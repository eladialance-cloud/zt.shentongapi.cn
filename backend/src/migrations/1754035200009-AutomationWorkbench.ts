import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 自动化工作台（方案 B4/B6）：场景模板 / 用户实例 / 审计日志 三表 + 内置模板种子
 *
 * - automation_templates：后台/内置预置的执行模板（steps_json 步骤数组）
 * - automation_instances：用户实例（选模板填参数，IM 消息命中 name/keywords 即路由）
 * - automation_audit_logs：命令/结果/确认审计（后台可查）
 *
 * 幂等：CREATE TABLE IF NOT EXISTS + 模板按唯一 name INSERT IGNORE
 */
const CREATE_TEMPLATES_SQL = `
CREATE TABLE IF NOT EXISTS automation_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL COMMENT '模板名称（IM 消息命中关键词）',
  description VARCHAR(512) NULL COMMENT '模板说明',
  steps_json JSON NOT NULL COMMENT '执行步骤数组 [{type,name,paths/command/path/workflowId,params}]',
  params_schema JSON NULL COMMENT '参数 schema（表单/IM 填充）',
  keywords VARCHAR(512) NULL COMMENT 'IM 触发关键词（逗号分隔）',
  status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  built_in TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否内置模板',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_automation_templates_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自动化场景模板（后台预置）';
`;

const CREATE_INSTANCES_SQL = `
CREATE TABLE IF NOT EXISTS automation_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL COMMENT '所属用户',
  template_id BIGINT UNSIGNED NOT NULL COMMENT '关联模板',
  name VARCHAR(128) NOT NULL COMMENT '实例名称（IM 触发关键词）',
  params_json JSON NULL COMMENT '用户填写的参数',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用/停用',
  device_id VARCHAR(128) NULL COMMENT '绑定设备指纹（留空=任意在线设备）',
  last_run_at DATETIME NULL COMMENT '最近执行时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_automation_instances_user_id (user_id),
  KEY idx_automation_instances_template_id (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户自动化场景实例';
`;

const CREATE_AUDIT_SQL = `
CREATE TABLE IF NOT EXISTS automation_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL COMMENT '所属用户',
  command_id VARCHAR(64) NULL COMMENT '命令唯一 ID',
  instance_id BIGINT UNSIGNED NULL COMMENT '命中场景实例',
  direction VARCHAR(16) NOT NULL DEFAULT 'in' COMMENT 'in/result/confirm',
  command VARCHAR(512) NULL COMMENT '命令文本',
  command_type VARCHAR(32) NULL COMMENT '命令类型',
  status VARCHAR(32) NULL COMMENT 'received/routed/offline/need_confirmation/success/failed',
  message VARCHAR(1024) NULL COMMENT '结果消息',
  reply_context JSON NULL COMMENT '回传上下文',
  device_id VARCHAR(128) NULL COMMENT '设备指纹',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_automation_audit_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自动化工作台审计日志';
`;

const SEED_TEMPLATES = [
  {
    name: '查询设备状态',
    description: '查询绑定电脑的在线状态与服务运行情况',
    keywords: '查询状态,设备状态,电脑状态',
    paramsSchema: [],
    steps: [{ type: 'query_status', name: '查询设备状态' }],
  },
  {
    name: '打开文件或应用',
    description: '用系统默认程序打开指定文件/应用',
    keywords: '打开文件,打开应用,帮我打开',
    paramsSchema: [{ key: 'path', label: '文件或应用路径', required: true }],
    steps: [{ type: 'file_open', name: '打开文件', path: '{{params.path}}' }],
  },
  {
    name: '运行本地工作流',
    description: '触发本地 N8N 工作流（webhook 路径逗号分隔）',
    keywords: '运行工作流,执行工作流,本地工作流',
    paramsSchema: [{ key: 'paths', label: 'N8N webhook 路径（逗号分隔）', required: true }],
    steps: [{ type: 'n8n', name: '运行本地N8N工作流', paths: ['{{params.paths}}'] }],
  },
] as const;

export class AutomationWorkbench1754035200009 implements MigrationInterface {
  name = 'AutomationWorkbench1754035200009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(CREATE_TEMPLATES_SQL);
    await queryRunner.query(CREATE_INSTANCES_SQL);
    await queryRunner.query(CREATE_AUDIT_SQL);

    // 内置模板种子（按唯一 name 幂等）
    for (const t of SEED_TEMPLATES) {
      await queryRunner.query(
        `INSERT IGNORE INTO automation_templates
           (name, description, steps_json, params_schema, keywords, status, built_in)
         VALUES (?, ?, ?, ?, ?, 'active', 1)`,
        [t.name, t.description, JSON.stringify(t.steps), JSON.stringify(t.paramsSchema), t.keywords],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS automation_audit_logs`).catch(() => undefined);
    await queryRunner.query(`DROP TABLE IF EXISTS automation_instances`).catch(() => undefined);
    await queryRunner.query(`DROP TABLE IF EXISTS automation_templates`).catch(() => undefined);
  }
}