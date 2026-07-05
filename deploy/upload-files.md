# 深瞳AI 云端部署 - 上传文件清单

## 一、必须上传的文件

### 1. 后端源码(`backend/` 整个目录)

```
backend/
  ├─ src/                    # NestJS 源码
  ├─ database/
  │   ├─ init.sql            # 数据库初始化脚本(必传)
  │   └─ seed.sql            # 种子数据(必传)
  ├─ sql/                    # 补充 SQL 脚本
  ├─ package.json            # 依赖清单
  ├─ package-lock.json       # 依赖锁定
  ├─ tsconfig.json           # TypeScript 配置
  ├─ nest-cli.json           # NestJS 配置
  ├─ .env.example            # 环境变量示例
  ├─ .dockerignore           # Docker 构建忽略
  └─ Dockerfile              # 多阶段构建文件
```

### 2. Docker 编排文件(项目根目录)

```
docker-compose.yml           # 全栈编排(MySQL + Redis + 后端 + Nginx)
.env.example                 # 环境变量示例(根目录,docker-compose 用)
```

### 3. 部署配置(`deploy/` 目录)

```
deploy/
  ├─ nginx.conf              # Nginx 反向代理配置
  └─ deploy.sh               # 一键部署脚本
```

### 4. 桌面客户端安装包(供用户下载)

打包完成后,上传 `desktop/dist/installer/` 下的所有文件到服务器的 `updates/` 目录:

```
desktop/dist/installer/
  ├─ 深瞳AI-0.1.0-win-x64.exe   # Windows 安装包
  ├─ 深瞳AI-0.1.0-mac-x64.dmg   # Mac Intel 安装包
  ├─ 深瞳AI-0.1.0-mac-arm64.dmg # Mac Apple Silicon 安装包
  └─ latest.yml                  # electron-updater 版本清单(必传)
```

### 5. Landing 站点(`frontend/user/dist/` 目录)

本地构建后上传整个 dist 目录到服务器:

```
frontend/user/dist/
  ├─ index.html
  ├─ assets/
  │   ├─ index-xxxx.js
  │   ├─ index-xxxx.css
  │   └─ ...
  └─ ...
```

**注意**:需在本地先执行 `cd frontend/user && npm run build` 生成 dist 目录,再上传。

## 二、必须排除的文件

以下文件**不要**上传到服务器:

| 目录/文件 | 原因 |
|----------|------|
| `node_modules/` | 服务器上由 `docker compose build` 重建 |
| `dist/` | 服务器上由 Dockerfile 编译生成 |
| `.git/` | 版本控制元数据,不需要 |
| `.trae/` | IDE 配置,不需要 |
| `*.md` 文档 | 非必需,仅 `deploy/upload-files.md` 本身可保留 |
| `frontend/user/` | 旧版 Web 前端,桌面客户端已内置,可选 |
| `desktop/src/` | 桌面客户端源码,本地打包即可 |
| `desktop/electron/` | 同上 |
| `desktop/node_modules/` | 同上 |
| `.env` | 敏感配置,服务器上从 `.env.example` 复制后修改 |
| `start_stdout.txt` / `start_stderr.txt` | 本地调试日志 |

## 三、服务器目录结构建议

```
/opt/shentong/                          # 项目根目录
  ├─ backend/                           # 后端
  │   ├─ src/
  │   ├─ database/
  │   │   ├─ init.sql
  │   │   └─ seed.sql
  │   ├─ sql/
  │   ├─ package.json
  │   ├─ package-lock.json
  │   ├─ tsconfig.json
  │   ├─ nest-cli.json
  │   ├─ .env.example
  │   ├─ .dockerignore
  │   └─ Dockerfile
  ├─ deploy/
  │   ├─ nginx.conf
  │   ├─ deploy.sh
  │   └─ upload-files.md                # 本文档
  ├─ frontend/                          # Landing 站点(新增)
  │   └─ user/
  │       └─ dist/                      # 构建产物(本地 build 后上传)
  │           ├─ index.html
  │           └─ assets/
  ├─ updates/                           # 桌面客户端下载站(nginx 挂载)
  │   ├─ 深瞳AI-0.1.0-win-x64.exe
  │   ├─ 深瞳AI-0.1.0-mac-arm64.dmg
  │   └─ latest.yml
  ├─ docker-compose.yml
  ├─ .env.example
  └─ .env                               # 从 .env.example 复制并修改(不进 Git)
```

## 四、上传命令示例

### 方法 1:使用 scp(简单直接)

```bash
# 上传后端目录
scp -r d:/二次开发/backend user@server:/opt/shentong/

# 上传部署配置
scp -r d:/二次开发/deploy user@server:/opt/shentong/

# 上传 docker-compose 与 .env.example
scp d:/二次开发/docker-compose.yml d:/二次开发/.env.example user@server:/opt/shentong/

# 上传桌面客户端安装包(打包后)
scp d:/二次开发/desktop/dist/installer/* user@server:/opt/shentong/updates/
```

### 方法 2:使用 rsync(推荐,增量同步)

```bash
# 在本地项目根目录执行

# 上传后端(排除 node_modules / dist)
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env' \
  --exclude='start_*.txt' \
  backend/ user@server:/opt/shentong/backend/

# 上传部署配置
rsync -avz deploy/ user@server:/opt/shentong/deploy/

# 上传根目录配置文件
rsync -avz docker-compose.yml .env.example user@server:/opt/shentong/

# 上传桌面客户端安装包(打包后)
rsync -avz --delete desktop/dist/installer/ user@server:/opt/shentong/updates/

# 上传 Landing 站点(本地先构建)
cd d:/二次开发/frontend/user
npm run build
rsync -avz --delete dist/ user@server:/opt/shentong/frontend/user/dist/
```

### 方法 3:使用 Git(推荐,版本可控)

```bash
# 在服务器上
cd /opt
git clone <your-repo-url> shentong
cd shentong

# 后续更新
cd /opt/shentong
git pull
```

## 五、部署后步骤

### 1. 配置环境变量

```bash
ssh user@server
cd /opt/shentong
cp .env.example .env
vi .env
```

**必须修改的项**:
- `MYSQL_ROOT_PASSWORD` — MySQL root 密码(强密码)
- `MYSQL_PASSWORD` — 应用数据库密码(强密码)
- `REDIS_PASSWORD` — Redis 密码(强密码)
- `JWT_SECRET` — JWT 签名密钥(至少 32 字符,使用 `openssl rand -hex 32` 生成)

### 2. 启动服务

```bash
cd /opt/shentong
chmod +x deploy/deploy.sh
bash deploy/deploy.sh
```

### 3. 验证部署

```bash
# 健康检查
curl http://localhost/api/health

# Swagger 文档
curl http://localhost/api/docs

# 查看容器状态
docker compose ps

# 查看后端日志
docker compose logs -f backend
```

### 4. 配置域名 + HTTPS(生产环境)

```bash
# 安装 certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书并自动配置 Nginx
sudo certbot --nginx -d api.shentong.ai -d update.shentong.ai

# 证书自动续期(已由 certbot 配置)
sudo systemctl status certbot.timer
```

### 5. 上传桌面客户端安装包

每次发布新版桌面客户端后:

```bash
# 本地打包
cd d:/二次开发/desktop
npm run pack:win

# 上传到服务器
scp desktop/dist/installer/* user@server:/opt/shentong/updates/

# 或用 rsync 增量同步
rsync -avz desktop/dist/installer/ user@server:/opt/shentong/updates/
```

用户启动客户端时,electron-updater 会自动检查 `https://update.shentong.ai/desktop/latest.yml` 并提示更新。

### 6. 构建并上传 Landing 站点

```bash
# 本地构建
cd d:/二次开发/frontend/user
npm run build

# 上传到服务器
rsync -avz --delete dist/ user@server:/opt/shentong/frontend/user/dist/

# 重启 nginx 加载新静态文件(可选,docker compose 会自动检测)
ssh user@server "cd /opt/shentong && docker compose restart nginx"
```

Landing 站点将通过 `https://zt.shentongapi.cn/` 访问。

## 六、常见问题

### Q: 修改了后端代码如何更新?
A: 上传新的 `backend/src/` 后,在服务器执行:
```bash
cd /opt/shentong
docker compose up -d --build backend
```

### Q: 如何查看数据库?
A: 进入 MySQL 容器:
```bash
docker exec -it shentong-mysql mysql -u root -p
```

### Q: 如何备份数据?
A: 备份 MySQL 数据卷:
```bash
docker run --rm \
  -v shentong-mysql-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/mysql-$(date +%Y%m%d).tar.gz /data
```

### Q: 如何完全重置?
A: 警告:会删除所有数据!
```bash
docker compose down -v
docker compose up -d --build
```
