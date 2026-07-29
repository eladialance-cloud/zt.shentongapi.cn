-- =====================================================
-- P2 修复脚本：补全缺失表 & 修正字段不匹配
-- 生成时间：2026-07-15
-- 说明：对比 Entity 定义与现有 SQL，修复以下问题：
--   1. hermes_skills 表缺失多个字段（exec_config, category, avg_rating, rating_count, tags, changelog）
--   2. hermes_skill_ratings 表完全缺失
--   3. n8n_webhook_logs 表缺失 signature_provided 和 status 字段
--   4. openclaw_instances 表 DROP+CREATE 改为 CREATE IF NOT EXISTS
--   5. hermes_call_logs 索引名称与 Entity 定义不一致
--   6. 部分表缺少 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 声明
-- 执行方式：docker exec -i shentong-mysql mysql -u root -p<password> ai_agent < p2_fix_missing_tables.sql
-- =====================================================

SET NAMES utf8mb4;

-- =====================================================
-- 1. hermes_skills 表：补全缺失字段
--    Entity: hermes-skill.entity.ts 定义了 exec_config, category, avg_rating, rating_count, tags, changelog
--    现有 SQL 完全缺失这些字段
-- =====================================================

-- 1.1 添加 exec_config 字段（JSON，技能执行配置）
-- 注意：MySQL 8.0+ 不支持 ADD COLUMN IF NOT EXISTS，需手动检查
-- 可通过以下查询检查列是否存在：
--   SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'ai_agent' AND TABLE_NAME = 'hermes_skills' AND COLUMN_NAME = 'exec_config';
ALTER TABLE `hermes_skills` ADD COLUMN `exec_config` JSON NULL COMMENT '技能执行配置（JSON）';
-- 1.2 添加 category 字段（VARCHAR(64)，技能分类）
ALTER TABLE `hermes_skills` ADD COLUMN `category` VARCHAR(64) NULL COMMENT '技能分类';
-- 1.3 添加 avg_rating 字段（DECIMAL(3,2)，平均评分）
ALTER TABLE `hermes_skills` ADD COLUMN `avg_rating` DECIMAL(3,2) DEFAULT 0.00 COMMENT '平均评分（0-5）';
-- 1.4 添加 rating_count 字段（INT，评分数）
ALTER TABLE `hermes_skills` ADD COLUMN `rating_count` INT DEFAULT 0 COMMENT '评分数';
-- 1.5 添加 tags 字段（JSON，标签数组）
ALTER TABLE `hermes_skills` ADD COLUMN `tags` JSON NULL COMMENT '标签（JSON 数组）';
-- 1.6 添加 changelog 字段（TEXT，更新日志）
ALTER TABLE `hermes_skills` ADD COLUMN `changelog` TEXT NULL COMMENT '更新日志';

-- 为 hermes_skills 添加分类索引
ALTER TABLE `hermes_skills` ADD INDEX `idx_hermes_skills_category` (`category`);

-- =====================================================
-- 2. hermes_skill_ratings 表：完全缺失，需新建
--    Entity: hermes-skill-rating.entity.ts
--    唯一约束：uk_user_skill (user_id, skill_id)
-- =====================================================

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

-- =====================================================
-- 3. n8n_webhook_logs 表：补全缺失字段
--    Entity: n8n-webhook-log.entity.ts 定义了 signature_provided 和 status 字段
--    现有 SQL 缺失这两个字段
-- =====================================================

-- 3.1 添加 signature_provided 字段（BOOLEAN，是否提供了签名）
ALTER TABLE `n8n_webhook_logs` ADD COLUMN `signature_provided` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否提供了签名';
-- 3.2 添加 status 字段（VARCHAR(32)，处理状态）
ALTER TABLE `n8n_webhook_logs` ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'processed' COMMENT '处理状态: processed/signature_failed/instance_not_found';

-- =====================================================
-- 4. openclaw_instances 表：修正索引与 Entity 一致
--    Entity: openclaw-instance.entity.ts
--    - user_id 上有普通索引
--    - agent_id 上有普通索引
--    - openclaw_agent_id 上有唯一索引
--    - 现有 999_create_missing_tables.sql 中使用了 DROP+CREATE，此脚本不重复执行
--    如需新建（表不存在时），使用以下定义
-- =====================================================

-- 仅在表不存在时创建（安全方式，不删除已有数据）
-- 注意：如果表已存在且数据需要保留，请勿执行以下 CREATE 语句
-- 以下语句仅在表不存在时生效
CREATE TABLE IF NOT EXISTS `openclaw_instances` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OpenClaw 运行时实例注册表';

-- =====================================================
-- 5. hermes_call_logs 表：修正索引名称
--    Entity 定义的索引名：
--      idx_hermes_call_logs_instance_id
--      idx_hermes_call_logs_user_id
--      idx_hermes_call_logs_created_at
--    现有 SQL 的索引名：
--      idx_hermes_call_logs_instance
--      idx_hermes_call_logs_user
--      idx_hermes_call_logs_created
--    需要重命名索引以匹配 Entity 定义
--    注意：TypeORM synchronize 模式下索引名不一致可能导致重复索引
-- =====================================================

-- 5.1 重命名 instance_id 索引
ALTER TABLE `hermes_call_logs` DROP INDEX `idx_hermes_call_logs_instance`, ADD INDEX `idx_hermes_call_logs_instance_id` (`instance_id`);
-- 5.2 重命名 user_id 索引
ALTER TABLE `hermes_call_logs` DROP INDEX `idx_hermes_call_logs_user`, ADD INDEX `idx_hermes_call_logs_user_id` (`user_id`);
-- 5.3 重命名 created_at 索引
ALTER TABLE `hermes_call_logs` DROP INDEX `idx_hermes_call_logs_created`, ADD INDEX `idx_hermes_call_logs_created_at` (`created_at`);

-- =====================================================
-- 6. hermes_instances 表：确保引擎和字符集一致
--    现有 999_create_missing_tables.sql 已有 ENGINE=InnoDB 但缺少 COLLATE
-- =====================================================
ALTER TABLE `hermes_instances` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE `hermes_call_logs` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE `hermes_skills` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 验证说明
-- =====================================================
-- 执行后可通过以下查询验证：
--
-- 检查 hermes_skills 新字段：
--   DESCRIBE hermes_skills;
--
-- 检查 hermes_skill_ratings 表：
--   DESCRIBE hermes_skill_ratings;
--
-- 检查 n8n_webhook_logs 新字段：
--   DESCRIBE n8n_webhook_logs;
--
-- 检查索引名称：
--   SHOW INDEX FROM hermes_call_logs;
--   SHOW INDEX FROM hermes_skill_ratings;
--   SHOW INDEX FROM openclaw_instances;
