-- =============================================================================
-- 深瞳 AI 智能中台 - 数据库初始化脚本
-- 数据库：ai_agent
-- MySQL 版本：8.0+
-- 字符集：utf8mb4 / utf8mb4_unicode_ci
-- 引擎：InnoDB
-- 文档依据：《开发文档-数据库设计.md》v1.0 + 前端类型定义
-- =============================================================================

-- 删除已存在的数据库 (开发环境使用，生产环境请注释)
DROP DATABASE IF EXISTS `ai_agent`;

-- 创建数据库
CREATE DATABASE `ai_agent`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `ai_agent`;

-- 设置严格模式
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- 一、用户体系表 (5 张)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 用户表 (users) - 文档 3.1.1
-- -----------------------------------------------------------------------------
CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户 ID',
  `username` VARCHAR(64) NOT NULL COMMENT '用户名 (全局唯一)',
  `email` VARCHAR(128) NOT NULL COMMENT '邮箱 (全局唯一)',
  `password` VARCHAR(128) NOT NULL COMMENT 'bcrypt 哈希密码',
  `phone` VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  `avatar` VARCHAR(512) DEFAULT NULL COMMENT '头像 URL',
  `status` ENUM('active', 'banned') NOT NULL DEFAULT 'active' COMMENT '账户状态 (active正常/banned封禁)',
  `real_name_verified` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '实名认证状态',
  `level` INT NOT NULL DEFAULT 0 COMMENT '用户等级 (0=免费/1=专业/2=企业)',
  `ban_reason` VARCHAR(512) DEFAULT NULL COMMENT '封禁原因',
  `ban_duration` VARCHAR(16) DEFAULT NULL COMMENT '封禁时长 (permanent/temporary)',
  `ban_until` DATETIME DEFAULT NULL COMMENT '临时封禁截止时间',
  `register_source` VARCHAR(16) NOT NULL DEFAULT 'direct' COMMENT '注册来源 (direct/invite/promotion)',
  `inviter_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '邀请人 ID',
  `invite_code` VARCHAR(32) DEFAULT NULL COMMENT '邀请码',
  `needs_tenant_setup` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否需要重新创建租户资源',
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否需要修改密码',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_username` (`username`),
  UNIQUE KEY `uniq_users_email` (`email`),
  UNIQUE KEY `uniq_users_invite_code` (`invite_code`),
  KEY `idx_users_phone` (`phone`),
  KEY `idx_users_inviter_id` (`inviter_id`),
  KEY `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- -----------------------------------------------------------------------------
-- 2. 角色表 (roles) - 文档 3.1.2
-- -----------------------------------------------------------------------------
CREATE TABLE `roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '角色 ID',
  `name` VARCHAR(64) NOT NULL COMMENT '角色名称 (super_admin/admin/user)',
  code VARCHAR(64) DEFAULT NULL COMMENT '角色编码',
  `description` VARCHAR(512) DEFAULT NULL COMMENT '角色描述',
  `permissions` JSON DEFAULT NULL COMMENT '权限列表 (JSON 数组)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- -----------------------------------------------------------------------------
-- 3. 用户角色关联表 (user_roles) - 文档 3.1.3
-- -----------------------------------------------------------------------------
CREATE TABLE `user_roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '关联 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT '角色 ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_roles` (`user_id`, `role_id`),
  KEY `idx_user_roles_user_id` (`user_id`),
  KEY `idx_user_roles_role_id` (`role_id`),
  CONSTRAINT `fk_user_roles_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_role_id` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色关联表';

-- -----------------------------------------------------------------------------
-- 4. 团队表 (teams) - 文档 3.1.4
-- -----------------------------------------------------------------------------
CREATE TABLE `teams` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '团队 ID',
  `name` VARCHAR(128) NOT NULL COMMENT '团队名称',
  `owner_id` BIGINT UNSIGNED NOT NULL COMMENT '团队所有者 ID',
  `description` VARCHAR(512) DEFAULT NULL COMMENT '团队描述',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_teams_owner_id` (`owner_id`),
  CONSTRAINT `fk_teams_owner_id` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队表';

-- -----------------------------------------------------------------------------
-- 5. 团队成员表 (team_members) - 文档 3.1.5
-- -----------------------------------------------------------------------------
CREATE TABLE `team_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '关联 ID',
  `team_id` BIGINT UNSIGNED NOT NULL COMMENT '团队 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `role` VARCHAR(32) NOT NULL COMMENT '团队内角色 (admin/member/viewer)',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_team_members` (`team_id`, `user_id`),
  KEY `idx_team_members_team_id` (`team_id`),
  KEY `idx_team_members_user_id` (`user_id`),
  CONSTRAINT `fk_team_members_team_id` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_team_members_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队成员表';

-- =============================================================================
-- 二、AI Agent 模块表 (4 张)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6. Agent 表 (agents) - 文档 3.2.1
--    包含 OpenClaw 集成字段
-- -----------------------------------------------------------------------------
CREATE TABLE `agents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Agent ID',
  `name` VARCHAR(64) NOT NULL COMMENT 'Agent 名称',
  `description` VARCHAR(512) DEFAULT NULL COMMENT 'Agent 描述',
  `avatar` VARCHAR(512) DEFAULT NULL COMMENT '头像 URL',
  `system_prompt` TEXT NOT NULL COMMENT '系统提示词',
  `usage_example` TEXT DEFAULT NULL COMMENT '使用示例 (Markdown)',
  `model_id` VARCHAR(64) NOT NULL COMMENT '绑定模型 ID (关联 models.model_id)',
  `price_per_call` INT NOT NULL DEFAULT 0 COMMENT '每次调用价格 (积分)',
  `price_per_token` JSON DEFAULT NULL COMMENT 'Token 单价 JSON (input/output)',
  `creator_id` BIGINT UNSIGNED NOT NULL COMMENT '创建者用户 ID',
  `creator_type` VARCHAR(16) NOT NULL DEFAULT 'user' COMMENT '创建者类型 (official/user)',
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '状态 (draft/pending_review/published/rejected/offline)',
  `category` VARCHAR(32) NOT NULL DEFAULT 'other' COMMENT '分类 (office/programming/copywriting/data_analysis/other)',
  `tags` JSON DEFAULT NULL COMMENT '标签列表 (JSON 数组)',
  `allowed_plugin_ids` JSON DEFAULT NULL COMMENT '允许使用的插件 ID 列表',
  `allowed_workflow_ids` JSON DEFAULT NULL COMMENT '允许使用的工作流 ID 列表',
  `allowed_knowledge_base_ids` JSON DEFAULT NULL COMMENT '允许使用的知识库 ID 列表',
  `rating` DECIMAL(3,2) NOT NULL DEFAULT 0.00 COMMENT '平均评分 (0-5)',
  `rating_count` INT NOT NULL DEFAULT 0 COMMENT '评分人数',
  `call_count` INT NOT NULL DEFAULT 0 COMMENT '调用次数',
  `revenue` INT NOT NULL DEFAULT 0 COMMENT '累计收益 (积分)',
  `rejection_reason` VARCHAR(512) DEFAULT NULL COMMENT '审核拒绝原因',
  `published_at` DATETIME DEFAULT NULL COMMENT '上架时间',
  `openclaw_agent_id` VARCHAR(64) DEFAULT NULL COMMENT 'OpenClaw 引擎 Agent ID',
  `source_type` VARCHAR(16) NOT NULL DEFAULT 'user' COMMENT '来源类型 (official/user/imported)',
  `source_name` VARCHAR(128) DEFAULT NULL COMMENT '来源名称',
  `source_repo_url` VARCHAR(512) DEFAULT NULL COMMENT '来源仓库 URL',
  `source_file_path` VARCHAR(512) DEFAULT NULL COMMENT '来源仓库相对路径',
  `source_category` VARCHAR(64) DEFAULT NULL COMMENT '来源分类',
  `source_version` VARCHAR(32) DEFAULT NULL COMMENT '来源版本',
  `runtime_type` VARCHAR(16) NOT NULL DEFAULT 'openclaw' COMMENT '运行时类型 (openclaw/hermes/hybrid)',
  `is_official` TINYINT NOT NULL DEFAULT 0 COMMENT '是否官方 Agent (0=否/1=是)',
  `official_visible` TINYINT NOT NULL DEFAULT 1 COMMENT '是否在前端官方列表展示 (0=否/1=是)',
  `sync_status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'OpenClaw 同步状态 (pending/synced/failed)',
  `sync_error` VARCHAR(512) DEFAULT NULL COMMENT '同步失败原因',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '归属用户 ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_agents_openclaw_agent_id` (`openclaw_agent_id`),
  UNIQUE KEY `idx_agents_source_repo_file` (`source_repo_url`, `source_file_path`),
  KEY `idx_agents_creator_id` (`creator_id`),
  KEY `idx_agents_user_id` (`user_id`),
  KEY `idx_agents_status` (`status`),
  KEY `idx_agents_category` (`category`),
  KEY `idx_agents_rating` (`rating`),
  KEY `idx_agents_call_count` (`call_count`),
  KEY `idx_agents_status_category_rating` (`status`, `category`, `rating`),
  CONSTRAINT `fk_agents_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agents_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 表';

-- -----------------------------------------------------------------------------
-- 6.1 Agent 批量导入任务表 (agent_import_tasks)
--    持久化 GitHub 仓库批量导入任务进度与统计
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `agent_import_tasks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `task_id` VARCHAR(64) NOT NULL,
  `repo_url` VARCHAR(512) NOT NULL,
  `branch` VARCHAR(64) NULL,
  `commit_sha` VARCHAR(64) NULL,
  `status` ENUM('pending','processing','success','failed') NOT NULL DEFAULT 'pending',
  `progress` INT NOT NULL DEFAULT 0,
  `stats` JSON NULL,
  `error` VARCHAR(512) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_agent_import_tasks_task_id` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 7. Agent 版本表 (agent_versions) - 文档 3.2.2
-- -----------------------------------------------------------------------------
CREATE TABLE `agent_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '版本 ID',
  `agent_id` BIGINT UNSIGNED NOT NULL COMMENT 'Agent ID',
  `version` VARCHAR(32) NOT NULL COMMENT '版本号',
  `system_prompt` TEXT NOT NULL COMMENT '系统提示词 (快照)',
  `model_id` VARCHAR(64) NOT NULL COMMENT '模型 ID (快照)',
  `config` JSON DEFAULT NULL COMMENT '完整配置快照',
  `changelog` TEXT DEFAULT NULL COMMENT '变更说明',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_agent_versions_agent_id` (`agent_id`),
  CONSTRAINT `fk_agent_versions_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 版本表';

-- -----------------------------------------------------------------------------
-- 8. Agent 调用日志表 (agent_call_logs) - 文档 3.2.3
--    日志表，无 updated_at
-- -----------------------------------------------------------------------------
CREATE TABLE `agent_call_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日志 ID',
  `agent_id` BIGINT UNSIGNED NOT NULL COMMENT 'Agent ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '调用者 ID',
  `session_id` BIGINT UNSIGNED NOT NULL COMMENT '会话 ID',
  `token_usage` JSON DEFAULT NULL COMMENT 'Token 用量 (input/output/total)',
  `credits_cost` INT NOT NULL DEFAULT 0 COMMENT '消耗积分',
  `duration_ms` INT DEFAULT NULL COMMENT '响应时间 (毫秒)',
  `success` BOOLEAN NOT NULL COMMENT '是否成功',
  `error` VARCHAR(512) DEFAULT NULL COMMENT '错误信息',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_agent_call_logs_agent_id` (`agent_id`),
  KEY `idx_agent_call_logs_user_id` (`user_id`),
  KEY `idx_agent_call_logs_session_id` (`session_id`),
  KEY `idx_agent_call_logs_created_at` (`created_at`),
  CONSTRAINT `fk_agent_call_logs_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_call_logs_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 调用日志表';

-- -----------------------------------------------------------------------------
-- 9. Agent 审核记录表 (agent_reviews) - 文档 3.2.4
--    日志表，无 updated_at
-- -----------------------------------------------------------------------------
CREATE TABLE `agent_reviews` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '记录 ID',
  `agent_id` BIGINT UNSIGNED NOT NULL COMMENT 'Agent ID',
  `reviewer_id` BIGINT UNSIGNED NOT NULL COMMENT '审核员 ID',
  `action` VARCHAR(16) NOT NULL COMMENT '操作 (approve/reject)',
  `reason` VARCHAR(512) DEFAULT NULL COMMENT '拒绝原因',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_agent_reviews_agent_id` (`agent_id`),
  KEY `idx_agent_reviews_reviewer_id` (`reviewer_id`),
  CONSTRAINT `fk_agent_reviews_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_reviews_reviewer_id` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 审核记录表';

-- =============================================================================
-- 三、聊天模块表 (3 张)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 10. 聊天会话表 (chat_sessions) - 文档 3.3.1
-- -----------------------------------------------------------------------------
CREATE TABLE `chat_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会话 ID',
  `title` VARCHAR(128) NOT NULL DEFAULT '新会话' COMMENT '会话标题',
  `model_id` VARCHAR(64) NOT NULL COMMENT '当前模型 ID',
  `agent_id` VARCHAR(64) DEFAULT NULL COMMENT '挂载的 Agent ID (字符串引用)',
  `group_id` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '所属分组 ID (0=默认分组)',
  `attached_knowledge_base_ids` JSON DEFAULT NULL COMMENT '挂载的知识库 ID 列表',
  `enabled_plugin_ids` JSON DEFAULT NULL COMMENT '启用的 MCP 插件 ID 列表',
  `enabled_workflow_ids` JSON DEFAULT NULL COMMENT '启用的工作流 ID 列表',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '归属用户 ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_chat_sessions_user_id` (`user_id`),
  KEY `idx_chat_sessions_model_id` (`model_id`),
  KEY `idx_chat_sessions_agent_id` (`agent_id`),
  KEY `idx_chat_sessions_group_id` (`group_id`),
  CONSTRAINT `fk_chat_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天会话表';

-- -----------------------------------------------------------------------------
-- 11. 聊天消息表 (chat_messages) - 文档 3.3.2
--     日志表，无 updated_at
-- -----------------------------------------------------------------------------
CREATE TABLE `chat_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '消息 ID',
  `session_id` BIGINT UNSIGNED NOT NULL COMMENT '会话 ID',
  `role` VARCHAR(16) NOT NULL COMMENT '消息角色 (user/assistant/system/tool)',
  `content` MEDIUMTEXT NOT NULL COMMENT '消息内容',
  `tool_calls` JSON DEFAULT NULL COMMENT '工具调用记录',
  `token_usage` JSON DEFAULT NULL COMMENT 'Token 用量 (input/output/total)',
  `credits_cost` INT NOT NULL DEFAULT 0 COMMENT '消耗积分',
  `attachments` JSON DEFAULT NULL COMMENT '消息附件列表',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_chat_messages_session_id` (`session_id`),
  KEY `idx_chat_messages_created_at` (`created_at`),
  KEY `idx_chat_messages_session_id_created_at` (`session_id`, `created_at`),
  CONSTRAINT `fk_chat_messages_session_id` FOREIGN KEY (`session_id`) REFERENCES `chat_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表';

-- -----------------------------------------------------------------------------
-- 12. 聊天分组表 (chat_groups) - 文档 3.3.3
-- -----------------------------------------------------------------------------
CREATE TABLE `chat_groups` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分组 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `name` VARCHAR(128) NOT NULL COMMENT '分组名称',
  `order` INT NOT NULL DEFAULT 0 COMMENT '排序顺序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_chat_groups_user_id` (`user_id`),
  CONSTRAINT `fk_chat_groups_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天分组表';

-- =============================================================================
-- 四、知识库模块表 (3 张)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 13. 知识库表 (knowledge_bases) - 文档 3.4.1
-- -----------------------------------------------------------------------------
CREATE TABLE `knowledge_bases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '知识库 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '归属用户 ID (多租户隔离)',
  `name` VARCHAR(128) NOT NULL COMMENT '知识库名称',
  `description` VARCHAR(512) DEFAULT NULL COMMENT '知识库描述',
  `visibility` VARCHAR(16) NOT NULL DEFAULT 'private' COMMENT '可见性 (private/public)',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态 (active/processing/reindexing/error/deleting/delete_failed)',
  `embedding_model` VARCHAR(64) NOT NULL DEFAULT 'text-embedding-ada-002' COMMENT '向量模型',
  `chunk_size` INT NOT NULL DEFAULT 1000 COMMENT '分块大小 (字符)',
  `chunk_overlap` INT NOT NULL DEFAULT 200 COMMENT '分块重叠 (字符)',
  `document_count` INT NOT NULL DEFAULT 0 COMMENT '文档数量',
  `total_chunks` INT NOT NULL DEFAULT 0 COMMENT '总 chunk 数',
  `total_tokens` INT NOT NULL DEFAULT 0 COMMENT '总 token 数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_knowledge_bases_user_id` (`user_id`),
  KEY `idx_knowledge_bases_status` (`status`),
  CONSTRAINT `fk_knowledge_bases_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库表';

-- -----------------------------------------------------------------------------
-- 14. 知识库文档表 (knowledge_base_documents) - 文档 3.4.2
-- -----------------------------------------------------------------------------
CREATE TABLE `knowledge_base_documents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文档 ID',
  `knowledge_base_id` BIGINT UNSIGNED NOT NULL COMMENT '知识库 ID',
  `name` VARCHAR(256) NOT NULL COMMENT '文档名称',
  `file_path` VARCHAR(512) NOT NULL COMMENT '文件路径 (MinIO/OSS)',
  `file_size` INT NOT NULL COMMENT '文件大小 (字节)',
  `mime_type` VARCHAR(128) DEFAULT NULL COMMENT 'MIME 类型',
  `chunk_count` INT NOT NULL DEFAULT 0 COMMENT '切片数量',
  `token_count` INT NOT NULL DEFAULT 0 COMMENT 'Token 数量',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '处理状态 (pending/processing/done/error)',
  `error` VARCHAR(512) DEFAULT NULL COMMENT '错误信息',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_knowledge_base_documents_kb_id` (`knowledge_base_id`),
  KEY `idx_knowledge_base_documents_status` (`status`),
  CONSTRAINT `fk_knowledge_base_documents_kb_id` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库文档表';

-- -----------------------------------------------------------------------------
-- 15. 知识库切片表 (knowledge_base_chunks) - 文档 3.4.3
--     日志表，无 updated_at
-- -----------------------------------------------------------------------------
CREATE TABLE `knowledge_base_chunks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '切片 ID',
  `document_id` BIGINT UNSIGNED NOT NULL COMMENT '文档 ID',
  `knowledge_base_id` BIGINT UNSIGNED NOT NULL COMMENT '知识库 ID',
  `content` TEXT NOT NULL COMMENT '切片内容',
  `chunk_index` INT NOT NULL COMMENT '切片索引',
  `token_count` INT NOT NULL COMMENT 'Token 数量',
  `embedding_id` VARCHAR(64) NOT NULL COMMENT 'Qdrant 中的向量 ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_knowledge_base_chunks_document_id` (`document_id`),
  KEY `idx_knowledge_base_chunks_kb_id` (`knowledge_base_id`),
  CONSTRAINT `fk_knowledge_base_chunks_document_id` FOREIGN KEY (`document_id`) REFERENCES `knowledge_base_documents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_knowledge_base_chunks_kb_id` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库切片表';

-- =============================================================================
-- 五、支付模块表 (2 张)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 16. 支付记录表 (payment_records) - 文档 3.5.1
-- -----------------------------------------------------------------------------
CREATE TABLE `payment_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '支付记录 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `order_no` VARCHAR(64) NOT NULL COMMENT '业务订单号',
  `channel` VARCHAR(16) NOT NULL COMMENT '支付渠道 (wechat/alipay/stripe)',
  `sub_method` VARCHAR(32) DEFAULT NULL COMMENT '支付子方式 (native/jsapi/pc/wap/card)',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '支付金额 (元)',
  `currency` VARCHAR(8) NOT NULL DEFAULT 'CNY' COMMENT '货币',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '支付状态 (pending/paid/failed/refunded/refunding)',
  `payment_txn_id` VARCHAR(128) DEFAULT NULL COMMENT '支付渠道流水号',
  `pay_params` JSON DEFAULT NULL COMMENT '支付参数 (二维码/跳转链接等)',
  `paid_at` DATETIME DEFAULT NULL COMMENT '支付时间',
  `refund_txn_id` VARCHAR(128) DEFAULT NULL COMMENT '退款流水号',
  `refund_amount` DECIMAL(10,2) DEFAULT NULL COMMENT '退款金额',
  `refunded_at` DATETIME DEFAULT NULL COMMENT '退款时间',
  `description` VARCHAR(256) DEFAULT NULL COMMENT '商品描述',
  `callback_raw` JSON DEFAULT NULL COMMENT '回调原始数据 (用于对账)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_payment_records_order_no` (`order_no`),
  KEY `idx_payment_records_user_id` (`user_id`),
  KEY `idx_payment_records_payment_txn_id` (`payment_txn_id`),
  KEY `idx_payment_records_status` (`status`),
  KEY `idx_payment_records_created_at` (`created_at`),
  CONSTRAINT `fk_payment_records_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付记录表';

-- -----------------------------------------------------------------------------
-- 17. 充值订单表 (recharge_orders) - 文档 3.5.2
-- -----------------------------------------------------------------------------
CREATE TABLE `recharge_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单 ID',
  `order_no` VARCHAR(64) NOT NULL COMMENT '订单号',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `package_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '积分套餐 ID',
  `credits` INT NOT NULL COMMENT '充值积分数量',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '支付金额 (元)',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '订单状态 (pending/paid/failed/refunded)',
  `payment_channel` VARCHAR(16) DEFAULT NULL COMMENT '支付渠道',
  `payment_record_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '关联支付记录 ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_recharge_orders_order_no` (`order_no`),
  KEY `idx_recharge_orders_user_id` (`user_id`),
  KEY `idx_recharge_orders_status` (`status`),
  CONSTRAINT `fk_recharge_orders_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='充值订单表';

-- =============================================================================
-- 六、其他基础表 (3 张)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 18. 文件表 (files) - 文档 3.6.1
--     日志表，无 updated_at
-- -----------------------------------------------------------------------------
CREATE TABLE `files` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文件 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `name` VARCHAR(256) NOT NULL COMMENT '文件名',
  `path` VARCHAR(512) NOT NULL COMMENT '存储路径',
  `size` INT NOT NULL COMMENT '文件大小 (字节)',
  `mime_type` VARCHAR(128) DEFAULT NULL COMMENT 'MIME 类型',
  `storage_type` VARCHAR(16) NOT NULL COMMENT '存储类型 (minio/oss/cos)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_files_user_id` (`user_id`),
  CONSTRAINT `fk_files_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件表';

-- -----------------------------------------------------------------------------
-- 19. 模型配置表 (models) - 文档 3.6.2
-- -----------------------------------------------------------------------------
CREATE TABLE `models` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '模型 ID',
  `provider` VARCHAR(64) NOT NULL COMMENT '提供商 (openai/anthropic/google/local)',
  `model_id` VARCHAR(64) NOT NULL COMMENT '模型标识符',
  `name` VARCHAR(128) NOT NULL COMMENT '模型名称',
  `description` VARCHAR(512) DEFAULT NULL COMMENT '模型描述',
  `context_window` INT DEFAULT NULL COMMENT '上下文窗口大小',
  `max_tokens` INT DEFAULT NULL COMMENT '最大输出 Token',
  `supports_vision` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否支持视觉',
  `supports_functions` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否支持函数调用',
  `price_per_1k_input` DECIMAL(10,4) DEFAULT NULL COMMENT '输入价格 (元/千 token)',
  `price_per_1k_output` DECIMAL(10,4) DEFAULT NULL COMMENT '输出价格 (元/千 token)',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_models_model_id` (`model_id`),
  KEY `idx_models_provider` (`provider`),
  KEY `idx_models_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型配置表';

-- -----------------------------------------------------------------------------
-- 20. 插件表 (plugins) - 文档 3.6.3
-- -----------------------------------------------------------------------------
CREATE TABLE `plugins` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '插件 ID',
  `name` VARCHAR(64) NOT NULL COMMENT '插件名称',
  `description` VARCHAR(512) DEFAULT NULL COMMENT '插件描述',
  `version` VARCHAR(32) NOT NULL COMMENT '插件版本',
  `mcp_server_url` VARCHAR(512) DEFAULT NULL COMMENT 'MCP 服务器 URL',
  `config` JSON DEFAULT NULL COMMENT '插件配置',
  `is_official` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否官方插件',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_plugins_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='插件表 (MCP)';

-- =============================================================================
-- 七、OPC 团队协作模块表 (4 张) - 前端需要，设计文档中缺失
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 21. OPC 团队表 (opc_teams)
-- -----------------------------------------------------------------------------
CREATE TABLE `opc_teams` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'OPC 团队 ID',
  `name` VARCHAR(128) NOT NULL COMMENT '团队名称',
  `avatar` VARCHAR(512) DEFAULT NULL COMMENT '团队头像 URL',
  `description` VARCHAR(512) DEFAULT NULL COMMENT '团队描述',
  `member_count` INT NOT NULL DEFAULT 0 COMMENT '成员数量',
  `creator_id` BIGINT UNSIGNED NOT NULL COMMENT '创建者用户 ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_opc_teams_creator_id` (`creator_id`),
  CONSTRAINT `fk_opc_teams_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OPC 团队表';

-- -----------------------------------------------------------------------------
-- 22. OPC 任务表 (opc_tasks)
-- -----------------------------------------------------------------------------
CREATE TABLE `opc_tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'OPC 任务 ID',
  `team_id` BIGINT UNSIGNED NOT NULL COMMENT '所属团队 ID',
  `title` VARCHAR(256) NOT NULL COMMENT '任务标题',
  `description` TEXT DEFAULT NULL COMMENT '任务描述',
  `status` ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending' COMMENT '任务状态 (pending待处理/in_progress进行中/completed已完成)',
  `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium' COMMENT '任务优先级 (low低/medium中/high高)',
  `assignee_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '指派人 ID',
  `creator_id` BIGINT UNSIGNED NOT NULL COMMENT '创建者 ID',
  `due_date` DATETIME DEFAULT NULL COMMENT '截止时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_opc_tasks_team_id` (`team_id`),
  KEY `idx_opc_tasks_assignee_id` (`assignee_id`),
  KEY `idx_opc_tasks_creator_id` (`creator_id`),
  KEY `idx_opc_tasks_status` (`status`),
  CONSTRAINT `fk_opc_tasks_team_id` FOREIGN KEY (`team_id`) REFERENCES `opc_teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_opc_tasks_assignee_id` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_opc_tasks_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OPC 任务表';

-- -----------------------------------------------------------------------------
-- 23. OPC 团队成员表 (opc_team_members)
-- -----------------------------------------------------------------------------
CREATE TABLE `opc_team_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'OPC 成员关联 ID',
  `team_id` BIGINT UNSIGNED NOT NULL COMMENT '团队 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `role` ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member' COMMENT '团队角色 (owner创建者/admin管理员/member成员)',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_opc_team_members` (`team_id`, `user_id`),
  KEY `idx_opc_team_members_team_id` (`team_id`),
  KEY `idx_opc_team_members_user_id` (`user_id`),
  CONSTRAINT `fk_opc_team_members_team_id` FOREIGN KEY (`team_id`) REFERENCES `opc_teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_opc_team_members_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OPC 团队成员表';

-- -----------------------------------------------------------------------------
-- 24. OPC Agent 仓库表 (opc_agent_repo)
-- -----------------------------------------------------------------------------
CREATE TABLE `opc_agent_repo` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'OPC Agent 仓库项 ID',
  `team_id` BIGINT UNSIGNED NOT NULL COMMENT '团队 ID',
  `agent_id` BIGINT UNSIGNED NOT NULL COMMENT 'Agent ID',
  `added_by` BIGINT UNSIGNED NOT NULL COMMENT '添加人 ID',
  `added_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '添加时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_opc_agent_repo` (`team_id`, `agent_id`),
  KEY `idx_opc_agent_repo_team_id` (`team_id`),
  KEY `idx_opc_agent_repo_agent_id` (`agent_id`),
  CONSTRAINT `fk_opc_agent_repo_team_id` FOREIGN KEY (`team_id`) REFERENCES `opc_teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_opc_agent_repo_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_opc_agent_repo_added_by` FOREIGN KEY (`added_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OPC Agent 仓库表';

-- =============================================================================
-- 八、前端补充表 (5 张) - 收藏 / 评分 / 会员套餐 / 收益 / 提现
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 25. Agent 收藏表 (agent_favorites)
-- -----------------------------------------------------------------------------
CREATE TABLE `agent_favorites` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '收藏 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `agent_id` BIGINT UNSIGNED NOT NULL COMMENT 'Agent ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_agent_favorites_user_agent` (`user_id`, `agent_id`),
  KEY `idx_agent_favorites_user_id` (`user_id`),
  KEY `idx_agent_favorites_agent_id` (`agent_id`),
  CONSTRAINT `fk_agent_favorites_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_favorites_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 收藏表';

-- -----------------------------------------------------------------------------
-- 26. Agent 评分表 (agent_ratings)
-- -----------------------------------------------------------------------------
CREATE TABLE `agent_ratings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '评分 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `agent_id` BIGINT UNSIGNED NOT NULL COMMENT 'Agent ID',
  `rating` TINYINT NOT NULL COMMENT '评分 (1-5)',
  `review` VARCHAR(512) DEFAULT NULL COMMENT '评价内容',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评分时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_agent_ratings_user_agent` (`user_id`, `agent_id`),
  KEY `idx_agent_ratings_user_id` (`user_id`),
  KEY `idx_agent_ratings_agent_id` (`agent_id`),
  CONSTRAINT `chk_agent_ratings_rating` CHECK (`rating` BETWEEN 1 AND 5),
  CONSTRAINT `fk_agent_ratings_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_ratings_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 评分表';

-- -----------------------------------------------------------------------------
-- 27. 会员套餐表 (membership_plans)
-- -----------------------------------------------------------------------------
CREATE TABLE `membership_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '套餐 ID',
  `name` VARCHAR(64) NOT NULL COMMENT '套餐名称 (免费版/专业版/企业版)',
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '价格 (元)',
  `level` INT NOT NULL DEFAULT 0 COMMENT '对应 users.level (0=免费/1=专业/2=企业)',
  `period` VARCHAR(16) NOT NULL DEFAULT 'month' COMMENT '计费周期 (forever/month/year)',
  `benefits` JSON DEFAULT NULL COMMENT '权益列表 (JSON 数组)',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否上架',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_membership_plans_level` (`level`),
  KEY `idx_membership_plans_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会员套餐表';

-- -----------------------------------------------------------------------------
-- 28. 收益记录表 (revenue_records)
--     日志表，无 updated_at
-- -----------------------------------------------------------------------------
CREATE TABLE `revenue_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '收益记录 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `source` VARCHAR(32) NOT NULL COMMENT '收益来源 (subscription/reward/agent_sale/invite)',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '收益金额 (元)',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态 (settled/pending/failed)',
  `description` VARCHAR(256) DEFAULT NULL COMMENT '描述',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_revenue_records_user_id` (`user_id`),
  KEY `idx_revenue_records_source` (`source`),
  KEY `idx_revenue_records_status` (`status`),
  KEY `idx_revenue_records_created_at` (`created_at`),
  CONSTRAINT `fk_revenue_records_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收益记录表';

-- -----------------------------------------------------------------------------
-- 29. 提现记录表 (withdrawal_records)
-- -----------------------------------------------------------------------------
CREATE TABLE `withdrawal_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '提现记录 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '提现金额 (元)',
  `channel` VARCHAR(32) NOT NULL COMMENT '提现渠道 (wechat/alipay/bank)',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '提现状态 (pending/paid/rejected)',
  `transaction_no` VARCHAR(128) DEFAULT NULL COMMENT '交易流水号',
  `paid_at` DATETIME DEFAULT NULL COMMENT '到账时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_withdrawal_records_user_id` (`user_id`),
  KEY `idx_withdrawal_records_status` (`status`),
  KEY `idx_withdrawal_records_created_at` (`created_at`),
  CONSTRAINT `fk_withdrawal_records_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提现记录表';

-- =============================================================================
-- 30. 操作日志表(operation_logs)
-- =============================================================================
CREATE TABLE `operation_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日志 ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '操作人 ID',
  `username` VARCHAR(64) NOT NULL COMMENT '操作人用户名',
  `type` VARCHAR(64) NOT NULL COMMENT '操作类型(POST/PUT/PATCH/DELETE)',
  `target` VARCHAR(128) NOT NULL COMMENT '操作目标路径',
  `operation` VARCHAR(512) NOT NULL COMMENT '操作描述',
  `ip` VARCHAR(64) DEFAULT NULL COMMENT '操作 IP',
  `ua` VARCHAR(512) DEFAULT NULL COMMENT 'User-Agent',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_operation_logs_user_id` (`user_id`),
  KEY `idx_operation_logs_type` (`type`),
  KEY `idx_operation_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理端操作日志表';

-- =============================================================================
-- 结束
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 1;
