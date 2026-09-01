import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P4 批次 1（G 域任务域）命名规范统一：<domain>_<entity>_s
 *
 * RENAME TABLE 旧名 → 新名，并为旧名创建只读过渡视图（1 个发布周期后由 P4 收尾批次删除）。
 * 代码仓库内引用已同步为新表名；视图兜底外部/历史工具对旧名的访问。
 *
 * | 旧表名 | 新表名 |
 * |---|---|
 * | agent_task | task_agent_tasks |
 * | team_tasks | task_team_tasks |
 * | team_workflow_nodes | task_team_workflow_nodes |
 * | team_members | task_team_members |
 * | teams | task_teams |
 * | scheduled_tasks | task_scheduled_tasks |
 * | n8n_workflows | task_n8n_workflows |
 * | n8n_workflow_exec_log | task_n8n_workflow_exec_log |
 * | n8n_workflow_lib | task_n8n_workflow_lib |
 */

const RENAMES: Array<[string, string]> = [
  ['agent_task', 'task_agent_tasks'],
  ['team_tasks', 'task_team_tasks'],
  ['team_workflow_nodes', 'task_team_workflow_nodes'],
  ['team_members', 'task_team_members'],
  ['teams', 'task_teams'],
  ['scheduled_tasks', 'task_scheduled_tasks'],
  ['n8n_workflows', 'task_n8n_workflows'],
  ['n8n_workflow_exec_log', 'task_n8n_workflow_exec_log'],
  ['n8n_workflow_lib', 'task_n8n_workflow_lib'],
];

export class RenameTaskDomainTables1754035200002 implements MigrationInterface {
  name = 'RenameTaskDomainTables1754035200002';

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