-- 口播工坊：我的声音 / 我的数字人形象资产表（幂等：表已存在时跳过）
-- 对应实体：backend/src/modules/oral-workshop/entities/voice-asset.entity.ts、digital-human-asset.entity.ts
-- 启动迁移 db-migration.ts 也会自动补建

CREATE TABLE IF NOT EXISTS voice_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(128) NOT NULL,
  ref_audio_url VARCHAR(512) NOT NULL,
  speaker_id VARCHAR(128),
  status VARCHAR(16) NOT NULL DEFAULT 'ready',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_va_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='口播工坊-我的声音资产';

CREATE TABLE IF NOT EXISTS digital_human_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(128) NOT NULL,
  cloud_id VARCHAR(128) NOT NULL,
  preview_url VARCHAR(512),
  authorized TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(16) NOT NULL DEFAULT 'ready',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dha_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='口播工坊-我的数字人形象';
