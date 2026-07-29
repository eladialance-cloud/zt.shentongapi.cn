#!/bin/bash
# Landing 页面部署脚本
# 在服务器上执行

set -e

LANDING_DIR="/opt/shentong/frontend/landing"
NGINX_LANDING="/usr/share/nginx/html/landing"

echo "=== 深瞳 AI Landing 页面部署 ==="
echo ""

# 检查目录是否存在
if [ ! -d "$LANDING_DIR" ]; then
    echo "错误: $LANDING_DIR 不存在"
    echo "请先上传源码到该目录"
    exit 1
fi

cd "$LANDING_DIR"

# 1. 安装依赖
echo "[1/6] 安装依赖..."
if [ ! -d "node_modules" ]; then
    npm ci
else
    echo "node_modules 已存在，跳过安装"
fi

# 2. 构建
echo "[2/6] 构建项目..."
npm run build

# 3. 检查构建结果
if [ ! -d "dist" ]; then
    echo "错误: 构建失败，dist 目录不存在"
    exit 1
fi

# 4. 备份旧版本
echo "[3/6] 备份旧版本..."
if [ -d "$NGINX_LANDING" ]; then
    BACKUP_NAME="$NGINX_LANDING.bak.$(date +%Y%m%d%H%M%S)"
    mv "$NGINX_LANDING" "$BACKUP_NAME"
    echo "已备份到: $BACKUP_NAME"
fi

# 5. 部署新版本
echo "[4/6] 部署新版本..."
cp -r dist "$NGINX_LANDING"

# 6. 设置权限
echo "[5/6] 设置权限..."
chown -R www:www "$NGINX_LANDING"
chmod -R 755 "$NGINX_LANDING"

# 7. 验证
echo "[6/6] 验证部署..."
echo ""
echo "文件列表:"
ls -la "$NGINX_LANDING/"
echo ""
echo "Assets:"
ls -la "$NGINX_LANDING/assets/"

echo ""
echo "=== 部署完成 ==="
echo "请访问 https://zt.shentongapi.cn/landing/ 查看效果"
echo ""
echo "如果版本号仍显示旧版本，请按 Ctrl+Shift+R 强制刷新浏览器"
