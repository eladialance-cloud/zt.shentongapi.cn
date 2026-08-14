/** OssUploadService 单测（mock provider 上传方法，不触发真实 SDK）
 * 运行: node -r ts-node/register --test test/unit/oss-upload.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OssUploadService } from '../../src/modules/admin-oss/oss-upload.service';
import { AdminOssService } from '../../src/modules/admin-oss/admin-oss.service';

function buildOssService() {
  const repo: any = { findOne: async () => null };
  const enc: any = { decryptAes: (s: string) => s };
  const svc = new OssUploadService(repo, enc);
  return { svc, repo };
}

describe('OssUploadService 纯逻辑', () => {
  it('buildObjectKey 格式 generated/{userId}/{callMode}/{yyyyMMdd}/{uuid}.{ext}', () => {
    const { svc } = buildOssService();
    const key = svc.buildObjectKey({ userId: 9, callMode: 'image', ext: 'png', mime: 'image/png' });
    assert.match(key, /^generated\/9\/image\/\d{8}\/[0-9a-f-]{36}\.png$/);
  });
  it('buildObjectKey 非法 ext 回退 bin（去路径分隔符/点，白名单 [A-Za-z0-9]{1,16}）', () => {
    const { svc } = buildOssService();
    const evil = svc.buildObjectKey({ userId: 1, callMode: 'image', ext: 'evil../x', mime: 'image/png' });
    assert.match(evil, /^generated\/1\/image\/\d{8}\/[0-9a-f-]{36}\.bin$/);
    const longExt = svc.buildObjectKey({ userId: 1, callMode: 'image', ext: 'a'.repeat(17), mime: 'image/png' });
    assert.match(longExt, /\.bin$/);
    const valid = svc.buildObjectKey({ userId: 1, callMode: 'image', ext: 'JPEG', mime: 'image/jpeg' });
    assert.match(valid, /\.JPEG$/);
  });
  it('resolvePublicUrl 优先 CDN，其次桶公网外链', () => {
    const { svc } = buildOssService();
    const cdn = svc.resolvePublicUrl(
      { provider: 'aliyun', bucket: 'b', region: 'oss-cn-shanghai', extraConfig: { cdnUrl: 'https://cdn.example.com/' } } as any,
      'generated/1/a/20260101/x.png',
    );
    assert.equal(cdn, 'https://cdn.example.com/generated/1/a/20260101/x.png');
    const noCdn = svc.resolvePublicUrl(
      { provider: 'tencent', bucket: 'b', region: 'ap-guangzhou', extraConfig: null } as any,
      'k',
    );
    assert.equal(noCdn, 'https://b.cos.ap-guangzhou.myqcloud.com/k');
  });
  it('resolvePublicUrl qiniu/minio 桶公网外链', () => {
    const { svc } = buildOssService();
    const qiniu = svc.resolvePublicUrl(
      { provider: 'qiniu', bucket: 'b', region: 'z0', extraConfig: null } as any,
      'k',
    );
    assert.equal(qiniu, 'https://b.qnssl.com/k');
    const minio = svc.resolvePublicUrl(
      { provider: 'minio', bucket: 'b', region: 'us-east-1', endpoint: 'https://minio.example.com/', extraConfig: null } as any,
      'k',
    );
    assert.equal(minio, 'https://minio.example.com/b/k');
  });
  it('resolvePublicUrl 非 http(s) cdnUrl 不采用，回退桶公网外链', () => {
    const { svc } = buildOssService();
    const url = svc.resolvePublicUrl(
      { provider: 'aliyun', bucket: 'b', region: 'oss-cn-shanghai', extraConfig: { cdnUrl: 'ftp://cdn.example.com/' } } as any,
      'k',
    );
    assert.equal(url, 'https://b.oss-cn-shanghai.aliyuncs.com/k');
  });
  it('storageTypeOf 映射 aliyun/qiniu->oss、tencent->cos、minio->minio', () => {
    const { svc } = buildOssService();
    assert.equal(svc.storageTypeOf('aliyun'), 'oss');
    assert.equal(svc.storageTypeOf('qiniu'), 'oss');
    assert.equal(svc.storageTypeOf('tencent'), 'cos');
    assert.equal(svc.storageTypeOf('minio'), 'minio');
  });
  it('未配置默认 OSS 或 provider=local 时 upload 返回 null（本地回退）', async () => {
    const { svc, repo } = buildOssService();
    repo.findOne = async () => null;
    assert.equal(await svc.upload(Buffer.from('x'), { userId: 1, callMode: 'image', ext: 'png', mime: 'image/png' }), null);
    repo.findOne = async () => ({ id: 2, provider: 'local', isDefault: true, isActive: true });
    assert.equal(await svc.upload(Buffer.from('x'), { userId: 1, callMode: 'image', ext: 'png', mime: 'image/png' }), null);
  });
  it('配置 OSS 时调用对应 provider 上传并返回云 URL（CDN）', async () => {
    const { svc, repo } = buildOssService();
    repo.findOne = async () => ({
      id: 1, provider: 'aliyun', bucket: 'b', region: 'oss-cn-hangzhou',
      isDefault: true, isActive: true, accessKey: 'ak', secretKey: 'sk',
      extraConfig: { cdnUrl: 'https://cdn.x.com' },
    });
    let uploaded = 0;
    (svc as any).putAliyun = async () => { uploaded++; };
    const r = await svc.upload(Buffer.from('x'), { userId: 1, callMode: 'image', ext: 'png', mime: 'image/png' });
    assert.equal(uploaded, 1);
    assert.equal(r!.storageType, 'oss');
    assert.ok(r!.url.startsWith('https://cdn.x.com/generated/1/image/'));
  });
  it('uploadWithConfig 未知 provider 返回 null', async () => {
    const { svc } = buildOssService();
    const r = await svc.uploadWithConfig(
      { id: 3, provider: 'unknown' } as any,
      Buffer.from('x'),
      { userId: 1, callMode: 'image', ext: 'png', mime: 'image/png' },
    );
    assert.equal(r, null);
  });
});
describe('OssUploadService 连通性探针', () => {
  it('probeConfigId 对 aliyun 配置调用上传并返回成功', async () => {
    const { svc, repo } = buildOssService();
    repo.findOne = async () => ({ id: 1, provider: 'aliyun', bucket: 'b', isDefault: true, isActive: true, accessKey: 'ak', secretKey: 'sk', extraConfig: null });
    let uploaded = 0;
    (svc as any).putAliyun = async () => { uploaded++; };
    const r = await svc.probeConfigId(1);
    assert.equal(r.ok, true);
    assert.equal(uploaded, 1);
    assert.ok(r.latencyMs >= 0);
  });
  it('probeConfigId 上传失败返回 ok=false 且不抛异常', async () => {
    const { svc, repo } = buildOssService();
    repo.findOne = async () => ({ id: 2, provider: 'qiniu', bucket: 'b', isDefault: true, isActive: true, accessKey: 'ak', secretKey: 'sk', extraConfig: null });
    (svc as any).putQiniu = async () => { throw new Error('connection refused'); };
    const r = await svc.probeConfigId(2);
    assert.equal(r.ok, false);
    assert.match(r.message, /connection refused/);
  });
});
describe('AdminOssService.testConnection 云映射（不触碰文件系统）', () => {
  it('probeConfigId 成功映射为 success=true', async () => {
    const repo: any = { findOne: async () => ({ id: 1, provider: 'aliyun' }) };
    const enc: any = {};
    const probe: any = { probeConfigId: async () => ({ ok: true, latencyMs: 42, message: 'ok' }) };
    const svc = new AdminOssService(repo, enc, probe);
    const r = await svc.testConnection(1);
    assert.deepEqual(r, { success: true, provider: 'aliyun', latency: 42, message: 'ok' });
  });
  it('probeConfigId 失败映射为 success=false', async () => {
    const repo: any = { findOne: async () => ({ id: 2, provider: 'qiniu' }) };
    const enc: any = {};
    const probe: any = { probeConfigId: async () => ({ ok: false, latencyMs: 7, message: 'qiniu 连接失败: refused' }) };
    const svc = new AdminOssService(repo, enc, probe);
    const r = await svc.testConnection(2);
    assert.deepEqual(r, { success: false, provider: 'qiniu', latency: 7, message: 'qiniu 连接失败: refused' });
  });
});