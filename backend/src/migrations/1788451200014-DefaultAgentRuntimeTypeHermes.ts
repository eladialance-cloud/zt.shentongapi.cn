import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * eco_agents.runtime_type 默认值对齐（OpenClaw 已下线）。
 *
 * 背景：init.sql 已把该列默认值由 'openclaw' 改为 'hermes'，但已存在的库仍保留旧默认值，
 * 新建 Agent 会写入代码已不再识别的 'openclaw'（实体类型为 'hermes' | 'hybrid'）。
 * 本迁移修正列默认值并回填历史值，避免新旧库行为不一致。
 *
 * 幂等：先探测列是否存在；ALTER/UPDATE 均可重复执行。
 * down()：恢复旧默认值；数据回填不可逆（不会把 'hermes' 回写成 'openclaw'）。
 */
export class DefaultAgentRuntimeTypeHermes1788451200014 implements MigrationInterface {
  name = 'DefaultAgentRuntimeTypeHermes1788451200014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eco_agents' AND COLUMN_NAME = 'runtime_type'",
    )) as Array<{ c: number }>;
    if (!rows[0]?.c) {
      return;
    }
    await queryRunner.query(
      "ALTER TABLE `eco_agents` MODIFY COLUMN `runtime_type` VARCHAR(16) NOT NULL DEFAULT 'hermes' " +
        "COMMENT '运行时类型 (hermes/hybrid)'",
    );
    await queryRunner.query(
      "UPDATE `eco_agents` SET `runtime_type` = 'hermes' WHERE `runtime_type` NOT IN ('hermes', 'hybrid')",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `eco_agents` MODIFY COLUMN `runtime_type` VARCHAR(16) NOT NULL DEFAULT 'openclaw' " +
        "COMMENT '运行时类型 (openclaw/hermes/hybrid)'",
    );
  }
}
