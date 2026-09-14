import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 清理 eco_agents.openclaw_agent_id 列（OpenClaw 已下线）。
 *
 * 背景：OpenClaw Agent 同步链路已下线（syncToOpenClaw 已移除），代码已无任何读写该列；
 * 该列仅残留在旧表结构与 init.sql 中。本迁移将其连同唯一索引一并删除。
 *
 * 幂等：仅当列存在才执行 DROP（兼容手工已删的库）。
 * down()：重加列与唯一索引，便于回滚。
 */
export class DropAgentOpenclawAgentId1788451200012 implements MigrationInterface {
  name = 'DropAgentOpenclawAgentId1788451200012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eco_agents' AND COLUMN_NAME = 'openclaw_agent_id'",
    )) as Array<{ c: number }>;
    // mysql2 会把 COUNT(*) 以字符串返回（'0' 是真值），必须显式转数字，
    // 否则「列不存在」会被误判成「列存在」，去执行必然失败的 DROP/MODIFY（2026-09-14 生产事故）
    if (!(Number(rows[0]?.c ?? 0) > 0)) {
      return;
    }
    // 动态删除所有引用 openclaw_agent_id 的索引（不硬编码索引名，兼容旧库真实命名）；
    // 主键索引除外（该列不会是主键；主键由 DROP COLUMN 时一并处理）。
    const idxRows = (await queryRunner.query(
      "SELECT DISTINCT INDEX_NAME AS idx FROM information_schema.STATISTICS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eco_agents' " +
      "AND COLUMN_NAME = 'openclaw_agent_id' AND INDEX_NAME <> 'PRIMARY'",
    )) as Array<{ idx: string }>;
    for (const r of idxRows) {
      await queryRunner.query('DROP INDEX `' + r.idx + '` ON `eco_agents`');
    }
    await queryRunner.query('ALTER TABLE `eco_agents` DROP COLUMN `openclaw_agent_id`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `eco_agents` ADD COLUMN `openclaw_agent_id` VARCHAR(64) DEFAULT NULL " +
      "COMMENT 'OpenClaw 引擎 Agent ID', ADD UNIQUE INDEX `uniq_agents_openclaw_agent_id` (`openclaw_agent_id`)",
    );
  }
}
