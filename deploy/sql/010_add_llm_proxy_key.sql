-- 深瞳AI v0.3.1 Hermes Agent LLM 代理集成
-- 为 users 表添加 llm_proxy_key 列

ALTER TABLE users
  ADD COLUMN llm_proxy_key VARCHAR(128) NULL UNIQUE
  COMMENT '长期 LLM 代理 API Key (sk-shentong-xxxx 格式)';
