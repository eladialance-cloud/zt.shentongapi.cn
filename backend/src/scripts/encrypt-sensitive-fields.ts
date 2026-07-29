/**
 * P0 数据迁移脚本：加密 sys_oss_config 和 system_config 中的明文密钥
 *
 * 运行方式：docker exec -it shentong-backend node dist/scripts/encrypt-sensitive-fields.js
 * 或本地：npx ts-node src/scripts/encrypt-sensitive-fields.ts
 *
 * 此脚本会：
 * 1. 找到 sys_oss_config 中明文 access_key/secret_key 的记录 → AES-256-GCM 加密后更新
 * 2. 找到 system_config 中 payment/notification 的明文密钥 → 加密后更新
 * 3. 输出迁移报告
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EncryptionService } from '../common/services/encryption.service';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const encryptionService = app.get(EncryptionService);
  const dataSource = app.get(DataSource);

  console.log('=== P0 数据迁移：加密明文密钥 ===\n');

  // --- 1. sys_oss_config 加密 ---
  const ossRepo = dataSource.getRepository('sys_oss_config');
  const ossRecords = await ossRepo.find();
  let ossMigrated = 0;

  for (const record of ossRecords as any[]) {
    if (record.provider === 'local') continue;
    const updates: Record<string, string> = {};

    if (record.accessKey && record.accessKey.length > 0) {
      // 检测是否已加密（AES-256-GCM 格式：iv:authTag:ciphertext，3段且较长）
      const parts = record.accessKey.split(':');
      if (parts.length !== 3 || record.accessKey.length < 50) {
        updates.accessKey = encryptionService.encryptAes(record.accessKey);
        console.log(`  OSS #${record.id} access_key: 明文→加密`);
      }
    }

    if (record.secretKey && record.secretKey.length > 0) {
      const parts = record.secretKey.split(':');
      if (parts.length !== 3 || record.secretKey.length < 50) {
        updates.secretKey = encryptionService.encryptAes(record.secretKey);
        console.log(`  OSS #${record.id} secret_key: 明文→加密`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await ossRepo.update(record.id, updates);
      ossMigrated++;
    }
  }
  console.log(`\nsys_oss_config: ${ossMigrated} 条记录已加密\n`);

  // --- 2. system_config payment/notification 加密 ---
  const configRepo = dataSource.getRepository('system_config');
  const SENSITIVE_PATHS: Record<string, string[]> = {
    payment: ['wechat.apiV3Key', 'alipay.privateKey', 'stripe.secretKey', 'stripe.webhookSecret'],
    notification: ['smtp.username', 'sms.accessKeyId'],
  };

  let configMigrated = 0;

  for (const [section, paths] of Object.entries(SENSITIVE_PATHS)) {
    const row = await configRepo.findOne({ where: { section } });
    if (!row) {
      console.log(`  ${section}: 无数据，跳过`);
      continue;
    }

    const config = row.configValue as Record<string, any>;
    let changed = false;

    for (const path of paths) {
      const value = getDeepValue(config, path);
      if (value && typeof value === 'string' && value.length > 0) {
        const parts = value.split(':');
        if (parts.length !== 3 || value.length < 50) {
          setDeepValue(config, path, encryptionService.encryptAes(value));
          console.log(`  ${section}.${path}: 明文→加密`);
          changed = true;
        }
      }
    }

    if (changed) {
      row.configValue = config;
      await configRepo.save(row);
      configMigrated++;
    }
  }
  console.log(`\nsystem_config: ${configMigrated} 条记录已加密\n`);

  // --- 报告 ---
  console.log('=== 迁移完成 ===');
  console.log(`sys_oss_config: ${ossMigrated} 条`);
  console.log(`system_config: ${configMigrated} 条`);
  console.log(`总计: ${ossMigrated + configMigrated} 条敏感字段已加密`);

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
  let current: Record<string, any> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

bootstrap().catch((err) => {
  console.error('迁移失败:', err);
  process.exit(1);
});
