import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 清理 OpenClaw 下线后的残留表。
 *
 * 背景：OpenClaw 已从桌面端/后端收敛下线，`OpenClawInstanceEntity` 及
 * `src/modules/openclaw/` 模块已删除，代码不再读写 `eco_openclaw_instances`。
 *
 * 本迁移仅 DROP 该表。`agents.sync_status` 列仍被 admin-plugin / admin-model /
 * admin-imports / agent.service 读写，暂不处理；`agents.openclaw_agent_id` 的删除
 * 由独立迁移 1788451200012-DropAgentOpenclawAgentId 负责（本表迁移不涉及该列）。
 *
 * 执行前建议先备份/确认无外部脚本仍依赖该表；不做联机数据保留（OpenClaw 已下线）。
 */
export class DropOpenClawInstances1788451200011 implements MigrationInterface {
  name = 'DropOpenClawInstances1788451200011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    await queryRunner.query('DROP TABLE IF EXISTS `eco_openclaw_instances`');
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 重建表（与历史 openclaw-instance.entity.ts 结构一致，便于回滚）。
    // 注意：不会自动恢复关联 eco_agents 的外键（drop 表时外键已移除）。
    await queryRunner.query(
      "CREATE TABLE IF NOT EXISTS `eco_openclaw_instances` (" +
      "  `id` BIGINT AUTO_INCREMENT PRIMARY KEY," +
      "  `user_id` BIGINT NOT NULL COMMENT '用户ID'," +
      "  `agent_id` BIGINT NULL COMMENT '关联 eco_agents 表 id'," +
      "  `openclaw_agent_id` VARCHAR(64) NOT NULL COMMENT 'OpenClaw 侧 agentId'," +
      "  `endpoint` VARCHAR(256) NOT NULL DEFAULT 'http://localhost:8080' COMMENT 'OpenClaw API 地址'," +
      "  `status` ENUM('online','offline','error') DEFAULT 'offline'," +
      "  `last_heartbeat_at` DATETIME NULL COMMENT '最后心跳时间'," +
      "  `config` JSON NULL," +
      "  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP," +
      "  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "  INDEX `idx_openclaw_user` (`user_id`)," +
      "  INDEX `idx_openclaw_agent` (`agent_id`)," +
      "  UNIQUE INDEX `uniq_openclaw_agent_id` (`openclaw_agent_id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OpenClaw 运行时实例注册表';"
    );
  }
}
