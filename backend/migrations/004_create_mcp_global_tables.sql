-- ============================================================
-- 004_create_mcp_global_tables.sql
-- MCP全局表：服务配置、工具注册、资源注册、调用日志
-- ============================================================

-- 全局MCP服务配置
CREATE TABLE IF NOT EXISTS `mcp_server_config` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL COMMENT '服务名称',
  `description` VARCHAR(512) NULL COMMENT '服务描述',
  `transport_type` ENUM('stdio','http','streamable-http') DEFAULT 'stdio' COMMENT '传输类型',
  `command` VARCHAR(256) NULL COMMENT 'stdio模式下的启动命令',
  `args` JSON NULL COMMENT '命令参数列表',
  `env` JSON NULL COMMENT '环境变量',
  `url` VARCHAR(512) NULL COMMENT 'HTTP/streamable-http模式的URL',
  `headers` JSON NULL COMMENT 'HTTP请求头',
  `is_system` TINYINT(1) DEFAULT 0 COMMENT '是否系统内置服务: OpenClaw/CodeX/N8N',
  `service_type` ENUM('openclaw','codex','n8n','custom') DEFAULT 'custom' COMMENT '服务类型',
  `enabled` TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  `status` ENUM('pending','connected','failed','disabled') DEFAULT 'pending' COMMENT '连接状态',
  `last_connected_at` DATETIME NULL COMMENT '最后连接时间',
  `tool_count` INT DEFAULT 0 COMMENT '工具数量',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='全局MCP服务配置';

-- MCP工具注册表
CREATE TABLE IF NOT EXISTS `mcp_tool_registry` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `server_id` BIGINT NOT NULL COMMENT '关联 mcp_server_config.id',
  `tool_name` VARCHAR(128) NOT NULL COMMENT '工具名称',
  `display_name` VARCHAR(128) NULL COMMENT '显示名称',
  `description` TEXT NULL COMMENT '工具描述',
  `input_schema` JSON NULL COMMENT '工具输入参数JSON Schema',
  `category` VARCHAR(64) NULL COMMENT '工具分类',
  `is_enabled` TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  `call_count` INT DEFAULT 0 COMMENT '调用次数',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_server_id` (`server_id`),
  UNIQUE KEY `uk_server_tool` (`server_id`, `tool_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MCP工具注册表';

-- MCP资源注册表
CREATE TABLE IF NOT EXISTS `mcp_resource_registry` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `server_id` BIGINT NOT NULL COMMENT '关联 mcp_server_config.id',
  `resource_uri` VARCHAR(256) NOT NULL COMMENT '资源URI，如 agent://xxx',
  `resource_type` ENUM('agent','workflow','data','file','prompt') DEFAULT 'agent' COMMENT '资源类型',
  `display_name` VARCHAR(128) NULL COMMENT '显示名称',
  `description` TEXT NULL COMMENT '资源描述',
  `metadata` JSON NULL COMMENT '元数据',
  `is_enabled` TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_server_id` (`server_id`),
  INDEX `idx_resource_type` (`resource_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MCP资源注册表';

-- MCP调用日志
CREATE TABLE IF NOT EXISTS `mcp_call_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NULL COMMENT '用户ID',
  `server_id` BIGINT NULL COMMENT '关联 mcp_server_config.id',
  `tool_name` VARCHAR(128) NULL COMMENT '工具名称',
  `resource_uri` VARCHAR(256) NULL COMMENT '资源URI',
  `call_type` ENUM('tool','resource') DEFAULT 'tool' COMMENT '调用类型',
  `request_data` JSON NULL COMMENT '请求数据',
  `response_data` JSON NULL COMMENT '响应数据',
  `status` ENUM('success','failed','timeout') DEFAULT 'success' COMMENT '调用状态',
  `error_message` TEXT NULL COMMENT '错误信息',
  `duration_ms` INT NULL COMMENT '耗时(毫秒)',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_server_id` (`server_id`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MCP调用日志';
