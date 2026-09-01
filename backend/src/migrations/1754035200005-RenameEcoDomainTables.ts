import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P4 批次 4（I 域生态域）命名规范统一：eco_ 前缀
 *
 * RENAME TABLE 旧名 → 新名，并为旧名创建只读过渡视图（1 个发布周期后由 P4 收尾批次删除）。
 * 代码仓库内引用已同步为新表名；视图兜底外部/历史工具对旧名的访问。
 *
 * | agents | eco_agents |
 * | agent_versions | eco_agent_versions |
 * | agent_categories | eco_agent_categories |
 * | agent_department | eco_agent_department |
 * | agent_favorites | eco_agent_favorites |
 * | agent_installs | eco_agent_installs |
 * | agent_ratings | eco_agent_ratings |
 * | agent_reviews | eco_agent_reviews |
 * | agent_tag | eco_agent_tag |
 * | agent_tag_map | eco_agent_tag_map |
 * | agent_import_tasks | eco_agent_import_tasks |
 * | plugins | eco_plugins |
 * | user_plugins | eco_user_plugins |
 * | skill_packages | eco_skill_packages |
 * | skill_sources | eco_skill_sources |
 * | skill_install_logs | eco_skill_install_logs |
 * | mcp_servers | eco_mcp_servers |
 * | mcp_catalog | eco_mcp_catalog |
 * | n8n_instances | eco_n8n_instances |
 * | n8n_webhook_logs | eco_n8n_webhook_logs |
 * | openclaw_instances | eco_openclaw_instances |
 * | runtime_versions | eco_runtime_versions |
 * | workflow_mcp_bind | eco_workflow_mcp_bind |
 */

const RENAMES: Array<[string, string]> = [
  ['agents', 'eco_agents'],
  ['agent_versions', 'eco_agent_versions'],
  ['agent_categories', 'eco_agent_categories'],
  ['agent_department', 'eco_agent_department'],
  ['agent_favorites', 'eco_agent_favorites'],
  ['agent_installs', 'eco_agent_installs'],
  ['agent_ratings', 'eco_agent_ratings'],
  ['agent_reviews', 'eco_agent_reviews'],
  ['agent_tag', 'eco_agent_tag'],
  ['agent_tag_map', 'eco_agent_tag_map'],
  ['agent_import_tasks', 'eco_agent_import_tasks'],
  ['plugins', 'eco_plugins'],
  ['user_plugins', 'eco_user_plugins'],
  ['skill_packages', 'eco_skill_packages'],
  ['skill_sources', 'eco_skill_sources'],
  ['skill_install_logs', 'eco_skill_install_logs'],
  ['mcp_servers', 'eco_mcp_servers'],
  ['mcp_catalog', 'eco_mcp_catalog'],
  ['n8n_instances', 'eco_n8n_instances'],
  ['n8n_webhook_logs', 'eco_n8n_webhook_logs'],
  ['openclaw_instances', 'eco_openclaw_instances'],
  ['runtime_versions', 'eco_runtime_versions'],
  ['workflow_mcp_bind', 'eco_workflow_mcp_bind'],
];

export class RenameEcoDomainTables1754035200005 implements MigrationInterface {
  name = 'RenameEcoDomainTables1754035200005';

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
