#!/bin/bash
# start.sh - 深瞳AI 服务器一键启动脚本
# 用法: chmod +x start.sh && ./start.sh

set -e

cd /opt/shentong

echo "========================================"
echo "  深瞳AI 服务器启动脚本"
echo "========================================"

# 1. 杀掉占用 3001 的宿主机进程
echo "[1/6] 检查并释放 3001 端口..."
PID=$(ss -tlnp 2>/dev/null | grep 3001 | grep -oP 'pid=\K\d+' | head -1)
if [ -n "$PID" ]; then
    echo "  → 发现占用进程 PID=$PID，正在终止..."
    kill -9 $PID 2>/dev/null || true
    sleep 1
fi
ss -tlnp | grep 3001 >/dev/null 2>&1 && echo "  ⚠ 3001 仍被占用" || echo "  ✓ 3001 端口已释放"

# 2. 确保 .env 文件存在
if [ ! -f .env ]; then
    echo "[错误] .env 文件不存在!"
    exit 1
fi

# 3. 停掉容器版 nginx（用宝塔的宿主机 nginx）
echo "[2/6] 停用容器版 nginx..."
docker compose stop nginx 2>/dev/null || true
docker compose rm -f nginx 2>/dev/null || true

# 4. 启动核心服务
echo "[3/6] 启动 MySQL 和 Redis..."
docker compose up -d mysql redis

echo "  → 等待 MySQL 就绪..."
for i in {1..30}; do
    if docker exec shentong-mysql mysqladmin -uroot -p${MYSQL_ROOT_PASSWORD:-ded9e9de12d34cb48bf6a1f641ca7cb9} ping --silent 2>/dev/null; then
        echo "  ✓ MySQL 已就绪"
        break
    fi
    sleep 1
    [ $i -eq 30 ] && echo "  ⚠ MySQL 启动超时" && exit 1
done

# 5. 初始化数据库用户
echo "[4/6] 初始化 MySQL 用户..."
docker exec -i shentong-mysql mysql -uroot -p${MYSQL_ROOT_PASSWORD:-ded9e9de12d34cb48bf6a1f641ca7cb9} -e "
DROP USER IF EXISTS 'shentong'@'%';
CREATE USER 'shentong'@'%' IDENTIFIED BY '${MYSQL_PASSWORD:-ded9e9de12d34cb48bf6a1f641ca7cb9}';
GRANT ALL PRIVILEGES ON ai_agent.* TO 'shentong'@'%';
FLUSH PRIVILEGES;
" 2>/dev/null && echo "  ✓ shentong 用户已创建" || echo "  ⚠ 用户创建可能失败"

# 6. 执行数据库迁移
echo "[5/6] 执行数据库迁移..."
for sql in /opt/shentong/backend/migrations/*.sql; do
    if [ -f "$sql" ]; then
        echo "  → 执行 $(basename $sql)..."
        docker exec -i shentong-mysql mysql -ushentong -p${MYSQL_PASSWORD:-ded9e9de12d34cb48bf6a1f641ca7cb9} ai_agent < "$sql" 2>/dev/null && echo "    ✓ 成功" || echo "    ⚠ 失败或已执行"
    fi
done

# 7. 构建并启动后端
echo "[6/6] 构建并启动后端服务..."
docker compose up -d --build backend

echo "  → 等待后端启动..."
sleep 5

# 8. 状态检查
echo ""
echo "========================================"
echo "  部署状态检查"
echo "========================================"

echo ""
echo "[容器状态]"
docker compose ps

echo ""
echo "[后端日志 - 最近20行]"
docker compose logs --tail=20 backend 2>/dev/null || echo "  后端日志获取失败"

echo ""
echo "[API 测试]"
HEALTH=$(curl -s http://127.0.0.1:3001/api/health 2>/dev/null | grep -o '"status":"ok"' || echo "失败")
if [ "$HEALTH" = '"status":"ok"' ]; then
    echo "  ✓ 后端 API 正常"
else
    echo "  ⚠ 后端 API 可能未就绪"
fi

echo ""
echo "========================================"
echo "  部署完成"
echo "========================================"
echo "  前端: https://zt.shentongapi.cn"
echo "  后台: https://zt.shentongapi.cn/admin/"
echo "  API:  http://127.0.0.1:3001/api/"
echo "========================================"
