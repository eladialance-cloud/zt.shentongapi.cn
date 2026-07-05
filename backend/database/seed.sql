-- =============================================================================
-- 深瞳 AI 智能中台 - 种子数据脚本
-- 数据库：ai_agent
-- MySQL 版本：8.0+
-- 文档依据：《开发文档-数据库设计.md》v1.0
-- 说明：本脚本需在 init.sql 执行成功后运行
-- =============================================================================

USE `ai_agent`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- 一、清空已有数据 (按外键依赖逆序删除)
-- =============================================================================
DELETE FROM `withdrawal_records`;
DELETE FROM `revenue_records`;
DELETE FROM `membership_plans`;
DELETE FROM `agent_ratings`;
DELETE FROM `agent_favorites`;
DELETE FROM `opc_agent_repo`;
DELETE FROM `opc_team_members`;
DELETE FROM `opc_tasks`;
DELETE FROM `opc_teams`;
DELETE FROM `plugins`;
DELETE FROM `models`;
DELETE FROM `files`;
DELETE FROM `recharge_orders`;
DELETE FROM `payment_records`;
DELETE FROM `knowledge_base_chunks`;
DELETE FROM `knowledge_base_documents`;
DELETE FROM `knowledge_bases`;
DELETE FROM `chat_groups`;
DELETE FROM `chat_messages`;
DELETE FROM `chat_sessions`;
DELETE FROM `agent_reviews`;
DELETE FROM `agent_call_logs`;
DELETE FROM `agent_versions`;
DELETE FROM `agents`;
DELETE FROM `team_members`;
DELETE FROM `teams`;
DELETE FROM `user_roles`;
DELETE FROM `roles`;
DELETE FROM `users`;

-- 重置自增 ID
ALTER TABLE `users` AUTO_INCREMENT = 1;
ALTER TABLE `roles` AUTO_INCREMENT = 1;
ALTER TABLE `models` AUTO_INCREMENT = 1;
ALTER TABLE `plugins` AUTO_INCREMENT = 1;
ALTER TABLE `membership_plans` AUTO_INCREMENT = 1;

-- =============================================================================
-- 二、插入角色数据 (3 条)
-- =============================================================================
-- permissions 字段为 JSON 数组，列出该角色的权限标识
INSERT INTO `roles` (`name`, `description`, `permissions`) VALUES
(
  'super_admin',
  '超级管理员 - 拥有系统所有权限',
  JSON_ARRAY(
    'agent:manage', 'agent:review', 'agent:publish',
    'user:manage', 'user:ban', 'user:unban',
    'model:manage', 'plugin:manage',
    'payment:view', 'revenue:view',
    'system:config', 'system:log',
    'team:manage', 'knowledge:manage'
  )
),
(
  'admin',
  '管理员 - 拥有运营管理权限',
  JSON_ARRAY(
    'agent:review', 'agent:publish',
    'user:view',
    'model:view', 'plugin:view',
    'payment:view',
    'system:log'
  )
),
(
  'user',
  '普通用户 - 拥有基础使用权限',
  JSON_ARRAY(
    'agent:use', 'agent:create', 'agent:edit_own',
    'chat:use', 'knowledge:use', 'knowledge:create',
    'profile:edit', 'file:upload',
    'team:create'
  )
);

-- =============================================================================
-- 三、插入测试用户数据 (2 条)
-- =============================================================================
-- 密码哈希占位说明：
--   以下 password 字段为 bcrypt 格式占位哈希 (cost=10)
--   实际部署时请使用后端 bcrypt 库重新生成真实哈希后替换
--   生成方式 (Node.js): await bcrypt.hash('admin123', 10)
--   - admin/admin123 -> 占位哈希 (60 字符, bcrypt 格式)
--   - test/test123   -> 占位哈希 (60 字符, bcrypt 格式)
INSERT INTO `users`
  (`username`, `email`, `password`, `phone`, `avatar`, `status`, `real_name_verified`, `level`, `register_source`, `invite_code`)
VALUES
(
  'admin',
  'admin@example.com',
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  '13800000001',
  'https://cdn.example.com/avatars/admin.png',
  'active',
  TRUE,
  2,
  'direct',
  'ADMIN_INVITE_001'
),
(
  'test',
  'test@example.com',
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWz',
  '13800000002',
  'https://cdn.example.com/avatars/test.png',
  'active',
  FALSE,
  0,
  'direct',
  'TEST_INVITE_001'
);

-- =============================================================================
-- 四、插入用户角色关联 (3 条)
-- =============================================================================
-- admin 用户 (id=1) 同时拥有 super_admin 和 admin 角色
-- test  用户 (id=2) 拥有 user 角色
INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES
(1, 1), -- admin  -> super_admin
(1, 2), -- admin  -> admin
(2, 3); -- test   -> user

-- =============================================================================
-- 五、插入模型配置数据 (4 条)
-- =============================================================================
-- price_per_1k_input / price_per_1k_output 单位：元/千 token (参考公开定价)
INSERT INTO `models`
  (`provider`, `model_id`, `name`, `description`, `context_window`, `max_tokens`,
   `supports_vision`, `supports_functions`, `price_per_1k_input`, `price_per_1k_output`, `is_active`)
VALUES
(
  'openai',
  'gpt-4o',
  'GPT-4o',
  'OpenAI 旗舰多模态模型，支持文本/图像输入，适用于复杂推理、代码生成与多语言场景',
  128000,
  16384,
  TRUE,
  TRUE,
  0.0170,
  0.0680
),
(
  'openai',
  'gpt-4o-mini',
  'GPT-4o mini',
  'OpenAI 高性价比轻量模型，适用于对话、文本摘要、简单代码任务等高并发场景',
  128000,
  16384,
  TRUE,
  TRUE,
  0.0002,
  0.0006
),
(
  'anthropic',
  'claude-3-opus',
  'Claude 3 Opus',
  'Anthropic 旗舰模型，擅长长文档理解、复杂分析与创作任务',
  200000,
  4096,
  TRUE,
  TRUE,
  0.0150,
  0.0750
),
(
  'anthropic',
  'claude-3-sonnet',
  'Claude 3 Sonnet',
  'Anthropic 平衡型模型，速度与质量兼顾，适用于企业级生产场景',
  200000,
  4096,
  TRUE,
  TRUE,
  0.0030,
  0.0150
);

-- =============================================================================
-- 六、插入插件数据 (4 条)
-- =============================================================================
INSERT INTO `plugins`
  (`name`, `description`, `version`, `mcp_server_url`, `config`, `is_official`, `is_active`)
VALUES
(
  'web_search',
  '网络搜索插件 - 通过 MCP 协议提供实时网络信息检索能力',
  '1.0.0',
  'http://mcp-server:3100/web-search',
  JSON_OBJECT('max_results', 10, 'timeout_ms', 5000, 'safe_search', TRUE),
  TRUE,
  TRUE
),
(
  'code_execution',
  '代码执行插件 - 在沙箱中执行 Python/JavaScript 代码并返回结果',
  '1.2.0',
  'http://mcp-server:3101/code-exec',
  JSON_OBJECT('languages', JSON_ARRAY('python', 'javascript'), 'memory_limit_mb', 512, 'timeout_ms', 10000),
  TRUE,
  TRUE
),
(
  'image_generation',
  '图像生成插件 - 基于 DALL-E / Stable Diffusion 生成图像',
  '2.0.1',
  'http://mcp-server:3102/image-gen',
  JSON_OBJECT('default_size', '1024x1024', 'supported_styles', JSON_ARRAY('natural', 'vivid', 'anime')),
  TRUE,
  TRUE
),
(
  'file_parser',
  '文件解析插件 - 解析 PDF / Word / Excel / Markdown 等文档为纯文本',
  '1.1.3',
  'http://mcp-server:3103/file-parser',
  JSON_OBJECT('supported_formats', JSON_ARRAY('pdf', 'docx', 'xlsx', 'md', 'txt'), 'max_size_mb', 50),
  TRUE,
  TRUE
);

-- =============================================================================
-- 七、插入会员套餐数据 (3 条)
-- =============================================================================
-- level 字段对齐 users.level: 0=免费 / 1=专业 / 2=企业
-- benefits 字段为 JSON 数组，对齐前端 Membership.tsx 中的套餐权益
INSERT INTO `membership_plans`
  (`name`, `price`, `level`, `period`, `benefits`, `is_active`)
VALUES
(
  '免费版',
  0.00,
  0,
  'forever',
  JSON_ARRAY(
    '每日 100 次 AI 对话',
    '单文件最大 10MB',
    '基础模型支持',
    '社区支持'
  ),
  TRUE
),
(
  '专业版',
  99.00,
  1,
  'month',
  JSON_ARRAY(
    '无限 AI 对话',
    '单文件最大 100MB',
    '高级模型支持 (GPT-4)',
    '知识库容量 10GB',
    '优先客服支持'
  ),
  TRUE
),
(
  '企业版',
  999.00,
  2,
  'month',
  JSON_ARRAY(
    '无限 AI 对话 + 专属模型',
    '单文件最大 1GB',
    '团队协作 (最多 50 人)',
    '知识库容量 1TB',
    '专属客户经理',
    'SLA 99.9% 可用性保障'
  ),
  TRUE
);

-- =============================================================================
-- 八、验证数据 (可选查询)
-- =============================================================================
-- SELECT id, name FROM roles;
-- SELECT id, username, email, level FROM users;
-- SELECT ur.user_id, u.username, r.name AS role FROM user_roles ur
--   JOIN users u ON ur.user_id = u.id
--   JOIN roles r ON ur.role_id = r.id;
-- SELECT id, provider, model_id, name FROM models;
-- SELECT id, name, version, is_active FROM plugins;
-- SELECT id, name, price, level FROM membership_plans;

-- =============================================================================
-- 结束
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 1;
