-- 深瞳AI v0.6.0 增量迁移：opc_agent_repo -> opc_agent_repos（表名对齐 + Agent 快照列）
-- 注意：MySQL 不支持 IF NOT EXISTS，重复执行会报 Duplicate/Table already exists，可忽略；
-- 后端启动迁移（db-migration.ts）已做幂等处理。
RENAME TABLE `opc_agent_repo` TO `opc_agent_repos`;

ALTER TABLE `opc_agent_repos`
  ADD COLUMN `agent_name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'Agent 名称快照' AFTER `agent_id`,
  ADD COLUMN `agent_avatar` VARCHAR(512) DEFAULT NULL COMMENT 'Agent 头像快照' AFTER `agent_name`,
  ADD COLUMN `description` VARCHAR(512) DEFAULT NULL COMMENT 'Agent 描述快照' AFTER `agent_avatar`,
  ADD COLUMN `version` VARCHAR(32) NOT NULL DEFAULT '1' COMMENT 'Agent 版本快照' AFTER `description`;
