-- ============================================================
-- 管理后台优化 Task 1: Agent 名称中文化
-- ============================================================
-- 执行前请备份 agents 表
-- 执行方式：手动在生产数据库执行，不随应用启动自动执行
-- 执行后：name 字段存中文名，displayName 字段保留为空（不影响已有功能）
--
-- 现状说明（2026-07-23 校对）：
--   经核查 _deploy_v4/backend/database/init.sql 与 003_alter_agents_add_fields.sql，
--   agents 表本身只有 `name` 列，并没有 `display_name` 列。
--   AgentEntity（modules/agent/entities/agent.entity.ts）也无 displayName 属性。
--   历史前端表单虽存在“显示名”输入框，但后端从未真正落库，列表返回也不包含该字段。
--   因此本迁移实际上是一次幂等的安全空操作（no-op）：
--     - 若数据库存在 display_name 列（兼容旧版本/分支），则用其值回填 name；
--     - 若不存在（当前主线 schema），则跳过 UPDATE，仅打印提示。
-- ============================================================

-- 仅当 agents 表存在 display_name 列时执行回填，避免在生产 schema 上报错。
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'agents'
    AND COLUMN_NAME = 'display_name'
);

-- 使用 PREPARE/EXECUTE 动态执行 UPDATE，因为 MySQL 不支持直接对“可能不存在的列”做条件 UPDATE。
SET @sql := IF(
  @col_exists > 0,
  'UPDATE agents SET name = COALESCE(display_name, name) WHERE display_name IS NOT NULL AND display_name != ''''',
  'SELECT ''agents.display_name 列不存在，跳过回填（name 已是中文显示名）'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 可选：若确认不再需要 display_name 列，可在后续迁移中执行（本次不执行，保留向后兼容）：
-- ALTER TABLE `agents` DROP COLUMN `display_name`;
