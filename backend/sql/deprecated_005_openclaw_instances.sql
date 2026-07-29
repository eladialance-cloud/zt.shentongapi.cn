-- OpenClaw 模块建表脚本
-- 005_openclaw_instances.sql

CREATE TABLE IF NOT EXISTS openclaw_instances (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NULL COMMENT '关联 agents 表 id',
  openclaw_agent_id VARCHAR(64) NOT NULL COMMENT 'OpenClaw 侧 agentId',
  endpoint VARCHAR(256) NOT NULL DEFAULT 'http://localhost:8080' COMMENT 'OpenClaw API 地址',
  status ENUM('online','offline','error') DEFAULT 'offline',
  last_heartbeat_at DATETIME NULL,
  config JSON NULL COMMENT 'SOUL.md/工具策略/MCP 配置等',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_openclaw_user (user_id),
  INDEX idx_openclaw_agent (agent_id),
  UNIQUE INDEX uk_openclaw_agent (openclaw_agent_id)
);
