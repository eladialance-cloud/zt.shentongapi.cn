-- ============================================================
-- 005_create_sys_oss_config.sql
-- 系统对象存储配置表
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_oss_config` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL COMMENT '配置名称',
  `provider` ENUM('local','aliyun','tencent','qiniu','minio') DEFAULT 'local' COMMENT '存储提供商',
  `endpoint` VARCHAR(256) NULL COMMENT '接入端点',
  `region` VARCHAR(64) NULL COMMENT '区域',
  `bucket` VARCHAR(128) NULL COMMENT '存储桶',
  `access_key` VARCHAR(256) NULL COMMENT 'AccessKey',
  `secret_key` VARCHAR(512) NULL COMMENT 'SecretKey',
  `is_default` TINYINT(1) DEFAULT 0 COMMENT '是否默认存储',
  `is_active` TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  `extra_config` JSON NULL COMMENT '额外配置',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统对象存储配置表';
