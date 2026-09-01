import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P4 批次 6（收尾）：删除 0002-0006 创建的全部旧名过渡视图
 *
 * 0002-0006 已把旧表名 RENAME 为 task_* / create_* / ai_* / eco_* / social_*，并为旧名创建只读过渡视图。
 * 本迁移在发布周期后删除这些过渡视图，完成命名规范收尾。
 *
 * 安全策略：仅删除 TABLE_TYPE = 'VIEW' 的对象；若旧名仍是真实表（迁移未生效/失败），
 * 绝不 DROP，避免误删数据。
 *
 * | 旧名（过渡视图） | 新名（真实表） |
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
 * | oral_workshop_jobs | create_oral_workshop_jobs |
 * | oral_workshop_steps | create_oral_workshop_steps |
 * | oral_workshop_publish_platforms | create_oral_workshop_publish_platforms |
 * | publish_plans | create_publish_plans |
 * | publish_accounts | create_publish_accounts |
 * | publish_channels | create_publish_channels |
 * | briefs | create_briefs |
 * | hermes_instances | create_hermes_instances |
 * | hermes_skills | create_hermes_skills |
 * | hermes_skill_ratings | create_hermes_skill_ratings |
 * | hermes_call_logs | create_hermes_call_logs |
 * | ai_audit_config | create_ai_audit_config |
 * | models | ai_models |
 * | model_providers | ai_model_providers |
 * | llm_files | ai_llm_files |
 * | mcp_call_log | ai_mcp_call_logs |
 * | mcp_resource_registry | ai_mcp_resource_registry |
 * | mcp_tool_registry | ai_mcp_tool_registry |
 * | mcp_server_config | ai_mcp_server_config |
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
 * | posts | social_posts |
 * | post_tags | social_post_tags |
 * | replies | social_replies |
 * | votes | social_votes |
 * | bookmarks | social_bookmarks |
 * | channels | social_channels |
 * | channel_messages | social_channel_messages |
 * | tags | social_tags |
 * | user_profiles | social_user_profiles |
 * | coin_transactions | social_coin_transactions |
 */

const PAIRS: Array<[string, string]> = [
  ['agent_task', 'task_agent_tasks'],
  ['team_tasks', 'task_team_tasks'],
  ['team_workflow_nodes', 'task_team_workflow_nodes'],
  ['team_members', 'task_team_members'],
  ['teams', 'task_teams'],
  ['scheduled_tasks', 'task_scheduled_tasks'],
  ['n8n_workflows', 'task_n8n_workflows'],
  ['n8n_workflow_exec_log', 'task_n8n_workflow_exec_log'],
  ['n8n_workflow_lib', 'task_n8n_workflow_lib'],
  ['oral_workshop_jobs', 'create_oral_workshop_jobs'],
  ['oral_workshop_steps', 'create_oral_workshop_steps'],
  ['oral_workshop_publish_platforms', 'create_oral_workshop_publish_platforms'],
  ['publish_plans', 'create_publish_plans'],
  ['publish_accounts', 'create_publish_accounts'],
  ['publish_channels', 'create_publish_channels'],
  ['briefs', 'create_briefs'],
  ['hermes_instances', 'create_hermes_instances'],
  ['hermes_skills', 'create_hermes_skills'],
  ['hermes_skill_ratings', 'create_hermes_skill_ratings'],
  ['hermes_call_logs', 'create_hermes_call_logs'],
  ['ai_audit_config', 'create_ai_audit_config'],
  ['models', 'ai_models'],
  ['model_providers', 'ai_model_providers'],
  ['llm_files', 'ai_llm_files'],
  ['mcp_call_log', 'ai_mcp_call_logs'],
  ['mcp_resource_registry', 'ai_mcp_resource_registry'],
  ['mcp_tool_registry', 'ai_mcp_tool_registry'],
  ['mcp_server_config', 'ai_mcp_server_config'],
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
  ['posts', 'social_posts'],
  ['post_tags', 'social_post_tags'],
  ['replies', 'social_replies'],
  ['votes', 'social_votes'],
  ['bookmarks', 'social_bookmarks'],
  ['channels', 'social_channels'],
  ['channel_messages', 'social_channel_messages'],
  ['tags', 'social_tags'],
  ['user_profiles', 'social_user_profiles'],
  ['coin_transactions', 'social_coin_transactions'],
];

export class RemoveTransitionViews1754035200007 implements MigrationInterface {
  name = 'RemoveTransitionViews1754035200007';

  private async isView(qr: QueryRunner, name: string): Promise<boolean> {
    const rows = await qr.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [name],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async tableExists(qr: QueryRunner, name: string): Promise<boolean> {
    const rows = await qr.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [name],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  /** 删除全部旧名过渡视图（仅视图，真实表不删） */
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [oldName] of PAIRS) {
      if (await this.isView(queryRunner, oldName)) {
        await queryRunner.query(`DROP VIEW IF EXISTS \`${oldName}\``);
      }
    }
  }

  /** 回滚：为新名真实表重建旧名只读过渡视图 */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [oldName, newName] of PAIRS) {
      const newIsTable = await this.tableExists(queryRunner, newName);
      const oldIsTable = await this.tableExists(queryRunner, oldName);
      if (newIsTable && !oldIsTable) {
        await queryRunner.query(`CREATE OR REPLACE VIEW \`${oldName}\` AS SELECT * FROM \`${newName}\``);
      }
    }
  }
}
