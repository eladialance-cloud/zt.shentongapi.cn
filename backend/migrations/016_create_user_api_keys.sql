-- 深瞳AI v0.6.0 增量迁移：user_api_keys 表 + users.notification_settings 列
CREATE TABLE IF NOT EXISTS `user_api_keys` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'API Key ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `alias` VARCHAR(128) NOT NULL COMMENT '别名',
  `key_hash` VARCHAR(64) NOT NULL COMMENT '完整 key 的 SHA-256 哈希',
  `key_prefix` VARCHAR(16) NOT NULL COMMENT '明文 key 前 8 位（脱敏展示）',
  `last_used_at` DATETIME DEFAULT NULL COMMENT '最后使用时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_api_keys_key_hash` (`key_hash`),
  KEY `idx_user_api_keys_user_id` (`user_id`),
  CONSTRAINT `fk_user_api_keys_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户 API Key 表';

ALTER TABLE `users`
  ADD COLUMN `notification_settings` JSON DEFAULT NULL COMMENT '通知设置（JSON）' AFTER `llm_proxy_key`;
