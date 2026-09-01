-- P0-6 修复：为生产数据库添加 eco_runtime_versions 表
-- seed.sql 引用了此表但 init.sql 中缺少定义（已在新版 init.sql 中修复）
-- 执行方式：docker exec -i shentong-mysql mysql -u root -p<password> shentong_db < migration_add_runtime_versions.sql

CREATE TABLE IF NOT EXISTS `eco_runtime_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_name` VARCHAR(32) NOT NULL COMMENT '服务名称 (openclaw/n8n/mcp)',
  `version` VARCHAR(32) NOT NULL COMMENT '版本号',
  `platform` VARCHAR(16) NOT NULL COMMENT '平台 (win32-x64/linux-x64/darwin-x64/darwin-arm64)',
  `download_url` VARCHAR(512) NOT NULL COMMENT '下载地址',
  `sha256` CHAR(64) NOT NULL DEFAULT '' COMMENT 'SHA256 校验值',
  `changelog` TEXT DEFAULT NULL COMMENT '更新日志',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `force_update` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否强制更新',
  `min_app_version` VARCHAR(32) DEFAULT NULL COMMENT '最低兼容APP版本',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_service_active` (`service_name`, `is_active`),
  KEY `idx_service_name` (`service_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运行时引擎版本表';
