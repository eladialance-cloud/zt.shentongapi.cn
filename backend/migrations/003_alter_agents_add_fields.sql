-- ============================================================
-- 003_alter_agents_add_fields.sql
-- 为 agents 表追加部门、MCP寻址、输出规则、模型配置等字段
-- ============================================================

ALTER TABLE `agents`
  ADD COLUMN `dept_id` BIGINT NULL COMMENT '关联 agent_department.id' AFTER `updated_at`,
  ADD COLUMN `agent_key` VARCHAR(128) NULL COMMENT 'Agent唯一标识key，用于MCP资源寻址' AFTER `dept_id`,
  ADD COLUMN `output_rule` JSON NULL COMMENT '输出规则配置' AFTER `agent_key`,
  ADD COLUMN `model_config` JSON NULL COMMENT '模型参数配置，如temperature/max_tokens' AFTER `output_rule`,
  ADD COLUMN `use_codex` TINYINT(1) DEFAULT 0 COMMENT '是否使用CodeX沙箱' AFTER `model_config`,
  ADD COLUMN `codex_runtime_config` JSON NULL COMMENT 'CodeX运行时配置' AFTER `use_codex`,
  ADD COLUMN `version` INT DEFAULT 1 COMMENT '版本号' AFTER `codex_runtime_config`,
  ADD INDEX `idx_dept_id` (`dept_id`),
  ADD INDEX `idx_agent_key` (`agent_key`);
