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
      `UPDATE roles SET code = name WHERE code IS NULL LIMIT 10000`
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

    // 5. skill_packages 表（技能商店；实体存在但无建表脚本，缺失时启动自动补建）
    const [skillPackagesTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'skill_packages'`
    );
    if (!skillPackagesTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS skill_packages (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(64) NOT NULL,
          display_name VARCHAR(512) NOT NULL,
          description VARCHAR(512) NOT NULL,
          skill_type VARCHAR(32) NOT NULL DEFAULT 'skill',
          runtime_type VARCHAR(32) NOT NULL,
          category VARCHAR(32) DEFAULT NULL,
          source_url VARCHAR(512) NOT NULL,
          install_path VARCHAR(512) DEFAULT NULL,
          skill_md_path VARCHAR(512) DEFAULT NULL,
          entry_point VARCHAR(256) DEFAULT NULL,
          input_schema JSON DEFAULT NULL,
          output_schema JSON DEFAULT NULL,
          dependencies JSON DEFAULT NULL,
          trigger_keywords JSON DEFAULT NULL,
          examples JSON DEFAULT NULL,
          ui_config JSON DEFAULT NULL,
          opc_agent_config JSON DEFAULT NULL,
          status ENUM('draft','reviewing','approved','published','unpublished','failed') NOT NULL DEFAULT 'draft',
          review_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          review_note VARCHAR(512) DEFAULT NULL,
          is_official TINYINT(1) NOT NULL DEFAULT 0,
          call_count INT NOT NULL DEFAULT 0,
          avg_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
          version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_skill_packages_name (name),
          KEY idx_skill_packages_status (status),
          KEY idx_skill_packages_skill_type (skill_type),
          KEY idx_skill_packages_is_official (is_official)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能商店-技能包'
      `);
      logger.log('Created table: skill_packages');
    }

    // 6. skill_sources 表
    const [skillSourcesTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'skill_sources'`
    );
    if (!skillSourcesTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS skill_sources (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          source_url VARCHAR(512) NOT NULL,
          source_type VARCHAR(32) NOT NULL DEFAULT 'github',
          skill_name VARCHAR(64) NOT NULL,
          skill_desc VARCHAR(512) NOT NULL,
          skill_type VARCHAR(32) NOT NULL DEFAULT 'skill',
          auto_detected_type VARCHAR(32) DEFAULT NULL,
          status ENUM('pending','analyzing','analyzed','failed') NOT NULL DEFAULT 'pending',
          analyze_result JSON DEFAULT NULL,
          error_message VARCHAR(1024) DEFAULT NULL,
          package_id BIGINT UNSIGNED DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_skill_sources_source_url (source_url),
          KEY idx_skill_sources_package_id (package_id),
          KEY idx_skill_sources_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能商店-技能来源'
      `);
      logger.log('Created table: skill_sources');
    }

    // 7. skill_install_logs 表
    const [skillInstallLogsTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'skill_install_logs'`
    );
    if (!skillInstallLogsTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS skill_install_logs (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          package_id BIGINT UNSIGNED NOT NULL,
          user_id BIGINT UNSIGNED DEFAULT NULL,
          action VARCHAR(32) NOT NULL,
          result VARCHAR(32) NOT NULL DEFAULT 'success',
          error_message VARCHAR(1024) DEFAULT NULL,
          duration_ms INT NOT NULL DEFAULT 0,
          detail JSON DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_skill_install_logs_package_id (package_id),
          KEY idx_skill_install_logs_user_id (user_id),
          KEY idx_skill_install_logs_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能商店-安装/执行日志'
      `);
      logger.log('Created table: skill_install_logs');
    }


    // 8. chat_sessions 补充桌面端会话字段（置顶/状态/最后消息/知识库）
    const chatSessionCols: Array<{ name: string; def: string }> = [
      { name: 'knowledge_base_id', def: "BIGINT UNSIGNED DEFAULT NULL COMMENT '当前挂载知识库 ID'" },
      { name: 'pinned', def: "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否置顶'" },
      { name: 'status', def: "VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '会话状态'" },
      { name: 'last_message_at', def: "DATETIME DEFAULT NULL COMMENT '最后消息时间'" },
    ];
    for (const col of chatSessionCols) {
      const [colRow] = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_sessions' AND COLUMN_NAME = '${col.name}'`
      );
      if (!colRow) {
        await queryRunner.query(
          `ALTER TABLE chat_sessions ADD COLUMN \`${col.name}\` ${col.def}`
        );
        logger.log(`Added column: chat_sessions.${col.name}`);
      }
    }


    // 9. opc_agent_repos 表名对齐（历史 SQL 建表为单数 opc_agent_repo，实体为复数 opc_agent_repos）
    const [opcSingular] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opc_agent_repo'`
    );
    const [opcPlural] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opc_agent_repos'`
    );
    if (opcSingular && !opcPlural) {
      await queryRunner.query('RENAME TABLE opc_agent_repo TO opc_agent_repos');
      logger.log('Renamed table: opc_agent_repo -> opc_agent_repos');
    }
    if (opcPlural) {
      const [agentNameCol] = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opc_agent_repos' AND COLUMN_NAME = 'agent_name'`
      );
      if (!agentNameCol) {
        await queryRunner.query(`ALTER TABLE opc_agent_repos
          ADD COLUMN agent_name VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'Agent 名称快照' AFTER agent_id,
          ADD COLUMN agent_avatar VARCHAR(512) DEFAULT NULL COMMENT 'Agent 头像快照' AFTER agent_name,
          ADD COLUMN description VARCHAR(512) DEFAULT NULL COMMENT 'Agent 描述快照' AFTER agent_avatar,
          ADD COLUMN version VARCHAR(32) NOT NULL DEFAULT '1' COMMENT 'Agent 版本快照' AFTER description`);
        logger.log('Added columns: opc_agent_repos snapshot columns');
      }
    }


    // 10. agent_installs 表（桌面端 Agent 安装/卸载记录）
    const [agentInstallsTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_installs'`
    );
    if (!agentInstallsTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS agent_installs (
          id BIGINT NOT NULL AUTO_INCREMENT,
          user_id BIGINT NOT NULL,
          agent_id BIGINT NOT NULL,
          version VARCHAR(32) DEFAULT NULL,
          install_dir VARCHAR(512) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_agent_installs_user_agent (user_id, agent_id),
          KEY idx_agent_installs_user_id (user_id),
          KEY idx_agent_installs_agent_id (agent_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 安装记录表'
      `);
      logger.log('Created table: agent_installs');
    }


    // 11. users.notification_settings 列 + user_api_keys 表（设置页 API Key / 通知设置）
    const [notifCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'notification_settings'`
    );
    if (!notifCol) {
      await queryRunner.query(
        `ALTER TABLE users ADD COLUMN notification_settings JSON DEFAULT NULL COMMENT '通知设置（JSON）' AFTER llm_proxy_key`
      );
      logger.log('Added column: users.notification_settings');
    }
    const [apiKeysTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_api_keys'`
    );
    if (!apiKeysTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS user_api_keys (
          id BIGINT NOT NULL AUTO_INCREMENT,
          user_id BIGINT NOT NULL,
          alias VARCHAR(128) NOT NULL,
          key_hash VARCHAR(64) NOT NULL,
          key_prefix VARCHAR(16) NOT NULL,
          last_used_at DATETIME DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_user_api_keys_key_hash (key_hash),
          KEY idx_user_api_keys_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户 API Key 表'
      `);
      logger.log('Created table: user_api_keys');
    }

    // 团队可关联知识库
    const [hermesTeamCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hermes_call_logs' AND COLUMN_NAME = 'team_id'`
    );
    if (!hermesTeamCol) {
      await queryRunner.query(
        `ALTER TABLE hermes_call_logs ADD COLUMN team_id BIGINT DEFAULT NULL COMMENT '关联 OPC 团队 ID' AFTER user_id`
      );
      logger.log('Added column: hermes_call_logs.team_id');
    }
    // 团队三表：确保存在 + 补齐实体所需列（兼容服务器上历史遗留的旧表结构，如缺 member_count/agent_id 等）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS teams (
      id BIGINT NOT NULL AUTO_INCREMENT,
      name VARCHAR(128) NOT NULL COMMENT '团队名称',
      avatar VARCHAR(512) NULL COMMENT '团队头像',
      description VARCHAR(512) NULL COMMENT '团队描述',
      member_count INT NOT NULL DEFAULT 0 COMMENT '成员数量',
      creator_id BIGINT NOT NULL COMMENT '创建者 ID',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      PRIMARY KEY (id),
      INDEX idx_teams_creator_id (creator_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队表'`);
    logger.log('Ensured table: teams');

    const ensureColumn = async (table: string, name: string, def: string) => {
      const [row] = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${name}'`
      );
      if (!row) {
        await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN \`${name}\` ${def}`);
        logger.log(`Added column: ${table}.${name}`);
      }
    };

    // teams 补齐新团队实体所需列（旧表可能是 owner_id 结构）
    const teamCols: Array<[string, string]> = [
      ['name', "VARCHAR(128) NOT NULL DEFAULT '' COMMENT '团队名称'"],
      ['avatar', "VARCHAR(512) DEFAULT NULL COMMENT '团队头像'"],
      ['description', "VARCHAR(512) DEFAULT NULL COMMENT '团队描述'"],
      ['member_count', "INT NOT NULL DEFAULT 0 COMMENT '成员数量'"],
      ['creator_id', "BIGINT NOT NULL DEFAULT 0 COMMENT '创建者 ID'"],
      ['knowledge_base_id', "BIGINT DEFAULT NULL COMMENT '关联知识库 ID'"],
    ];
    for (const [colName, colDef] of teamCols) {
      await ensureColumn('teams', colName, colDef);
    }

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS team_members (
      id BIGINT NOT NULL AUTO_INCREMENT,
      team_id BIGINT NOT NULL COMMENT '团队 ID',
      agent_id BIGINT NOT NULL COMMENT '关联的 Agent ID',
      agent_name VARCHAR(64) NOT NULL COMMENT 'Agent 名称快照',
      agent_avatar VARCHAR(512) NULL COMMENT 'Agent 头像快照',
      role_title VARCHAR(64) NOT NULL COMMENT '自定义职能名',
      role_description VARCHAR(512) NULL COMMENT '职能描述',
      role_emoji VARCHAR(16) NULL COMMENT '职能图标 emoji',
      theme_color VARCHAR(16) NULL COMMENT '主题色',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '成员排序',
      is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否激活',
      added_by BIGINT NOT NULL COMMENT '添加者 ID',
      joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      PRIMARY KEY (id),
      UNIQUE INDEX uniq_team_member_agent (team_id, agent_id),
      INDEX idx_team_member_team (team_id),
      INDEX idx_team_member_agent (agent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队成员表'`);
    const teamMemberCols: Array<[string, string]> = [
      ['team_id', 'BIGINT NOT NULL DEFAULT 0'],
      ['agent_id', 'BIGINT NOT NULL DEFAULT 0'],
      ['agent_name', "VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'Agent 名称快照'"],
      ['agent_avatar', 'VARCHAR(512) DEFAULT NULL'],
      ['role_title', "VARCHAR(64) NOT NULL DEFAULT '团队成员' COMMENT '自定义职能名'"],
      ['role_description', 'VARCHAR(512) DEFAULT NULL'],
      ['role_emoji', 'VARCHAR(16) DEFAULT NULL'],
      ['theme_color', 'VARCHAR(16) DEFAULT NULL'],
      ['sort_order', 'INT NOT NULL DEFAULT 0'],
      ['is_active', 'TINYINT(1) NOT NULL DEFAULT 1'],
      ['added_by', 'BIGINT NOT NULL DEFAULT 0'],
    ];
    for (const [colName, colDef] of teamMemberCols) {
      await ensureColumn('team_members', colName, colDef);
    }

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS team_tasks (
      id BIGINT NOT NULL AUTO_INCREMENT,
      team_id BIGINT NOT NULL COMMENT '团队 ID',
      title VARCHAR(128) NOT NULL COMMENT '任务标题',
      description VARCHAR(512) NULL COMMENT '任务描述',
      status ENUM('pending', 'in_progress', 'completed', 'failed') NOT NULL DEFAULT 'pending' COMMENT '任务状态',
      assignee_member_id BIGINT NULL COMMENT '分配给哪个成员',
      creator_id BIGINT NOT NULL COMMENT '创建者 ID',
      priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium' COMMENT '优先级',
      due_date DATETIME NULL COMMENT '截止日期',
      result JSON NULL COMMENT '执行结果',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      completed_at DATETIME NULL COMMENT '完成时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      PRIMARY KEY (id),
      INDEX idx_team_task_team (team_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队任务表'`);
    const teamTaskCols: Array<[string, string]> = [
      ['team_id', 'BIGINT NOT NULL DEFAULT 0'],
      ['title', "VARCHAR(128) NOT NULL DEFAULT '' COMMENT '任务标题'"],
      ['description', 'VARCHAR(512) DEFAULT NULL'],
      ['status', "ENUM('pending','in_progress','completed','failed') NOT NULL DEFAULT 'pending'"],
      ['assignee_member_id', 'BIGINT DEFAULT NULL'],
      ['creator_id', 'BIGINT NOT NULL DEFAULT 0'],
      ['priority', "ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium'"],
      ['due_date', 'DATETIME DEFAULT NULL'],
      ['result', 'JSON DEFAULT NULL'],
    ];
    for (const [colName, colDef] of teamTaskCols) {
      await ensureColumn('team_tasks', colName, colDef);
    }
    logger.log('Startup migrations completed');
  } catch (err) {
    logger.error(`Startup migration failed: ${(err as Error).message}`);
    // 不抛出错误，允许后端继续启动
  } finally {
    await queryRunner.release();
  }
}