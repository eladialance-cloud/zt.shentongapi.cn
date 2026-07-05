-- =====================================================================
-- 管理端种子数据：超级管理员 + 超级管理员角色 + 关联
-- 数据合同真源：Task 17 - 管理端认证与权限
--
-- 默认管理员账号：
--   用户名: admin
--   密码:   Admin@123456   (bcrypt cost=10，下方哈希已校验匹配)
--
-- 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现幂等，可重复执行。
-- =====================================================================

-- 1. 超级管理员用户（users.username / users.email 均为唯一键）
INSERT INTO `users` (
  `username`, `email`, `password`, `phone`, `avatar`,
  `status`, `real_name_verified`, `level`,
  `register_source`, `needs_tenant_setup`,
  `created_at`, `updated_at`
) VALUES (
  'admin',
  'admin@shentongapi.cn',
  '$2b$10$tfiSViEmjpceI4UexH4ZqOPvQPnp7P4C4zxY7BbOoOVykKJpoHO0S',
  NULL, NULL,
  'active', 0, 0,
  'direct', 0,
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE
  `password` = VALUES(`password`),
  `email` = VALUES(`email`),
  `status` = VALUES(`status`);

-- 2. 超级管理员角色（roles.name / roles.code 均为唯一键）
--    permissions 为 JSON 数组，包含前端 ALL_PERMISSION_CODES 全部权限码。
INSERT INTO `roles` (
  `name`, `code`, `description`, `permissions`,
  `created_at`, `updated_at`
) VALUES (
  '超级管理员',
  'super_admin',
  '系统超级管理员，拥有全部权限',
  JSON_ARRAY(
    'user:read', 'user:write',
    'agent:read', 'agent:write', 'agent:approve',
    'workflow:read', 'workflow:write', 'workflow:approve',
    'plugin:read', 'plugin:write', 'plugin:approve',
    'model:read', 'model:write',
    'credits:read', 'credits:adjust',
    'payment:read', 'payment:refund',
    'audit:read', 'audit:process',
    'stats:read',
    'version:read', 'version:write',
    'system:read', 'system:write',
    'apikey_pool:read', 'apikey_pool:write'
  ),
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `permissions` = VALUES(`permissions`),
  `description` = VALUES(`description`);

-- 3. 用户-角色关联（user_roles (user_id, role_id) 唯一键）
INSERT INTO `user_roles` (`user_id`, `role_id`, `created_at`)
SELECT u.id, r.id, NOW()
FROM `users` u, `roles` r
WHERE u.username = 'admin' AND r.code = 'super_admin'
ON DUPLICATE KEY UPDATE
  `user_id` = VALUES(`user_id`);
