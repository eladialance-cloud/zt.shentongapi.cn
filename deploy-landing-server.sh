#!/bin/bash
# Landing 页面部署脚本 - 在服务器上执行
# 上传 landing-source-v0.5.0.zip 到 /opt/shentong/ 后执行

set -e

ZIP_FILE="/opt/shentong/landing-source-v0.5.0.zip"
LANDING_DIR="/opt/shentong/frontend/landing"
NGINX_LANDING="/usr/share/nginx/html/landing"

echo "=== 深瞳 AI Landing 页面部署 ==="
echo ""

# 检查 zip 文件
if [ ! -f "$ZIP_FILE" ]; then
    echo "错误: $ZIP_FILE 不存在"
    echo "请先上传 landing-source-v0.5.0.zip 到 /opt/shentong/"
    exit 1
fi

# 1. 清理并创建目录
echo "[1/7] 准备目录..."
rm -rf "$LANDING_DIR"
mkdir -p "$LANDING_DIR"

# 2. 解压
echo "[2/7] 解压源码..."
cd /opt/shentong
unzip -q "$ZIP_FILE" -d "$LANDING_DIR/"

# 3. 检查 Node.js
echo "[3/7] 检查环境..."
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装"
    exit 1
fi

node -v
npm -v

# 4. 安装依赖
echo "[4/7] 安装依赖..."
cd "$LANDING_DIR"
npm ci

# 5. 构建
echo "[5/7] 构建项目..."
npm run build

# 检查构建结果
if [ ! -d "dist" ]; then
    echo "错误: 构建失败，dist 目录不存在"
    exit 1
fi

# 6. 部署到 Nginx
echo "[6/7] 部署到 Nginx..."

# 备份旧版本
if [ -d "$NGINX_LANDING" ]; then
    BACKUP_NAME="$NGINX_LANDING.bak.$(date +%Y%m%d%H%M%S)"
    mv "$NGINX_LANDING" "$BACKUP_NAME"
    echo "已备份旧版本到: $BACKUP_NAME"
fi

# 复制新版本
cp -r "$LANDING_DIR/dist" "$NGINX_LANDING"

# 设置权限
chown -R www:www "$NGINX_LANDING"
chmod -R 755 "$NGINX_LANDING"

# 7. 验证
echo "[7/7] 验证部署..."
echo ""
echo "文件列表:"
ls -la "$NGINX_LANDING/"
echo ""
echo "JS 文件:"
ls -la "$NGINX_LANDING/assets/" | grep "\.js"
echo ""

echo "=== 部署完成 ==="
echo ""
echo "请访问 https://zt.shentongapi.cn/landing/ 查看效果"
echo "按 Ctrl+Shift+R 强制刷新浏览器缓存"
echo ""
echo "如果版本号仍显示旧版本，请检查:"
echo "1. API 是否正常: curl https://zt.shentongapi.cn/api/client-versions/latest?platform=win"
echo "2. 浏览器是否强制刷新"
