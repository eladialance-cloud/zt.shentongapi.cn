-- =====================================================
-- P2 编排：create_hermes_call_logs 支持本地编排上报（call_type=orchestrate）
-- 生成时间：2026-08-20
-- 说明：
--   1. instance_id 允许为空（本地 Hermes 编排上报无 create_hermes_instances 记录）
--   2. call_type 枚举增加 orchestrate
-- 执行方式：docker exec -i shentong-mysql mysql -u root -p<password> <dbname> < 本文件
-- =====================================================

SET NAMES utf8mb4;

-- 1. instance_id 允许为空
ALTER TABLE `create_hermes_call_logs` MODIFY COLUMN `instance_id` BIGINT NULL COMMENT 'Hermes 实例 ID（本地编排上报可为空）';

-- 2. call_type 增加 orchestrate
ALTER TABLE `create_hermes_call_logs` MODIFY COLUMN `call_type` ENUM('skill_execute','tool_call','agent_invoke','workflow_run','orchestrate') NOT NULL COMMENT '调用类型：orchestrate=本地 Hermes 编排上报';

-- 验证：
--   SHOW COLUMNS FROM create_hermes_call_logs LIKE 'call_type';
--   SHOW COLUMNS FROM create_hermes_call_logs LIKE 'instance_id';