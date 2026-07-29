-- ============================================================
-- Storage 模块数据库迁移
-- 表：storage_buckets, storage_objects
-- ============================================================

-- --------------------------------------------------------
-- 存储桶表
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `storage_buckets` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `name` VARCHAR(128) NOT NULL COMMENT '存储桶名称',
  `type` ENUM('local', 's3', 'oss', 'minio') NOT NULL DEFAULT 'local' COMMENT '存储类型',
  `config` JSON NULL COMMENT '存储配置（endpoint/bucket/region/accessKey/secretKey 等，敏感字段 AES 加密）',
  `quota_bytes` BIGINT NOT NULL DEFAULT 5368709120 COMMENT '配额（字节），默认 5GB',
  `used_bytes` BIGINT NOT NULL DEFAULT 0 COMMENT '已用（字节）',
  `status` ENUM('active', 'error') NOT NULL DEFAULT 'active' COMMENT '状态',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_storage_buckets_user_id` (`user_id`),
  UNIQUE INDEX `uk_storage_buckets_user_name` (`user_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='存储桶配置表';

-- --------------------------------------------------------
-- 存储对象表
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `storage_objects` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bucket_id` BIGINT NOT NULL COMMENT '所属存储桶ID',
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `file_key` VARCHAR(256) NOT NULL COMMENT '文件唯一标识',
  `filename` VARCHAR(256) NOT NULL COMMENT '原始文件名',
  `mime_type` VARCHAR(128) NULL COMMENT 'MIME 类型',
  `size` BIGINT NOT NULL COMMENT '文件大小（字节）',
  `storage_path` VARCHAR(512) NOT NULL COMMENT '实际存储路径',
  `url` VARCHAR(1024) NULL COMMENT '访问 URL',
  `metadata` JSON NULL COMMENT '元数据',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_storage_objects_file_key` (`file_key`),
  INDEX `idx_storage_objects_bucket_id` (`bucket_id`),
  INDEX `idx_storage_objects_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='存储对象表';
