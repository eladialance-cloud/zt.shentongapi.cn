# SSL 证书部署指南

本文档指导如何在生产环境部署 SSL 证书，启用 HTTPS 访问。

## 前置条件

1. 域名已解析到服务器 IP：
   - `zt.shentongapi.cn` → 服务器 IP（Landing + 管理后台 + API + 下载站 + CDN）
2. 服务器 80 端口可从公网访问（用于 ACME challenge）
3. 拥有 root 权限
4. 已安装 Docker 和 docker compose

## 一键部署（推荐）

```bash
# 1. 克隆项目到服务器
git clone <repo-url> /opt/shentong
cd /opt/shentong

# 2. 运行 SSL 部署脚本
sudo bash deploy/ssl/deploy-ssl.sh
```

脚本会自动完成：certbot 安装 → 证书签发 → 文件放置 → cron 配置 → nginx 重启。

## 手动部署

### 1. 安装 certbot

```bash
# Ubuntu/Debian
apt update && apt install -y certbot

# CentOS/RHEL
yum install -y certbot
```

### 2. 签发证书

```bash
# 停止 nginx 释放 80 端口
docker compose stop nginx

# 签发 zt.shentongapi.cn 证书
certbot certonly --standalone -d zt.shentongapi.cn --non-interactive --agree-tos -m admin@shentong.ai

# 启动 nginx
docker compose up -d nginx
```

### 3. 复制证书到 nginx 目录

```bash
mkdir -p nginx/ssl

cp /etc/letsencrypt/live/zt.shentongapi.cn/fullchain.pem nginx/ssl/zt.shentongapi.cn.crt
cp /etc/letsencrypt/live/zt.shentongapi.cn/privkey.pem nginx/ssl/zt.shentongapi.cn.key

chmod 644 nginx/ssl/*.crt
chmod 600 nginx/ssl/*.key
```

### 4. 重启 nginx

```bash
docker compose restart nginx
```

## 自动续签

certbot 证书有效期 90 天，建议自动续签。

### 配置 cron

```bash
# 每月 1 日 3:00 执行续签
echo "0 3 1 * * /opt/shentong/deploy/ssl/certbot-renew.sh >> /var/log/certbot-renew.log 2>&1" | crontab -
```

或使用 `deploy-ssl.sh` 自动配置（推荐）。

### 续签脚本

`deploy/ssl/certbot-renew.sh` 会在续签成功后自动 reload nginx：
```bash
certbot renew --quiet --deploy-hook "docker exec shentong-nginx nginx -s reload"
```

## 健康检查

定期运行健康检查脚本验证 SSL 状态：

```bash
bash deploy/ssl/health-check.sh
```

检查项：
- 证书剩余有效期（< 14 天 WARN，< 30 天 INFO）
- HTTP→HTTPS 跳转（301）
- HTTPS 可达性（200）
- HSTS 安全头

建议配置为 cron 每日执行：
```bash
echo "0 8 * * * /opt/shentong/deploy/ssl/health-check.sh >> /var/log/ssl-health.log 2>&1" | crontab -
```

## 故障排查

### 证书过期

**现象**：浏览器提示证书不安全
**解决**：
```bash
# 检查证书状态
bash deploy/ssl/health-check.sh

# 手动续签
sudo bash deploy/ssl/certbot-renew.sh

# 或重新签发
docker compose stop nginx
certbot certonly --standalone -d zt.shentongapi.cn
docker compose up -d nginx
```

### nginx reload 失败

**现象**：续签成功但 nginx 仍使用旧证书
**解决**：
```bash
# 检查 nginx 配置
docker exec shentong-nginx nginx -t

# 强制重启 nginx 容器
docker compose restart nginx
```

### 80 端口被占用

**现象**：certbot standalone 模式启动失败
**解决**：
```bash
# 查看占用 80 端口的进程
lsof -i :80

# 停止占用进程（通常是 nginx）
docker compose stop nginx
# 或
systemctl stop nginx
```

### ACME challenge 失败

**现象**：`Failed authorization procedure`
**解决**：
1. 确认域名已正确解析到服务器 IP：`dig zt.shentongapi.cn`
2. 确认防火墙放行 80 端口
3. 确认 `.well-known/acme-challenge/` 路径可达

## 证书文件结构

部署完成后，`nginx/ssl/` 目录结构：
```
nginx/ssl/
├── zt.shentongapi.cn.crt   # SSL 证书（全站共用）
└── zt.shentongapi.cn.key   # SSL 私钥
```

对应 nginx.conf 中的配置：
- `zt.shentongapi.cn` server 块：`ssl_certificate /etc/nginx/ssl/zt.shentongapi.cn.crt;`
