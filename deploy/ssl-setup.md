# 🔒 Nginx SSL 证书配置指南

> 深瞳AI 生产环境 SSL/TLS 证书部署文档
> 域名：`zt.shentongapi.cn`

---

## 目录

1. [方案一：Let's Encrypt + certbot 自动签发与续期](#方案一lets-encrypt--certbot-自动签发与续期)
2. [方案二：手动放置商业证书](#方案二手动放置商业证书)
3. [Nginx SSL 最佳实践配置](#nginx-ssl-最佳实践配置)
4. [证书自动续期 Cron 脚本](#证书自动续期-cron-脚本)
5. [验证与排错](#验证与排错)

---

## 方案一：Let's Encrypt + certbot 自动签发与续期

### 1.1 前置条件

- 服务器 80/443 端口已开放
- 域名 `zt.shentongapi.cn` 的 A 记录已指向服务器 IP
- Nginx 已停止或 80 端口可用（用于 ACME HTTP-01 验证）

### 1.2 安装 certbot

```bash
# Ubuntu/Debian
apt update && apt install -y certbot python3-certbot-nginx

# CentOS/RHEL
yum install -y certbot python3-certbot-nginx

# Docker 方式（推荐，不污染宿主机）
# 见下方 1.4 节
```

### 1.3 签发证书（standalone 模式）

> 需临时停止 Nginx 以释放 80 端口

```bash
# 停止 Nginx
docker compose stop nginx  # 或 systemctl stop nginx

# 签发证书
certbot certonly \
  --standalone \
  -d zt.shentongapi.cn \
  --email admin@shentongapi.cn \
  --agree-tos \
  --no-eff-email \
  --non-interactive

# 证书生成位置：
# /etc/letsencrypt/live/zt.shentongapi.cn/fullchain.pem
# /etc/letsencrypt/live/zt.shentongapi.cn/privkey.pem

# 重新启动 Nginx
docker compose start nginx
```

### 1.4 Docker 环境签发（推荐）

在 `docker-compose.yml` 中添加 certbot 一次性服务：

```yaml
  certbot:
    image: certbot/certbot:latest
    container_name: shentong-certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/usr/share/nginx/html
    command: certonly --webroot -w /usr/share/nginx/html -d zt.shentongapi.cn --email admin@shentongapi.cn --agree-tos --no-eff-email --non-interactive
    depends_on:
      - nginx
```

Nginx 配置中已包含 ACME challenge 路径：

```nginx
location /.well-known/acme-challenge/ {
    root /usr/share/nginx/html;
}
```

执行签发：

```bash
docker compose run --rm certbot
```

### 1.5 将证书挂载到 Nginx 容器

在 `docker-compose.yml` 的 nginx 服务中添加卷映射：

```yaml
  nginx:
    volumes:
      - ./certbot/conf/live/zt.shentongapi.cn/fullchain.pem:/etc/nginx/ssl/zt.shentongapi.cn.crt:ro
      - ./certbot/conf/live/zt.shentongapi.cn/privkey.pem:/etc/nginx/ssl/zt.shentongapi.cn.key:ro
      - ./certbot/conf:/etc/letsencrypt:ro  # 续期时需要
```

---

## 方案二：手动放置商业证书

适用于购买商业 SSL 证书（如 DigiCert、GeoTrust、阿里云 SSL 等）的场景。

### 2.1 准备证书文件

从证书供应商处下载以下文件：

| 文件 | 说明 | 对应 Nginx 指令 |
|------|------|-----------------|
| `fullchain.pem` / `.crt` | 证书链（含中间证书） | `ssl_certificate` |
| `privkey.pem` / `.key` | 私钥文件 | `ssl_certificate_key` |

### 2.2 放置证书

```bash
# 创建 SSL 目录
mkdir -p deploy/ssl

# 复制证书文件
cp /path/to/your/fullchain.crt deploy/ssl/zt.shentongapi.cn.crt
cp /path/to/your/private.key deploy/ssl/zt.shentongapi.cn.key

# 设置权限
chmod 644 deploy/ssl/zt.shentongapi.cn.crt
chmod 600 deploy/ssl/zt.shentongapi.cn.key
```

### 2.3 Docker 挂载

在 `docker-compose.yml` 中：

```yaml
  nginx:
    volumes:
      - ./deploy/ssl/zt.shentongapi.cn.crt:/etc/nginx/ssl/zt.shentongapi.cn.crt:ro
      - ./deploy/ssl/zt.shentongapi.cn.key:/etc/nginx/ssl/zt.shentongapi.cn.key:ro
```

### 2.4 验证证书链

```bash
# 检查证书信息
openssl x509 -in deploy/ssl/zt.shentongapi.cn.crt -text -noout | head -20

# 验证证书与私钥匹配
openssl x509 -noout -modulus -in deploy/ssl/zt.shentongapi.cn.crt | openssl md5
openssl rsa  -noout -modulus -in deploy/ssl/zt.shentongapi.cn.key | openssl md5
# 两个 MD5 值应该相同
```

---

## Nginx SSL 最佳实践配置

以下配置已集成到 `nginx.conf` 中，此处为完整参考和说明：

### 3.1 推荐 SSL 配置块

```nginx
# ---------- HTTPS 主服务 ----------
server {
    listen 443 ssl;
    http2 on;
    server_name zt.shentongapi.cn;

    # ---------- SSL 证书 ----------
    ssl_certificate     /etc/nginx/ssl/zt.shentongapi.cn.crt;
    ssl_certificate_key /etc/nginx/ssl/zt.shentongapi.cn.key;

    # ---------- TLS 协议版本 ----------
    # 仅允许 TLS 1.2 和 1.3，禁用 TLS 1.0/1.1（已不安全）
    ssl_protocols TLSv1.2 TLSv1.3;

    # ---------- Cipher Suite ----------
    # TLS 1.2 推荐套件（Mozilla Intermediate 兼容性方案 2024）
    # TLS 1.3 由 OpenSSL 自动选择，无需手动配置
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # ---------- 会话缓存 ----------
    # 缓存 SSL 会话以提升握手性能
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # ---------- OCSP Stapling ----------
    # 启用 OCSP 装订，减少客户端验证延迟
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # ---------- HSTS ----------
    # 强制浏览器在未来 1 年内只通过 HTTPS 访问
    # includeSubDomains: 覆盖所有子域名
    # preload: 允许提交到 HSTS Preload List
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # ---------- 其他安全头 ----------
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ... 其余 location 配置 ...
}
```

### 3.2 配置要点说明

| 配置项 | 说明 |
|--------|------|
| `http2 on` | 启用 HTTP/2，提升多路复用性能 |
| `TLSv1.2 TLSv1.3` | 禁用旧协议，TLS 1.3 提供前向安全 |
| `ECDHE-*` 套件 | 使用前向加密，密钥泄露不影响历史流量 |
| `ssl_prefer_server_ciphers off` | TLS 1.3 最佳实践，让客户端选择 |
| `ssl_stapling on` | OCSP 装订，加速证书验证 |
| HSTS `max-age=31536000` | 1 年 HTTPS 强制，防止 SSL Strip 攻击 |

### 3.3 SSL 评级验证

部署完成后，使用以下工具验证 SSL 配置评级（目标 A+）：

- [SSL Labs](https://www.ssllabs.com/ssltest/analyze.html?d=zt.shentongapi.cn)
- [Mozilla Observatory](https://observatory.mozilla.org/)

---

## 证书自动续期 Cron 脚本

### 4.1 Let's Encrypt 续期脚本

Let's Encrypt 证书有效期为 90 天，建议每 60 天自动续期。

创建脚本 `deploy/renew-ssl.sh`：

```bash
#!/usr/bin/env bash
# =============================================================================
# 深瞳AI SSL 证书自动续期脚本
# 域名：zt.shentongapi.cn
# 频率：每月 1 日和 15 日凌晨 3:00 执行
# =============================================================================
set -euo pipefail

DOMAIN="zt.shentongapi.cn"
COMPOSE_DIR="/opt/shentong"  # ← 请修改为实际 docker-compose.yml 所在目录
LOG_FILE="/var/log/ssl-renew.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] 开始 SSL 证书续期检查..." >> "$LOG_FILE"

# 使用 Docker 方式续期
cd "$COMPOSE_DIR"

docker compose run --rm certbot renew --quiet

# 检查续期结果
if [ $? -eq 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] 证书续期成功，重载 Nginx..." >> "$LOG_FILE"
    docker compose exec nginx nginx -s reload
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Nginx 重载完成" >> "$LOG_FILE"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] 证书续期失败！" >> "$LOG_FILE"
    # 发送告警通知（可选：接入企业微信/钉钉机器人）
    # curl -X POST "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY" \
    #   -H 'Content-Type: application/json' \
    #   -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"⚠️ SSL证书续期失败！域名：$DOMAIN，请立即检查！\"}}"
    exit 1
fi
```

### 4.2 设置 Cron 定时任务

```bash
# 赋予执行权限
chmod +x deploy/renew-ssl.sh

# 编辑 root crontab
crontab -e

# 添加以下行 — 每月 1 日和 15 日凌晨 3:00 执行
0 3 1,15 * * /opt/shentong/deploy/renew-ssl.sh >> /var/log/ssl-renew.log 2>&1
```

### 4.3 手动测试续期

```bash
# 模拟续期（不实际执行，仅检查是否需要续期）
docker compose run --rm certbot renew --dry-run
```

---

## 验证与排错

### 5.1 验证 SSL 配置

```bash
# 检查 Nginx 配置语法
docker compose exec nginx nginx -t

# 验证证书链
openssl s_client -connect zt.shentongapi.cn:443 -servername zt.shentongapi.cn < /dev/null 2>/dev/null | openssl x509 -text -noout | head -30

# 检查 HSTS 头
curl -sI https://zt.shentongapi.cn | grep -i strict-transport

# 检查 TLS 版本
nmap --script ssl-enum-ciphers -p 443 zt.shentongapi.cn
```

### 5.2 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `nginx: [emerg] cannot load certificate` | 证书文件路径错误或不存在 | 检查 docker-compose volumes 挂载路径 |
| SSL Labs 评级 B | 缺少 HSTS 或使用了弱 cipher | 确认 HSTS 头已添加，cipher suite 使用 Mozilla Intermediate |
| 证书过期未续期 | cron 未执行或 certbot 容器异常 | 检查 `/var/log/ssl-renew.log`，手动执行 `certbot renew` |
| OCSP Stapling 失败 | resolver 无法访问或证书缺中间证书 | 确认 resolver 可达，fullchain.pem 包含中间证书 |
| HTTP/2 未生效 | Nginx 版本过低 | 使用 Nginx 1.25.1+，使用 `http2 on;` 指令 |

---

## 当前 nginx.conf SSL 配置审计结果

✅ 已配置项：
- [x] SSL 证书路径正确 (`/etc/nginx/ssl/zt.shentongapi.cn.crt`)
- [x] TLS 1.2 + 1.3 协议
- [x] HSTS (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- [x] 安全响应头 (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy)
- [x] HTTP → HTTPS 301 重定向
- [x] ACME challenge 路径
- [x] HTTP/2 启用
- [x] SSL 会话缓存

⚠️ 建议改进项（已在本文档最佳实践中标注）：
- [ ] Cipher suite 替换为 Mozilla Intermediate 2024 推荐套件
- [ ] `ssl_prefer_server_ciphers` 改为 `off`（TLS 1.3 最佳实践）
- [ ] 添加 OCSP Stapling 配置
- [ ] HSTS 添加 `preload` 指令
- [ ] 添加 `ssl_dhparam` （如使用 DHE 套件）
