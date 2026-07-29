#!/bin/bash
# ============================================
# 神通AI 管理后台 v0.5.0 部署脚本
# 在服务器上执行: bash deploy-v0.5.0.sh
# ============================================

set -e

echo "=== 1. 执行数据库结构升级 ==="
cd /opt/shentong/backend
DB_HOST=$(grep -E "^DB_HOST=" .env | cut -d= -f2)
DB_PORT=$(grep -E "^DB_PORT=" .env | cut -d= -f2)
DB_USER=$(grep -E "^DB_USER=" .env | cut -d= -f2)
DB_PASS=$(grep -E "^DB_PASSWORD=" .env | cut -d= -f2)
DB_NAME=$(grep -E "^DB_DATABASE=" .env | cut -d= -f2)

echo "数据库: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
mysql -h"${DB_HOST}" -P"${DB_PORT}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < /tmp/upgrade-v0.5.0.sql
echo "✅ 数据库升级完成"

echo "=== 2. 部署后端 ==="
sudo tar -xzf /tmp/backend-v0.5.0.tar.gz -C /opt/shentong/backend/
sudo chown -R ubuntu:ubuntu /opt/shentong/backend/dist
sudo systemctl restart shentong-backend
sleep 3
sudo systemctl status shentong-backend --no-pager | head -5
echo "✅ 后端部署完成"

echo "=== 3. 部署前端管理后台 ==="
sudo mkdir -p /usr/share/nginx/html/admin
# 清空旧文件（使用 find 而非 rm -rf）
sudo find /usr/share/nginx/html/admin/ -mindepth 1 -delete
sudo tar -xzf /tmp/admin-dist-v0.5.0.tar.gz -C /usr/share/nginx/html/admin/
ls -la /usr/share/nginx/html/admin/index.html
echo "✅ 前端部署完成"

echo "=== 4. 验证 ==="
curl -sI https://zt.shentongapi.cn/admin/ | head -3
curl -s "https://zt.shentongapi.cn/api/admin/models?page=1&pageSize=1" -o /dev/null -w "API /admin/models: HTTP %{http_code}\n"
curl -s "https://zt.shentongapi.cn/api/admin/agents?page=1&pageSize=1" -o /dev/null -w "API /admin/agents: HTTP %{http_code}\n"
curl -s "https://zt.shentongapi.cn/api/admin/workflows?page=1&pageSize=1" -o /dev/null -w "API /admin/workflows: HTTP %{http_code}\n"

echo ""
echo "=== 部署完成 ==="
echo "管理后台: https://zt.shentongapi.cn/admin/"
