/**
 * AES_KEY 轮换脚本：把全部 AES 加密落库字段用新密钥重新加密
 *
 * 运行方式：
 *   1) 先生成新密钥（至少 32 字符）：
 *      openssl rand -base64 48  （或手动生成）
 *   2) 设置环境变量并运行（此时 AES_KEY 仍为旧密钥）：
 *      set AES_KEY_NEW=<新密钥> && npx ts-node src/scripts/rotate-aes-key.ts
 *      （生产环境：AES_KEY_NEW 通过 systemd Environment 临时注入）
 *   3) 脚本完成后，把 .env / systemd 的 AES_KEY 更新为新密钥，重启后端。
 *   4) 确认业务正常后，删除旧密钥备份。
 *
 * 覆盖字段：
 *   - sys_oss_config.access_key / secret_key
 *   - system_config 中 payment/notification 敏感路径
 *   - api_key_pool.api_key
 *   - model_providers.api_key
 *   - model.api_key
 *   - channel.credentials（JSON 加密串）
 *   - oral_workshop publish_account.cookies
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EncryptionService } from '../common/services/encryption.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as crypto from 'node:crypto';

function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && value.length >= 50;
}

async function bootstrap() {
  const newKey = process.env.AES_KEY_NEW;
  if (!newKey) {
    console.error('缺少 AES_KEY_NEW 环境变量，终止。');
    process.exit(1);
  }
  if (newKey.length < 32) {
    console.error('AES_KEY_NEW 长度不足 32 字符，终止。');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const oldService = app.get(EncryptionService);

  // 用新密钥构造一个临时加密服务（仅用于重加密，不写入任何配置）
  const fakeConfig = {
    get: (key: string) => (key === 'AES_KEY' ? newKey : undefined),
  } as unknown as ConfigService;
  const newService = new EncryptionService(fakeConfig);

  const report: string[] = [];
  const reencrypt = (encryptedOrPlain: string): string => {
    let plain: string;
    if (isEncrypted(encryptedOrPlain)) {
      try { plain = oldService.decryptAes(encryptedOrPlain); }
      catch { plain = encryptedOrPlain; }
    } else {
      plain = encryptedOrPlain;
    }
    return newService.encryptAes(plain);
  };

  // 1. sys_oss_config
  const ossRepo = dataSource.getRepository('sys_oss_config');
  const ossRecords = (await ossRepo.find()) as any[];
  let ossCount = 0;
  for (const r of ossRecords) {
    const patch: Record<string, string> = {};
    if (r.accessKey) { patch.accessKey = reencrypt(r.accessKey); }
    if (r.secretKey) { patch.secretKey = reencrypt(r.secretKey); }
    if (Object.keys(patch).length) { await ossRepo.update(r.id, patch); ossCount++; }
  }
  report.push(`sys_oss_config: ${ossCount} 条`);

  // 2. system_config 敏感路径
  const SENSITIVE_PATHS: Record<string, string[]> = {
    payment: ['wechat.apiV3Key', 'alipay.privateKey', 'stripe.secretKey', 'stripe.webhookSecret'],
    notification: ['smtp.username', 'sms.accessKeyId'],
  };
  const configRepo = dataSource.getRepository('system_config');
  let configCount = 0;
  for (const [section, paths] of Object.entries(SENSITIVE_PATHS)) {
    const row = (await configRepo.findOne({ where: { section } })) as any;
    if (!row) continue;
    const config = row.configValue as Record<string, any>;
    let changed = false;
    for (const path of paths) {
      const value = getDeepValue(config, path);
      if (value && typeof value === 'string' && value.length > 0) {
        setDeepValue(config, path, reencrypt(value));
        changed = true;
      }
    }
    if (changed) { await configRepo.save(row); configCount++; }
  }
  report.push(`system_config: ${configCount} 条`);

  // 3. api_key_pool
  const poolRepo = dataSource.getRepository('api_key_pool');
  const poolRows = (await poolRepo.find()) as any[];
  let poolCount = 0;
  for (const r of poolRows) {
    if (r.api_key) { await poolRepo.update(r.id, { api_key: reencrypt(r.api_key) }); poolCount++; }
  }
  report.push(`api_key_pool: ${poolCount} 条`);

  // 4. model_providers.api_key
  const provRepo = dataSource.getRepository('model_providers');
  const provRows = (await provRepo.find()) as any[];
  let provCount = 0;
  for (const r of provRows) {
    if (r.api_key) { await provRepo.update(r.id, { api_key: reencrypt(r.api_key) }); provCount++; }
  }
  report.push(`model_providers: ${provCount} 条`);

  // 5. model.api_key
  const modelRepo = dataSource.getRepository('model');
  const modelRows = (await modelRepo.find()) as any[];
  let modelCount = 0;
  for (const r of modelRows) {
    if (r.api_key) { await modelRepo.update(r.id, { api_key: reencrypt(r.api_key) }); modelCount++; }
  }
  report.push(`model: ${modelCount} 条`);

  // 6. channel.credentials
  const channelRepo = dataSource.getRepository('channel');
  const channelRows = (await channelRepo.find()) as any[];
  let channelCount = 0;
  for (const r of channelRows) {
    if (r.credentials) { await channelRepo.update(r.id, { credentials: reencrypt(r.credentials) }); channelCount++; }
  }
  report.push(`channel: ${channelCount} 条`);

  // 7. publish_account.cookies
  try {
    const paRepo = dataSource.getRepository('publish_account');
    const paRows = (await paRepo.find()) as any[];
    let paCount = 0;
    for (const r of paRows) {
      if (r.cookies && isEncrypted(r.cookies)) {
        await paRepo.update(r.id, { cookies: reencrypt(r.cookies) });
        paCount++;
      }
    }
    report.push(`publish_account: ${paCount} 条`);
  } catch (err) {
    report.push(`publish_account: 跳过（${(err as Error).message}）`);
  }

  console.log('=== AES_KEY 轮换完成 ===');
  console.log(report.join('\n'));
  console.log('');
  console.log('下一步：把 .env / systemd 的 AES_KEY 更新为新密钥，然后重启后端；确认业务正常后删除旧密钥备份。');
  console.log('注意：请保留旧密钥直到确认所有功能正常（聊天/模型/OSS/支付/工作流/官署技能）。');

  await app.close();
}

function getDeepValue(obj: Record<string, any>, path: string): any {
  const keys = path.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function setDeepValue(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.');
  let current: any = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

bootstrap().catch((err) => {
  console.error('轮换失败:', err);
  process.exit(1);
});