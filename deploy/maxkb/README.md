# MaxKB 部署指南（Phase 0）

> 目标：在 4C8G 服务器上部署 MaxKB 知识库引擎，并接入深瞳AI 后端。
> 文件：本目录下的 `docker-compose.yml`、`nginx-kb.conf`。
> ⚠️ 以官方文档为准：https://github.com/1Panel-dev/MaxKB （本目录配置为单机版标准部署，端口映射改 3003）

## 1. 服务器上放文件并启动

```bash
sudo -i
mkdir -p /opt/maxkb
cd /opt/maxkb
# 方式A：直接复制本仓库 deploy/maxkb/ 下的 docker-compose.yml 到这里
# 方式B：从官方仓库拉取（网络不稳时用方式A）
#   wget https://raw.githubusercontent.com/1Panel-dev/MaxKB/main/docker-compose.yml

# 改端口映射：把 8080:8080 改成 3003:8080（本仓库已改好）
docker compose up -d
sleep 15
docker ps | grep maxkb   # 状态应为 Up
docker logs --tail 50 maxkb   # 确认无 ERROR
```

## 2. 初始化 MaxKB（浏览器操作一次）

1. 打开 `http://服务器IP:3003`，首次访问注册管理员账号（记好账号密码）
2. 左侧「系统管理 → 模型管理」配置模型：
   - 嵌入模型（Embedding）：选你们模型代理的 OpenAI 兼容接口，模型名如 `text-embedding-3-small`
   - 对话模型（Chat）：同上，选你们代理里的对话模型（如 `deepseek-chat`）
   - 两个模型都要填：API 地址（你们模型代理地址）、API Key、模型名称
3. 「系统管理 → API 访问令牌」新建一个 API Key，复制保存（下一步要用）

## 3. 后端接入

```bash
cd /opt/shentong/backend
grep -q "^MAXKB_BASE_URL=" .env || echo "MAXKB_BASE_URL=http://127.0.0.1:3003" >> .env
grep -q "^MAXKB_API_KEY=" .env || echo "MAXKB_API_KEY=第2步复制的Key" >> .env
pkill -9 -f "dist/main.js"; sleep 2
nohup node dist/main.js > server.log 2>&1 &
sleep 8
curl -s http://127.0.0.1:3001/api/health; echo

# 验证引擎连通
TOKEN=$(curl -s http://127.0.0.1:3001/api/admin/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"你的管理密码"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s http://127.0.0.1:3001/api/admin/knowledge-bases/engine-status -H "Authorization: Bearer $TOKEN"; echo
# 期望 {"configured":true,"reachable":true}
```

## 4. 域名反代（可选，推荐）

1. DNS：把 `kb.zt.shentongapi.cn` 解析到服务器 IP
2. 签发证书：
```bash
certbot certonly --webroot -w /usr/share/nginx/html -d kb.zt.shentongapi.cn
# 或沿用现有证书体系（见 deploy/ssl-setup.md）
```
3. 把 `nginx-kb.conf` 复制到 `/etc/nginx/conf.d/kb.conf`，证书路径改成实际路径，然后：
```bash
nginx -t && systemctl reload nginx
curl -s https://kb.zt.shentongapi.cn/ | head -5   # 能看到 MaxKB 页面即成功
```
4. 把后端 `.env` 的 `MAXKB_BASE_URL` 改为 `https://kb.zt.shentongapi.cn` 并重启后端（公网 HTTPS 更稳）：
```bash
sed -i "s|^MAXKB_BASE_URL=.*|MAXKB_BASE_URL=https://kb.zt.shentongapi.cn|" /opt/shentong/backend/.env
pkill -9 -f "dist/main.js"; sleep 2
cd /opt/shentong/backend && nohup node dist/main.js > server.log 2>&1 &
sleep 8
curl -s http://127.0.0.1:3001/api/health; echo
```

## 5. 上线前自测

```bash
# 管理后台建一个官方知识库（应自动在 MaxKB 建数据集）
TOKEN=$(curl -s http://127.0.0.1:3001/api/admin/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"你的管理密码"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s http://127.0.0.1:3001/api/admin/knowledge-bases -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"上线自测库","visibility":"public"}'; echo

# 传一个 txt 文档（用上面返回的 id）
echo "深瞳AI 的知识库引擎自测内容" > /tmp/test.txt
curl -s -X POST http://127.0.0.1:3001/api/admin/knowledge-bases/1/documents -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/test.txt"; echo

# 发布并检索
curl -s -X POST http://127.0.0.1:3001/api/admin/knowledge-bases/1/publish -H "Authorization: Bearer $TOKEN"; echo
sleep 30   # 等引擎索引完成
curl -s http://127.0.0.1:3001/api/knowledge/official -H "Authorization: Bearer $TOKEN"; echo
```

## 6. 常见问题

- 引擎状态显示 unreachable：检查 3003 端口是否监听、防火墙是否放行、`MAXKB_API_KEY` 是否正确
- 上传文档后 `engine_status=failed`：看 `server.log` 里 `MaxKB` 报错，多半是端点路径/字段与当前版本不一致，把报错贴回来我按实际接口调 `maxkb.client.ts`
- 磁盘空间：MaxKB 数据在 docker volume，定期 `docker system df` 查看
