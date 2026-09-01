-- 012_create_skill_store_tables.sql
-- 深瞳AI v0.6.0：技能商店三表（eco_skill_packages / eco_skill_sources / eco_skill_install_logs）
-- 幂等：IF NOT EXISTS，可重复执行
-- 执行：bash update_db_0.6.0.sh

CREATE TABLE IF NOT EXISTS `eco_skill_packages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `display_name` VARCHAR(512) NOT NULL,
  `description` VARCHAR(512) NOT NULL,
  `skill_type` VARCHAR(32) NOT NULL DEFAULT 'skill',
  `runtime_type` VARCHAR(32) NOT NULL,
  `category` VARCHAR(32) DEFAULT NULL,
  `source_url` VARCHAR(512) NOT NULL,
  `install_path` VARCHAR(512) DEFAULT NULL,
  `skill_md_path` VARCHAR(512) DEFAULT NULL,
  `entry_point` VARCHAR(256) DEFAULT NULL,
  `input_schema` JSON DEFAULT NULL,
  `output_schema` JSON DEFAULT NULL,
  `dependencies` JSON DEFAULT NULL,
  `trigger_keywords` JSON DEFAULT NULL,
  `examples` JSON DEFAULT NULL,
  `ui_config` JSON DEFAULT NULL,
  `opc_agent_config` JSON DEFAULT NULL,
  `status` ENUM('draft','reviewing','approved','published','unpublished','failed') NOT NULL DEFAULT 'draft',
  `review_status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `review_note` VARCHAR(512) DEFAULT NULL,
  `is_official` TINYINT(1) NOT NULL DEFAULT 0,
  `call_count` INT NOT NULL DEFAULT 0,
  `avg_rating` DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  `version` VARCHAR(32) NOT NULL DEFAULT '1.0.0',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_skill_packages_name` (`name`),
  KEY `idx_skill_packages_status` (`status`),
  KEY `idx_skill_packages_skill_type` (`skill_type`),
  KEY `idx_skill_packages_is_official` (`is_official`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能商店-技能包';

CREATE TABLE IF NOT EXISTS `eco_skill_sources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_url` VARCHAR(512) NOT NULL,
  `source_type` VARCHAR(32) NOT NULL DEFAULT 'github',
  `skill_name` VARCHAR(64) NOT NULL,
  `skill_desc` VARCHAR(512) NOT NULL,
  `skill_type` VARCHAR(32) NOT NULL DEFAULT 'skill',
  `auto_detected_type` VARCHAR(32) DEFAULT NULL,
  `status` ENUM('pending','analyzing','analyzed','failed') NOT NULL DEFAULT 'pending',
  `analyze_result` JSON DEFAULT NULL,
  `error_message` VARCHAR(1024) DEFAULT NULL,
  `package_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_skill_sources_source_url` (`source_url`),
  KEY `idx_skill_sources_package_id` (`package_id`),
  KEY `idx_skill_sources_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能商店-技能来源';

CREATE TABLE IF NOT EXISTS `eco_skill_install_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `package_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED DEFAULT NULL,
  `action` VARCHAR(32) NOT NULL,
  `result` VARCHAR(32) NOT NULL DEFAULT 'success',
  `error_message` VARCHAR(1024) DEFAULT NULL,
  `duration_ms` INT NOT NULL DEFAULT 0,
  `detail` JSON DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_skill_install_logs_package_id` (`package_id`),
  KEY `idx_skill_install_logs_user_id` (`user_id`),
  KEY `idx_skill_install_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能商店-安装/执行日志';
