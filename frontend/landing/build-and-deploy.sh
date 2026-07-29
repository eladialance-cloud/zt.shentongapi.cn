#!/bin/bash
# Landing 页面构建和部署脚本
# 在服务器上执行

set -e

echo "=== 深瞳 AI Landing 页面构建和部署 ==="

# 1. 安装依赖
echo "[1/5] 安装依赖..."
npm ci

# 2. 构建
echo "[2/5] 构建项目..."
npm run build

# 3. 备份旧版本
echo "[3/5] 备份旧版本..."
if [ -d "/usr/share/nginx/html/landing" ]; then
    mv /usr/share/nginx/html/landing /usr/share/nginx/html/landing.bak.$(date +%Y%m%d%H%M%S)
fi

# 4. 部署新版本
echo "[4/5] 部署新版本..."
cp -r dist /usr/share/nginx/html/landing

# 5. 验证
echo "[5/5] 验证部署..."
ls -la /usr/share/nginx/html/landing/
ls -la /usr/share/nginx/html/landing/assets/

echo ""
echo "=== 部署完成 ==="
echo "请刷新浏览器查看效果"
