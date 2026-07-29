# V0.5.0 服务器部署修复记录

## 时间
2026-07-27 17:36 GMT+8

## 部署结果
- **后端 API**: ✅ 运行中，systemd 托管（shentong-backend.service），开机自启
- **管理后台**: ✅ https://zt.shentongapi.cn/admin/ 返回 200
- **桌面端更新**: ✅ https://zt.shentongapi.cn/desktop/latest.yml 返回 v0.5.0
- **MySQL/Redis/Qdrant**: ✅ Docker 运行中，healthy
- **Nginx + SSL**: ✅ 宝塔面板管理，证书在 /www/server/panel/vhost/cert/zt.shentongapi.cn/

## 修复的问题

### 1. src/src 嵌套目录
- 解压 backend-v0.5.0.tar.gz 时路径重复，产生 /opt/shentong/backend/src/src/
- 清理：rm -rf src/src src_backup_20260726_200840

### 2. NestJS 模块依赖注入失败（3 个模块）
- **CreditsModule**: 缺 ModelEntity, AgentEntity（PricingService 注入），缺 UserModule（UserService 注入）
- **AdminWorkflowModule**: 缺 N8nWorkflowLibEntity, N8nWorkflowExecLogEntity, WorkflowMcpBindEntity；缺 AdminWorkflowLibService 注册
- **AdminAgentModule**: 缺 AgentDepartmentEntity, AgentTagEntity, AgentTagMapEntity

### 3. Docker 构建极慢
- 原因：COPY node_modules 189MB 传构建上下文到 Docker 构建器极慢
- 解决：改为宿主机直接 node dist/main.js，用 systemd 托管

### 4. Docker backend 容器用旧镜像
- 容器内代码是旧的，每次代码更新需重建镜像，但构建太慢
- 解决：停掉 Docker backend 容器，改用 systemd service

### 5. SSL 证书找不到
- Docker nginx 配置指向 /etc/nginx/ssl/ 但证书实际在宝塔面板目录
- 发现：服务器一直用宝塔 nginx 做 SSL 反向代理，不是 Docker nginx
- 解决：停掉 Docker nginx，恢复宝塔 nginx（配置在 /www/server/panel/vhost/nginx/zt.shentongapi.cn.conf）

### 6. DB_HOST=mysql 无法解析
- .env 中 DB_HOST=mysql 是 Docker 容器名，宿主机 node 进程无法解析
- 解决：sed -i 's/^DB_HOST=mysql/DB_HOST=127.0.0.1/' /opt/shentong/.env

### 7. Redis WRONGPASS
- REDIS_URL 格式 redis://password@host:port 不被 Redis 7 接受
- 解决：改为 redis://default:password@host:6379

### 8. systemd service 文件格式错误
- cat heredoc 吞了 [Unit]/[Service]/[Install] section header
- 解决：改用 printf 逐行写入

## 当前架构

```
客户端 → 宝塔 nginx (80/443, SSL) → 127.0.0.1:3001 (node dist/main.js, systemd)
                                   → /admin/ (静态文件)
                                   → /desktop/ (安装包下载)
Docker: MySQL (3306), Redis (6379), Qdrant (6333)
```

## 关键文件
- systemd service: /etc/systemd/system/shentong-backend.service
- 宝塔 nginx 配置: /www/server/panel/vhost/nginx/zt.shentongapi.cn.conf
- SSL 证书: /www/server/panel/vhost/cert/zt.shentongapi.cn/
- 后端代码: /opt/shentong/backend/
- 环境变量: /opt/shentong/.env (DB_HOST 已改为 127.0.0.1)
- Docker 编排: /opt/shentong/docker-compose.yml (backend 和 nginx 不再用 Docker)
