-- 深瞳AI v0.6.0 增量迁移：chat_sessions 补充桌面端会话字段（置顶/状态/最后消息/知识库）
-- 幂等说明：列已存在时 MySQL 会报错，可忽略 Duplicate column 错误；或由后端启动迁移自动补列。
ALTER TABLE `chat_sessions`
  ADD COLUMN `knowledge_base_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '当前挂载知识库 ID' AFTER `user_id`,
  ADD COLUMN `pinned` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否置顶' AFTER `knowledge_base_id`,
  ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '会话状态' AFTER `pinned`,
  ADD COLUMN `last_message_at` DATETIME DEFAULT NULL COMMENT '最后消息时间' AFTER `status`;
