import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * mcp-server-config 的 service_type 枚举去掉 'openclaw'。
 *
 * 背景：OpenClaw 已下线且无旧数据；枚举收口为 codex / n8n / custom。
 * 先把存量 'openclaw' 行改写为 'custom'，再 MODIFY 枚举列，避免数据越界报错。
 */
export class DropMcpOpenclawServiceType1788451200013 implements MigrationInterface {
  name = 'DropMcpOpenclawServiceType1788451200013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `ai_mcp_server_config` SET `service_type` = 'custom' WHERE `service_type` = 'openclaw'",
    );
    await queryRunner.query(
      "ALTER TABLE `ai_mcp_server_config` MODIFY `service_type` ENUM('codex','n8n','custom') DEFAULT 'custom' COMMENT '服务类型'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `ai_mcp_server_config` MODIFY `service_type` ENUM('openclaw','codex','n8n','custom') DEFAULT 'custom' COMMENT '服务类型'",
    );
  }
}
