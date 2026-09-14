import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 素材两库（用户输入库 / 生成素材库）+ 形象合并（P4）。
 *
 * 背景：media_assets 原先只用 source_type/source_id 表达来源，无法区分「原料 vs 成品」。
 * 本迁移把两库口径落库为两个正交字段：
 *   library: input=用户输入库(原料) / output=生成素材库(成品)
 *   kind   : 输入库 voice/avatar/ip_archive/image/video/audio/file，生成库 copy/image/video/audio
 * 同时把 digital_human_assets 合并为 media_assets(library='input', kind='avatar')
 * + 1:1 扩展表 media_asset_avatar（不再保留独立形象表）。
 *
 * 幂等：所有 DDL 先查 information_schema 再执行；历史库已由启动迁移(db-migration.ts)执行过，
 * 本类只做「应用 + 登记」，重复执行为 no-op。
 *
 * 注意：计数一律 Number() 转换（mysql2 的 COUNT(*) 返回字符串，直接取真值会误判——2026-09-14 生产事故）。
 */
export class SyncMediaAssetTwoLibraries1788451200015 implements MigrationInterface {
  name = 'SyncMediaAssetTwoLibraries1788451200015';

  private async hasTable(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const [row] = await queryRunner.query(
      'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [table],
    );
    return Number(row?.c || 0) > 0;
  }

  private async hasColumn(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
    const [row] = await queryRunner.query(
      'SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
      [table, column],
    );
    return Number(row?.c || 0) > 0;
  }

  private async hasIndex(queryRunner: QueryRunner, table: string, index: string): Promise<boolean> {
    const [row] = await queryRunner.query(
      'SELECT COUNT(*) AS c FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
      [table, index],
    );
    return Number(row?.c || 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasTable(queryRunner, 'media_assets'))) {
      return; // 空库：结构由启动迁移(db-migration.ts) 的建表语句负责
    }

    // (a) source_type: ENUM('task','media_job','manual') → VARCHAR(32)，容纳 agent(官署)/flow(业务流)
    const [sourceCol] = await queryRunner.query(
      "SELECT COLUMN_TYPE AS t FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media_assets' AND column_name = 'source_type'",
    );
    if (sourceCol && /^enum/i.test(String(sourceCol.t))) {
      await queryRunner.query(
        "ALTER TABLE `media_assets` MODIFY COLUMN `source_type` VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT '素材来源: task(任务输出)/media_job(媒体生成)/manual(手动上传)/agent(官署产出)/flow(业务流)'",
      );
    }

    // (b) 两轴字段
    if (!(await this.hasColumn(queryRunner, 'media_assets', 'library'))) {
      await queryRunner.query(
        "ALTER TABLE `media_assets` ADD COLUMN `library` VARCHAR(8) NOT NULL DEFAULT 'input' COMMENT '素材库: input=用户输入库(原料) / output=生成素材库(成品)'",
      );
    }
    if (!(await this.hasColumn(queryRunner, 'media_assets', 'kind'))) {
      await queryRunner.query(
        "ALTER TABLE `media_assets` ADD COLUMN `kind` VARCHAR(16) NOT NULL DEFAULT 'file' COMMENT '业务类别: voice/avatar/ip_archive/image/video/audio/file(输入库) | copy/image/video/audio(生成库)'",
      );
    }

    // (c) 两轴索引
    if (!(await this.hasIndex(queryRunner, 'media_assets', 'idx_media_assets_library'))) {
      await queryRunner.query('CREATE INDEX `idx_media_assets_library` ON `media_assets` (`library`)');
    }
    if (!(await this.hasIndex(queryRunner, 'media_assets', 'idx_media_assets_kind'))) {
      await queryRunner.query('CREATE INDEX `idx_media_assets_kind` ON `media_assets` (`kind`)');
    }

    // (d) 形象合并：HeyGen talking photo 图片列（老库由 digital_human_assets 承载）
    try {
      if (
        (await this.hasTable(queryRunner, 'digital_human_assets')) &&
        (await this.hasColumn(queryRunner, 'digital_human_assets', 'preview_url')) &&
        !(await this.hasColumn(queryRunner, 'digital_human_assets', 'image_url'))
      ) {
        await queryRunner.query(
          "ALTER TABLE `digital_human_assets` ADD COLUMN `image_url` VARCHAR(512) DEFAULT NULL COMMENT 'HeyGen talking photo 图片 URL(kind=image)' AFTER `preview_url`",
        );
      }
    } catch {
      // 旧表缺失/结构异常不阻断主链路（形象数据迁移由 db-migration.ts 的 mergeDigitalHumanAssets 兜底）
    }

    // (e) 形象 1:1 扩展表
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS media_asset_avatar (
      asset_id BIGINT NOT NULL,
      dh_kind VARCHAR(8) NOT NULL DEFAULT 'cloud' COMMENT 'cloud=火山数字人 / video=本地视频 / image=HeyGen图片 / avatar=HeyGen预置',
      cloud_id VARCHAR(128) NOT NULL,
      video_url VARCHAR(512) DEFAULT NULL,
      image_url VARCHAR(512) DEFAULT NULL,
      preview_url VARCHAR(512) DEFAULT NULL,
      authorized TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(16) NOT NULL DEFAULT 'ready',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (asset_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='形象扩展表（1:1 扩展 media_assets.kind=avatar）'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasTable(queryRunner, 'media_assets'))) {
      return;
    }
    // 回滚：先收口枚举再删列（agent/flow 来源在旧枚举下无处安放，统一回落 manual）
    await queryRunner.query(
      "UPDATE `media_assets` SET `source_type` = 'manual' WHERE `source_type` IN ('agent','flow')",
    ).catch(() => undefined);
    await queryRunner.query('DROP TABLE IF EXISTS `media_asset_avatar`').catch(() => undefined);
    if (await this.hasIndex(queryRunner, 'media_assets', 'idx_media_assets_library')) {
      await queryRunner.query('DROP INDEX `idx_media_assets_library` ON `media_assets`').catch(() => undefined);
    }
    if (await this.hasIndex(queryRunner, 'media_assets', 'idx_media_assets_kind')) {
      await queryRunner.query('DROP INDEX `idx_media_assets_kind` ON `media_assets`').catch(() => undefined);
    }
    if (await this.hasColumn(queryRunner, 'media_assets', 'kind')) {
      await queryRunner.query('ALTER TABLE `media_assets` DROP COLUMN `kind`').catch(() => undefined);
    }
    if (await this.hasColumn(queryRunner, 'media_assets', 'library')) {
      await queryRunner.query('ALTER TABLE `media_assets` DROP COLUMN `library`').catch(() => undefined);
    }
    const [sourceCol] = await queryRunner.query(
      "SELECT COLUMN_TYPE AS t FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media_assets' AND column_name = 'source_type'",
    );
    if (sourceCol && /^varchar/i.test(String(sourceCol.t))) {
      await queryRunner.query(
        "ALTER TABLE `media_assets` MODIFY COLUMN `source_type` ENUM('task','media_job','manual') NOT NULL DEFAULT 'manual'",
      ).catch(() => undefined);
    }
  }
}
