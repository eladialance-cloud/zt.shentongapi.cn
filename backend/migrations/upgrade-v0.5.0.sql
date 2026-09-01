-- ============================================
-- 神通AI 管理后台 v0.5.0 数据库结构升级
-- 执行方式: mysql -u <user> -p <database> < this file
-- ============================================

-- ── 1. ai_models 表：新增连接凭据字段 ──
ALTER TABLE `ai_models`
  ADD COLUMN `api_endpoint` VARCHAR(512) NULL COMMENT 'API地址' AFTER `name`,
  ADD COLUMN `api_key` VARCHAR(512) NULL COMMENT 'AES加密的API Key' AFTER `api_endpoint`,
  ADD COLUMN `connection_status` VARCHAR(16) NOT NULL DEFAULT 'untested' COMMENT '连接状态' AFTER `api_key`,
  ADD COLUMN `last_tested_at` DATETIME NULL COMMENT '最后测试时间' AFTER `connection_status`;

-- ── 2. eco_agents 表：新增 displayName 字段 ──
ALTER TABLE `eco_agents`
  ADD COLUMN `display_name` VARCHAR(64) NULL COMMENT '显示名称' AFTER `name`;

-- ── 3. workflows 表：新增合并字段（从 n8n_workflow_lib 合并） ──
ALTER TABLE `workflows`
  ADD COLUMN `engine_type` VARCHAR(16) NOT NULL DEFAULT 'n8n' COMMENT '引擎类型' AFTER `description`,
  ADD COLUMN `category` VARCHAR(64) NOT NULL DEFAULT 'other' COMMENT '分类' AFTER `engine_type`,
  ADD COLUMN `workflow_json` MEDIUMTEXT NULL COMMENT 'n8n工作流JSON定义' AFTER `category`,
  ADD COLUMN `input_schema` JSON NULL COMMENT '输入参数Schema' AFTER `workflow_json`,
  ADD COLUMN `output_schema` JSON NULL COMMENT '输出参数Schema' AFTER `input_schema`,
  ADD COLUMN `n8n_workflow_id` VARCHAR(64) NULL COMMENT 'n8n工作流ID' AFTER `output_schema`,
  ADD COLUMN `coze_workflow_id` VARCHAR(64) NULL COMMENT 'Coze工作流ID' AFTER `n8n_workflow_id`,
  ADD COLUMN `source_repo` VARCHAR(256) NULL COMMENT 'GitHub来源仓库' AFTER `coze_workflow_id`,
  ADD COLUMN `source_path` VARCHAR(512) NULL COMMENT 'GitHub来源路径' AFTER `source_repo`,
  ADD COLUMN `version` VARCHAR(32) NULL COMMENT '版本号' AFTER `source_path`,
  ADD COLUMN `icon` VARCHAR(256) NULL COMMENT '图标URL' AFTER `version`,
  ADD COLUMN `tags` JSON NULL COMMENT '标签数组' AFTER `icon`,
  ADD COLUMN `price_per_execution` INT NOT NULL DEFAULT 0 COMMENT '每次执行积分价格' AFTER `tags`,
  ADD COLUMN `is_published` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已发布' AFTER `is_active`,
  ADD COLUMN `review_status` VARCHAR(32) NOT NULL DEFAULT 'pending_review' COMMENT '审核状态' AFTER `is_published`,
  ADD COLUMN `publish_status` ENUM('draft','pending_review','approved','published','rejected') NOT NULL DEFAULT 'draft' COMMENT '发布状态' AFTER `review_status`,
  ADD COLUMN `reject_reason` VARCHAR(512) NULL COMMENT '驳回原因' AFTER `publish_status`,
  ADD COLUMN `execution_count` INT NOT NULL DEFAULT 0 COMMENT '执行次数' AFTER `reject_reason`,
  ADD COLUMN `node_count` INT NOT NULL DEFAULT 0 COMMENT '节点数量' AFTER `execution_count`,
  ADD COLUMN `trigger_type` VARCHAR(64) NULL COMMENT '触发类型' AFTER `node_count`,
  ADD COLUMN `creator_name` VARCHAR(64) NULL COMMENT '创建者名称' AFTER `trigger_type`;

-- 添加索引
ALTER TABLE `workflows`
  ADD INDEX `idx_workflows_review_status` (`review_status`),
  ADD INDEX `idx_workflows_publish_status` (`publish_status`),
  ADD INDEX `idx_workflows_category` (`category`);

-- ── 4. 检查 admin_users 表是否存在（用户管理模块需要） ──
-- 如果已存在则跳过此部分
-- CREATE TABLE IF NOT EXISTS `admin_users` ...

-- ── 完成 ──
SELECT 'Database schema upgrade completed successfully!' AS result;
