-- ============================================================
-- 002_create_agent_tag.sql
-- Agent标签库 + Agent-标签关联表
-- ============================================================

-- Agent标签库
CREATE TABLE IF NOT EXISTS `agent_tag` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL COMMENT '标签名称',
  `color` VARCHAR(32) NULL DEFAULT '#6366f1' COMMENT '标签颜色',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent标签库';

-- Agent-标签关联表
CREATE TABLE IF NOT EXISTS `agent_tag_map` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `agent_id` BIGINT NOT NULL COMMENT '关联 agents.id',
  `tag_id` BIGINT NOT NULL COMMENT '关联 agent_tag.id',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_agent_tag` (`agent_id`, `tag_id`),
  INDEX `idx_tag_id` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent-标签关联表';
