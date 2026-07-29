-- ============================================================
-- 007_create_task_tables.sql
-- 通用任务主表 + 任务输出项
-- ============================================================

-- 通用任务主表
CREATE TABLE IF NOT EXISTS `agent_task` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `agent_id` BIGINT NULL COMMENT '关联 agents.id',
  `task_type` ENUM('chat','workflow','skill','multi_agent','codex') DEFAULT 'chat' COMMENT '任务类型',
  `title` VARCHAR(256) NULL COMMENT '任务标题',
  `input_text` TEXT NULL COMMENT '用户输入',
  `input_params` JSON NULL COMMENT '结构化参数',
  `status` ENUM('queued','running','success','failed','cancelled') DEFAULT 'queued' COMMENT '任务状态',
  `hermes_task_id` VARCHAR(64) NULL COMMENT 'Hermes任务ID，多Agent时',
  `error_message` TEXT NULL COMMENT '错误信息',
  `started_at` DATETIME NULL COMMENT '开始时间',
  `finished_at` DATETIME NULL COMMENT '结束时间',
  `duration_ms` INT NULL COMMENT '耗时(毫秒)',
  `credits_cost` INT DEFAULT 0 COMMENT '积分消耗',
  `credits_frozen` INT DEFAULT 0 COMMENT '冻结积分',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_agent_id` (`agent_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_task_type` (`task_type`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用任务主表';

-- 任务输出项
CREATE TABLE IF NOT EXISTS `task_output_item` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `task_id` BIGINT NOT NULL COMMENT '关联 agent_task.id',
  `output_type` ENUM('text','form','image','audio','video') DEFAULT 'text' COMMENT '输出类型',
  `content` TEXT NULL COMMENT '文本内容或文件URL',
  `content_json` JSON NULL COMMENT '结构化数据，如表格',
  `file_url` VARCHAR(512) NULL COMMENT '文件URL',
  `file_size` BIGINT NULL COMMENT '文件大小(字节)',
  `mime_type` VARCHAR(128) NULL COMMENT 'MIME类型',
  `sort_order` INT DEFAULT 0 COMMENT '排序',
  `metadata` JSON NULL COMMENT '元数据',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_task_id` (`task_id`),
  INDEX `idx_output_type` (`output_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务输出项';
