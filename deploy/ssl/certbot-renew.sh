#!/bin/bash
set -e

# certbot 自动续签脚本，每月由 cron 执行

certbot renew --quiet --deploy-hook "docker exec shentong-nginx nginx -s reload"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] certbot renew completed" >> /var/log/certbot-renew.log
