-- Hermes 模块建表脚本
-- 004_hermes_tables.sql

CREATE TABLE IF NOT EXISTS hermes_instances (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(64) NOT NULL,
  status ENUM('running','stopped','error') DEFAULT 'stopped',
  pid INT NULL COMMENT '子进程PID',
  skill_count INT DEFAULT 0,
  skill_ids JSON COMMENT '已挂载技能包ID列表',
  error_message VARCHAR(512) NULL,
  cpu_percent DECIMAL(5,2) DEFAULT 0,
  memory_used_mb INT DEFAULT 0,
  memory_total_mb INT DEFAULT 0,
  started_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hermes_user (user_id),
  INDEX idx_hermes_status (status)
);

CREATE TABLE IF NOT EXISTS hermes_call_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  instance_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  call_type ENUM('skill_execute','tool_call','agent_invoke','workflow_run') NOT NULL,
  status ENUM('success','failed','timeout','running') NOT NULL DEFAULT 'running',
  duration_ms INT DEFAULT 0,
  credits_cost INT DEFAULT 0,
  target VARCHAR(128) NULL COMMENT '调用的技能/工具/工作流名称',
  error_message VARCHAR(512) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hermes_call_logs_instance (instance_id),
  INDEX idx_hermes_call_logs_user (user_id),
  INDEX idx_hermes_call_logs_created (created_at)
);

CREATE TABLE IF NOT EXISTS hermes_skills (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  author VARCHAR(64),
  price_per_minute INT DEFAULT 0 COMMENT '积分/分钟，0=免费',
  install_count INT DEFAULT 0,
  icon VARCHAR(512),
  version VARCHAR(64) DEFAULT '1.0.0',
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hermes_skills_active (is_active)
);
