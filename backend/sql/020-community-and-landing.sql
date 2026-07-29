-- ============================================================
-- 020-community-and-landing.sql
-- 社区系统 + Landing页内容管理
-- ============================================================

-- ============================================================
-- 1. Landing页内容块表
-- ============================================================
CREATE TABLE IF NOT EXISTS landing_blocks (
  id VARCHAR(32) PRIMARY KEY COMMENT '内容块标识',
  name VARCHAR(64) NOT NULL COMMENT '显示名称',
  type ENUM('hero', 'stats', 'cards', 'steps', 'list', 'markdown') NOT NULL COMMENT '块类型',
  sort_order INT DEFAULT 0 COMMENT '排序',
  is_enabled BOOLEAN DEFAULT TRUE COMMENT '是否显示',
  data JSON NOT NULL COMMENT '内容数据',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 初始数据（从 data.tsx 迁移）
INSERT INTO landing_blocks (id, name, type, sort_order, is_enabled, data) VALUES
('hero', '首页主视觉', 'hero', 1, TRUE, JSON_OBJECT(
  'title', '打造AI自动化公司',
  'subtitle', '8大AI员工 24h 自主工作',
  'description', '基于OpenClaw运行时与Hermes编排中枢，1人即可启动并管理一支AI团队，实现全链路自动化运营。',
  'cta_primary', JSON_OBJECT('text', '立即体验', 'link', '/register'),
  'cta_secondary', JSON_OBJECT('text', '了解更多', 'link', '#features')
)),
('stats', '数据统计', 'stats', 2, TRUE, JSON_OBJECT(
  'items', JSON_ARRAY(
    JSON_OBJECT('value', '8', 'label', '核心员工'),
    JSON_OBJECT('value', '24/7', 'label', '全自动运行'),
    JSON_OBJECT('value', '1', 'label', '人即可启动')
  )
)),
('foundation', '技术基座', 'cards', 3, TRUE, JSON_OBJECT(
  'title', '四大技术基座',
  'subtitle', '企业级AI基础设施',
  'cards', JSON_ARRAY(
    JSON_OBJECT('icon', 'openclaw', 'title', 'OpenClaw', 'desc', 'AI运行时与任务调度'),
    JSON_OBJECT('icon', 'hermes', 'title', 'Hermes', 'desc', '智能编排中枢'),
    JSON_OBJECT('icon', 'n8n', 'title', 'N8N', 'desc', '工作流引擎'),
    JSON_OBJECT('icon', 'mcp', 'title', 'MCP', 'desc', '模型上下文协议')
  )
)),
('process', '工作流程', 'steps', 4, TRUE, JSON_OBJECT(
  'title', 'AI团队工作流程',
  'subtitle', '从指令到执行，全链路自动化',
  'steps', JSON_ARRAY(
    JSON_OBJECT('title', '任务下发', 'desc', '自然语言下达任务'),
    JSON_OBJECT('title', '智能分配', 'desc', 'Hermes中枢自动编排'),
    JSON_OBJECT('title', '协同执行', 'desc', 'AI员工各司其职'),
    JSON_OBJECT('title', '结果交付', 'desc', '自动质检与反馈')
  )
)),
('flywheel', '业务飞轮', 'cards', 5, TRUE, JSON_OBJECT(
  'title', '业务增长飞轮',
  'subtitle', '越用越聪明的AI系统',
  'cards', JSON_ARRAY(
    JSON_OBJECT('icon', 'rocket', 'title', '启动', 'desc', '1人配置，5分钟上线'),
    JSON_OBJECT('icon', 'sync', 'title', '运转', 'desc', 'AI员工24h自主工作'),
    JSON_OBJECT('icon', 'chart', 'title', '进化', 'desc', '持续学习优化流程')
  )
)),
('industry', '适用行业', 'cards', 6, TRUE, JSON_OBJECT(
  'title', '适用行业',
  'subtitle', '一套系统，全行业覆盖',
  'cards', JSON_ARRAY(
    JSON_OBJECT('icon', 'shopping', 'title', '电商运营', 'desc', '客服、选品、文案'),
    JSON_OBJECT('icon', 'edit', 'title', '内容创作', 'desc', '写作、编辑、发布'),
    JSON_OBJECT('icon', 'headset', 'title', '客户服务', 'desc', '接待、工单、回访'),
    JSON_OBJECT('icon', 'chart', 'title', '数据分析', 'desc', '采集、清洗、洞察')
  )
));

-- ============================================================
-- 2. 社区频道表
-- ============================================================
CREATE TABLE IF NOT EXISTS channels (
  id VARCHAR(32) PRIMARY KEY COMMENT '频道标识',
  name VARCHAR(64) NOT NULL COMMENT '频道名称',
  slug VARCHAR(64) UNIQUE NOT NULL COMMENT 'URL标识',
  description TEXT COMMENT '频道描述',
  icon VARCHAR(64) COMMENT '图标名称',
  color VARCHAR(7) DEFAULT '#4F6EF7' COMMENT '主题色',
  sort_order INT DEFAULT 0,
  is_enabled BOOLEAN DEFAULT TRUE,
  post_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO channels (id, name, slug, description, icon, sort_order) VALUES
('discussion', '综合讨论', 'discussion', 'AI相关话题自由讨论', 'chat', 1),
('question', '问答求助', 'question', '技术问答与悬赏求助', 'question', 2),
('showcase', '作品展示', 'showcase', '分享你的AI应用作品', 'showcase', 3),
('ai-office', 'AI员工秀', 'ai-office', '展示AI办公室配置与效果', 'robot', 4),
('announcement', '官方动态', 'announcement', '官方公告与版本动态', 'bell', 5);

-- ============================================================
-- 3. 帖子表
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  channel_id VARCHAR(32) NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  
  type ENUM('discussion', 'question', 'showcase', 'announcement') DEFAULT 'discussion',
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL COMMENT 'Markdown格式',
  content_html TEXT COMMENT '渲染后HTML缓存',
  
  is_resolved BOOLEAN DEFAULT FALSE,
  best_reply_id BIGINT UNSIGNED,
  bounty INT DEFAULT 0 COMMENT '悬赏积分',
  
  cover_image VARCHAR(500),
  demo_url VARCHAR(500),
  agent_id VARCHAR(64),
  
  view_count INT DEFAULT 0,
  vote_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  bookmark_count INT DEFAULT 0,
  
  status ENUM('pending', 'approved', 'rejected', 'deleted') DEFAULT 'approved',
  is_pinned BOOLEAN DEFAULT FALSE,
  is_essence BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_channel_created (channel_id, created_at DESC),
  INDEX idx_author (author_id),
  INDEX idx_status (status),
  INDEX idx_hot (vote_count DESC, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 4. 回复表
-- ============================================================
CREATE TABLE IF NOT EXISTS replies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED COMMENT '楼中楼父回复ID',
  
  content TEXT NOT NULL,
  content_html TEXT,
  
  vote_count INT DEFAULT 0,
  is_accepted BOOLEAN DEFAULT FALSE COMMENT '被采纳为最佳答案',
  
  status ENUM('active', 'deleted') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_post (post_id, created_at),
  INDEX idx_author (author_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 5. 投票表
-- ============================================================
CREATE TABLE IF NOT EXISTS votes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  target_type ENUM('post', 'reply') NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  value TINYINT NOT NULL COMMENT '1=赞, -1=踩',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_user_target (user_id, target_type, target_id),
  INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 6. 收藏表
-- ============================================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  post_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_user_post (user_id, post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 7. 标签表
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) UNIQUE NOT NULL,
  description VARCHAR(200),
  color VARCHAR(7) DEFAULT '#4F6EF7',
  post_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 8. 帖子-标签关联
-- ============================================================
CREATE TABLE IF NOT EXISTS post_tags (
  post_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 9. 用户社区档案表
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  reputation INT DEFAULT 0,
  level INT DEFAULT 1,
  coins INT DEFAULT 0,
  
  post_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  accepted_count INT DEFAULT 0,
  
  bio VARCHAR(500),
  website VARCHAR(200),
  github VARCHAR(64),
  location VARCHAR(64),
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 10. 积分流水表
-- ============================================================
CREATE TABLE IF NOT EXISTS coin_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('post', 'reply', 'accepted', 'daily', 'bounty', 'other') NOT NULL,
  amount INT NOT NULL COMMENT '正=收入, 负=支出',
  description VARCHAR(200),
  related_id BIGINT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
