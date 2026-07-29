#!/bin/bash
# register-config-fix.sh - 邀请码由管理后台控制
cd /opt/shentong

# ============ 1. 执行 SQL：插入注册配置 ============
docker exec -i shentong-mysql mysql -u shentong -p"085d9f3c748c433b8d4d4a7050df9c9b" ai_agent << 'SQLEOF'
INSERT INTO `system_config` (`section`, `config_value`, `description`)
VALUES ('registration', '{"inviteCodeRequired": false}', '注册配置：邀请码是否必填')
ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`);
SQLEOF

echo "SQL done."

# ============ 2. 覆盖后端文件 ============
cd /opt/shentong/backend/src/modules/auth

# 备份
cp dto/../auth.module.ts auth.module.ts.bak 2>/dev/null
cp controllers/auth.controller.ts controllers/auth.controller.ts.bak
cp services/auth.service.ts services/auth.service.ts.bak

# 覆盖（从zip解压目录）
cp /opt/shentong/register-config-fix/auth.module.ts /opt/shentong/backend/src/modules/auth/auth.module.ts
cp /opt/shentong/register-config-fix/auth.controller.ts /opt/shentong/backend/src/modules/auth/controllers/auth.controller.ts
cp /opt/shentong/register-config-fix/auth.service.ts /opt/shentong/backend/src/modules/auth/services/auth.service.ts

echo "Backend files copied."

# ============ 3. 重建后端 ============
cd /opt/shentong
docker compose build backend 2>&1 | tail -5
docker compose up -d backend

echo "Waiting for backend..."
sleep 8
docker logs shentong-backend --tail 10

# ============ 4. 验证 ============
echo "=== Test registration config endpoint ==="
curl -s https://zt.shentongapi.cn/api/auth/registration-config
echo ""
echo "=== Test register without inviteCode ==="
curl -s -X POST https://zt.shentongapi.cn/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser05","email":"test05@test.com","password":"TestPass123"}'
echo ""
