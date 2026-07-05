// 本地数据库 Schema 定义
// 5 张本地表，字段命名与云端 MySQL 对齐（snake_case）

export const SCHEMA_SQL = `
-- 1. 本地对话会话表（对应云端 chat_sessions）
CREATE TABLE IF NOT EXISTS local_chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id VARCHAR(64) UNIQUE NOT NULL,
  user_id BIGINT NOT NULL,
  title VARCHAR(256),
  model_id VARCHAR(128),
  agent_id BIGINT,
  knowledge_base_id BIGINT,
  status VARCHAR(32) DEFAULT 'active',
  pinned BOOLEAN DEFAULT 0,
  last_message_at DATETIME,
  cloud_synced BOOLEAN DEFAULT 0,
  client_txn_id VARCHAR(64) UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 本地对话消息表（对应云端 chat_messages）
CREATE TABLE IF NOT EXISTS local_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id VARCHAR(64) UNIQUE NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  role VARCHAR(16) NOT NULL,
  content TEXT,
  tool_calls JSON,
  token_usage JSON,
  credits_cost DECIMAL(12,4) DEFAULT 0,
  status VARCHAR(16) DEFAULT 'success',
  cloud_synced BOOLEAN DEFAULT 0,
  client_txn_id VARCHAR(64) UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 本地工作流执行表（对应云端 workflow_executions）
CREATE TABLE IF NOT EXISTS local_workflow_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id VARCHAR(64) UNIQUE NOT NULL,
  workflow_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  status VARCHAR(16) DEFAULT 'running',
  input JSON,
  output JSON,
  duration_ms INT,
  credits_cost INT DEFAULT 0,
  retry_count INT DEFAULT 0,
  cloud_synced BOOLEAN DEFAULT 0,
  client_txn_id VARCHAR(64) UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. 本地插件调用日志表（对应云端 plugin_call_logs）
CREATE TABLE IF NOT EXISTS local_plugin_call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id VARCHAR(64) UNIQUE NOT NULL,
  plugin_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  session_id VARCHAR(64),
  input JSON,
  output JSON,
  status VARCHAR(16) DEFAULT 'success',
  duration_ms INT,
  credits_cost INT DEFAULT 0,
  cloud_synced BOOLEAN DEFAULT 0,
  client_txn_id VARCHAR(64) UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. 本地同步队列表（离线调用队列）
CREATE TABLE IF NOT EXISTS local_sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_txn_id VARCHAR(64) UNIQUE NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  operation VARCHAR(16) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(16) DEFAULT 'pending',
  retry_count INT DEFAULT 0,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_local_chat_sessions_user_id ON local_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_local_chat_messages_session_id ON local_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_local_workflow_executions_user_id ON local_workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_local_plugin_call_logs_user_id ON local_plugin_call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_local_sync_queue_status ON local_sync_queue(status);
`
