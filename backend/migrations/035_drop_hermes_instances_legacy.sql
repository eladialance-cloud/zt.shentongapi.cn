-- Hermes 实例功能下线（补）：生产库历史建表名为 hermes_instances（非 create_ 前缀），034 未覆盖
-- 两个候选表名一并清理（IF EXISTS 幂等，无外键引用）
DROP TABLE IF EXISTS `hermes_instances`;
DROP TABLE IF EXISTS `create_hermes_instances`;
