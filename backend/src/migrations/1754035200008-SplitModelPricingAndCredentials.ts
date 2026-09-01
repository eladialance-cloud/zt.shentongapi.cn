import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P5 宽表拆分（步骤 1+2）：ai_models 拆出 ai_model_pricing + ai_model_credentials
 *
 * - ai_model_credentials：api_key / api_endpoint（模型级连接凭据，api_key 应用层 AES 加密）
 * - ai_model_pricing：计费/能力/场景字段（input_types、advanced_capabilities、min_user_level、
 *   price_per_1k_input/output、price_per_image、video_prices、price_per_call、price_per_minute、
 *   pricing_mode、video_per_second、scenario_tags、generation_params、cost_price）
 * - ai_models 保留核心列；旧列暂不删除（P5 步骤 3 收尾，1 个发布周期后清理，保证可回滚）
 *
 * 兼容两种历史：
 *   1. 存量库：ai_models 已含全部列 → INSERT SELECT 全量回填
 *   2. 新装库：ai_models 仅 init.sql 基础列（缺 input_types 等，db-migration 启动补表在迁移之后）
 *      → 按列存在性动态组装 SELECT，缺失列回填 NULL，保证迁移幂等不失败
 *
 * 幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE（model_id 唯一索引防重）
 */

const PRICING_COLUMNS = [
  'input_types',
  'advanced_capabilities',
  'min_user_level',
  'price_per_1k_input',
  'price_per_1k_output',
  'price_per_image',
  'video_prices',
  'price_per_call',
  'price_per_minute',
  'pricing_mode',
  'video_per_second',
  'scenario_tags',
  'generation_params',
  'cost_price',
] as const;

const CREDENTIAL_COLUMNS = ['api_key', 'api_endpoint'] as const;

const CREATE_PRICING_SQL = `
CREATE TABLE IF NOT EXISTS ai_model_pricing (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  model_id BIGINT UNSIGNED NOT NULL,
  input_types JSON NULL COMMENT '输入类型(多选)',
  advanced_capabilities JSON NULL COMMENT '高级能力(多选)',
  min_user_level INT NOT NULL DEFAULT 0 COMMENT '最低用户等级',
  price_per_1k_input DECIMAL(10,4) NULL COMMENT '输入价格(积分/千token)',
  price_per_1k_output DECIMAL(10,4) NULL COMMENT '输出价格(积分/千token)',
  price_per_image DECIMAL(10,4) NULL COMMENT '图片生成固定积分(积分/张)',
  video_prices JSON NULL COMMENT '视频生成价格矩阵',
  price_per_call DECIMAL(10,4) NULL COMMENT '按次计费积分',
  price_per_minute DECIMAL(10,4) NULL COMMENT '按分钟计费积分',
  pricing_mode VARCHAR(16) NULL COMMENT '计费方式: token/per_image/per_call/per_minute/per_second',
  video_per_second JSON NULL COMMENT '视频按分辨率档积分/秒',
  scenario_tags JSON NULL COMMENT '场景标签(固定字典多选)',
  generation_params JSON NULL COMMENT '生成参数选项',
  cost_price DECIMAL(10,4) NULL COMMENT '成本价(元)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_model_pricing_model_id (model_id),
  KEY idx_ai_model_pricing_min_user_level (min_user_level),
  CONSTRAINT fk_ai_model_pricing_model_id FOREIGN KEY (model_id) REFERENCES ai_models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型计费/能力配置表（P5 拆分）';
`;

const CREATE_CREDENTIALS_SQL = `
CREATE TABLE IF NOT EXISTS ai_model_credentials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  model_id BIGINT UNSIGNED NOT NULL,
  api_key VARCHAR(1024) NULL COMMENT 'AES 加密的 API Key（模型级直连凭据，老数据回填原样）',
  api_endpoint VARCHAR(512) NULL COMMENT 'API 地址',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_model_credentials_model_id (model_id),
  CONSTRAINT fk_ai_model_credentials_model_id FOREIGN KEY (model_id) REFERENCES ai_models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型级连接凭据表（P5 拆分，api_key 应用层 AES-256-GCM 加密）';
`;

export class SplitModelPricingAndCredentials1754035200008 implements MigrationInterface {
  name = 'SplitModelPricingAndCredentials1754035200008';

  private async tableExists(qr: QueryRunner, table: string): Promise<boolean> {
    const rows = await qr.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async columnNames(qr: QueryRunner, table: string): Promise<Set<string>> {
    const rows = await qr.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return new Set((rows || []).map((r: { COLUMN_NAME?: string }) => r.COLUMN_NAME));
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'ai_models'))) return;
    await queryRunner.query(CREATE_PRICING_SQL);
    await queryRunner.query(CREATE_CREDENTIALS_SQL);

    const cols = await this.columnNames(queryRunner, 'ai_models');
    const pricingPresent = PRICING_COLUMNS.filter((c) => cols.has(c));
    const pricingSelect = pricingPresent.join(', ');
    if (pricingPresent.length) {
      await queryRunner.query(
        `INSERT IGNORE INTO ai_model_pricing (model_id, ${pricingSelect}) SELECT id, ${pricingSelect} FROM ai_models`,
      );
    }
    const credPresent = CREDENTIAL_COLUMNS.filter((c) => cols.has(c));
    if (credPresent.length) {
      const credSelect = credPresent.join(', ');
      await queryRunner.query(
        `INSERT IGNORE INTO ai_model_credentials (model_id, ${credSelect}) SELECT id, ${credSelect} FROM ai_models`,
      );
    }
  }

  /** 回滚：删除拆分表（ai_models 旧列保留，数据无损） */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_model_credentials`).catch(() => undefined);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_model_pricing`).catch(() => undefined);
  }
}
