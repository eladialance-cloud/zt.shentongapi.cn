-- =============================================================================
-- 深瞳 AI 智能中台 - 补缺失表迁移脚本
-- 创建时间: 2026-07-12
-- 说明: 补齐 19 个 Entity 有定义但 SQL 缺失的建表语句
-- 执行方式: docker exec -i shentong-mysql mysql -u root -p<password> shentong_db < 008_create_missing_tables.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. agent_categories - Agent 分类表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `agent_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `category` VARCHAR(64) NOT NULL COMMENT '分类标识',
  `display_name` VARCHAR(64) NOT NULL COMMENT '分类显示名称',
  `sort` INT NOT NULL DEFAULT 0 COMMENT '排序权重',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uk_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 分类表';

-- -----------------------------------------------------------------------------
-- 2. ai_audit_config - AI 审核配置表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_audit_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `config` JSON NOT NULL COMMENT 'AI 审核配置 JSON',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 审核配置表';

-- -----------------------------------------------------------------------------
-- 3. audit_queue - 审核队列表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_queue` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `type` ENUM('conversation','agent','plugin','workflow') NOT NULL COMMENT '审核类型',
  `content_summary` VARCHAR(512) NOT NULL COMMENT '内容摘要',
  `content` TEXT NULL COMMENT '完整内容',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `username` VARCHAR(64) NULL COMMENT '用户名',
  `trigger_reason` ENUM('sensitive_word','ai_audit') NOT NULL DEFAULT 'sensitive_word' COMMENT '触发原因',
  `hit_words` JSON NULL COMMENT '命中的敏感词列表',
  `risk_level` ENUM('low','medium','high') NOT NULL DEFAULT 'low' COMMENT '风险等级',
  `status` ENUM('pending','approved','rejected','false_positive') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `processed_by` VARCHAR(64) NULL COMMENT '处理人',
  `processed_at` DATETIME NULL COMMENT '处理时间',
  `process_remark` VARCHAR(512) NULL COMMENT '处理备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_type` (`type`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核队列表';

-- -----------------------------------------------------------------------------
-- 4. sensitive_words - 敏感词表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sensitive_words` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `word` VARCHAR(128) NOT NULL COMMENT '敏感词',
  `category` ENUM('politics','porn','violence','ad','other') NOT NULL DEFAULT 'other' COMMENT '敏感词分类',
  `level` ENUM('block','replace','review') NOT NULL DEFAULT 'review' COMMENT '处理级别',
  `replacement` VARCHAR(128) NULL COMMENT '替换词',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uk_word` (`word`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='敏感词表';

-- -----------------------------------------------------------------------------
-- 5. invoices - 发票表 (无 BaseEntity，自有主键 + CreateDateColumn)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `apply_no` VARCHAR(64) NOT NULL COMMENT '申请编号',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `order_no` VARCHAR(64) NOT NULL COMMENT '订单编号',
  `invoice_type` VARCHAR(16) NOT NULL DEFAULT 'personal' COMMENT '发票类型: personal/company',
  `title` VARCHAR(256) NOT NULL COMMENT '发票抬头',
  `tax_no` VARCHAR(64) NULL COMMENT '税号',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '开票金额',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/issued/rejected',
  `invoice_number` VARCHAR(128) NULL COMMENT '发票号码',
  `invoice_url` VARCHAR(512) NULL COMMENT '发票文件 URL',
  `reject_reason` VARCHAR(512) NULL COMMENT '驳回原因',
  `issued_at` DATETIME NULL COMMENT '开票时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE INDEX `uk_apply_no` (`apply_no`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发票表';

-- -----------------------------------------------------------------------------
-- 6. announcements - 公告表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `announcements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(128) NOT NULL COMMENT '公告标题',
  `content` TEXT NOT NULL COMMENT '公告内容',
  `type` ENUM('info','warning','critical') NOT NULL DEFAULT 'info' COMMENT '公告类型',
  `scope` ENUM('all','level_specific') NOT NULL DEFAULT 'all' COMMENT '公告范围',
  `target_level` INT NULL COMMENT '目标用户等级 (scope=level_specific 时使用)',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `status` ENUM('draft','published') NOT NULL DEFAULT 'draft' COMMENT '发布状态',
  `published_at` DATETIME NULL COMMENT '发布时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公告表';

-- -----------------------------------------------------------------------------
-- 7. system_config - 系统配置表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `section` VARCHAR(32) NOT NULL COMMENT '配置分区标识',
  `config_value` JSON NOT NULL COMMENT '配置值 JSON',
  `description` VARCHAR(256) NULL COMMENT '配置描述',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uk_section` (`section`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- -----------------------------------------------------------------------------
-- 8. tenants - 租户表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tenants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL COMMENT '租户名称',
  `quota` JSON NOT NULL COMMENT '配额配置 JSON',
  `status` ENUM('active','suspended') NOT NULL DEFAULT 'active' COMMENT '租户状态',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uk_name` (`name`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='租户表';

-- -----------------------------------------------------------------------------
-- 9. workflows - 工作流表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `workflows` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL COMMENT '工作流名称',
  `description` VARCHAR(1024) NULL COMMENT '工作流描述',
  `engine_type` VARCHAR(16) NOT NULL DEFAULT 'n8n' COMMENT '引擎类型: n8n/coze',
  `n8n_workflow_id` VARCHAR(64) NULL COMMENT 'n8n 工作流 ID',
  `coze_workflow_id` VARCHAR(64) NULL COMMENT 'Coze 工作流 ID',
  `category` VARCHAR(32) NOT NULL DEFAULT 'other' COMMENT '分类',
  `input_schema` JSON NULL COMMENT '输入参数 schema',
  `output_schema` JSON NULL COMMENT '输出参数 schema',
  `price_per_execution` INT NOT NULL DEFAULT 0 COMMENT '每次执行消耗积分',
  `is_active` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用',
  `review_status` VARCHAR(32) NOT NULL DEFAULT 'pending_review' COMMENT '审核状态',
  `reject_reason` VARCHAR(512) NULL COMMENT '驳回原因',
  `execution_count` INT NOT NULL DEFAULT 0 COMMENT '执行次数',
  `creator_name` VARCHAR(64) NULL COMMENT '创建者名称',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流表';

-- -----------------------------------------------------------------------------
-- 10. api_key_pool - API Key 池表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `api_key_pool` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `model_config_id` BIGINT UNSIGNED NULL COMMENT '关联模型配置 ID',
  `provider` VARCHAR(32) NOT NULL COMMENT 'API 提供商',
  `api_key` VARCHAR(512) NOT NULL COMMENT 'API Key',
  `alias` VARCHAR(64) NULL COMMENT '别名',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '优先级',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled/exhausted/error',
  `total_quota` DECIMAL(12,4) NOT NULL COMMENT '总配额',
  `used_quota` DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '已用配额',
  `remaining_quota` DECIMAL(12,4) NOT NULL COMMENT '剩余配额',
  `daily_quota` DECIMAL(12,4) NULL COMMENT '每日配额上限',
  `monthly_quota` DECIMAL(12,4) NULL COMMENT '每月配额上限',
  `daily_used_quota` DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '当日已用配额',
  `monthly_used_quota` DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '当月已用配额',
  `last_used_at` DATETIME NULL COMMENT '最后使用时间',
  `last_check_at` DATETIME NULL COMMENT '最后检查时间',
  `error_count` INT NOT NULL DEFAULT 0 COMMENT '错误次数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_model_config_id` (`model_config_id`),
  INDEX `idx_provider` (`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API Key 池表';

-- -----------------------------------------------------------------------------
-- 11. credit_accounts - 积分账户表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `credit_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `balance` INT NOT NULL DEFAULT 0 COMMENT '可用余额',
  `frozen_balance` INT NOT NULL DEFAULT 0 COMMENT '冻结余额',
  `total_recharged` INT NOT NULL DEFAULT 0 COMMENT '累计充值',
  `total_consumed` INT NOT NULL DEFAULT 0 COMMENT '累计消费',
  `version` INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uk_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分账户表';

-- -----------------------------------------------------------------------------
-- 12. credit_transactions - 积分交易流水表 (无 BaseEntity，自有主键 + CreateDateColumn)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `credit_transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `type` VARCHAR(32) NOT NULL COMMENT '交易类型: recharge/consume/refund/freeze/unfreeze/admin_adjust',
  `amount` INT NOT NULL COMMENT '交易金额 (正数增加/负数减少)',
  `balance_before` INT NOT NULL COMMENT '交易前余额',
  `balance_after` INT NOT NULL COMMENT '交易后余额',
  `source` VARCHAR(32) NOT NULL COMMENT '来源: order/admin/system',
  `source_id` VARCHAR(64) NOT NULL COMMENT '来源关联 ID',
  `frozen_txn_id` BIGINT UNSIGNED NULL COMMENT '关联冻结交易 ID',
  `remark` VARCHAR(512) NULL COMMENT '备注',
  `admin_id` BIGINT UNSIGNED NULL COMMENT '操作管理员 ID',
  `settled_at` DATETIME NULL COMMENT '结算时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_source_id` (`source_id`),
  INDEX `idx_frozen_txn_id` (`frozen_txn_id`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分交易流水表';

-- -----------------------------------------------------------------------------
-- 13. credits_config - 积分配置表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `credits_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `config_key` VARCHAR(64) NOT NULL COMMENT '配置键',
  `config_value` JSON NOT NULL COMMENT '配置值 JSON',
  `description` VARCHAR(256) NULL COMMENT '配置描述',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uk_config_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分配置表';

-- -----------------------------------------------------------------------------
-- 14. user_plugins - 用户插件关联表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_plugins` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL COMMENT '用户 ID',
  `plugin_id` INT NOT NULL COMMENT '插件 ID',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `is_installed` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否已安装',
  `config` JSON NULL COMMENT '插件配置 JSON',
  `installed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '安装时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uk_user_plugin` (`user_id`, `plugin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户插件关联表';

-- -----------------------------------------------------------------------------
-- 15. reconciliation_diff - 对账差异表 (无 BaseEntity，自有主键 + CreateDateColumn)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reconciliation_diff` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `type` VARCHAR(32) NOT NULL COMMENT '对账类型',
  `user_id` BIGINT UNSIGNED NULL COMMENT '用户 ID',
  `diff_amount` DECIMAL(12,4) NOT NULL COMMENT '差异金额',
  `detail` JSON NULL COMMENT '差异详情 JSON',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/resolved',
  `resolved_by` BIGINT UNSIGNED NULL COMMENT '处理人 ID',
  `resolved_at` DATETIME NULL COMMENT '处理时间',
  `remark` VARCHAR(512) NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对账差异表';

-- -----------------------------------------------------------------------------
-- 16. runtime_versions - 运行时版本表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `runtime_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `service_name` VARCHAR(32) NOT NULL COMMENT '服务名称',
  `version` VARCHAR(32) NOT NULL COMMENT '版本号',
  `platform` VARCHAR(16) NOT NULL COMMENT '平台: windows/mac/linux',
  `download_url` VARCHAR(512) NOT NULL COMMENT '下载地址',
  `sha256` CHAR(64) NOT NULL COMMENT 'SHA256 校验值',
  `changelog` TEXT NULL COMMENT '更新日志',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `force_update` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否强制更新',
  `min_app_version` VARCHAR(32) NULL COMMENT '最低兼容 App 版本',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_service_name` (`service_name`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_service_active` (`service_name`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运行时版本表';

-- -----------------------------------------------------------------------------
-- 17. daily_stats - 每日统计表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `daily_stats` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `date` DATE NOT NULL COMMENT '统计日期',
  `dau` INT NOT NULL DEFAULT 0 COMMENT '日活跃用户数',
  `new_users` INT NOT NULL DEFAULT 0 COMMENT '新增用户数',
  `total_users` INT NOT NULL DEFAULT 0 COMMENT '总用户数',
  `total_calls` INT NOT NULL DEFAULT 0 COMMENT '总调用次数',
  `total_revenue` DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '总收入',
  `total_consumed` DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '总消耗',
  `avg_order_value` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '平均订单金额',
  `online_users` INT NOT NULL DEFAULT 0 COMMENT '在线用户数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uk_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日统计表';

-- -----------------------------------------------------------------------------
-- 18. sync_records - 同步记录表 (无 BaseEntity，自有主键 + CreateDateColumn)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sync_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `client_txn_id` VARCHAR(64) NOT NULL COMMENT '客户端事务 ID',
  `type` VARCHAR(32) NOT NULL COMMENT '同步类型',
  `payload` JSON NOT NULL COMMENT '同步数据 JSON',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/processed/failed',
  `error_msg` TEXT NULL COMMENT '错误信息',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `processed_at` DATETIME NULL COMMENT '处理时间',
  INDEX `idx_user_id` (`user_id`),
  UNIQUE INDEX `uk_client_txn_id` (`client_txn_id`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='同步记录表';

-- -----------------------------------------------------------------------------
-- 19. client_versions - 客户端版本表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `client_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `version` VARCHAR(32) NOT NULL COMMENT '版本号',
  `platform` VARCHAR(16) NOT NULL COMMENT '平台: windows/mac/linux/android/ios',
  `download_url` VARCHAR(512) NOT NULL COMMENT '下载地址',
  `changelog` TEXT NULL COMMENT '更新日志',
  `force_update` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否强制更新',
  `grayscale_percent` INT NOT NULL DEFAULT 100 COMMENT '灰度发布百分比 (0-100)',
  `published_at` DATETIME NULL COMMENT '发布时间',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_version` (`version`),
  INDEX `idx_platform` (`platform`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户端版本表';
