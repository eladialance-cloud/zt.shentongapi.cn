import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P4 批次 3（C 域模型域）命名规范统一：ai_ 前缀
 *
 * RENAME TABLE 旧名 → 新名，并为旧名创建只读过渡视图（1 个发布周期后由 P4 收尾批次删除）。
 * 代码仓库内引用已同步为新表名；视图兜底外部/历史工具对旧名的访问。
 *
 * | 旧表名 | 新表名 |
 * |---|---|
 * | models | ai_models |
 * | model_providers | ai_model_providers |
 * | llm_files | ai_llm_files |
 * | mcp_call_log | ai_mcp_call_logs |
 * | mcp_resource_registry | ai_mcp_resource_registry |
 * | mcp_tool_registry | ai_mcp_tool_registry |
 * | mcp_server_config | ai_mcp_server_config |
 */

const RENAMES: Array<[string, string]> = [
  ['models', 'ai_models'],
  ['model_providers', 'ai_model_providers'],
  ['llm_files', 'ai_llm_files'],
  ['mcp_call_log', 'ai_mcp_call_logs'],
  ['mcp_resource_registry', 'ai_mcp_resource_registry'],
  ['mcp_tool_registry', 'ai_mcp_tool_registry'],
  ['mcp_server_config', 'ai_mcp_server_config'],
];

export class RenameAiDomainTables1754035200004 implements MigrationInterface {
  name = 'RenameAiDomainTables1754035200004';

  private async tableExists(qr: QueryRunner, table: string): Promise<boolean> {
    const rows = await qr.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [oldName, newName] of RENAMES) {
      const oldIsTable = await this.tableExists(queryRunner, oldName);
      const newIsTable = await this.tableExists(queryRunner, newName);
      if (oldIsTable && !newIsTable) {
        await queryRunner.query(`RENAME TABLE \`${oldName}\` TO \`${newName}\``);
      }
      // 新表存在且旧名不是真实表时，确保旧名过渡视图存在（幂等，兼容部分失败重跑）
      if (newIsTable && !(await this.tableExists(queryRunner, oldName))) {
        await queryRunner.query(`CREATE OR REPLACE VIEW \`${oldName}\` AS SELECT * FROM \`${newName}\``);
      }
    }
  }

  /** 回滚：删除过渡视图，并把新名表改回旧名（新名不存在且旧名非真实表时） */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [oldName, newName] of RENAMES) {
      await queryRunner.query(`DROP VIEW IF EXISTS \`${oldName}\``).catch(() => undefined);
      const oldIsTable = await this.tableExists(queryRunner, oldName);
      const newIsTable = await this.tableExists(queryRunner, newName);
      if (newIsTable && !oldIsTable) {
        await queryRunner.query(`RENAME TABLE \`${newName}\` TO \`${oldName}\``);
      }
    }
  }
}
