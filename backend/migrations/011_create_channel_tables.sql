-- Migration: 011_create_channel_tables
-- 创建渠道对接模块表
-- 设计文档: channel_integration_design_20260730.md

-- 1. 渠道配置表
CREATE TABLE IF NOT EXISTS `channels` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL COMMENT '渠道名称',
  `platform` ENUM('wechat_mp', 'wechat_work', 'feishu_bot', 'dingtalk_bot', 'telegram_bot') NOT NULL COMMENT '平台类型',
  `direction` ENUM('input', 'output', 'both') NOT NULL DEFAULT 'input' COMMENT '消息方向: input=入站, output=出站, both=双向',
  `status` ENUM('active', 'disabled', 'error') NOT NULL DEFAULT 'active' COMMENT '渠道状态',
  `credentials` TEXT NULL COMMENT '加密存储的平台凭证(JSON)',
  `webhook_url` VARCHAR(512) NULL COMMENT 'Webhook 回调地址',
  `webhook_token` VARCHAR(256) NULL COMMENT 'Webhook 验证 Token',
  `team_id` BIGINT NULL COMMENT '绑定的团队 ID',
  `agent_id` BIGINT NULL COMMENT '绑定的 Agent ID',
  `last_message_at` DATETIME NULL COMMENT '最后消息时间',
  `user_id` BIGINT NOT NULL COMMENT '所属用户 ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_channels_user_id` (`user_id`),
  INDEX `idx_channels_team_id` (`team_id`),
  INDEX `idx_channels_agent_id` (`agent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='渠道配置表';

-- 2. 渠道消息记录表
CREATE TABLE IF NOT EXISTS `channel_messages` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `channel_id` BIGINT NOT NULL COMMENT '渠道 ID',
  `direction` ENUM('inbound', 'outbound') NOT NULL COMMENT '消息方向',
  `external_id` VARCHAR(128) NULL COMMENT '外部平台消息 ID',
  `sender_external_id` VARCHAR(128) NULL COMMENT '发送者外部 ID',
  `sender_name` VARCHAR(64) NULL COMMENT '发送者名称',
  `content` TEXT NULL COMMENT '消息内容',
  `message_type` ENUM('text', 'image', 'voice', 'video', 'file', 'event') NOT NULL DEFAULT 'text' COMMENT '消息类型',
  `raw_payload` JSON NULL COMMENT '原始 payload',
  `reply_content` TEXT NULL COMMENT '回复内容',
  `status` ENUM('pending', 'processing', 'replied', 'failed', 'ignored') NOT NULL DEFAULT 'pending' COMMENT '处理状态',
  `session_id` BIGINT NULL COMMENT '关联会话 ID',
  `error_message` VARCHAR(512) NULL COMMENT '错误信息',
  `processed_at` DATETIME NULL COMMENT '处理完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_channel_msgs_channel` (`channel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='渠道消息记录表';

-- 3. 发布计划表
CREATE TABLE IF NOT EXISTS `publish_plans` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(128) NOT NULL COMMENT '发布标题',
  `content` TEXT NULL COMMENT '发布内容',
  `media_urls` JSON NULL COMMENT '媒体 URL 列表',
  `target_platforms` JSON NOT NULL COMMENT '目标平台列表: douyin/xiaohongshu/weibo...',
  `mode` ENUM('manual', 'scheduled', 'auto') NOT NULL DEFAULT 'manual' COMMENT '发布模式',
  `status` ENUM('draft', 'pending_review', 'approved', 'rejected', 'published', 'failed') NOT NULL DEFAULT 'draft' COMMENT '发布状态',
  `review_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `review_comment` VARCHAR(512) NULL COMMENT '审核意见',
  `publish_result` JSON NULL COMMENT '发布结果',
  `scheduled_at` DATETIME NULL COMMENT '计划发布时间',
  `published_at` DATETIME NULL COMMENT '实际发布时间',
  `user_id` BIGINT NOT NULL COMMENT '所属用户 ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_publish_plans_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发布计划表';
