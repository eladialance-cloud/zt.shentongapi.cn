-- 会员与兑换码模块（M7）
-- 对应实体：backend/src/modules/payment/entities/user-membership.entity.ts / redeem-code.entity.ts
-- 说明：生产环境 DB_SYNCHRONIZE=false，由本 migration 管理表结构

CREATE TABLE IF NOT EXISTS user_memberships (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL UNIQUE,
  level VARCHAR(16) NOT NULL DEFAULT 'free',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  features_json JSON NULL,
  started_at DATETIME NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT NOW(),
  INDEX idx_um_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS redeem_codes (
  code VARCHAR(32) PRIMARY KEY,
  level VARCHAR(16) NOT NULL,
  duration_days INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'unused',
  used_by BIGINT NULL,
  used_at DATETIME NULL,
  batch_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT NOW(),
  INDEX idx_rc_status (status),
  INDEX idx_rc_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
