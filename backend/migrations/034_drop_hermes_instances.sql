-- Hermes 实例功能下线：删除实例表（无外键引用，create_hermes_call_logs.instance_id 仅为普通索引列）
DROP TABLE IF EXISTS `create_hermes_instances`;
