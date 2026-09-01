-- Migration: 010_create_team_tables
-- 创建团队模块表
-- 设计文档: team_module_design_20260730.md

-- 1. 团队表
CREATE TABLE IF NOT EXISTS task_teams (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队表';

-- 2. 团队成员表
CREATE TABLE IF NOT EXISTS task_team_members (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队成员表';

-- 3. 团队任务表
CREATE TABLE IF NOT EXISTS task_team_tasks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队任务表';
