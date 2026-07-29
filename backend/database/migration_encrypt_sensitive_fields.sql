-- P0 数据迁移脚本：将 sys_oss_config 和 system_config 中明文密钥加密存储
-- ⚠️ 此脚本应在后端 v0.2.8-hotfix3 部署后执行
-- ⚠️ 加密需要 AES_KEY 环境变量已配置
-- ⚠️ 加密操作需在后端应用代码中执行，SQL 层无法完成 AES-256-GCM 加密
-- ⚠️ 因此此脚本仅用于：检查当前明文密钥数据 + 标记迁移状态

-- Step 1: 检查 sys_oss_config 中存在明文密钥的记录
SELECT id, name, provider,
  CASE WHEN access_key IS NOT NULL AND access_key != '' AND access_key NOT LIKE '%:%:%' THEN 'PLAINTEXT' ELSE 'OK' END AS access_key_status,
  CASE WHEN secret_key IS NOT NULL AND secret_key != '' AND secret_key NOT LIKE '%:%:%' THEN 'PLAINTEXT' ELSE 'OK' END AS secret_key_status
FROM sys_oss_config
WHERE provider != 'local';

-- Step 2: 检查 system_config 中 payment/notification section 的密钥状态
-- payment section
SELECT section,
  JSON_EXTRACT(config_value, '$.wechat.apiV3Key') AS wechat_apiV3Key,
  JSON_EXTRACT(config_value, '$.alipay.privateKey') AS alipay_privateKey,
  JSON_EXTRACT(config_value, '$.stripe.secretKey') AS stripe_secretKey,
  JSON_EXTRACT(config_value, '$.stripe.webhookSecret') AS stripe_webhookSecret
FROM system_config
WHERE section = 'payment';

-- notification section
SELECT section,
  JSON_EXTRACT(config_value, '$.smtp.username') AS smtp_username,
  JSON_EXTRACT(config_value, '$.sms.accessKeyId') AS sms_accessKeyId
FROM system_config
WHERE section = 'notification';

-- Step 3: 迁移操作说明
-- 由于 AES-256-GCM 加密需要在应用层执行（需要 AES_KEY 环境变量），
-- 实际密钥加密应通过以下方式完成：
--
-- 方案A（推荐）：通过管理后台重新保存各配置（前端提交明文 → 后端自动加密存储）
-- 方案B：编写临时 NestJS CLI 脚本，读取明文 → 加密 → 更新数据库
--
-- 以下为方案B的参考 SQL（需在后端应用执行加密后替换）：
-- UPDATE sys_oss_config SET access_key = '<encrypted_value>' WHERE id = <id>;
-- UPDATE sys_oss_config SET secret_key = '<encrypted_value>' WHERE id = <id>;
-- UPDATE system_config SET config_value = '<encrypted_json>' WHERE section = 'payment';

-- Step 4: sys_oss_config 表结构变更 - 扩展字段长度以容纳加密值
-- AES-256-GCM 加密后长度约为明文长度的 2-3 倍
ALTER TABLE `sys_oss_config` MODIFY COLUMN `access_key` VARCHAR(512) NULL DEFAULT NULL;
ALTER TABLE `sys_oss_config` MODIFY COLUMN `secret_key` VARCHAR(1024) NULL DEFAULT NULL;
