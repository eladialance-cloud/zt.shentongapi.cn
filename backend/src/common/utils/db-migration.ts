import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * 启动时自动迁移检查
 * 确保 Entity 中新增的字段在数据库中存在
 * 幂等执行，列已存在时跳过
 */
export async function runStartupMigrations(dataSource: DataSource): Promise<void> {
  const logger = new Logger('DbMigration');
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.connect();

    // 1. users 表添加 must_change_password 列
    const [usersCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'`
    );
    if (!usersCol) {
      await queryRunner.query(
        `ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否需要修改密码'`
      );
      logger.log('Added column: users.must_change_password');
    }

    // 2. roles 表添加 code 列
    const [rolesCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'code'`
    );
    if (!rolesCol) {
      await queryRunner.query(
        `ALTER TABLE roles ADD COLUMN code VARCHAR(64) DEFAULT NULL COMMENT '角色编码'`
      );
      logger.log('Added column: roles.code');
    }

    // 3. 为已有角色设置 code 值
    await queryRunner.query(
      `UPDATE roles SET code = name WHERE code IS NULL`
    );

    // 4. operation_logs 表（如果不存在则创建）
    const [logTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_logs'`
    );
    if (!logTable) {
      await queryRunner.query(`
        CREATE TABLE operation_logs (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          admin_id BIGINT UNSIGNED NOT NULL,
          action VARCHAR(64) NOT NULL,
          resource VARCHAR(64) DEFAULT NULL,
          resource_id VARCHAR(64) DEFAULT NULL,
          details JSON DEFAULT NULL,
          ip VARCHAR(45) DEFAULT NULL,
          user_agent VARCHAR(512) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_operation_logs_admin_id (admin_id),
          KEY idx_operation_logs_action (action),
          KEY idx_operation_logs_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表'
      `);
      logger.log('Created table: operation_logs');
    }

    logger.log('Startup migrations completed');
  } catch (err) {
    logger.error(`Startup migration failed: ${err.message}`);
    // 不抛出错误，允许后端继续启动
  } finally {
    await queryRunner.release();
  }
}
