-- 合并 SQL 迁移脚本：创建缺失的数据库表
-- 优先级说明：本脚本为主脚本，deprecated_004/005 已废弃（与 999 重复且定义不一致）
-- 在服务器上执行：docker exec -i shentong-mysql mysql -u root -p<password> shentong_db < this.sql

-- MCP Server 配置表
CREATE TABLE IF NOT EXISTS `mcp_servers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `description` VARCHAR(512) DEFAULT NULL,
  `transport_type` ENUM('stdio', 'http', 'streamable-http') NOT NULL DEFAULT 'stdio',
  `command` VARCHAR(256) DEFAULT NULL,
  `args` JSON DEFAULT NULL,
  `env` JSON DEFAULT NULL,
  `url` VARCHAR(512) DEFAULT NULL,
  `headers` JSON DEFAULT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `last_connected_at` DATETIME DEFAULT NULL,
  `tool_count` INT NOT NULL DEFAULT 0,
  `status` ENUM('pending', 'connected', 'failed', 'disabled') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- N8N 实例表
CREATE TABLE IF NOT EXISTS `n8n_instances` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `description` VARCHAR(512) NULL DEFAULT NULL,
  `base_url` VARCHAR(512) NOT NULL,
  `api_key` VARCHAR(256) NOT NULL COMMENT 'N8N API Key（AES-256-GCM 加密存储）',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `version` VARCHAR(32) NULL DEFAULT NULL,
  `last_started_at` DATETIME NULL DEFAULT NULL,
  `last_stopped_at` DATETIME NULL DEFAULT NULL,
  `webhook_url` VARCHAR(512) NULL DEFAULT NULL,
  `config` JSON NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_n8n_instances_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- N8N 工作流表
CREATE TABLE IF NOT EXISTS `n8n_workflows` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `instance_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `workflow_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT FALSE,
  `nodes` JSON NULL DEFAULT NULL,
  `connections` JSON NULL DEFAULT NULL,
  `tags` JSON NULL DEFAULT NULL,
  `last_executed_at` DATETIME NULL DEFAULT NULL,
  `last_execution_status` VARCHAR(32) NOT NULL DEFAULT 'unknown',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_n8n_workflows_instance_id` (`instance_id`),
  INDEX `idx_n8n_workflows_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- N8N Webhook 日志表
CREATE TABLE IF NOT EXISTS `n8n_webhook_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `instance_id` BIGINT UNSIGNED NOT NULL,
  `workflow_id` VARCHAR(64) NOT NULL,
  `signature_valid` BOOLEAN NOT NULL DEFAULT FALSE,
  `signature_provided` BOOLEAN NOT NULL DEFAULT FALSE,
  `payload` JSON NULL DEFAULT NULL,
  `response_data` JSON NULL DEFAULT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'processed',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_n8n_webhook_logs_instance` (`instance_id`, `workflow_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hermes 实例表
CREATE TABLE IF NOT EXISTS `hermes_instances` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `status` ENUM('running','stopped','error') DEFAULT 'stopped',
  `pid` INT NULL,
  `skill_count` INT DEFAULT 0,
  `skill_ids` JSON COMMENT '已挂载技能包ID列表',
  `error_message` VARCHAR(512) NULL,
  `cpu_percent` DECIMAL(5,2) DEFAULT 0,
  `memory_used_mb` INT DEFAULT 0,
  `memory_total_mb` INT DEFAULT 0,
  `started_at` DATETIME NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_hermes_user` (`user_id`),
  INDEX `idx_hermes_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hermes 调用日志表
CREATE TABLE IF NOT EXISTS `hermes_call_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `instance_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `call_type` ENUM('skill_execute','tool_call','agent_invoke','workflow_run') NOT NULL,
  `status` ENUM('success','failed','timeout','running') NOT NULL DEFAULT 'running',
  `duration_ms` INT DEFAULT 0,
  `credits_cost` INT DEFAULT 0,
  `target` VARCHAR(128) NULL,
  `error_message` VARCHAR(512) NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_hermes_call_logs_instance_id` (`instance_id`),
  INDEX `idx_hermes_call_logs_user_id` (`user_id`),
  INDEX `idx_hermes_call_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hermes 技能包表
CREATE TABLE IF NOT EXISTS `hermes_skills` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL,
  `description` TEXT,
  `author` VARCHAR(64),
  `price_per_minute` INT DEFAULT 0 COMMENT '积分/分钟，0=免费',
  `install_count` INT DEFAULT 0,
  `icon` VARCHAR(512),
  `version` VARCHAR(64) DEFAULT '1.0.0',
  `is_active` BOOLEAN DEFAULT TRUE,
  `exec_config` JSON NULL COMMENT '技能执行配置（JSON）',
  `category` VARCHAR(64) NULL COMMENT '技能分类',
  `avg_rating` DECIMAL(3,2) DEFAULT 0.00 COMMENT '平均评分（0-5）',
  `rating_count` INT DEFAULT 0 COMMENT '评分数',
  `tags` JSON NULL COMMENT '标签（JSON 数组）',
  `changelog` TEXT NULL COMMENT '更新日志',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_hermes_skills_active` (`is_active`),
  INDEX `idx_hermes_skills_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hermes 技能包评分记录表
CREATE TABLE IF NOT EXISTS `hermes_skill_ratings` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `skill_id` BIGINT NOT NULL COMMENT '技能包ID',
  `rating` INT NOT NULL COMMENT '评分 1-5',
  `comment` TEXT NULL COMMENT '评论文本',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_hermes_rating_user` (`user_id`),
  INDEX `idx_hermes_rating_skill` (`skill_id`),
  UNIQUE INDEX `uk_user_skill` (`user_id`, `skill_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能包评分记录';

-- OpenClaw 实例表
-- 注意：与 openclaw-instance.entity.ts 完全一致，deprecated_005 已废弃
-- 安全方式：仅在不存时创建，不删除已有数据
CREATE TABLE IF NOT EXISTS `openclaw_instances` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL,
  `agent_id` BIGINT NULL COMMENT '关联 agents 表 id',
  `openclaw_agent_id` VARCHAR(64) NOT NULL COMMENT 'OpenClaw 侧 agentId',
  `endpoint` VARCHAR(256) NOT NULL DEFAULT 'http://localhost:8080' COMMENT 'OpenClaw API 地址',
  `status` ENUM('online','offline','error') DEFAULT 'offline',
  `last_heartbeat_at` DATETIME NULL COMMENT '最后心跳时间',
  `config` JSON NULL COMMENT 'SOUL.md/工具策略/MCP 配置等',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_openclaw_user` (`user_id`),
  INDEX `idx_openclaw_agent` (`agent_id`),
  UNIQUE INDEX `uniq_openclaw_agent_id` (`openclaw_agent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
