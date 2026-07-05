#!/bin/bash
# =============================================================================
# 深瞳AI 桌面客户端 - Mac/Linux 一键打包脚本
#
# 用法:
#   npm run pack:mac                               # 打包 Mac
#   ./scripts/build-installer.sh --target mac      # 同上
#   ./scripts/build-installer.sh --target win      # 打包 Windows(需在 Mac 上交叉编译)
#   ./scripts/build-installer.sh --target all      # 打包全平台
#   ./scripts/build-installer.sh --api-base https://api.example.com/api
#   ./scripts/build-installer.sh --version 1.0.0
# =============================================================================

set -e

# ===== 默认参数 =====
TARGET="mac"
VERSION=""
API_BASE=""

# ===== 参数解析 =====
while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)
            TARGET="$2"
            shift 2
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --api-base)
            API_BASE="$2"
            shift 2
            ;;
        --help|-h)
            echo "用法: $0 [--target win|mac|all] [--version <semver>] [--api-base <url>]"
            exit 0
            ;;
        *)
            echo "未知参数: $1"
            exit 1
            ;;
    esac
done

# 校验 target
if [[ "$TARGET" != "win" && "$TARGET" != "mac" && "$TARGET" != "all" ]]; then
    echo "错误: --target 只能是 win / mac / all"
    exit 1
fi

# ===== 切换到项目根目录 =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# ===== 读取版本号 =====
PKG_VERSION=$(node -p "require('./package.json').version")
ACTUAL_VERSION="${VERSION:-$PKG_VERSION}"

# ===== 计时器 =====
START_TIME=$(date +%s)

# ===== 输出函数 =====
step() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

ok() {
    echo "  [OK] $1"
}

fail() {
    echo "  [FAIL] $1"
}

info() {
    echo "  [INFO] $1"
}

# ===== 横幅 =====
echo ""
echo "========================================================"
echo "  深瞳AI 桌面客户端一键打包"
echo "========================================================"
echo "  目标平台: $TARGET"
echo "  版本号:   $ACTUAL_VERSION"
if [[ -n "$API_BASE" ]]; then
    echo "  API 地址: $API_BASE"
fi
echo "  工作目录: $PROJECT_ROOT"
echo "========================================================"

# ===== 步骤 1:类型检查 =====
step "步骤 1/7:类型检查(typecheck)"
npm run typecheck
ok "类型检查通过"

# ===== 步骤 2:下载运行时 =====
step "步骤 2/7:下载运行时(fetch-runtime)"
if [[ "$TARGET" == "all" ]]; then
    npm run fetch-runtime -- --win
    npm run fetch-runtime -- --mac
else
    npm run fetch-runtime -- --"$TARGET"
fi
ok "运行时下载完成"

# ===== 步骤 3:注入 API 地址 =====
if [[ -n "$API_BASE" ]]; then
    step "步骤 3/7:注入生产环境 API 地址"
    echo "# 生产环境配置" > .env.production
    echo "VITE_API_BASE_URL=$API_BASE" >> .env.production
    ok "已写入 .env.production"
    info "VITE_API_BASE_URL=$API_BASE"
else
    step "步骤 3/7:跳过 API 地址注入(未指定 --api-base)"
fi

# ===== 步骤 4:编译 =====
step "步骤 4/7:编译主进程 + preload + 渲染进程"
npm run build
ok "编译完成"

# ===== 步骤 5:打包安装程序 =====
step "步骤 5/7:electron-builder 打包"
if [[ "$TARGET" == "all" ]]; then
    npx electron-builder --win --mac
else
    npx electron-builder --"$TARGET"
fi
ok "安装程序打包完成"

# ===== 步骤 6:生成 latest.yml =====
step "步骤 6/7:生成 latest.yml(electron-updater 清单)"
npx tsx scripts/generate-latest-yml.ts
ok "latest.yml 已生成"

# ===== 步骤 7:校验产物 =====
step "步骤 7/7:校验产物完整性"
npx tsx scripts/verify-installer.ts
ok "校验通过"

# ===== 打包报告 =====
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

echo ""
echo "========================================================"
echo "  打包成功!"
echo "========================================================"
echo "  耗时: ${MINUTES}分${SECONDS}秒"
echo "  版本: $ACTUAL_VERSION"
echo "  平台: $TARGET"
echo ""
echo "  产物目录:"
INSTALLER_DIR="$PROJECT_ROOT/dist/installer"
if [[ -d "$INSTALLER_DIR" ]]; then
    ls -lh "$INSTALLER_DIR" | tail -n +2 | while read -r line; do
        echo "    $line"
    done
fi
echo ""
echo "  下一步:"
echo "    1. 上传 dist/installer/ 下的安装包与 latest.yml 到服务器"
echo "    2. 用户通过 update.shentong.ai/desktop/ 自动更新"
echo ""
