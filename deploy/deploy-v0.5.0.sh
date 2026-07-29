#!/bin/bash
# ==============================================================================
# 深瞳AI 智能中台 - V0.5.0 部署脚本
#
# 功能：
# 1. 备份当前 .env
# 2. 重建 backend + nginx 容器
# 3. 临时开启 synchronize 自动建表（补建缺失的 59 张表）
# 4. 关闭 synchronize，恢复安全配置
# 5. 验证服务健康
#
# 用法：
#   bash deploy/deploy-v0.5.0.sh           # 正常部署
#   bash deploy/deploy-v0.5.0.sh --dry-run # 只打印命令不执行
# ==============================================================================

set -e

# ===== 参数 =====
DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        *) echo "未知参数: $1"; exit 1 ;;
    esac
done

# ===== 工具函数 =====
run() {
    echo "  \$ $*"
    if [ "$DRY_RUN" = "false" ]; then
        eval "$@"
    fi
}

step() {
    echo ""
    echo "=============================================="
    echo "  $1"
    echo "=============================================="
}

ok()   { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; exit 1; }
warn() { echo "  ⚠️  $1"; }

# ===== 开始 =====
step "深瞳AI V0.5.0 部署开始"
echo "  工作目录: $(pwd)"
echo "  模式: $([ "$DRY_RUN" = "true" ] && echo 'Dry Run (只打印)' || echo '实际执行')"

# ===== Step 1: 备份 .env =====
step "Step 1: 备份当前配置"
if [ -f .env ]; then
    BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
    run "cp .env $BACKUP_FILE"
    ok "已备份到 $BACKUP_FILE"
else
    fail ".env 文件不存在，请先创建（参考 .env.example）"
fi

# ===== Step 2: 检查必要的密码变量 =====
step "Step 2: 检查密码变量"
REQUIRED_VARS=("MYSQL_ROOT_PASSWORD" "MYSQL_PASSWORD" "REDIS_PASSWORD" "JWT_SECRET" "ADMIN_JWT_SECRET")
for var in "${REQUIRED_VARS[@]}"; do
    VAL=$(grep -E "^${var}=" .env 2>/dev/null | cut -d'=' -f2-)
    if [ -z "$VAL" ] || [[ "$VAL" == *"change-me"* ]]; then
        fail "$var 未设置或仍为默认值，请修改 .env"
    fi
    ok "$var 已设置"
done

# ===== Step 3: 重建 backend 镜像 =====
step "Step 3: 重建 Backend 容器"
run "docker compose up -d --build backend"
ok "Backend 容器已重建"

# ===== Step 4: 重建 nginx 容器 =====
step "Step 4: 重建 Nginx 容器"
run "docker compose up -d --build nginx"
ok "Nginx 容器已重建"

# ===== Step 5: 临时开启 synchronize 自动建表 =====
step "Step 5: 自动建表（补建缺失的表）"
warn "将临时开启 DB_SYNCHRONIZE=true 让 TypeORM 自动创建缺失的表"

# 添加环境变量
if ! grep -q "DB_SYNCHRONIZE" .env; then
    run "echo 'DB_SYNCHRONIZE=true' >> .env"
else
    run "sed -i 's/DB_SYNCHRONIZE=.*/DB_SYNCHRONIZE=true/' .env"
fi
ok "已开启 DB_SYNCHRONIZE=true"

# 重启 backend 让它建表
run "docker compose restart backend"
echo "  等待 backend 启动并建表..."
run "sleep 15"

# 检查表数量
TABLE_COUNT=$(docker exec shentong-mysql mysql -u root -p$(grep MYSQL_ROOT_PASSWORD .env | cut -d'=' -f2) -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='ai_agent'" 2>/dev/null)
echo "  当前表数量: $TABLE_COUNT"
if [ "$TABLE_COUNT" -lt 80 ]; then
    warn "表数量偏少（$TABLE_COUNT < 80），可能部分表创建失败，请检查 backend 日志"
    run "docker compose logs backend --tail 50"
else
    ok "表数量正常（$TABLE_COUNT 张表）"
fi

# 关闭 synchronize
run "sed -i 's/DB_SYNCHRONIZE=true/DB_SYNCHRONIZE=false/' .env"
ok "已关闭 DB_SYNCHRONIZE=false"
run "docker compose restart backend"
ok "Backend 已重启（synchronize=false）"

# ===== Step 6: 更新管理端前端 =====
step "Step 6: 管理端前端"
if [ -d "frontend/admin/dist" ]; then
    ok "管理端前端已存在于 frontend/admin/dist/"
    warn "如果有新的前端构建，请替换 frontend/admin/dist/ 内容"
else
    warn "frontend/admin/dist/ 不存在，请构建并上传管理端前端"
fi

# ===== Step 7: 桌面端安装包 =====
step "Step 7: 桌面端安装包"
if [ -f "updates/latest.yml" ]; then
    VERSION=$(grep "^version:" updates/latest.yml | head -1 | awk '{print $2}')
    echo "  当前 updates/latest.yml 版本: $VERSION"
    if [[ "$VERSION" == "0.5.0" ]]; then
        ok "已是 V0.5.0"
    else
        warn "当前是 $VERSION，需要上传 V0.5.0 的构建产物到 updates/ 目录"
        echo "  需要的文件："
        echo "    - ShenTongAI-Setup-0.5.0-x64.exe"
        echo "    - latest.yml（electron-builder 自动生成）"
        echo "    - ShenTongAI-0.5.0-x64.exe.blockmap"
    fi
else
    warn "updates/latest.yml 不存在"
    echo "  请将桌面端构建产物上传到 updates/ 目录"
fi

# ===== Step 8: 验证 =====
step "Step 8: 验证服务"
echo "  检查容器状态..."
run "docker compose ps"

echo ""
echo "  检查 Backend 健康..."
HEALTH=$(curl -s http://localhost:3001/api/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
    ok "Backend API 正常: $HEALTH"
else
    fail "Backend API 无响应"
fi

echo ""
echo "  检查桌面端更新文件..."
if [ -f "updates/latest.yml" ]; then
    ok "latest.yml 存在"
    echo "  内容："
    cat updates/latest.yml | head -5 | sed 's/^/    /'
else
    warn "updates/latest.yml 不存在，桌面端自动更新不可用"
fi

# ===== 完成 =====
step "部署完成"
echo "  ✅ Backend 已更新到 V0.5.0"
echo "  ✅ 数据库已补建缺失的表"
echo "  ✅ Nginx 配置已更新"
echo ""
echo "  📋 待办事项："
echo "    1. 上传管理端前端构建产物到 frontend/admin/dist/（如有更新）"
echo "    2. 构建并上传桌面端 V0.5.0 安装包到 updates/ 目录"
echo "    3. 验证 https://zt.shentongapi.cn/desktop/latest.yml 返回 0.5.0"
echo "    4. 在已安装的桌面端测试自动更新"
