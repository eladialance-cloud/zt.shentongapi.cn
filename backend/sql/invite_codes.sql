-- =============================================================================
-- 深瞳 AI 智能中台 - 邀请码表
-- 数据库：ai_agent
-- MySQL 版本：8.0+
-- 文档依据：Task 5 - 邀请码生成与管理服务
-- 说明：本脚本可在 init.sql 执行后单独运行
-- =============================================================================

USE `ai_agent`;

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- invite_codes - 邀请码表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invite_codes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '邀请码 ID',
  `code` VARCHAR(32) NOT NULL COMMENT '邀请码（8 字符 base32，去除易混淆字符）',
  `inviter_id` BIGINT UNSIGNED NOT NULL COMMENT '邀请人 ID',
  `invitee_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '被邀请人 ID（未使用时为 NULL）',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态 (active/used/expired)',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间（生成后 30 天）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  INDEX `idx_inviter_id` (`inviter_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请码表';
