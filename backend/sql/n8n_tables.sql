-- =====================================================
-- N8N 模块数据库迁移
-- 表：eco_n8n_instances, n8n_workflows
-- =====================================================

-- ---------------------------------------------------
-- N8N 实例配置表
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `eco_n8n_instances` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `name` VARCHAR(128) NOT NULL COMMENT '实例名称',
  `description` VARCHAR(512) NULL DEFAULT NULL COMMENT '实例描述',
  `base_url` VARCHAR(512) NOT NULL COMMENT 'N8N API 地址',
  `api_key` VARCHAR(256) NOT NULL COMMENT 'N8N API Key（AES-256-GCM 加密存储，格式: base64(iv):base64(authTag):base64(ciphertext)）',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/running/stopped/error',
  `version` VARCHAR(32) NULL DEFAULT NULL COMMENT 'N8N 版本',
  `last_started_at` DATETIME NULL DEFAULT NULL COMMENT '最后启动时间',
  `last_stopped_at` DATETIME NULL DEFAULT NULL COMMENT '最后停止时间',
  `webhook_url` VARCHAR(512) NULL DEFAULT NULL COMMENT 'Webhook URL',
  `config` JSON NULL DEFAULT NULL COMMENT '额外配置（时区等）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_n8n_instances_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='N8N 实例配置';

-- ---------------------------------------------------
-- N8N 工作流表（本地缓存）
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `n8n_workflows` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `instance_id` BIGINT UNSIGNED NOT NULL COMMENT '关联实例ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `workflow_id` VARCHAR(64) NOT NULL COMMENT 'N8N 中的工作流ID',
  `name` VARCHAR(128) NOT NULL COMMENT '工作流名称',
  `active` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否激活',
  `nodes` JSON NULL DEFAULT NULL COMMENT '节点配置',
  `connections` JSON NULL DEFAULT NULL COMMENT '连接配置',
  `tags` JSON NULL DEFAULT NULL COMMENT '标签',
  `last_executed_at` DATETIME NULL DEFAULT NULL COMMENT '最后执行时间',
  `last_execution_status` VARCHAR(32) NOT NULL DEFAULT 'unknown' COMMENT '最后执行状态: success/error/running/unknown',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_n8n_workflows_instance_id` (`instance_id`),
  INDEX `idx_n8n_workflows_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='N8N 工作流缓存';

-- ---------------------------------------------------
-- N8N Webhook 回调日志表
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `eco_n8n_webhook_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `instance_id` BIGINT UNSIGNED NOT NULL COMMENT '关联实例ID',
  `workflow_id` VARCHAR(64) NOT NULL COMMENT '工作流ID',
  `signature_valid` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '签名是否验证通过',
  `signature_provided` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否提供了签名',
  `payload` JSON NULL DEFAULT NULL COMMENT '请求体（JSON）',
  `response_data` JSON NULL DEFAULT NULL COMMENT '响应数据（JSON）',
  `status` VARCHAR(32) NOT NULL DEFAULT 'processed' COMMENT '处理状态: processed/signature_failed/instance_not_found',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_n8n_webhook_logs_instance` (`instance_id`),
  INDEX `idx_n8n_webhook_logs_workflow` (`workflow_id`),
  INDEX `idx_n8n_webhook_logs_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='N8N Webhook 回调日志';
