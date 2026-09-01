import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P2 同名实体去重：channels 表拆分
 *
 * - channels         → community 社区频道（varchar PK，生产库真源，含 slug/icon/color/post_count）
 * - create_publish_channels → channel 模块发布渠道（bigint PK，原错误映射到 channels 的渠道配置表）
 *
 * 兼容两种历史：
 *   1. 生产库：channels 已是 varchar 社区表 → 仅新建 create_publish_channels
 *   2. 新装库：011 遗留建过 bigint channels → RENAME 归位为 publish_channels，再补建 varchar channels（社区频道）
 */

const CREATE_PUBLISH_CHANNELS_SQL = `
CREATE TABLE IF NOT EXISTS create_publish_channels (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL COMMENT '渠道名称',
  platform ENUM('wechat_mp', 'wechat_work', 'feishu_bot', 'dingtalk_bot', 'telegram_bot') NOT NULL COMMENT '平台类型',
  direction ENUM('input', 'output', 'both') NOT NULL DEFAULT 'input' COMMENT '消息方向: input=入站, output=出站, both=双向',
  status ENUM('active', 'disabled', 'error') NOT NULL DEFAULT 'active' COMMENT '渠道状态',
  credentials TEXT NULL COMMENT '加密存储的平台凭证(JSON)',
  webhook_url VARCHAR(512) NULL COMMENT 'Webhook 回调地址',
  webhook_token VARCHAR(256) NULL COMMENT 'Webhook 验证 Token',
  team_id BIGINT NULL COMMENT '绑定的团队 ID',
  agent_id BIGINT NULL COMMENT '绑定的 Agent ID',
  last_message_at DATETIME NULL COMMENT '最后消息时间',
  user_id BIGINT NOT NULL COMMENT '所属用户 ID',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX idx_publish_channels_user_id (user_id),
  INDEX idx_publish_channels_team_id (team_id),
  INDEX idx_publish_channels_agent_id (agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发布渠道配置表';
`;

const CREATE_COMMUNITY_CHANNELS_SQL = `
CREATE TABLE IF NOT EXISTS channels (
  id VARCHAR(32) NOT NULL COMMENT '频道标识',
  name VARCHAR(64) NOT NULL COMMENT '频道名称',
  slug VARCHAR(64) NOT NULL COMMENT 'URL标识',
  description TEXT NULL COMMENT '频道描述',
  icon VARCHAR(64) NULL COMMENT '图标名称',
  color VARCHAR(7) DEFAULT '#4F6EF7' COMMENT '主题色',
  sort_order INT DEFAULT 0,
  is_enabled TINYINT(1) DEFAULT 1,
  post_count INT DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='社区频道表';
`;

const COMMUNITY_SEEDS: Array<[string, string, string, string, string, number]> = [
  ['discussion', '综合讨论', 'discussion', 'AI相关话题自由讨论', 'chat', 1],
  ['question', '问答求助', 'question', '技术问答与悬赏求助', 'question', 2],
  ['showcase', '作品展示', 'showcase', '分享你的AI应用作品', 'showcase', 3],
  ['ai-office', 'AI员工秀', 'ai-office', '展示AI办公室配置与效果', 'robot', 4],
  ['announcement', '官方动态', 'announcement', '官方公告与版本动态', 'bell', 5],
];

export class CreatePublishChannels1754035200000 implements MigrationInterface {
  name = 'CreatePublishChannels1754035200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'id'`,
    );
    const channelsIdType = rows && rows.length > 0 ? rows[0].DATA_TYPE : null;

    if (channelsIdType === 'bigint') {
      // 011 遗留的 bigint 渠道表 → 改名归位为 create_publish_channels
      await queryRunner.query('RENAME TABLE channels TO create_publish_channels');
    } else {
      // 生产库 channels 已是 varchar 社区表（或表不存在）：确保 create_publish_channels 存在
      await queryRunner.query(CREATE_PUBLISH_CHANNELS_SQL);
    }

    // 社区 channels（varchar）必须存在，并幂等补默认频道（生产已有则跳过）
    await queryRunner.query(CREATE_COMMUNITY_CHANNELS_SQL);
    for (const seed of COMMUNITY_SEEDS) {
      await queryRunner.query(
        `INSERT IGNORE INTO channels (id, name, slug, description, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
        seed,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const channelsRows = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'channels'`,
    );
    if (channelsRows.length === 0) {
      // 归位场景：改名还原
      await queryRunner.query('RENAME TABLE create_publish_channels TO channels');
    } else {
      await queryRunner.query('DROP TABLE IF EXISTS create_publish_channels');
    }
  }
}