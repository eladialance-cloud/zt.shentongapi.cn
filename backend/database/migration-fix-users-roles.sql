-- 迁移脚本：修复 users 和 roles 表缺失列
-- 适用于已有数据库，不需要重建
USE ai_agent;

-- 1. users 表添加 must_change_password 列
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否需要修改密码';

-- 2. roles 表添加 code 列  
ALTER TABLE roles ADD COLUMN IF NOT EXISTS code VARCHAR(64) DEFAULT NULL COMMENT '角色编码';

-- 3. 为已有角色设置 code 值
UPDATE roles SET code = 'super_admin' WHERE name = 'super_admin' AND code IS NULL;
UPDATE roles SET code = 'admin' WHERE name = 'admin' AND code IS NULL;
UPDATE roles SET code = 'user' WHERE name = 'user' AND code IS NULL;

-- 验证
SELECT 'users columns:' as info;
SHOW COLUMNS FROM users LIKE 'must_change_password';
SELECT 'roles columns:' as info;
SHOW COLUMNS FROM roles LIKE 'code';
SELECT 'roles data:' as info;
SELECT id, name, code FROM roles;
