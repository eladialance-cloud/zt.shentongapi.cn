import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SysOssConfigEntity } from './entities/sys-oss-config.entity';
import { EncryptionService } from '../../common/services/encryption.service';

export interface UploadTarget {
  userId: number;
  callMode: string;
  ext: string;
  mime: string;
}

export interface UploadResult {
  url: string;
  storageType: 'oss' | 'cos' | 'minio';
  objectKey: string;
  bucket?: string;
}

/** 动态加载 SDK（any 类型，单测/tsc 不依赖 SDK 安装；上线前必须 npm install） */
function loadSdk(name: string): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(name);
}

/** 七牛 region -> 上传 zone（z0 华东 / z1 华北 / z2 华南 / na0 北美 / as0 东南亚），默认 z0 */
const QINIU_ZONE_BY_REGION: Record<string, string> = {
  z0: 'Zone_z0',
  z1: 'Zone_z1',
  z2: 'Zone_z2',
  na0: 'Zone_na0',
  as0: 'Zone_as0',
};

@Injectable()
export class OssUploadService {
  private readonly logger = new (require('@nestjs/common').Logger)(OssUploadService.name);

  constructor(
    @InjectRepository(SysOssConfigEntity)
    private readonly ossConfigRepo: Repository<SysOssConfigEntity>,
    private readonly encryptionService: EncryptionService,
  ) {}

  /** 默认启用的 OSS 配置（无则本地回退） */
  async getActiveConfig(): Promise<SysOssConfigEntity | null> {
    return this.ossConfigRepo.findOne({
      where: { isDefault: true, isActive: true },
      order: { id: 'ASC' },
    });
  }

  /** object key: generated/{userId}/{callMode}/{yyyyMMdd}/{uuid}.{ext}（ext 白名单 [A-Za-z0-9]{1,16}，非法回退 bin） */
  buildObjectKey(target: UploadTarget): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const ext = /^[A-Za-z0-9]{1,16}$/.test(target.ext) ? target.ext : 'bin';
    return `generated/${target.userId}/${target.callMode}/${ymd}/${randomUUID()}.${ext}`;
  }

  /** 公有读外链：extraConfig.cdnUrl（仅 http(s)）优先，否则桶公网外链 */
  resolvePublicUrl(config: SysOssConfigEntity, objectKey: string): string {
    const extra = (config.extraConfig ?? {}) as Record<string, unknown>;
    const cdn =
      typeof extra.cdnUrl === 'string' && /^https?:\/\//.test(extra.cdnUrl)
        ? extra.cdnUrl.replace(/\/+$/, '')
        : '';
    if (cdn) return `${cdn}/${objectKey}`;
    const region = config.region || '';
    switch (config.provider) {
      case 'aliyun':
        return `https://${config.bucket}.${region || 'oss-cn-hangzhou'}.aliyuncs.com/${objectKey}`;
      case 'tencent':
        return `https://${config.bucket}.cos.${region || 'ap-guangzhou'}.myqcloud.com/${objectKey}`;
      case 'qiniu':
        return `https://${config.bucket}.qnssl.com/${objectKey}`;
      case 'minio':
        return `${(config.endpoint || '').replace(/\/+$/, '')}/${config.bucket}/${objectKey}`;
      case 'aws':
        return `${(config.endpoint || `https://s3.${region || 'us-east-1'}.amazonaws.com`).replace(/\/+$/, '')}/${config.bucket}/${objectKey}`;
      default:
        return '';
    }
  }

  /** provider -> files.storage_type 枚举值 */
  storageTypeOf(provider: string): 'oss' | 'cos' | 'minio' {
    if (provider === 'tencent') return 'cos';
    if (provider === 'minio') return 'minio';
    return 'oss';
  }

  /** 上传 buffer（使用默认配置）；未配置 OSS / provider=local 返回 null（调用方本地回退） */
  async upload(buffer: Buffer, target: UploadTarget): Promise<UploadResult | null> {
    const config = await this.getActiveConfig();
    if (!config || config.provider === 'local') return null;
    return this.uploadWithConfig(config, buffer, target);
  }

  /** 上传 buffer（指定配置，供探针/测试复用） */
  async uploadWithConfig(
    config: SysOssConfigEntity,
    buffer: Buffer,
    target: UploadTarget,
  ): Promise<UploadResult | null> {
    const accessKey = config.accessKey ? this.encryptionService.decryptAes(config.accessKey) : undefined;
    const secretKey = config.secretKey ? this.encryptionService.decryptAes(config.secretKey) : undefined;
    const objectKey = this.buildObjectKey(target);
    switch (config.provider) {
      case 'aliyun':
        await this.putAliyun(config, accessKey, secretKey, objectKey, buffer, target.mime);
        break;
      case 'tencent':
        await this.putTencent(config, accessKey, secretKey, objectKey, buffer, target.mime);
        break;
      case 'qiniu':
        await this.putQiniu(config, accessKey, secretKey, objectKey, buffer, target.mime);
        break;
      case 'minio':
        await this.putMinio(config, accessKey, secretKey, objectKey, buffer, target.mime);
        break;
      case 'aws':
        await this.putS3(config, accessKey, secretKey, objectKey, buffer, target.mime);
        break;
      default:
        return null;
    }
    return {
      url: this.resolvePublicUrl(config, objectKey),
      storageType: this.storageTypeOf(config.provider),
      objectKey,
      bucket: config.bucket,
    };
  }

  /** 连通性探针：按配置 id 上传 1 字节对象 */
  async probeConfigId(id: number): Promise<{ ok: boolean; latencyMs: number; message: string; url?: string }> {
    const config = await this.ossConfigRepo.findOne({ where: { id } });
    if (!config) return { ok: false, latencyMs: 0, message: 'OSS 配置不存在' };
    if (config.provider === 'local') return { ok: true, latencyMs: 0, message: '本地存储可用' };
    const start = Date.now();
    try {
      const res = await this.uploadWithConfig(config, Buffer.from('ok'), {
        userId: 0, callMode: '.probe', ext: 'txt', mime: 'text/plain',
      });
      if (!res) {
        return { ok: false, latencyMs: Date.now() - start, message: `${config.provider} 上传失败：未返回上传结果` };
      }
      return { ok: true, latencyMs: Date.now() - start, message: `${config.provider} 上传成功`, url: res.url };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, latencyMs: Date.now() - start, message: `${config.provider} 连接失败: ${message}` };
    }
  }

  /** 尽力设置公有读：无 PutObjectAcl 权限时回退默认 ACL 并告警，保证 resolvePublicUrl 公开外链可用 */
  private async putWithPublicRead(
    run: (acl?: string) => Promise<void>,
    provider: string,
    key: string,
  ): Promise<void> {
    // 统一上传超时（60s）：SDK 内部无超时时（如腾讯云 cos.putObject）挂起会导致任务永久卡死，
    // 超时抛错后由上层降级本地落盘，保证生成任务能正常收尾。
    const withTimeout = (acl?: string): Promise<void> => {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('OSS 上传超时(60s): provider=' + provider + ' key=' + key)),
          60000,
        );
      });
      return Promise.race([run(acl), timeout]).finally(() => {
        if (timer) clearTimeout(timer);
      }) as Promise<void>;
    };
    try {
      await withTimeout('public-read');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.warn?.(
        'OSS 设置公有读失败，回退默认 ACL: provider=' + provider + ' key=' + key + ' err=' + msg,
      );
      await withTimeout(undefined);
    }
  }

  // ============ provider 上传实现（动态 require，生产前须安装 SDK） ============

  private async putAliyun(
    config: SysOssConfigEntity, accessKey: string | undefined, secretKey: string | undefined,
    key: string, buffer: Buffer, mime: string,
  ): Promise<void> {
    const OSS = loadSdk('ali-oss');
    const client = new OSS({
      region: config.region,
      accessKeyId: accessKey,
      accessKeySecret: secretKey,
      bucket: config.bucket,
      endpoint: config.endpoint || undefined,
    });
    const putAli = async (acl?: string) => {
      const opts = { mime } as Record<string, unknown>;
      if (acl) opts.headers = { 'x-oss-object-acl': acl };
      await client.put(key, buffer, opts);
    };
    await this.putWithPublicRead(putAli, 'aliyun', key);
  }

  private async putTencent(
    config: SysOssConfigEntity, accessKey: string | undefined, secretKey: string | undefined,
    key: string, buffer: Buffer, mime: string,
  ): Promise<void> {
    // 优先官方新版 SDK，回退旧包名（cos-nodejs-sdk）
    let COS: any;
    try {
      COS = loadSdk('cos-nodejs-sdk-v5');
    } catch {
      COS = loadSdk('cos-nodejs-sdk');
    }
    const cos = new COS({ SecretId: accessKey, SecretKey: secretKey });
    const putTc = (acl?: string) =>
      new Promise<void>((resolve, reject) => {
        cos.putObject(
          {
            Bucket: config.bucket,
            Region: config.region,
            Key: key,
            Body: buffer,
            ContentType: mime,
            ...(acl ? { ACL: acl } : {}),
          },
          (err: Error | null) => (err ? reject(err) : resolve()),
        );
      });
    await this.putWithPublicRead(putTc, 'tencent', key);
  }

  private async putQiniu(
    config: SysOssConfigEntity, accessKey: string | undefined, secretKey: string | undefined,
    key: string, buffer: Buffer, mime: string,
  ): Promise<void> {
    const qiniu = loadSdk('qiniu');
    const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    const putPolicy = new qiniu.rs.PutPolicy({ scope: `${config.bucket}:${key}` });
    const uploadToken = putPolicy.uploadToken(mac);
    const zoneName = QINIU_ZONE_BY_REGION[config.region || 'z0'] || 'Zone_z0';
    const zone = qiniu.zone[zoneName] || qiniu.zone.Zone_z0;
    const formUploader = new qiniu.form_up.FormUploader(new qiniu.conf.Config({ zone }));
    await new Promise<void>((resolve, reject) => {
      formUploader.put(
        uploadToken, key, buffer, null, mime, null, null,
        (respErr: Error | null, _respBody: unknown, respInfo: { statusCode: number }) => {
          if (respErr) return reject(respErr);
          if (respInfo?.statusCode >= 200 && respInfo?.statusCode < 300) return resolve();
          return reject(new Error(`七牛上传失败 HTTP ${respInfo?.statusCode}`));
        },
      );
    });
  }

  private async putMinio(
    config: SysOssConfigEntity, accessKey: string | undefined, secretKey: string | undefined,
    key: string, buffer: Buffer, mime: string,
  ): Promise<void> {
    const { S3Client, PutObjectCommand } = loadSdk('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || 'us-east-1',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true,
    });
    const putMi = (acl?: string) =>
      client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: buffer,
          ContentType: mime,
          ...(acl ? { ACL: acl } : {}),
        }),
      );
    await this.putWithPublicRead(putMi, 'minio', key);
  }

  private async putS3(
    config: SysOssConfigEntity, accessKey: string | undefined, secretKey: string | undefined,
    key: string, buffer: Buffer, mime: string,
  ): Promise<void> {
    const { S3Client, PutObjectCommand } = loadSdk('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: config.endpoint || undefined,
      region: config.region || 'us-east-1',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: !!config.endpoint,
    });
    const putAws = (acl?: string) =>
      client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: buffer,
          ContentType: mime,
          ...(acl ? { ACL: acl } : {}),
        }),
      );
    await this.putWithPublicRead(putAws, 'aws', key);
  }
}