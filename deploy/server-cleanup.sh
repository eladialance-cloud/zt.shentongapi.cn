#!/bin/bash
# ==============================================================================
# 深瞳AI 服务器空间清理脚本
# 直接在服务器上执行：bash /tmp/server-cleanup.sh
# ==============================================================================

set -e

step() {
    echo ""
    echo "=============================================="
    echo "  $1"
    echo "=============================================="
}
ok()   { echo "  ✅ $1"; }
warn() { echo "  ⚠️  $1"; }
info() { echo "  ℹ️  $1"; }

PROJECT_DIR="/opt/shentong"
cd "$PROJECT_DIR"

step "深瞳AI 服务器空间清理"
echo "  目录: $(pwd)"
echo ""
echo "  清理前磁盘使用："
df -h /
echo ""
echo "  当前目录大小："
du -sh . 2>/dev/null || echo "  计算中..."

# ===== Step 1: 清理不该在服务器上的目录 =====
step "Step 1: 清理不该在服务器上的目录"

# desktop 整个目录（构建在本地，服务器只需要 updates/ 里的安装包）
if [ -d "desktop" ]; then
    DESKTOP_SIZE=$(du -sh desktop 2>/dev/null | cut -f1)
    echo "  desktop/ 大小: $DESKTOP_SIZE"
    echo "  包含 node_modules(855MB) + dist(4.64GB) + runtime(1.11GB)"
    echo "  这些都是本地构建用的，服务器完全不需要"
    echo "  正在删除..."
    rm -rf desktop
    ok "已删除 desktop/ 目录"
else
    info "desktop/ 目录不存在，跳过"
fi

# backend/node_modules（Docker 容器内会自己 npm ci 安装）
if [ -d "backend/node_modules" ]; then
    BACKEND_NM_SIZE=$(du -sh backend/node_modules 2>/dev/null | cut -f1)
    echo "  backend/node_modules 大小: $BACKEND_NM_SIZE"
    echo "  Docker 构建时容器内会 npm ci，宿主机不需要"
    rm -rf backend/node_modules
    ok "已删除 backend/node_modules"
else
    info "backend/node_modules 不存在，跳过"
fi

# frontend/admin/node_modules（只需要 dist 构建产物）
if [ -d "frontend/admin/node_modules" ]; then
    FRONTEND_NM_SIZE=$(du -sh frontend/admin/node_modules 2>/dev/null | cut -f1)
    echo "  frontend/admin/node_modules 大小: $FRONTEND_NM_SIZE"
    echo "  只需要 dist/ 构建产物，node_modules 不需要"
    rm -rf frontend/admin/node_modules
    ok "已删除 frontend/admin/node_modules"
else
    info "frontend/admin/node_modules 不存在，跳过"
fi

# backend/dist（Docker 容器内自动编译）
if [ -d "backend/dist" ]; then
    echo "  backend/dist 存在，Docker 容器内会自动编译"
    rm -rf backend/dist
    ok "已删除 backend/dist"
fi

# frontend/admin/src（服务器只需要 dist）
if [ -d "frontend/admin/src" ]; then
    rm -rf frontend/admin/src
    ok "已删除 frontend/admin/src"
fi

# frontend/user 已删除，如果服务器上还有也清理
if [ -d "frontend/user" ]; then
    USER_SIZE=$(du -sh frontend/user 2>/dev/null | cut -f1)
    echo "  frontend/user 大小: $USER_SIZE"
    echo "  用户端 Web 前端已废弃"
    rm -rf frontend/user
    ok "已删除 frontend/user"
fi

# ===== Step 2: 清理旧版本安装包 =====
step "Step 2: 清理旧版本安装包"

if [ -d "deploy/desktop" ]; then
    DEPLOY_DESKTOP_SIZE=$(du -sh deploy/desktop 2>/dev/null | cut -f1)
    echo "  deploy/desktop/ 大小: $DEPLOY_DESKTOP_SIZE"
    echo "  包含 V0.1.1 旧安装包，已被 updates/ 替代"
    rm -rf deploy/desktop
    ok "已删除 deploy/desktop/"
else
    info "deploy/desktop/ 不存在，跳过"
fi

# 显示 updates/ 内容
if [ -d "updates" ]; then
    echo "  updates/ 目录内容:"
    ls -lh updates/ 2>/dev/null || echo "  (空目录)"
    echo ""
    echo "  ↑ 只保留最新版本的安装包，旧版本可手动删除"
fi

# ===== Step 3: 清理 Docker 悬空资源 =====
step "Step 3: 清理 Docker 悬空资源"

echo "  当前 Docker 磁盘使用："
docker system df 2>/dev/null || echo "  Docker 未安装或未运行"

echo ""
echo "  清理悬空镜像..."
docker image prune -f 2>/dev/null && ok "悬空镜像已清理" || warn "Docker 清理跳过"

echo ""
echo "  清理停止的容器..."
docker container prune -f 2>/dev/null && ok "停止的容器已清理" || warn "容器清理跳过"

echo ""
echo "  清理未使用的构建缓存..."
docker builder prune -f 2>/dev/null && ok "构建缓存已清理" || warn "构建缓存清理跳过"

echo ""
warn "如需深度清理所有未使用镜像，手动执行：docker image prune -a"

# ===== Step 4: 清理日志 =====
step "Step 4: 清理日志"

# Docker 容器日志
if [ -d "/var/lib/docker/containers" ]; then
    LOG_SIZE=$(find /var/lib/docker/containers -name '*.log' -exec du -ch {} + 2>/dev/null | tail -1 | cut -f1)
    echo "  Docker 容器日志总大小: $LOG_SIZE"
    find /var/lib/docker/containers -name '*.log' -exec truncate -s 0 {} \; 2>/dev/null
    ok "容器日志已截断"
fi

# Nginx 日志
if [ -d "/var/log/nginx" ]; then
    find /var/log/nginx -name '*.log' -exec truncate -s 0 {} \; 2>/dev/null
    ok "Nginx 日志已截断"
fi

# ===== Step 5: 清理后磁盘使用 =====
step "Step 5: 清理后磁盘使用"
echo "  磁盘使用："
df -h /
echo ""
echo "  当前目录大小："
du -sh . 2>/dev/null || echo "  计算中..."

# ===== 汇总 =====
step "清理完成"
echo ""
echo "  📋 服务器上应该只保留："
echo "    .env                          ← 密码配置"
echo "    docker-compose.yml            ← 编排配置"
echo "    backend/src/ + Dockerfile     ← 后端源码（不含 node_modules）"
echo "    frontend/admin/dist/          ← 管理端构建产物"
echo "    deploy/nginx.conf             ← Nginx 配置"
echo "    updates/                      ← 桌面端安装包 + latest.yml"
echo "    cdn/                          ← 运行时下载源（如用到）"
echo "    nginx/ssl/                    ← SSL 证书"
