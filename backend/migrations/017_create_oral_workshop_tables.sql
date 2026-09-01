-- 口播工坊模块：任务表 + 步骤表
-- 对应实体：backend/src/modules/oral-workshop/entities/*.entity.ts
-- 说明：生产环境 DB_SYNCHRONIZE=false，由本 migration 管理表结构

CREATE TABLE IF NOT EXISTS create_oral_workshop_jobs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  client_txn_id VARCHAR(64) NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  current_step VARCHAR(32) NULL,
  script_input TEXT NULL,
  rewritten_script TEXT NULL,
  persona VARCHAR(512) NULL,
  digital_human_id BIGINT NULL,
  voice_id BIGINT NULL,
  template_id BIGINT NULL,
  video_url VARCHAR(512) NULL,
  audio_url VARCHAR(512) NULL,
  cover_url VARCHAR(512) NULL,
  publish_plan_id BIGINT NULL,
  credits_cost INT NOT NULL DEFAULT 0,
  frozen_txn_id BIGINT NULL,
  error VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT NOW(),
  updated_at DATETIME NOT NULL DEFAULT NOW(),
  INDEX idx_owj_user_id (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS create_oral_workshop_steps (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id BIGINT NOT NULL,
  step VARCHAR(32) NOT NULL,
  step_order INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  result_json JSON NULL,
  error VARCHAR(512) NULL,
  retry_count INT NOT NULL DEFAULT 0,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  INDEX idx_ows_job_id (job_id, step_order)
);
