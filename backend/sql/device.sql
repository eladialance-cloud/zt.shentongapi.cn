-- =============================================================================
-- 深瞳 AI 智能中台 - 用户设备绑定表
-- 数据库：ai_agent
-- MySQL 版本：8.0+
-- 文档依据：Task 4 - 设备指纹与绑定机制
-- 说明：本脚本可在 init.sql 执行后单独运行；每用户最多绑定 3 台设备（由业务层校验）
-- =============================================================================

USE `ai_agent`;

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- user_devices - 用户设备绑定表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_devices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '设备绑定 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `device_fingerprint` VARCHAR(64) NOT NULL COMMENT '设备指纹（SHA-256 哈希，64 字符 hex）',
  `device_name` VARCHAR(128) NOT NULL COMMENT '设备名称',
  `device_type` VARCHAR(32) NOT NULL COMMENT '设备类型 (win32/darwin/linux)',
  `last_login_at` DATETIME NOT NULL COMMENT '最近登录时间',
  `last_login_ip` VARCHAR(64) NOT NULL COMMENT '最近登录 IP',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态 (active/disabled)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_device` (`user_id`, `device_fingerprint`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_device_fingerprint` (`device_fingerprint`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户设备绑定表';
