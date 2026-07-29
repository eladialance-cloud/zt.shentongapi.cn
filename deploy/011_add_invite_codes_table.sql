-- =============================================================================
-- 添加 invite_codes 邀请码表
-- 解决用户注册时提示"邀请码无效或已过期"问题
-- =============================================================================

USE `ai_agent`;

-- 创建邀请码表
CREATE TABLE IF NOT EXISTS `invite_codes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `code` VARCHAR(32) NOT NULL COMMENT '邀请码',
  `inviter_id` BIGINT UNSIGNED NOT NULL COMMENT '邀请人ID',
  `invitee_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '被邀请人ID（使用后填充）',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态：active/used/expired',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_code` (`code`),
  KEY `idx_inviter_id` (`inviter_id`),
  KEY `idx_status` (`status`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请码表';

-- 插入默认邀请码（永不过期，用于开放注册）
-- 默认管理员 (id=1) 作为邀请人
INSERT INTO `invite_codes` (`code`, `inviter_id`, `invitee_id`, `status`, `expires_at`, `created_at`) VALUES
('SHENTONG2026', 1, NULL, 'active', '2099-12-31 23:59:59', NOW()),
('WELCOME', 1, NULL, 'active', '2099-12-31 23:59:59', NOW()),
('AIAGENT', 1, NULL, 'active', '2099-12-31 23:59:59', NOW())
ON DUPLICATE KEY UPDATE `status` = 'active', `expires_at` = '2099-12-31 23:59:59';

-- 验证
SELECT 'invite_codes table created:' as info;
SHOW TABLES LIKE 'invite_codes';
SELECT 'default invite codes:' as info;
SELECT `code`, `status`, `expires_at` FROM `invite_codes` WHERE `status` = 'active';
