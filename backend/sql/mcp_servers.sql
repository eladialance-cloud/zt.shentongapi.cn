-- =============================================================================
-- 深瞳 AI 智能中台 - MCP Server 配置表
-- 数据库：ai_agent
-- MySQL 版本：8.0+
-- 说明：存储用户配置的 MCP Server 信息，支持 stdio / http / streamable-http 传输
-- =============================================================================

USE `ai_agent`;

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- eco_mcp_servers - MCP Server 配置表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `eco_mcp_servers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `name` VARCHAR(128) NOT NULL COMMENT '服务器名称',
  `description` VARCHAR(512) DEFAULT NULL COMMENT '描述',
  `transport_type` ENUM('stdio', 'http', 'streamable-http') NOT NULL DEFAULT 'stdio' COMMENT '传输类型',
  `command` VARCHAR(256) DEFAULT NULL COMMENT 'stdio 模式启动命令',
  `args` JSON DEFAULT NULL COMMENT 'stdio 模式命令参数（JSON 数组）',
  `env` JSON DEFAULT NULL COMMENT 'stdio 模式环境变量（JSON 对象）',
  `url` VARCHAR(512) DEFAULT NULL COMMENT 'http 模式服务器 URL',
  `headers` JSON DEFAULT NULL COMMENT 'http 模式请求头（JSON 对象）',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `last_connected_at` DATETIME DEFAULT NULL COMMENT '最后连接时间',
  `tool_count` INT NOT NULL DEFAULT 0 COMMENT '工具数量',
  `status` ENUM('pending', 'connected', 'failed', 'disabled') NOT NULL DEFAULT 'pending' COMMENT '连接状态',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MCP Server 配置表';
