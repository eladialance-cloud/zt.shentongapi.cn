#!/bin/bash
# =============================================================================
# 深瞳AI 智能中台 - 云端一键部署脚本
#
# 功能:
# 1. 检查 Docker 环境
# 2. 初始化 .env 配置
# 3. 启动 docker compose 全栈
# 4. 等待服务就绪
# 5. 输出部署报告
#
# 用法:
#   bash deploy/deploy.sh              # 首次部署
#   bash deploy/deploy.sh --force-build # 强制重建镜像
# =============================================================================

set -e

# ===== 颜色码 =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# ===== 参数 =====
FORCE_BUILD=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --force-build)
            FORCE_BUILD=true
            shift
            ;;
        --help|-h)
            echo "用法: $0 [--force-build]"
            echo "  --force-build  强制重新构建镜像(无缓存)"
            exit 0
            ;;
        *)
            echo "未知参数: $1"
            exit 1
            ;;
    esac
done

# ===== 切换到项目根目录 =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# ===== 输出函数 =====
step() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

ok() {
    echo -e "  ${GREEN}[OK]${NC} $1"
}

fail() {
    echo -e "  ${RED}[FAIL]${NC} $1"
}

warn() {
    echo -e "  ${YELLOW}[WARN]${NC} $1"
}

info() {
    echo -e "  ${GRAY}[INFO]${NC} $1"
}

# ===== 横幅 =====
echo ""
echo -e "${CYAN}========================================================${NC}"
echo -e "${CYAN}  深瞳AI 智能中台 - 云端部署${NC}"
echo -e "${CYAN}========================================================${NC}"
echo -e "  工作目录: $PROJECT_ROOT"
echo -e "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "${CYAN}========================================================${NC}"

# ===== 步骤 1:检查 Docker 环境 =====
step "步骤 1/5:检查 Docker 环境"

if ! command -v docker &> /dev/null; then
    fail "Docker 未安装"
    info "请安装 Docker 24+: https://docs.docker.com/engine/install/"
    exit 1
fi
ok "Docker 已安装: $(docker --version)"

if ! docker compose version &> /dev/null; then
    fail "Docker Compose v2 未安装"
    info "Docker Compose v2 已内置于 Docker 20.10+,请升级 Docker"
    exit 1
fi
ok "Docker Compose: $(docker compose version)"

# ===== 步骤 2:初始化 .env =====
step "步骤 2/5:初始化环境变量(.env)"

if [[ ! -f ".env" ]]; then
    if [[ -f ".env.example" ]]; then
        cp .env.example .env
        warn ".env 已从 .env.example 复制"
        echo ""
        echo -e "  ${YELLOW}请修改以下敏感配置后再运行部署:${NC}"
        echo -e "    vi .env"
        echo ""
        echo -e "  ${GRAY}必须修改的项:${NC}"
        echo -e "    - MYSQL_ROOT_PASSWORD(数据库 root 密码)"
        echo -e "    - MYSQL_PASSWORD(应用数据库密码)"
        echo -e "    - REDIS_PASSWORD(Redis 密码)"
        echo -e "    - JWT_SECRET(至少 32 字符随机串)"
        echo ""
        echo -e "  ${GRAY}生成 JWT_SECRET:${NC}"
        echo -e "    openssl rand -hex 32"
        echo ""
        exit 0
    else
        fail ".env 与 .env.example 都不存在"
        info "请先从仓库获取 .env.example"
        exit 1
    fi
else
    ok ".env 已存在"
fi

# ===== 步骤 3:启动 docker compose =====
step "步骤 3/5:启动 docker compose 全栈"

if [[ "$FORCE_BUILD" == "true" ]]; then
    info "强制重建镜像(无缓存)..."
    docker compose build --no-cache
    ok "镜像重建完成"
fi

info "启动服务..."
docker compose up -d --build
ok "容器已启动"

# ===== 步骤 4:等待服务就绪 =====
step "步骤 4/5:等待服务就绪"

# 等待 MySQL
info "等待 MySQL 健康检查(最多 60 秒)..."
MYSQL_TIMEOUT=60
MYSQL_ELAPSED=0
while [[ $MYSQL_ELAPSED -lt $MYSQL_TIMEOUT ]]; do
    MYSQL_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' shentong-mysql 2>/dev/null || echo "starting")
    if [[ "$MYSQL_HEALTH" == "healthy" ]]; then
        ok "MySQL 已就绪(${MYSQL_ELAPSED}s)"
        break
    fi
    sleep 2
    MYSQL_ELAPSED=$((MYSQL_ELAPSED + 2))
    printf "."
done
echo ""

if [[ "$MYSQL_HEALTH" != "healthy" ]]; then
    fail "MySQL 健康检查超时(状态: $MYSQL_HEALTH)"
    info "查看日志: docker compose logs mysql"
    exit 1
fi

# 等待 Redis
info "等待 Redis 健康检查(最多 60 秒)..."
REDIS_TIMEOUT=60
REDIS_ELAPSED=0
while [[ $REDIS_ELAPSED -lt $REDIS_TIMEOUT ]]; do
    REDIS_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' shentong-redis 2>/dev/null || echo "starting")
    if [[ "$REDIS_HEALTH" == "healthy" ]]; then
        ok "Redis 已就绪(${REDIS_ELAPSED}s)"
        break
    fi
    sleep 2
    REDIS_ELAPSED=$((REDIS_ELAPSED + 2))
    printf "."
done
echo ""

if [[ "$REDIS_HEALTH" != "healthy" ]]; then
    fail "Redis 健康检查超时(状态: $REDIS_HEALTH)"
    info "查看日志: docker compose logs redis"
    exit 1
fi

# 等待 Backend
info "等待后端 API 就绪(最多 60 秒)..."
BACKEND_TIMEOUT=60
BACKEND_ELAPSED=0
BACKEND_OK=false
while [[ $BACKEND_ELAPSED -lt $BACKEND_TIMEOUT ]]; do
    if curl -sf http://localhost:3001/api/health &> /dev/null; then
        BACKEND_OK=true
        ok "后端 API 已就绪(${BACKEND_ELAPSED}s)"
        break
    fi
    sleep 2
    BACKEND_ELAPSED=$((BACKEND_ELAPSED + 2))
    printf "."
done
echo ""

if [[ "$BACKEND_OK" != "true" ]]; then
    fail "后端 API 就绪检查超时"
    info "查看日志: docker compose logs backend"
    exit 1
fi

# ===== 步骤 5:部署报告 =====
step "步骤 5/5:部署报告"

# 获取服务器 IP
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "${GREEN}========================================================${NC}"
echo -e "${GREEN}  部署成功!${NC}"
echo -e "${GREEN}========================================================${NC}"
echo ""
echo -e "  ${CYAN}服务访问地址:${NC}"
echo -e "    API:        http://$SERVER_IP/api/"
echo -e "    Swagger:    http://$SERVER_IP/api/docs"
echo -e "    健康检查:   http://$SERVER_IP/api/health"
echo -e "    Landing:    http://$SERVER_IP/"
echo -e "    管理后台:   http://$SERVER_IP/admin/"
echo ""
echo -e "  ${CYAN}容器状态:${NC}"
docker compose ps
echo ""
echo -e "  ${CYAN}端口映射:${NC}"
echo -e "    80   - Nginx(API 反代 + 下载站)"
echo -e "    3001 - NestJS 后端(直连调试)"
echo -e "    3306 - MySQL(建议改为内网)"
echo -e "    6379 - Redis(建议改为内网)"
echo ""
echo -e "  ${YELLOW}注意事项:${NC}"
echo -e "    1. 生产环境请配置域名 + HTTPS(certbot --nginx)"
echo -e "    2. 建议关闭 3306/6379 端口的外网访问"
echo -e "    3. 定期备份 mysql_data 卷"
echo -e "       docker run --rm -v shentong-mysql-data:/data -v \$(pwd):/backup alpine tar czf /backup/mysql-\$(date +%Y%m%d).tar.gz /data"
echo ""
echo -e "  ${CYAN}常用命令:${NC}"
echo -e "    查看日志:   docker compose logs -f backend"
echo -e "    重启服务:   docker compose restart backend"
echo -e "    停止服务:   docker compose down"
echo -e "    清除数据:   docker compose down -v"
echo ""
