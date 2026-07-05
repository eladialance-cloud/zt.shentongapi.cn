# Tasks

## 用户端一键打包

- [x] Task 1: 创建 `desktop/.env.production` 配置文件
  - [x] SubTask 1.1: 新建 `desktop/.env.production`,默认 `VITE_API_BASE_URL=https://api.shentong.ai/api`
  - [x] SubTask 1.2: 修改 `desktop/.gitignore`,确保 `.env.production` 不被忽略(生产配置可提交)
  - [x] SubTask 1.3: 修改 `desktop/electron.vite.config.ts`,优先加载 `.env.production`

- [x] Task 2: 实现 `desktop/scripts/generate-latest-yml.ts`
  - [x] SubTask 2.1: 读取 `package.json` 版本号
  - [x] SubTask 2.2: 扫描 `dist/installer/` 找到 `.exe` / `.dmg` 文件
  - [x] SubTask 2.3: 使用 `node:crypto` 计算 SHA-512 哈希
  - [x] SubTask 2.4: 使用 `fs.statSync` 获取文件大小
  - [x] SubTask 2.5: 生成 `latest.yml` 内容(version / files / path / sha512 / releaseDate)
  - [x] SubTask 2.6: 写入 `dist/installer/latest.yml`,控制台输出摘要

- [x] Task 3: 实现 `desktop/scripts/verify-installer.ts`
  - [x] SubTask 3.1: 校验 `dist/installer/` 下安装包文件存在性
  - [x] SubTask 3.2: 校验 `latest.yml` 存在且可解析(使用 `js-yaml` 或简易 YAML 解析)
  - [x] SubTask 3.3: 重新计算安装包 SHA-512,与 `latest.yml` 比对
  - [x] SubTask 3.4: 校验体积在 50MB-500MB 区间(超出警告,不中断)
  - [x] SubTask 3.5: 输出校验报告,失败则退出码 1

- [x] Task 4: 创建 `desktop/scripts/build-installer.ps1`(Windows 一键打包)
  - [x] SubTask 4.1: 参数解析 `-Target win|mac|all`、`-Version`、`-ApiBase`
  - [x] SubTask 4.2: 步骤 1 - `npm run typecheck`
  - [x] SubTask 4.3: 步骤 2 - `npm run fetch-runtime -- --$Target`
  - [x] SubTask 4.4: 步骤 3 - 若提供 `-ApiBase`,写入 `.env.production`
  - [x] SubTask 4.5: 步骤 4 - `npm run build`
  - [x] SubTask 4.6: 步骤 5 - `electron-builder --$Target`
  - [x] SubTask 4.7: 步骤 6 - `tsx scripts/generate-latest-yml.ts`
  - [x] SubTask 4.8: 步骤 7 - `tsx scripts/verify-installer.ts`
  - [x] SubTask 4.9: 任一步骤失败则中断,输出错误并退出码 1
  - [x] SubTask 4.10: 输出最终打包报告

- [x] Task 5: 创建 `desktop/scripts/build-installer.sh`(Mac/Linux 一键打包)
  - [x] SubTask 5.1: 参数解析 `--target win|mac|all`、`--version`、`--api-base`
  - [x] SubTask 5.2: 与 Task 4 相同的 7 步流程(Bash 实现)
  - [x] SubTask 5.3: 设置 `set -e` 严格错误模式

- [x] Task 6: 修改 `desktop/package.json` 添加 pack 脚本
  - [x] SubTask 6.1: 新增 `"pack:win": "powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -Target win"`
  - [x] SubTask 6.2: 新增 `"pack:mac": "bash scripts/build-installer.sh --target mac"`
  - [x] SubTask 6.3: 新增 `"pack:all": "bash scripts/build-installer.sh --target all"`
  - [x] SubTask 6.4: 新增 `"gen-latest-yml": "tsx scripts/generate-latest-yml.ts"`
  - [x] SubTask 6.5: 新增 `"verify-installer": "tsx scripts/verify-installer.ts"`

## 后端云服务器部署

- [x] Task 7: 创建 `backend/.dockerignore`
  - [x] SubTask 7.1: 排除 `node_modules/`、`dist/`、`.git/`
  - [x] SubTask 7.2: 排除 `.env`(敏感配置)、`*.log`、`start_stdout.txt`、`start_stderr.txt`
  - [x] SubTask 7.3: 保留 `src/`、`database/`、`sql/`、`package.json`、`package-lock.json`、`tsconfig.json`、`nest-cli.json`、`.env.example`

- [x] Task 8: 创建 `backend/Dockerfile`(多阶段构建)
  - [x] SubTask 8.1: Stage 1 `base` - `FROM node:20-alpine AS base`,设置工作目录 `/app`
  - [x] SubTask 8.2: Stage 1 - 复制 `package.json` + `package-lock.json`,执行 `npm install`
  - [x] SubTask 8.3: Stage 1 - 复制 `tsconfig.json` + `nest-cli.json` + `src/`,执行 `npm run build`
  - [x] SubTask 8.4: Stage 2 `prod` - `FROM node:20-alpine AS prod`,设置工作目录 `/app`
  - [x] SubTask 8.5: Stage 2 - 复制 `package.json` + `package-lock.json`,执行 `npm install --production`
  - [x] SubTask 8.6: Stage 2 - 从 Stage 1 复制 `dist/`
  - [x] SubTask 8.7: Stage 2 - `EXPOSE 3001` + `CMD ["node", "dist/main.js"]`

- [x] Task 9: 创建 `docker-compose.yml`(项目根目录)
  - [x] SubTask 9.1: 定义自定义网络 `shentong-net`(driver: bridge)
  - [x] SubTask 9.2: `mysql` 服务 - `mysql:8.0`,环境变量 `MYSQL_ROOT_PASSWORD` / `MYSQL_DATABASE=ai_agent`,持久化卷 `mysql_data:/var/lib/mysql`,挂载 `./backend/database/init.sql:/docker-entrypoint-initdb.d/init.sql`,健康检查 `mysqladmin ping`,restart `unless-stopped`
  - [x] SubTask 9.3: `redis` 服务 - `redis:7-alpine`,命令 `redis-server --requirepass ${REDIS_PASSWORD}`,持久化卷 `redis_data:/data`,健康检查 `redis-cli -a ${REDIS_PASSWORD} ping`,restart `unless-stopped`
  - [x] SubTask 9.4: `backend` 服务 - `build: ./backend`,depends_on mysql(healthy) + redis(healthy),env_file `.env`,暴露端口 `3001:3001`,restart `unless-stopped`
  - [x] SubTask 9.5: `nginx` 服务 - `nginx:alpine`,depends_on backend,挂载 `./deploy/nginx.conf:/etc/nginx/conf.d/default.conf` + `./updates:/usr/share/nginx/html/desktop`,暴露端口 `80:80` + `443:443`,restart `unless-stopped`
  - [x] SubTask 9.6: 定义卷 `mysql_data` + `redis_data`

- [x] Task 10: 创建 `deploy/nginx.conf`
  - [x] SubTask 10.1: API 服务 `server` 块 - `listen 80`,`server_name api.shentong.ai`
  - [x] SubTask 10.2: `/api/` location - `proxy_pass http://backend:3001`,设置 Host/X-Real-IP/X-Forwarded-For 头
  - [x] SubTask 10.3: `/api/socket.io/` location - WebSocket 升级头(`Upgrade` / `Connection`)+ `proxy_read_timeout 86400`
  - [x] SubTask 10.4: `client_max_body_size 100M`
  - [x] SubTask 10.5: 更新服务 `server` 块 - `listen 80`,`server_name update.shentong.ai`
  - [x] SubTask 10.6: `/desktop/` location - `alias /usr/share/nginx/html/desktop/`,`autoindex on`,`add_header Access-Control-Allow-Origin *`

- [x] Task 11: 创建 `deploy/deploy.sh`(一键部署脚本)
  - [x] SubTask 11.1: `#!/bin/bash` + `set -e`
  - [x] SubTask 11.2: 检查 `docker` 与 `docker compose` 命令存在性(缺失则报错退出)
  - [x] SubTask 11.3: 检查 `.env` 存在,不存在则 `cp .env.example .env` 并提示修改
  - [x] SubTask 11.4: 执行 `docker compose up -d --build`
  - [x] SubTask 11.5: 等待 mysql 健康检查通过(轮询 `docker inspect` health 状态,超时 60 秒)
  - [x] SubTask 11.6: 等待 redis 健康检查通过(同上)
  - [x] SubTask 11.7: 轮询 `http://localhost:3001/api/health`(超时 30 秒)
  - [x] SubTask 11.8: 输出部署结果(访问地址、Swagger 地址、注意事项)

- [x] Task 12: 创建 `deploy/upload-files.md`(上传文件清单文档)
  - [x] SubTask 12.1: 列出必须上传的文件与目录(`backend/`、`docker-compose.yml`、`deploy/`、`desktop/dist/installer/`)
  - [x] SubTask 12.2: 列出必须排除的目录(`node_modules/`、`dist/`、`.git/`、`.trae/`、`*.md`)
  - [x] SubTask 12.3: 提供服务器目录结构建议(`/opt/shentong/`)
  - [x] SubTask 12.4: 提供 `scp` 上传命令示例
  - [x] SubTask 12.5: 提供 `rsync` 上传命令示例(推荐)
  - [x] SubTask 12.6: 说明部署后步骤(修改 .env、运行 deploy.sh)

# Task Dependencies
- Task 2 必须先于 Task 3(校验脚本依赖 latest.yml 生成)
- Task 4 与 Task 5 依赖 Task 2 + Task 3(打包脚本调用生成与校验)
- Task 6 依赖 Task 4 + Task 5(脚本就绪后注册到 package.json)
- Task 8 与 Task 9 可并行(Dockerfile 与 compose 独立)
- Task 10 与 Task 11 可并行(Nginx 配置与部署脚本独立)
- Task 12 依赖 Task 9 + Task 10(文档需引用 compose 与 nginx 结构)
