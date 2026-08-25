import { Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

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

    // 5.5 hermes_skills 表（Hermes 技能市场；管理端技能包上架时同步生成记录）
    const [hermesSkillsTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hermes_skills'`
    );
    if (!hermesSkillsTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS hermes_skills (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(128) NOT NULL,
          description TEXT DEFAULT NULL,
          author VARCHAR(64) DEFAULT NULL,
          price_per_minute INT NOT NULL DEFAULT 0,
          install_count INT NOT NULL DEFAULT 0,
          icon VARCHAR(512) DEFAULT NULL,
          version VARCHAR(64) NOT NULL DEFAULT '1.0.0',
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          exec_config JSON DEFAULT NULL,
          category VARCHAR(64) DEFAULT NULL,
          avg_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
          rating_count INT NOT NULL DEFAULT 0,
          tags JSON DEFAULT NULL,
          changelog TEXT DEFAULT NULL,
          source_package_id BIGINT UNSIGNED DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_hermes_skills_source_package_id (source_package_id),
          KEY idx_hermes_skills_is_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hermes 技能包目录'
      `);
      logger.log('Created table: hermes_skills');
    } else {
      const [hsCol] = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hermes_skills' AND COLUMN_NAME = 'source_package_id'`
      );
      if (!hsCol) {
        await queryRunner.query(
          `ALTER TABLE hermes_skills ADD COLUMN \`source_package_id\` BIGINT UNSIGNED DEFAULT NULL COMMENT '关联管理端技能包 ID'`,
        );
        logger.log('Added column: hermes_skills.source_package_id');
      }
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
    } else {
      const [ssCatCol] = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'skill_sources' AND COLUMN_NAME = 'category'`
      );
      if (!ssCatCol) {
        await queryRunner.query(
          `ALTER TABLE skill_sources ADD COLUMN category VARCHAR(64) DEFAULT NULL COMMENT '平台中文分类'`,
        );
        logger.log('Added column: skill_sources.category');
      }
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
      try {
        const [row] = await queryRunner.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${name}'`
        );
        if (row) return;
      } catch (e) {
        // information_schema 查询异常不阻塞，继续走 ALTER 并由下方兜底
        logger.warn(`ensureColumn 检查失败 ${table}.${name}: ${(e as Error).message}`);
      }
      try {
        await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN \`${name}\` ${def}`);
        logger.log(`Added column: ${table}.${name}`);
      } catch (e) {
        const msg = String((e as Error).message || e);
        if (/Duplicate column/i.test(msg)) {
          logger.warn(`Column already exists (skip): ${table}.${name}`);
        } else {
          throw e;
        }
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
      ['created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'"],
      ['updated_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'"],
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
      ['joined_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间'"],
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
      ['created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'"],
      ['completed_at', "DATETIME DEFAULT NULL COMMENT '完成时间'"],
    ];
    for (const [colName, colDef] of teamTaskCols) {
      await ensureColumn('team_tasks', colName, colDef);
    }
    // 团队协作流程节点（Hermes 编排时作为任务主干模板；整表替换保存）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS team_workflow_nodes (
      id BIGINT NOT NULL AUTO_INCREMENT,
      team_id BIGINT NOT NULL COMMENT '团队 ID',
      name VARCHAR(128) NOT NULL COMMENT '流程节点名',
      description VARCHAR(512) NULL COMMENT '节点说明',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '节点顺序（升序）',
      assignee_member_ids JSON NULL COMMENT '负责成员 ID 列表（team_members.id）',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      PRIMARY KEY (id),
      INDEX idx_team_workflow_team (team_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队协作流程节点'`);
    logger.log('Ensured table: team_workflow_nodes');
    const teamWorkflowCols: Array<[string, string]> = [
      ['team_id', 'BIGINT NOT NULL DEFAULT 0'],
      ['name', "VARCHAR(128) NOT NULL DEFAULT '' COMMENT '流程节点名'"],
      ['description', 'VARCHAR(512) DEFAULT NULL'],
      ['sort_order', 'INT NOT NULL DEFAULT 0'],
      ['assignee_member_ids', 'JSON DEFAULT NULL'],
      ['created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'"],
      ['updated_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'"],
    ];
    for (const [colName, colDef] of teamWorkflowCols) {
      await ensureColumn('team_workflow_nodes', colName, colDef);
    }
    // 旧版 teams/team_members 表（init.sql 结构）含 owner_id/user_id/role 等 NOT NULL 旧列，
    // 新实体（creator_id/agent_id/role_title）INSERT 时不提供这些列会报
    // "Field ... doesn't have a default value"。这里把旧列调整为可空，兼容新旧两套结构共存。
    const adjustLegacyColumn = async (table: string, name: string, def: string) => {
      const [row] = await queryRunner.query(
        `SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${name}'`
      );
      if (row && row.IS_NULLABLE !== 'YES') {
        await queryRunner.query(`ALTER TABLE ${table} MODIFY COLUMN \`${name}\` ${def}`);
        logger.log(`Adjusted column: ${table}.${name} -> nullable`);
      }
    };
    await adjustLegacyColumn('teams', 'owner_id', "BIGINT UNSIGNED DEFAULT NULL COMMENT '团队所有者 ID（旧字段，新版本使用 creator_id）'");
    await adjustLegacyColumn('team_members', 'user_id', "BIGINT UNSIGNED DEFAULT NULL COMMENT '用户 ID（旧字段，新版本使用 agent_id）'");
    await adjustLegacyColumn('team_members', 'role', "VARCHAR(32) DEFAULT NULL COMMENT '团队内角色（旧字段，新版本使用 role_title）'");
    // Hermes 实例：确保表存在 + 补齐执行目标字段（团队 / N8N 工作流 / 知识库）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS hermes_instances (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      name VARCHAR(64) NOT NULL,
      status ENUM('running','stopped','error') NOT NULL DEFAULT 'stopped',
      pid INT DEFAULT NULL,
      skill_count INT NOT NULL DEFAULT 0,
      skill_ids JSON DEFAULT NULL,
      error_message VARCHAR(512) DEFAULT NULL,
      cpu_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      memory_used_mb INT NOT NULL DEFAULT 0,
      memory_total_mb INT NOT NULL DEFAULT 0,
      started_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hermes 实例表'`);
    const hermesInstanceCols: Array<[string, string]> = [
      ['execution_type', "VARCHAR(16) DEFAULT NULL COMMENT '执行目标类型：team=OPC团队, workflow=N8N工作流'"],
      ['team_id', "BIGINT DEFAULT NULL COMMENT '关联 OPC 团队 ID'"],
      ['workflow_id', "VARCHAR(64) DEFAULT NULL COMMENT '关联 N8N 工作流 ID'"],
      ['knowledge_base_id', "BIGINT DEFAULT NULL COMMENT '关联知识库 ID'"],
    ];
    for (const [colName, colDef] of hermesInstanceCols) {
      await ensureColumn('hermes_instances', colName, colDef);
    }

    // 充值档位表 recharge_plans（管理后台可配置，替代写死的静态数组）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS recharge_plans (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(64) NOT NULL COMMENT '档位名称',
      credits INT NOT NULL COMMENT '到账积分',
      bonus_credits INT NOT NULL DEFAULT 0 COMMENT '赠送积分',
      price DECIMAL(10,2) NOT NULL COMMENT '价格(元)',
      currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
      is_recommended TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否推荐',
      is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_recharge_plans_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='充值档位表'`);
    const [rechargePlanCount] = await queryRunner.query('SELECT COUNT(*) AS c FROM recharge_plans');
    if (Number(rechargePlanCount.c) === 0) {
      await queryRunner.query(`INSERT INTO recharge_plans (name, credits, bonus_credits, price, currency, is_recommended, is_active, sort_order) VALUES
        ('体验包', 100, 0, 10.00, 'CNY', 0, 1, 1),
        ('基础包', 500, 20, 48.00, 'CNY', 0, 1, 2),
        ('标准包', 1000, 100, 88.00, 'CNY', 1, 1, 3),
        ('进阶包', 3000, 400, 248.00, 'CNY', 0, 1, 4),
        ('尊享包', 5000, 800, 398.00, 'CNY', 0, 1, 5)`);
      logger.log('Seeded recharge_plans with 5 default plans');
    }

    // 支付渠道配置表 payment_configs
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS payment_configs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      channel VARCHAR(16) NOT NULL COMMENT '渠道: wechat/alipay/stripe',
      display_name VARCHAR(32) DEFAULT NULL COMMENT '渠道展示名',
      enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用',
      config JSON DEFAULT NULL COMMENT '商户参数',
      is_mock TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否模拟支付',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_payment_configs_channel (channel)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付渠道配置表'`);
    const [paymentConfigCount] = await queryRunner.query('SELECT COUNT(*) AS c FROM payment_configs');
    if (Number(paymentConfigCount.c) === 0) {
      await queryRunner.query(`INSERT INTO payment_configs (channel, display_name, enabled, is_mock) VALUES
        ('wechat', '微信支付', 0, 1),
        ('alipay', '支付宝', 0, 1),
        ('stripe', 'Stripe', 0, 1)`);
      logger.log('Seeded payment_configs with 3 default channels');
    }

    // 充值订单表 recharge_orders（真实支付：下单/回调入账/退款）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS recharge_orders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_no VARCHAR(64) NOT NULL COMMENT '订单号',
      user_id BIGINT NOT NULL COMMENT '用户 ID',
      package_id BIGINT DEFAULT NULL COMMENT '充值档位 ID',
      credits INT NOT NULL COMMENT '到账积分',
      amount DECIMAL(10,2) NOT NULL COMMENT '支付金额(元)',
      status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending' COMMENT '订单状态',
      payment_channel ENUM('wechat','alipay','stripe') DEFAULT NULL COMMENT '支付渠道',
      payment_record_id BIGINT DEFAULT NULL COMMENT '支付流水 ID',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_recharge_orders_order_no (order_no),
      KEY idx_recharge_orders_user_id (user_id),
      KEY idx_recharge_orders_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='充值订单表'`);
    logger.log('Ensured table: recharge_orders');

    // 支付流水表 payment_records（渠道侧支付记录，含回调原文）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS payment_records (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL COMMENT '用户 ID',
      order_no VARCHAR(64) NOT NULL COMMENT '业务订单号',
      channel ENUM('wechat','alipay','stripe') NOT NULL COMMENT '支付渠道',
      sub_method VARCHAR(32) DEFAULT NULL COMMENT '支付方式: native/jsapi/pc/wap/card',
      amount DECIMAL(10,2) NOT NULL COMMENT '支付金额(元)',
      currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
      status ENUM('pending','paid','failed','refunded','refunding') NOT NULL DEFAULT 'pending' COMMENT '流水状态',
      payment_txn_id VARCHAR(128) DEFAULT NULL COMMENT '渠道交易号',
      pay_params JSON DEFAULT NULL COMMENT '下单返回参数(二维码等)',
      paid_at DATETIME DEFAULT NULL COMMENT '支付时间',
      refund_txn_id VARCHAR(128) DEFAULT NULL COMMENT '退款渠道交易号',
      refund_amount DECIMAL(10,2) DEFAULT NULL COMMENT '退款金额',
      refunded_at DATETIME DEFAULT NULL COMMENT '退款时间',
      description VARCHAR(256) DEFAULT NULL COMMENT '描述',
      callback_raw JSON DEFAULT NULL COMMENT '回调原文',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_payment_records_order_no (order_no),
      KEY idx_payment_records_user_id (user_id),
      KEY idx_payment_records_status (status),
      KEY idx_payment_records_txn_id (payment_txn_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付流水表'`);
    logger.log('Ensured table: payment_records');

    // MCP 官方目录表 mcp_catalog（技能市场-MCP 官方来源）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS mcp_catalog (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(128) NOT NULL COMMENT '展示名称',
      description VARCHAR(512) DEFAULT NULL COMMENT '简介',
      category VARCHAR(32) DEFAULT NULL COMMENT '分类: database/search/browser/git/files/messaging/ai/devops/other',
      tags JSON DEFAULT NULL COMMENT '标签数组',
      icon VARCHAR(512) DEFAULT NULL COMMENT '图标 URL',
      homepage VARCHAR(512) DEFAULT NULL COMMENT '官方文档地址',
      source_url VARCHAR(512) DEFAULT NULL COMMENT '来源仓库地址',
      license VARCHAR(64) DEFAULT NULL COMMENT '许可证',
      runtime ENUM('node','python','docker','http') NOT NULL DEFAULT 'node' COMMENT '运行方式',
      security_level ENUM('official','community') NOT NULL DEFAULT 'community' COMMENT '安全分级',
      transport_type ENUM('stdio','http','streamable-http') NOT NULL DEFAULT 'stdio' COMMENT '传输方式',
      command VARCHAR(256) DEFAULT NULL COMMENT '启动命令(npx/uvx/docker/python/node)',
      args JSON DEFAULT NULL COMMENT '命令参数数组',
      env_template JSON DEFAULT NULL COMMENT '[{key,label,required,secret,default,description}]',
      url VARCHAR(512) DEFAULT NULL COMMENT 'http 型服务器地址',
      headers JSON DEFAULT NULL COMMENT 'http 型请求头模板',
      version VARCHAR(32) DEFAULT '1.0.0' COMMENT '目录版本',
      enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '上架/下架',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
      tool_count INT NOT NULL DEFAULT 0 COMMENT '已知工具数',
      download_count INT NOT NULL DEFAULT 0 COMMENT '累计下载数',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mcp_catalog_category (category),
      KEY idx_mcp_catalog_enabled (enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MCP 官方目录'`);
    logger.log('Ensured table: mcp_catalog');

    // mcp_servers 用户已装实例：来源 + 目录条目关联
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS mcp_servers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL COMMENT '用户 ID',
      name VARCHAR(128) NOT NULL COMMENT '服务器名称',
      description VARCHAR(512) DEFAULT NULL COMMENT '描述',
      transport_type ENUM('stdio','http','streamable-http') NOT NULL DEFAULT 'stdio' COMMENT '传输方式',
      command VARCHAR(256) DEFAULT NULL COMMENT '启动命令',
      args JSON DEFAULT NULL COMMENT '命令参数',
      env JSON DEFAULT NULL COMMENT '环境变量',
      url VARCHAR(512) DEFAULT NULL COMMENT '服务器 URL',
      headers JSON DEFAULT NULL COMMENT '请求头',
      enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
      last_connected_at DATETIME DEFAULT NULL COMMENT '最后连接时间',
      tool_count INT NOT NULL DEFAULT 0 COMMENT '工具数量',
      status ENUM('pending','connected','failed','disabled') NOT NULL DEFAULT 'pending' COMMENT '连接状态',
      source VARCHAR(16) NOT NULL DEFAULT 'custom' COMMENT '来源: custom/official/chat',
      catalog_id BIGINT DEFAULT NULL COMMENT '关联 mcp_catalog.id',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mcp_servers_user_id (user_id),
      KEY idx_mcp_servers_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户 MCP 服务器配置表'`);
    logger.log('Ensured table: mcp_servers');
    await ensureColumn('mcp_servers', 'source', "VARCHAR(16) NOT NULL DEFAULT 'custom' COMMENT '来源: custom/official/chat'");
    await ensureColumn('mcp_servers', 'catalog_id', "BIGINT DEFAULT NULL COMMENT '关联 mcp_catalog.id'");

    // 唯一索引兜底：同一用户对同一官方目录条目只允许一个实例（幂等复用依赖）
    const [ukMcpRow] = await queryRunner.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mcp_servers' AND INDEX_NAME = 'uk_mcp_user_catalog'`
    );
    if (!ukMcpRow) {
      await queryRunner.query(
        'ALTER TABLE mcp_servers ADD UNIQUE KEY `uk_mcp_user_catalog` (user_id, catalog_id)'
      );
      logger.log('Added unique index: mcp_servers.uk_mcp_user_catalog');
    }

    // ===== 知识库引擎升级（MaxKB）Phase 1 =====
    // 行业分类表 industry_categories（官方知识库按行业归类）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS industry_categories (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(64) NOT NULL COMMENT '行业名称',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_industry_categories_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='行业分类表'`);
    logger.log('Ensured table: industry_categories');

    // 官方知识库下载记录表 user_kb_downloads（Phase 3 同步到本地用）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS user_kb_downloads (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL COMMENT '用户 ID',
      kb_id BIGINT NOT NULL COMMENT '知识库 ID',
      status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending' COMMENT '下载状态',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_kb_downloads_user (user_id),
      KEY idx_user_kb_downloads_kb (kb_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='官方知识库下载记录表'`);
    logger.log('Ensured table: user_kb_downloads');

    // knowledge_bases 表兜底（服务器缺失时自动补建，含新列）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS knowledge_bases (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL COMMENT '所属用户 ID（官方库为 0）',
      name VARCHAR(128) NOT NULL COMMENT '知识库名称',
      description VARCHAR(512) DEFAULT NULL COMMENT '描述',
      visibility ENUM('private','public') NOT NULL DEFAULT 'private' COMMENT '可见性',
      status ENUM('active','processing','reindexing','error','deleting','delete_failed') NOT NULL DEFAULT 'active' COMMENT '状态',
      embedding_model VARCHAR(64) NOT NULL DEFAULT 'text-embedding-ada-002' COMMENT '嵌入模型',
      chunk_size INT NOT NULL DEFAULT 1000,
      chunk_overlap INT NOT NULL DEFAULT 200,
      document_count INT NOT NULL DEFAULT 0,
      total_chunks INT NOT NULL DEFAULT 0,
      total_tokens INT NOT NULL DEFAULT 0,
      is_official TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否官方知识库',
      industry_id BIGINT UNSIGNED DEFAULT NULL COMMENT '所属行业分类 ID',
      engine_kb_id VARCHAR(64) DEFAULT NULL COMMENT '引擎侧（MaxKB）数据集 ID',
      publish_status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '发布状态: draft/published/unpublished',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_knowledge_bases_user_id (user_id),
      KEY idx_knowledge_bases_industry_id (industry_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库表'`);
    logger.log('Ensured table: knowledge_bases');
    const kbCols: Array<[string, string]> = [
      ['is_official', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否官方知识库'"],
      ['industry_id', "BIGINT UNSIGNED DEFAULT NULL COMMENT '所属行业分类 ID'"],
      ['engine_kb_id', "VARCHAR(64) DEFAULT NULL COMMENT '引擎侧（MaxKB）数据集 ID'"],
      ['publish_status', "VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '发布状态: draft/published/unpublished'"],
    ];
    for (const [colName, colDef] of kbCols) {
      await ensureColumn('knowledge_bases', colName, colDef);
    }

    // knowledge_base_documents 表兜底 + 引擎列
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS knowledge_base_documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      knowledge_base_id BIGINT NOT NULL COMMENT '知识库 ID',
      name VARCHAR(256) NOT NULL COMMENT '文档名',
      file_path VARCHAR(512) NOT NULL COMMENT '文件路径',
      file_size INT NOT NULL DEFAULT 0 COMMENT '文件大小',
      mime_type VARCHAR(128) DEFAULT NULL,
      chunk_count INT NOT NULL DEFAULT 0,
      token_count INT NOT NULL DEFAULT 0,
      status ENUM('pending','processing','done','error') NOT NULL DEFAULT 'pending' COMMENT '处理状态',
      error VARCHAR(512) DEFAULT NULL,
      engine_document_id VARCHAR(64) DEFAULT NULL COMMENT '引擎侧（MaxKB）文档 ID',
      engine_status VARCHAR(16) DEFAULT NULL COMMENT '引擎索引状态',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_knowledge_base_documents_kb_id (knowledge_base_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库文档表'`);
    logger.log('Ensured table: knowledge_base_documents');
    const kbDocCols: Array<[string, string]> = [
      ['engine_document_id', "VARCHAR(64) DEFAULT NULL COMMENT '引擎侧（MaxKB）文档 ID'"],
      ['engine_status', "VARCHAR(16) DEFAULT NULL COMMENT '引擎索引状态'"],
    ];
    for (const [colName, colDef] of kbDocCols) {
      await ensureColumn('knowledge_base_documents', colName, colDef);
    }

    // models 表补充模型管理列（实体新增，历史库缺列时自动补齐）
    const legacyModelCols: Array<[string, string]> = [
      ['connection_status', "VARCHAR(16) NOT NULL DEFAULT 'untested' COMMENT '连接状态'"],
      ['last_tested_at', "DATETIME DEFAULT NULL COMMENT '最后测试时间'"],
      ['description', "VARCHAR(512) DEFAULT NULL COMMENT '模型描述'"],
      ['context_window', "INT DEFAULT NULL COMMENT '上下文窗口'"],
      ['max_tokens', "INT DEFAULT NULL COMMENT '最大输出'"],
    ];
    for (const [colName, colDef] of legacyModelCols) {
      await ensureColumn('models', colName, colDef);
    }
    // models 表：调用模式/场景标签/计费方式等新列（实体新增，历史库缺列时自动补齐）
    await ensureColumn('models', 'call_mode', "VARCHAR(32) NOT NULL DEFAULT 'text_chat' COMMENT '调用模式(14种字典)'");
    await ensureColumn('models', 'scenario_tags', "JSON NULL COMMENT '场景标签(固定字典多选)'");
    await ensureColumn('models', 'pricing_mode', "VARCHAR(16) NULL COMMENT '计费方式: token/per_image/per_call/per_minute/per_second'");
    await ensureColumn('models', 'video_per_second', "JSON NULL COMMENT '视频按分辨率档积分/秒'");
    await ensureColumn('models', 'specs', "JSON NULL COMMENT '动态规格字段值'");
    await ensureColumn('models', 'icon_url', "VARCHAR(512) NULL COMMENT '模型图标URL'");
    await ensureColumn('models', 'cost_price', "DECIMAL(10,4) NULL COMMENT '成本价(元)'");
    await ensureColumn('models', 'remark', "VARCHAR(512) NULL COMMENT '管理员备注'");
    await ensureColumn('models', 'price_per_minute', "DECIMAL(10,4) NULL COMMENT '按分钟计费积分(积分/分钟)'");

    // agents 表补充缺失列（实体新增，历史库缺列时自动补齐）
    const agentCols: Array<[string, string]> = [
      ['display_name', "VARCHAR(64) DEFAULT NULL COMMENT '展示名称'"],
      ['download_count', "INT NOT NULL DEFAULT 0 COMMENT '下载次数'"],
      ['pricing_strategy', "VARCHAR(16) NOT NULL DEFAULT 'model' COMMENT '定价策略'"],
      ['dept_id', "BIGINT DEFAULT NULL COMMENT '部门 ID'"],
      ['output_rule', "TEXT DEFAULT NULL COMMENT '输出规则'"],
      ['model_config', "JSON DEFAULT NULL COMMENT '模型参数配置'"],
      ['use_codex', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否使用 CodeX'"],
      ['version', "INT NOT NULL DEFAULT 1 COMMENT '版本号'"],
    ];
    for (const [colName, colDef] of agentCols) {
      await ensureColumn('agents', colName, colDef);
    }

    // workflows 表补充缺失列
    const workflowCols: Array<[string, string]> = [
      ['workflow_json', "MEDIUMTEXT DEFAULT NULL COMMENT 'n8n 工作流 JSON 定义'"],
      ['source_repo', "VARCHAR(256) DEFAULT NULL COMMENT '来源仓库'"],
      ['source_path', "VARCHAR(512) DEFAULT NULL COMMENT '来源路径'"],
      ['version', "VARCHAR(32) DEFAULT NULL COMMENT '版本'"],
      ['icon', "VARCHAR(256) DEFAULT NULL COMMENT '图标'"],
      ['tags', "JSON DEFAULT NULL COMMENT '标签'"],
      ['is_published', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已发布'"],
      ['publish_status', "VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT '发布状态'"],
      ['node_count', "INT NOT NULL DEFAULT 0 COMMENT '节点数'"],
      ['trigger_type', "VARCHAR(64) DEFAULT NULL COMMENT '触发类型'"],
    ];
    for (const [colName, colDef] of workflowCols) {
      await ensureColumn('workflows', colName, colDef);
    }


    // ===== 模型供应商体系 =====

    // 7. model_providers 表
    const [providersTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'model_providers'`
    );
    if (!providersTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS model_providers (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(64) NOT NULL COMMENT '供应商显示名',
          slug VARCHAR(64) NOT NULL COMMENT '唯一标识(=models.provider)',
          base_url VARCHAR(512) NOT NULL COMMENT 'Base URL(OpenAI兼容)',
          api_key VARCHAR(1024) DEFAULT NULL COMMENT 'AES加密的API Key',
          config JSON DEFAULT NULL COMMENT '配置文件',
          status ENUM('active','disabled') NOT NULL DEFAULT 'active',
          connection_status ENUM('untested','connected','failed') NOT NULL DEFAULT 'untested',
          last_tested_at DATETIME DEFAULT NULL,
          is_builtin TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=老数据迁移生成',
          model_count INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_model_providers_slug (slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='大模型供应商'
      `);
      logger.log('Created table: model_providers');
    }

    // 8. models 表补列
    const modelCols = [
      { name: 'provider_id', def: "BIGINT UNSIGNED DEFAULT NULL COMMENT '供应商ID'", after: 'provider' },
      { name: 'upstream_model_id', def: "VARCHAR(128) DEFAULT NULL COMMENT '上游模型名(实际发送)'", after: 'provider_id' },
      { name: 'model_type', def: "VARCHAR(32) NOT NULL DEFAULT 'chat' COMMENT '分类标签'", after: 'upstream_model_id' },
    ];
    for (const col of modelCols) {
      const [exists] = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'models' AND COLUMN_NAME = ?`,
        [col.name]
      );
      if (!exists) {
        await queryRunner.query(
          'ALTER TABLE models ADD COLUMN ' + col.name + ' ' + col.def + ' AFTER ' + col.after
        );
        logger.log('Added column: models.' + col.name);
      }
    }

    // 9. 价格单位迁移：元/千token -> 积分/千token（×100），以列注释为幂等标记
    const [priceCol] = await queryRunner.query(
      `SELECT COLUMN_COMMENT AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'models' AND COLUMN_NAME = 'price_per_1k_input'`
    );
    if (priceCol && !String(priceCol.c).includes('积分/千token')) {
      await queryRunner.query(
        `UPDATE models SET price_per_1k_input = price_per_1k_input * 100,
                price_per_1k_output = price_per_1k_output * 100
         WHERE price_per_1k_input IS NOT NULL OR price_per_1k_output IS NOT NULL`
      );
      await queryRunner.query(
        `ALTER TABLE models MODIFY COLUMN price_per_1k_input DECIMAL(10,4) DEFAULT NULL COMMENT '输入单价(积分/千token)'`
      );
      await queryRunner.query(
        `ALTER TABLE models MODIFY COLUMN price_per_1k_output DECIMAL(10,4) DEFAULT NULL COMMENT '输出单价(积分/千token)'`
      );
      logger.log('Migrated models price unit to credits/1k (x100)');
    }

    // 10. 老模型按 provider 分组自动建内置供应商并关联
    const [orphanModels] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM models WHERE provider_id IS NULL AND provider IS NOT NULL`
    );
    if (Number(orphanModels?.c ?? 0) > 0) {
      const groups = await queryRunner.query(
        `SELECT provider,
                MIN(api_endpoint) AS endpoint,
                MIN(api_key) AS api_key
         FROM models
         WHERE provider_id IS NULL AND provider IS NOT NULL
         GROUP BY provider`
      );
      for (const g of groups) {
        await queryRunner.query(
          `INSERT INTO model_providers (name, slug, base_url, api_key, status, connection_status, is_builtin, model_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', 'untested', 1, 0, NOW(), NOW())
           ON DUPLICATE KEY UPDATE name = name`,
          [g.provider, g.provider, g.endpoint || 'https://api.openai.com/v1', g.api_key || null]
        );
        const [prov] = await queryRunner.query(
          `SELECT id FROM model_providers WHERE slug = ? AND is_builtin = 1 LIMIT 1`,
          [g.provider]
        );
        if (prov) {
          await queryRunner.query(
            `UPDATE models SET provider_id = ?,
                    upstream_model_id = COALESCE(upstream_model_id, model_id)
             WHERE provider = ? AND provider_id IS NULL`,
            [prov.id, g.provider]
          );
        }
      }
      // 凭据已归属供应商，清空模型表冗余凭据
      await queryRunner.query(
        `UPDATE models m JOIN model_providers p ON p.id = m.provider_id
         SET m.api_endpoint = NULL, m.api_key = NULL`
      );
      // 刷新 model_count
      await queryRunner.query(
        `UPDATE model_providers p
         SET model_count = (SELECT COUNT(*) FROM models m WHERE m.provider_id = p.id)
         WHERE p.is_builtin = 1`
      );
      logger.log('Migrated legacy models to model_providers');
    }


    // purchased_items 表（官方内容市场已购清单）
    const [purchasedTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchased_items'`
    );
    if (!purchasedTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS purchased_items (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          item_type VARCHAR(16) NOT NULL COMMENT 'skill|plugin|workflow|agent',
          item_id BIGINT UNSIGNED NOT NULL,
          version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
          price INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_purchased_user_item (user_id, item_type, item_id),
          KEY idx_purchased_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='官方内容已购清单'
      `);
      logger.log('Created table: purchased_items');
    }

    // models 表：文生图/文生视频生成字段（幂等）
    const genModelCols = [
      { name: 'price_per_image', def: "DECIMAL(10,4) DEFAULT NULL COMMENT '图片生成积分/张'", after: 'price_per_1k_output' },
      { name: 'video_prices', def: "JSON DEFAULT NULL COMMENT '视频生成价格矩阵'", after: 'price_per_image' },
      { name: 'generation_params', def: "JSON DEFAULT NULL COMMENT '生成参数选项'", after: 'video_prices' },
    ];
    for (const col of genModelCols) {
      const [exists] = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'models' AND COLUMN_NAME = ?`,
        [col.name]
      );
      if (!exists) {
        await queryRunner.query(
          'ALTER TABLE models ADD COLUMN ' + col.name + ' ' + col.def + ' AFTER ' + col.after
        );
        logger.log('Added column: models.' + col.name);
      }
    }

    // model_providers 表：全局中转标志（严格单全局，唯一索引；幂等）
    await ensureColumn('model_providers', 'is_global', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否全局中转(全站至多1条=1)'");
    // model_providers 表：API 风格/限流/余额监控列（实体新增，幂等）
    await ensureColumn('model_providers', 'api_style', "VARCHAR(32) NULL COMMENT 'API风格: openai_compatible/dashscope_native/anthropic/custom'");
    await ensureColumn('model_providers', 'rate_limit_per_minute', "INT NULL COMMENT '每分钟限流'");
    await ensureColumn('model_providers', 'concurrency_limit', "INT NULL COMMENT '并发上限'");
    await ensureColumn('model_providers', 'balance_url', "VARCHAR(512) NULL COMMENT '余额查询接口'");
    await ensureColumn('model_providers', 'balance_headers', "JSON NULL COMMENT '余额接口请求头'");
    await ensureColumn('model_providers', 'balance_extra', "JSON NULL COMMENT '余额接口附加参数'");
    await ensureColumn('model_providers', 'last_balance', "DECIMAL(12,2) NULL COMMENT '最近一次余额'");
    await ensureColumn('model_providers', 'balance_checked_at', "DATETIME NULL COMMENT '最近余额检查时间'");
    await ensureColumn('model_providers', 'balance_alert_threshold', "DECIMAL(12,2) NULL COMMENT '余额告警阈值'");
    const [globalIdx] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'model_providers' AND INDEX_NAME = 'uk_model_providers_global'`
    );
    if (Number(globalIdx?.c ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE model_providers ADD UNIQUE INDEX uk_model_providers_global ((IF(is_global = 1, is_global, NULL)))`
      );
      logger.log('Created index: model_providers.uk_model_providers_global');
    }

    // models 表：排序权重 + 按次计费（幂等）
    const relayModelCols: Array<[string, string]> = [
      ['sort_order', "INT NOT NULL DEFAULT 0 COMMENT '排序权重(越小越靠前)'"],
      ['price_per_call', "DECIMAL(10,4) DEFAULT NULL COMMENT '按次计费积分(tts等单次调用)'"],
    ];
    for (const [colName, colDef] of relayModelCols) {
      await ensureColumn('models', colName, colDef);
    }

    // media_jobs 表（文生图/文生视频任务）
    const [mediaJobsTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_jobs'`
    );
    if (!mediaJobsTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS media_jobs (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          session_id BIGINT UNSIGNED DEFAULT NULL,
          model_id VARCHAR(64) NOT NULL,
          type VARCHAR(64) NOT NULL COMMENT '任务类型(调用模式)',
          prompt MEDIUMTEXT NOT NULL,
          params JSON DEFAULT NULL,
          status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending|processing|done|failed',
          result_urls JSON DEFAULT NULL,
          credits_cost INT NOT NULL DEFAULT 0,
          frozen_txn_id BIGINT UNSIGNED DEFAULT NULL,
          error VARCHAR(512) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_media_jobs_user_id (user_id),
          KEY idx_media_jobs_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文生图/文生视频生成任务'
      `);
      logger.log('Created table: media_jobs');
    }
    // media_jobs 表：调用模式冗余列（实体新增，便于任务列表筛选，幂等）
    await ensureColumn('media_jobs', 'call_mode', "VARCHAR(32) NULL COMMENT '调用模式(冗余存储)'");
    // media_jobs 表：type 列加宽（实体已放宽为 VARCHAR(64)，幂等 MODIFY）
    await queryRunner.query("ALTER TABLE media_jobs MODIFY COLUMN type VARCHAR(64) COMMENT '任务类型(调用模式)'");
    // llm_files 表（专用文本模型两步式：用户上传文件 -> 上游 file_id 映射）
    const [llmFilesTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'llm_files'`
    );
    if (!llmFilesTable) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS llm_files (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          model_id VARCHAR(64) NOT NULL,
          upstream_file_id VARCHAR(128) NOT NULL,
          file_name VARCHAR(255) DEFAULT NULL,
          file_size INT DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_llm_files_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户上传到上游的文件映射(专用文本模型两步式)'
      `);
      logger.log('Created table: llm_files');
    }


    // users.default_chat_model 列（OpenClaw 本地直达对话：用户默认对话模型，llm-proxy 据此解析 openclaw 内部模型名）
    const [defaultModelCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'default_chat_model'`
    );
    if (!defaultModelCol) {
      await queryRunner.query(
        `ALTER TABLE users ADD COLUMN default_chat_model VARCHAR(64) DEFAULT NULL COMMENT '用户默认对话模型(OpenClaw llm-proxy 解析用)' AFTER notification_settings`
      );
      logger.log('Added column: users.default_chat_model');
    }

    // users 表：每类默认模型（多模态网关分类兜底，幂等）
    const userDefaultModelCols: Array<[string, string]> = [
      ['default_model_vision', "VARCHAR(64) DEFAULT NULL COMMENT '用户默认识图模型'"],
      ['default_model_image', "VARCHAR(64) DEFAULT NULL COMMENT '用户默认文生图模型(image/image_edit共用)'"],
      ['default_model_video', "VARCHAR(64) DEFAULT NULL COMMENT '用户默认视频生成模型'"],
      ['default_model_tts', "VARCHAR(64) DEFAULT NULL COMMENT '用户默认语音合成模型'"],
    ];
    for (const [colName, colDef] of userDefaultModelCols) {
      await ensureColumn('users', colName, colDef);
    }


    // models 表：输入类型/高级能力（「类型=输出类型、能力=输入类型」重构，幂等）
    await ensureColumn('models', 'input_types', "JSON DEFAULT NULL COMMENT '输入类型(多选): text/image/video/audio'");
    await ensureColumn('models', 'advanced_capabilities', "JSON DEFAULT NULL COMMENT '高级能力(多选): function_calling/streaming/reasoning/json_mode'");
    // 存量模型按 model_type 回填输入类型（只处理空值行，幂等）
    await queryRunner.query(
      `UPDATE models SET input_types = JSON_ARRAY('text') WHERE model_type IN ('chat','image','video','tts') AND (input_types IS NULL OR JSON_LENGTH(input_types) = 0)`
    );
    await queryRunner.query(
      `UPDATE models SET input_types = JSON_ARRAY('text','image') WHERE model_type IN ('vision','image_edit') AND (input_types IS NULL OR JSON_LENGTH(input_types) = 0)`
    );
    await queryRunner.query(
      `UPDATE models SET input_types = JSON_ARRAY('text') WHERE input_types IS NULL OR JSON_LENGTH(input_types) = 0`
    );
    await queryRunner.query(
      `UPDATE models SET advanced_capabilities = JSON_ARRAY('function_calling') WHERE supports_functions = 1 AND (advanced_capabilities IS NULL OR JSON_LENGTH(advanced_capabilities) = 0)`
    );
    await queryRunner.query(
      `UPDATE models SET advanced_capabilities = JSON_ARRAY() WHERE advanced_capabilities IS NULL`
    );

    // ===== 资产市场重构 Phase 1：六类资产公共字段补齐（幂等） =====
    // agents：允许挂载 MCP ID 数组 + GitHub topics 快照 + 统一定价
    const assetAgentCols: Array<[string, string]> = [
      ['allowed_mcp_ids', "JSON DEFAULT NULL COMMENT '允许挂载的 MCP 目录 ID 数组(mcp_catalog.id)'"],
      ['github_topics', "JSON DEFAULT NULL COMMENT 'GitHub 导入时仓库 topics 快照'"],
      ['pricing', "JSON DEFAULT NULL COMMENT '统一定价配置(可选,兼容现有 pricePerCall/pricePerToken)'"],
    ];
    for (const [colName, colDef] of assetAgentCols) {
      await ensureColumn('agents', colName, colDef);
    }

    // workflows：场景分类 + 来源类型 + GitHub topics + 统一定价
    const assetWorkflowCols: Array<[string, string]> = [
      ['scene_category', "VARCHAR(32) NOT NULL DEFAULT 'other' COMMENT '场景分类: hotspot_monitor/multi_platform_distribution/comment_dm_ops/commercial_data_review/other'"],
      ['source_type', "VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT '来源: github=导入 manual=手工'"],
      ['github_topics', "JSON DEFAULT NULL COMMENT 'GitHub 导入时仓库 topics 快照'"],
      ['pricing', "JSON DEFAULT NULL COMMENT '统一定价配置(可选)'"],
    ];
    for (const [colName, colDef] of assetWorkflowCols) {
      await ensureColumn('workflows', colName, colDef);
    }

    // mcp_catalog：GitHub 来源字段
    const assetMcpCols: Array<[string, string]> = [
      ['source_type', "VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT '来源: github=导入 manual=手工'"],
      ['source_repo', "VARCHAR(512) DEFAULT NULL COMMENT '来源仓库 URL'"],
      ['source_path', "VARCHAR(512) DEFAULT NULL COMMENT '仓库内文件路径'"],
      ['github_topics', "JSON DEFAULT NULL COMMENT 'GitHub 导入时仓库 topics 快照'"],
      ['pricing', "JSON DEFAULT NULL COMMENT '统一定价配置(可选)'"],
    ];
    for (const [colName, colDef] of assetMcpCols) {
      await ensureColumn('mcp_catalog', colName, colDef);
    }

    // skill_packages：GitHub 来源字段
    const assetSkillCols: Array<[string, string]> = [
      ['source_type', "VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT '来源: github=导入 manual=手工'"],
      ['source_repo', "VARCHAR(512) DEFAULT NULL COMMENT '来源仓库 URL'"],
      ['source_path', "VARCHAR(512) DEFAULT NULL COMMENT '仓库内文件路径'"],
      ['github_topics', "JSON DEFAULT NULL COMMENT 'GitHub 导入时仓库 topics 快照'"],
      ['pricing', "JSON DEFAULT NULL COMMENT '统一定价配置(可选)'"],
    ];
    for (const [colName, colDef] of assetSkillCols) {
      await ensureColumn('skill_packages', colName, colDef);
    }

    // hermes_skills（技能包）：挂载技能 ID + GitHub 来源字段
    const assetHermesCols: Array<[string, string]> = [
      ['skill_ids', "JSON DEFAULT NULL COMMENT '挂载的技能 ID 数组(skill_packages.id)'"],
      ['source_type', "VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT '来源: github=导入 manual=手工'"],
      ['source_repo', "VARCHAR(512) DEFAULT NULL COMMENT '来源仓库 URL'"],
      ['source_path', "VARCHAR(512) DEFAULT NULL COMMENT '仓库内文件路径'"],
      ['github_topics', "JSON DEFAULT NULL COMMENT 'GitHub 导入时仓库 topics 快照'"],
      ['pricing', "JSON DEFAULT NULL COMMENT '统一定价配置(可选)'"],
    ];
    for (const [colName, colDef] of assetHermesCols) {
      await ensureColumn('hermes_skills', colName, colDef);
    }

    // plugins（用户自定义插件）：分类 + GitHub 来源字段
    const assetPluginCols: Array<[string, string]> = [
      ['category', "VARCHAR(32) DEFAULT NULL COMMENT '分类: database/search/browser/git/files/messaging/ai/devops/other'"],
      ['source_type', "VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT '来源: github=导入 manual=手工'"],
      ['source_repo', "VARCHAR(512) DEFAULT NULL COMMENT '来源仓库 URL'"],
      ['source_path', "VARCHAR(512) DEFAULT NULL COMMENT '仓库内文件路径'"],
      ['github_topics', "JSON DEFAULT NULL COMMENT 'GitHub 导入时仓库 topics 快照'"],
      ['pricing', "JSON DEFAULT NULL COMMENT '统一定价配置(可选)'"],
    ];
    for (const [colName, colDef] of assetPluginCols) {
      await ensureColumn('plugins', colName, colDef);
    }

    // ===== 资产市场重构 Phase 2：GitHub 统一导入任务表（Task 2） =====
    const ensureAssetImportJobsTable = async (): Promise<void> => {
      const table = 'asset_import_jobs';
      // 全量 DDL 建表（幂等），再对存量旧表兜底补齐缺失列
      await queryRunner.query(`CREATE TABLE IF NOT EXISTS asset_import_jobs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        type VARCHAR(32) NOT NULL DEFAULT 'agent' COMMENT '资产类型: agent/workflow/mcp/skill/skill_pack/n8n_mcp',
        repo_url VARCHAR(512) NOT NULL COMMENT 'GitHub 仓库地址',
        branch VARCHAR(128) DEFAULT NULL COMMENT '导入分支(默认仓库默认分支)',
        status ENUM('pending','processing','succeeded','failed') NOT NULL DEFAULT 'pending' COMMENT '任务状态',
        steps JSON DEFAULT NULL COMMENT '步骤进度: fetch_repo/parse/classify/save',
        result JSON DEFAULT NULL COMMENT '导入结果(created/skipped)',
        error_message VARCHAR(1024) DEFAULT NULL COMMENT '失败原因',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_asset_import_jobs_type (type),
        KEY idx_asset_import_jobs_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资产市场-GitHub 统一导入任务表'`);
      logger.log('Ensured table: asset_import_jobs');
      await ensureColumn(table, 'type', "varchar(32) NOT NULL DEFAULT 'agent'");
      await ensureColumn(table, 'repo_url', 'varchar(512) NOT NULL');
      await ensureColumn(table, 'branch', 'varchar(128) NULL');
      await ensureColumn(table, 'status', "enum('pending','processing','succeeded','failed') NOT NULL DEFAULT 'pending'");
      await ensureColumn(table, 'steps', 'json NULL');
      await ensureColumn(table, 'result', 'json NULL');
      await ensureColumn(table, 'error_message', 'varchar(1024) NULL');
      await ensureColumn(table, 'params', 'json NULL');
    };
    await ensureAssetImportJobsTable();

    // models 表：按 model_type 回填 call_mode（只回填空值/默认值，保留管理员手工定制，幂等）
    await queryRunner.query(
      `UPDATE models SET call_mode = CASE model_type
        WHEN 'vision' THEN 'vision' WHEN 'image' THEN 'image'
        WHEN 'image_edit' THEN 'image_edit' WHEN 'video' THEN 'video'
        WHEN 'tts' THEN 'tts' WHEN 'embedding' THEN 'embedding' WHEN 'audio' THEN 'tts' ELSE 'text_chat' END
       WHERE model_type IS NOT NULL AND model_type <> 'chat'
         AND (call_mode IS NULL OR call_mode = 'text_chat')`
    );
    logger.log('Backfilled models.call_mode from model_type');

    // models 表：按 call_mode 回填 pricing_mode（只填空值，幂等；映射依据 constants/call-modes.ts recommendedBilling）
    await queryRunner.query(
      `UPDATE models SET pricing_mode = CASE call_mode
        WHEN 'text_chat' THEN 'token' WHEN 'vision' THEN 'token'
        WHEN 'image' THEN 'per_image' WHEN 'image_edit' THEN 'per_image' WHEN 'ocr' THEN 'per_image'
        WHEN 'video' THEN 'per_second' WHEN 'video_edit' THEN 'per_second'
        WHEN 'stt' THEN 'per_minute' WHEN 'voice_conversion' THEN 'per_minute' WHEN 'realtime' THEN 'per_minute'
        WHEN 'embedding' THEN 'per_call' WHEN 'rerank' THEN 'per_call' WHEN 'music' THEN 'per_call' WHEN 'tts' THEN 'per_call'
        ELSE 'token' END
       WHERE call_mode IS NOT NULL AND (pricing_mode IS NULL OR pricing_mode = '')`
    );
    logger.log('Backfilled models.pricing_mode from call_mode');

    // models 表：video_prices -> video_per_second 折算回填（仅补空且为视频模型；取各分辨率最短时长单价折算积分/秒，幂等）
    const videoRows = await queryRunner.query(
      `SELECT id, video_prices FROM models
       WHERE (model_type IN ('video','video_edit') OR call_mode IN ('video','video_edit'))
         AND video_prices IS NOT NULL AND video_per_second IS NULL`
    );
    for (const row of videoRows ?? []) {
      const raw = row?.video_prices;
      if (raw == null) continue;
      let prices: unknown = raw;
      if (typeof raw === 'string') {
        try {
          prices = JSON.parse(raw);
        } catch {
          continue;
        }
      }
      if (!prices || typeof prices !== 'object' || Array.isArray(prices)) continue;
      const perSecond: Record<string, number> = {};
      for (const [resolution, durationMap] of Object.entries(prices as Record<string, unknown>)) {
        if (!durationMap || typeof durationMap !== 'object' || Array.isArray(durationMap)) continue;
        const entries = Object.entries(durationMap as Record<string, number>).filter(
          ([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
        );
        if (!entries.length) continue;
        entries.sort((a, b) => Number(a[0]) - Number(b[0]));
        const [shortestDuration, unitPrice] = entries[0];
        const seconds = Number(shortestDuration);
        if (!(seconds > 0)) continue;
        const resKey = resolution.trim().toLowerCase();
        const normalized =
          resKey === '720p' ? '720P' : resKey === '1080p' ? '1080P' : resKey === '2k' ? '2K' : resKey === '4k' ? '4K' : resolution;
        perSecond[normalized] = Math.round((unitPrice / seconds) * 100) / 100;
      }
      if (Object.keys(perSecond).length === 0) continue;
      await queryRunner.query(`UPDATE models SET video_per_second = ? WHERE id = ?`, [
        JSON.stringify(perSecond),
        row.id,
      ]);
    }
    logger.log('Backfilled models.video_per_second from video_prices (shortest-duration rate)');

    // ===== 二期 Task 1：briefs / media_assets 建表 + 既有表加列（幂等 DDL） =====

    // briefs 表：需求单（云端；一期 local_briefs 为离线 MVP）
    const [briefsTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'briefs'`
    );
    if (!briefsTable) {
      await queryRunner.query(`CREATE TABLE IF NOT EXISTS briefs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        title VARCHAR(128) NOT NULL,
        goal TEXT,
        target_audience VARCHAR(255),
        platforms JSON,
        style VARCHAR(512),
        deadline DATETIME,
        status ENUM('draft','confirmed','executing','completed','cancelled') NOT NULL DEFAULT 'draft',
        dispatch_status ENUM('none','pending','done','failed') NOT NULL DEFAULT 'none',
        dispatch_result JSON,
        source_chat_session_id BIGINT,
        source_chat_summary TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_briefs_user_created (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='需求单（云端；一期 local_briefs 为离线 MVP）'`);
      logger.log('Created table: briefs');
    }
    // briefs 补充列：拆解失败原因码 + 派发参数（重拆解用），幂等
    await ensureColumn('briefs', 'dispatch_error', "VARCHAR(512) DEFAULT NULL COMMENT 'AI拆解失败原因码'");
    await ensureColumn('briefs', 'dispatch_params', "JSON DEFAULT NULL COMMENT '派发参数(executeMode/teamId/agentId)'");

    // media_assets 表：素材资产库（种子：task_output_item / media_jobs）
    const [mediaAssetsTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_assets'`
    );
    if (!mediaAssetsTable) {
      await queryRunner.query(`CREATE TABLE IF NOT EXISTS media_assets (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        source_type ENUM('task','media_job','manual') NOT NULL DEFAULT 'manual',
        source_id BIGINT,
        title VARCHAR(255) NOT NULL,
        asset_type ENUM('image','video','audio','file') NOT NULL DEFAULT 'file',
        url VARCHAR(1024) NOT NULL,
        mime_type VARCHAR(128),
        file_size BIGINT,
        tags JSON,
        archived TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_media_assets_user (user_id),
        KEY idx_media_assets_source (source_type, source_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='素材资产库（种子：task_output_item / media_jobs）'`);
      logger.log('Created table: media_assets');
    }

    // 口播工坊：voice_assets 表（我的声音资产，对标参考软件声音克隆/训练/预览）
    const [voiceAssetsTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'voice_assets'`
    );
    if (!voiceAssetsTable) {
      await queryRunner.query(`CREATE TABLE IF NOT EXISTS voice_assets (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        name VARCHAR(128) NOT NULL,
        ref_audio_url VARCHAR(512) NOT NULL,
        speaker_id VARCHAR(128),
        status VARCHAR(16) NOT NULL DEFAULT 'ready',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_va_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='口播工坊-我的声音资产'`);
      logger.log('Created table: voice_assets');
    }

    // 口播工坊：digital_human_assets 表（我的数字人形象，对标参考软件形象库/授权状态）
    const [dhAssetsTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'digital_human_assets'`
    );
    if (!dhAssetsTable) {
      await queryRunner.query(`CREATE TABLE IF NOT EXISTS digital_human_assets (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        name VARCHAR(128) NOT NULL,
        cloud_id VARCHAR(128) NOT NULL,
        preview_url VARCHAR(512),
        authorized TINYINT(1) NOT NULL DEFAULT 1,
        status VARCHAR(16) NOT NULL DEFAULT 'ready',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_dha_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='口播工坊-我的数字人形象'`);
      logger.log('Created table: digital_human_assets');
    }

    // 既有表加列（幂等）：team_tasks 关联 briefs 需求单
    const [teamTasksBriefIdCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'team_tasks' AND COLUMN_NAME = 'brief_id'`
    );
    if (!teamTasksBriefIdCol) {
      await queryRunner.query(`ALTER TABLE team_tasks ADD COLUMN brief_id BIGINT NULL`);
      logger.log('Added column: team_tasks.brief_id');
    }

    const [teamTasksExecutionRefCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'team_tasks' AND COLUMN_NAME = 'execution_ref'`
    );
    if (!teamTasksExecutionRefCol) {
      await queryRunner.query(`ALTER TABLE team_tasks ADD COLUMN execution_ref VARCHAR(128) NULL`);
      logger.log('Added column: team_tasks.execution_ref');
    }

    // 既有表加列（幂等）：publish_plans 关联任务与素材资产
    const [publishPlansTaskIdCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'publish_plans' AND COLUMN_NAME = 'task_id'`
    );
    if (!publishPlansTaskIdCol) {
      await queryRunner.query(`ALTER TABLE publish_plans ADD COLUMN task_id BIGINT NULL`);
      logger.log('Added column: publish_plans.task_id');
    }

    const [publishPlansAssetIdsCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'publish_plans' AND COLUMN_NAME = 'asset_ids'`
    );
    if (!publishPlansAssetIdsCol) {
      await queryRunner.query(`ALTER TABLE publish_plans ADD COLUMN asset_ids JSON NULL`);
      logger.log('Added column: publish_plans.asset_ids');
    }

    // hermes_call_logs：instance_id 允许为空（本地编排上报无实例）+ call_type 增加 orchestrate
    const [hclInstanceCol] = await queryRunner.query(
      `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hermes_call_logs' AND COLUMN_NAME = 'instance_id'`
    );
    if (hclInstanceCol && hclInstanceCol.IS_NULLABLE === 'NO') {
      await queryRunner.query(`ALTER TABLE hermes_call_logs MODIFY COLUMN instance_id BIGINT NULL`);
      logger.log('Modified column: hermes_call_logs.instance_id nullable');
    }
    const [hclCallTypeCol] = await queryRunner.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hermes_call_logs' AND COLUMN_NAME = 'call_type'`
    );
    if (
      hclCallTypeCol &&
      hclCallTypeCol.COLUMN_TYPE &&
      !String(hclCallTypeCol.COLUMN_TYPE).includes('orchestrate')
    ) {
      await queryRunner.query(
        `ALTER TABLE hermes_call_logs MODIFY COLUMN call_type ENUM('skill_execute','tool_call','agent_invoke','workflow_run','orchestrate') NOT NULL`
      );
      logger.log('Modified column: hermes_call_logs.call_type + orchestrate');
    }

    // 对话沉淀记录表（M1：沉淀识别 -> 知识库/记忆 的审计与撤回）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS sedimentation_feed (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL COMMENT '用户 ID',
      session_id BIGINT NULL COMMENT '来源会话 ID',
      type VARCHAR(32) NOT NULL COMMENT 'enterprise_doc|customer_profile|data_update',
      target VARCHAR(32) NOT NULL COMMENT 'knowledge_base|hermes_memory',
      title VARCHAR(255) NOT NULL COMMENT '条目标题',
      content TEXT NOT NULL COMMENT '沉淀内容',
      kb_id BIGINT NULL COMMENT '知识库 ID',
      doc_id BIGINT NULL COMMENT '知识库文档 ID',
      status VARCHAR(16) NOT NULL DEFAULT 'applied' COMMENT 'applied|undone',
      undo_token VARCHAR(64) NULL COMMENT '撤回令牌',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      PRIMARY KEY (id),
      INDEX idx_sedimentation_user (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对话沉淀记录'`);
    logger.log('Ensured table: sedimentation_feed');

    // 定时任务表（对话创建 -> 桌面端软件开着时调度 -> Hermes 编排执行）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL COMMENT '用户 ID',
      title VARCHAR(255) NOT NULL COMMENT '任务标题',
      description TEXT NULL COMMENT '任务内容（触发时交给 Hermes 执行）',
      team_id BIGINT NULL COMMENT '执行团队 ID（NULL=自动选第一个团队）',
      repeat_type VARCHAR(16) NOT NULL DEFAULT 'once' COMMENT 'once|daily|weekly',
      run_time VARCHAR(8) NULL COMMENT '触发时间 HH:mm',
      weekday TINYINT NULL COMMENT '每周星期 1-7（1=周一）',
      due_at DATETIME NULL COMMENT '一次性执行时间',
      next_run_at DATETIME NULL COMMENT '下次触发时间',
      status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active|paused|done|failed',
      firing_token VARCHAR(64) NULL COMMENT '触发占位令牌',
      firing_expire_at DATETIME NULL COMMENT '触发占位过期时间',
      last_run_at DATETIME NULL COMMENT '上次触发时间',
      last_error TEXT NULL COMMENT '上次执行错误',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      PRIMARY KEY (id),
      INDEX idx_scheduled_tasks_user (user_id),
      INDEX idx_scheduled_tasks_next (next_run_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定时任务'`);
    logger.log('Ensured table: scheduled_tasks');

    // team_tasks：支持无团队执行（execute_mode=auto/agent 时 team_id 为空）
    const [ttTeamIdCol] = await queryRunner.query(
      `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'team_tasks' AND COLUMN_NAME = 'team_id'`
    );
    if (ttTeamIdCol && String(ttTeamIdCol.IS_NULLABLE).toUpperCase() === 'NO') {
      await queryRunner.query(`ALTER TABLE team_tasks MODIFY COLUMN team_id BIGINT NULL`);
      logger.log('Modified column: team_tasks.team_id nullable');
    }
    const [ttModeCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'team_tasks' AND COLUMN_NAME = 'execute_mode'`
    );
    if (!ttModeCol) {
      await queryRunner.query(
        `ALTER TABLE team_tasks ADD COLUMN execute_mode ENUM('team','auto','agent') NOT NULL DEFAULT 'team' COMMENT '执行方式'`
      );
      logger.log('Added column: team_tasks.execute_mode');
    }
    const [ttAgentCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'team_tasks' AND COLUMN_NAME = 'agent_id'`
    );
    if (!ttAgentCol) {
      await queryRunner.query(
        `ALTER TABLE team_tasks ADD COLUMN agent_id BIGINT NULL COMMENT '指定Agent执行'`
      );
      logger.log('Added column: team_tasks.agent_id');
    }
    // 口播工坊：oral_workshop_jobs.bilingual（双语字幕开关）
    const [owBilingualCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'oral_workshop_jobs' AND COLUMN_NAME = 'bilingual'`
    );
    if (!owBilingualCol) {
      await queryRunner.query(
        `ALTER TABLE oral_workshop_jobs ADD COLUMN bilingual TINYINT(1) NOT NULL DEFAULT 0 COMMENT '双语字幕开关'`
      );
      logger.log('Added column: oral_workshop_jobs.bilingual');
    }

    // 口播工坊：oral_workshop_jobs.target_lang（字幕目标语言）
    const [owTargetLangCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'oral_workshop_jobs' AND COLUMN_NAME = 'target_lang'`
    );
    if (!owTargetLangCol) {
      await queryRunner.query(
        `ALTER TABLE oral_workshop_jobs ADD COLUMN target_lang VARCHAR(16) NULL COMMENT '字幕目标语言(空=中文;en/zh-HK=双语)'`
      );
      logger.log('Added column: oral_workshop_jobs.target_lang');
    }

    // 口播工坊：oral_workshop_jobs 执行模式（execution_mode / waiting_step）
    const [owExecModeCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'oral_workshop_jobs' AND COLUMN_NAME = 'execution_mode'`
    );
    if (!owExecModeCol) {
      await queryRunner.query(
        `ALTER TABLE oral_workshop_jobs ADD COLUMN execution_mode VARCHAR(16) NOT NULL DEFAULT 'auto' COMMENT '执行模式:auto自动/manual手动/single单步'`
      );
      logger.log('Added column: oral_workshop_jobs.execution_mode');
    }
    const [owWaitingStepCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'oral_workshop_jobs' AND COLUMN_NAME = 'waiting_step'`
    );
    if (!owWaitingStepCol) {
      await queryRunner.query(
        `ALTER TABLE oral_workshop_jobs ADD COLUMN waiting_step VARCHAR(32) NULL COMMENT '手动模式等待用户放行的步骤'`
      );
      logger.log('Added column: oral_workshop_jobs.waiting_step');
    }

    // 口播工坊：oral_workshop_jobs 封面设计（主/副标题 + 设计配置）
    const owCoverCols = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'oral_workshop_jobs' AND COLUMN_NAME IN ('cover_h1','cover_h2','cover_config')`
    );
    const haveCoverCol = (name: string) => owCoverCols.some((c: { COLUMN_NAME: string }) => c.COLUMN_NAME === name);
    if (!haveCoverCol('cover_h1')) {
      await queryRunner.query(`ALTER TABLE oral_workshop_jobs ADD COLUMN cover_h1 VARCHAR(64) NULL COMMENT '封面主标题'`);
      logger.log('Added column: oral_workshop_jobs.cover_h1');
    }
    if (!haveCoverCol('cover_h2')) {
      await queryRunner.query(`ALTER TABLE oral_workshop_jobs ADD COLUMN cover_h2 VARCHAR(64) NULL COMMENT '封面副标题'`);
      logger.log('Added column: oral_workshop_jobs.cover_h2');
    }
    if (!haveCoverCol('cover_config')) {
      await queryRunner.query(`ALTER TABLE oral_workshop_jobs ADD COLUMN cover_config TEXT NULL COMMENT '封面设计配置JSON'`);
      logger.log('Added column: oral_workshop_jobs.cover_config');
    }

    // 素材中心：media_assets.description（语义检索文本）
    const [maDescCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_assets' AND COLUMN_NAME = 'description'`
    );
    if (!maDescCol) {
      await queryRunner.query(
        `ALTER TABLE media_assets ADD COLUMN description TEXT NULL COMMENT '素材描述（向量化检索文本）'`
      );
      logger.log('Added column: media_assets.description');
    }

    // 素材中心：media_assets.vector_status（向量化状态 none|pending|ready|failed）
    const [maVecCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_assets' AND COLUMN_NAME = 'vector_status'`
    );
    if (!maVecCol) {
      await queryRunner.query(
        `ALTER TABLE media_assets ADD COLUMN vector_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '向量化状态 none|pending|ready|failed'`
      );
      logger.log('Added column: media_assets.vector_status');
    }

    // 素材中心：media_assets.meta（时长/分辨率/封面等扩展元数据）
    const [maMetaCol] = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_assets' AND COLUMN_NAME = 'meta'`
    );
    if (!maMetaCol) {
      await queryRunner.query(
        `ALTER TABLE media_assets ADD COLUMN meta JSON NULL COMMENT '素材扩展元数据（时长/分辨率/封面）'`
      );
      logger.log('Added column: media_assets.meta');
    }

    // 顺序执行 migrations/*.sql（幂等台账 schema_migrations；存量库自动标记已应用）
    await runSqlMigrations(queryRunner, logger);

    logger.log('Startup migrations completed');
  } catch (err) {
    logger.error(`Startup migration failed: ${(err as Error).message}`);
    // 不抛出错误，允许后端继续启动
  } finally {
    await queryRunner.release();
  }
}

/** 按文件名顺序执行 migrations/*.sql（幂等台账 schema_migrations；存量库自动标记已应用，新库自动建表） */
export async function runSqlMigrations(queryRunner: QueryRunner, logger: Logger): Promise<void> {
  const migrationsDir = path.join(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) return;
  await queryRunner.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/i.test(f))
    .sort();
  const rows = (await queryRunner.query('SELECT name FROM schema_migrations')) as Array<{ name: string }>;
  const applied = new Set((rows || []).map((r) => r.name));
  if (applied.size === 0) {
    const [userTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`,
    );
    if (userTable) {
      for (const f of files) {
        await queryRunner.query('INSERT IGNORE INTO schema_migrations (name) VALUES (?)', [f]);
      }
      logger.log(`Legacy database detected: marked ${files.length} existing SQL migrations as applied`);
      return;
    }
  }
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    try {
      for (const stmt of splitSqlStatements(sql)) {
        if (stmt.trim()) await queryRunner.query(stmt);
      }
      await queryRunner.query('INSERT IGNORE INTO schema_migrations (name) VALUES (?)', [f]);
      logger.log(`SQL migration applied: ${f}`);
    } catch (err) {
      logger.warn(`SQL migration ${f} skipped (already applied or error): ${(err as Error).message}`);
      break;
    }
  }
}

/** 简易 SQL 语句拆分：去掉整行注释，按行尾分号切分 */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
