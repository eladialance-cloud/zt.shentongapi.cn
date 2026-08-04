-- 深瞳AI v0.6.0 增量迁移：agent_installs 安装记录表（桌面端安装/卸载闭环）
CREATE TABLE IF NOT EXISTS `agent_installs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '安装记录 ID',
  `user_id` BIGINT NOT NULL COMMENT '用户 ID',
  `agent_id` BIGINT NOT NULL COMMENT 'Agent ID',
  `version` VARCHAR(32) DEFAULT NULL COMMENT '安装版本',
  `install_dir` VARCHAR(512) DEFAULT NULL COMMENT '安装目录',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_agent_installs_user_agent` (`user_id`, `agent_id`),
  KEY `idx_agent_installs_user_id` (`user_id`),
  KEY `idx_agent_installs_agent_id` (`agent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 安装记录表';
