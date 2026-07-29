#!/bin/bash
set -e

# 检查 root 权限
if [[ $EUID -ne 0 ]]; then
    echo "请使用 root 权限运行" >&2
    exit 1
fi

# 安装 certbot
if ! command -v certbot &> /dev/null; then
    if command -v apt &> /dev/null; then
        apt update && apt install -y certbot
    elif command -v yum &> /dev/null; then
        yum install -y certbot
    else
        echo "不支持的包管理器，请手动安装 certbot" >&2
        exit 1
    fi
fi

# 签发证书（standalone 模式，需先停止 nginx 释放 80 端口）
echo "停止 nginx 容器以释放 80 端口..."
docker compose stop nginx || true

echo "签发 zt.shentongapi.cn 证书..."
certbot certonly --standalone -d zt.shentongapi.cn --non-interactive --agree-tos -m admin@shentong.ai

# 创建 nginx ssl 目录并复制证书
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
SSL_DIR="$PROJECT_ROOT/nginx/ssl"
mkdir -p "$SSL_DIR"

cp /etc/letsencrypt/live/zt.shentongapi.cn/fullchain.pem "$SSL_DIR/zt.shentongapi.cn.crt"
cp /etc/letsencrypt/live/zt.shentongapi.cn/privkey.pem "$SSL_DIR/zt.shentongapi.cn.key"

chmod 644 "$SSL_DIR"/*.crt
chmod 600 "$SSL_DIR"/*.key

# 设置 certbot-renew.sh 可执行权限
chmod +x "$SCRIPT_DIR/certbot-renew.sh"

# 配置 cron（每月 1 日 3:00 执行续签）
CRON_JOB="0 3 1 * * $SCRIPT_DIR/certbot-renew.sh >> /var/log/certbot-renew.log 2>&1"
(crontab -l 2>/dev/null | grep -v "certbot-renew.sh"; echo "$CRON_JOB") | crontab -
echo "cron 已配置: $CRON_JOB"

# 重启 nginx 容器
echo "启动 nginx 容器..."
cd "$PROJECT_ROOT"
docker compose up -d nginx

# 部署成功提示
echo ""
echo "SSL 部署完成！"
echo "  证书目录: $SSL_DIR"
echo "  证书域名: zt.shentongapi.cn"
echo "  续签 cron: 每月 1 日 3:00"
echo "  健康检查: bash $SCRIPT_DIR/health-check.sh"
