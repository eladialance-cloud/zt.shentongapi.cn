"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStartupMigrations = runStartupMigrations;
const common_1 = require("@nestjs/common");
async function runStartupMigrations(dataSource) {
    const logger = new common_1.Logger('DbMigration');
    const queryRunner = dataSource.createQueryRunner();
    try {
        await queryRunner.connect();
        const [usersCol] = await queryRunner.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'`);
        if (!usersCol) {
            await queryRunner.query(`ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否需要修改密码'`);
            logger.log('Added column: users.must_change_password');
        }
        const [rolesCol] = await queryRunner.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'code'`);
        if (!rolesCol) {
            await queryRunner.query(`ALTER TABLE roles ADD COLUMN code VARCHAR(64) DEFAULT NULL COMMENT '角色编码'`);
            logger.log('Added column: roles.code');
        }
        await queryRunner.query(`UPDATE roles SET code = name WHERE code IS NULL`);
        const [userDevicesTable] = await queryRunner.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_devices'`);
        if (!userDevicesTable) {
            await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS \`user_devices\` (
          \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`user_id\` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
          \`device_fingerprint\` VARCHAR(64) NOT NULL COMMENT '设备指纹(SHA-256)',
          \`device_name\` VARCHAR(128) NOT NULL COMMENT '设备名称',
          \`device_type\` VARCHAR(32) NOT NULL COMMENT '设备类型: win32/darwin/linux',
          \`last_login_at\` DATETIME NOT NULL COMMENT '最后登录时间',
          \`last_login_ip\` VARCHAR(64) NOT NULL COMMENT '最后登录 IP',
          \`status\` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled',
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_user_fingerprint\` (\`user_id\`, \`device_fingerprint\`),
          KEY \`idx_user_devices_user_id\` (\`user_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户设备绑定表'
      `);
            logger.log('Created table: user_devices');
        }
        const [clientVersionsTable] = await queryRunner.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_versions'`);
        if (!clientVersionsTable) {
            await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS \`client_versions\` (
          \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`version\` VARCHAR(32) NOT NULL COMMENT '版本号',
          \`platform\` VARCHAR(16) NOT NULL COMMENT '平台: win/mac',
          \`download_url\` VARCHAR(512) NOT NULL COMMENT '下载地址',
          \`changelog\` TEXT NULL COMMENT '更新日志',
          \`force_update\` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否强制更新',
          \`grayscale_percent\` INT NOT NULL DEFAULT 100 COMMENT '灰度比例 0-100',
          \`published_at\` DATETIME NULL COMMENT '发布时间',
          \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_client_versions_platform\` (\`platform\`),
          KEY \`idx_client_versions_active\` (\`is_active\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户端版本表'
      `);
            logger.log('Created table: client_versions');
        }
        const [runtimeVersionsTable] = await queryRunner.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'runtime_versions'`);
        if (!runtimeVersionsTable) {
            await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS \`runtime_versions\` (
          \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`service_name\` VARCHAR(32) NOT NULL COMMENT '引擎名: openclaw/n8n/mcp',
          \`version\` VARCHAR(32) NOT NULL COMMENT '版本号',
          \`platform\` VARCHAR(16) NOT NULL COMMENT '平台: win32-x64/darwin-x64/darwin-arm64/linux-x64',
          \`download_url\` VARCHAR(512) NOT NULL COMMENT 'CDN 下载地址',
          \`sha256\` CHAR(64) NOT NULL COMMENT 'SHA-256 哈希',
          \`changelog\` TEXT NULL COMMENT '更新日志',
          \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
          \`force_update\` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否强制更新此引擎',
          \`min_app_version\` VARCHAR(32) NULL COMMENT '要求的最小桌面端版本',
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_service_version_platform\` (\`service_name\`, \`version\`, \`platform\`),
          KEY \`idx_runtime_versions_active\` (\`service_name\`, \`is_active\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运行时引擎版本管理'
      `);
            logger.log('Created table: runtime_versions');
        }
        const [usersStatusCol] = await queryRunner.query(`SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'`);
        if (usersStatusCol && usersStatusCol.COLUMN_TYPE === "enum('active','banned')") {
            await queryRunner.query(`ALTER TABLE users MODIFY COLUMN \`status\` ENUM('active', 'banned', 'deleted') NOT NULL DEFAULT 'active' COMMENT '账户状态 (active正常/banned封禁/deleted已删除)'`);
            logger.log('Extended column: users.status ENUM (added deleted)');
        }
        logger.log('Startup migrations completed');
    }
    catch (err) {
        logger.error(`Startup migration failed: ${err.message}`);
        throw err;
    }
    finally {
        await queryRunner.release();
    }
}
//# sourceMappingURL=db-migration.js.map