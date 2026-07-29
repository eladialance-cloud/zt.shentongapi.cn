-- ============================================================
-- 006_create_n8n_workflow_lib.sql
-- N8N工作流库、执行日志、工作流-MCP资源映射
-- ============================================================

-- 全局工作流库
CREATE TABLE IF NOT EXISTS `n8n_workflow_lib` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL COMMENT '工作流名称',
  `description` TEXT NULL COMMENT '工作流描述',
  `category` VARCHAR(64) NULL COMMENT '分类: ai_collaboration/independent/automation',
  `workflow_json` TEXT NULL COMMENT 'N8N工作流JSON定义',
  `source_repo` VARCHAR(256) NULL COMMENT 'GitHub来源仓库',
  `source_path` VARCHAR(512) NULL COMMENT '来源文件路径',
  `version` VARCHAR(32) NULL COMMENT '版本号',
  `is_published` TINYINT(1) DEFAULT 0 COMMENT '是否已发布',
  `publish_status` ENUM('draft','pending_review','approved','published','rejected') DEFAULT 'draft' COMMENT '发布状态',
  `icon` VARCHAR(256) NULL COMMENT '图标URL',
  `tags` JSON NULL COMMENT '标签列表',
  `input_schema` JSON NULL COMMENT '参数表单定义',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_category` (`category`),
  INDEX `idx_publish_status` (`publish_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='全局N8N工作流库';

-- 工作流执行日志
CREATE TABLE IF NOT EXISTS `n8n_workflow_exec_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `workflow_lib_id` BIGINT NULL COMMENT '关联 n8n_workflow_lib.id',
  `n8n_instance_id` BIGINT NULL COMMENT 'N8N实例ID',
  `n8n_execution_id` VARCHAR(64) NULL COMMENT 'N8N执行ID',
  `task_id` BIGINT NULL COMMENT '关联 agent_task.id',
  `status` ENUM('queued','running','success','failed','cancelled') DEFAULT 'queued' COMMENT '执行状态',
  `input_data` JSON NULL COMMENT '输入数据',
  `output_data` JSON NULL COMMENT '输出数据',
  `error_message` TEXT NULL COMMENT '错误信息',
  `started_at` DATETIME NULL COMMENT '开始时间',
  `finished_at` DATETIME NULL COMMENT '结束时间',
  `duration_ms` INT NULL COMMENT '耗时(毫秒)',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_workflow_lib_id` (`workflow_lib_id`),
  INDEX `idx_task_id` (`task_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='N8N工作流执行日志';

-- 工作流-MCP资源映射
CREATE TABLE IF NOT EXISTS `workflow_mcp_bind` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workflow_lib_id` BIGINT NOT NULL COMMENT '关联 n8n_workflow_lib.id',
  `mcp_resource_id` BIGINT NOT NULL COMMENT '关联 mcp_resource_registry.id',
  `bind_type` ENUM('input','output','trigger') DEFAULT 'input' COMMENT '绑定类型',
  `config` JSON NULL COMMENT '绑定配置',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_workflow_resource` (`workflow_lib_id`, `mcp_resource_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流-MCP资源映射表';
