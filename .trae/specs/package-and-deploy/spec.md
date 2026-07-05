# 一键打包与云端部署 Spec

## Why
目前深瞳AI 桌面客户端虽已完成功能开发与运行时内置,但**缺少一键打包自动化脚本**:开发者需手动执行 `npm run build:win`、手动生成 `latest.yml`、手动注入生产 API 地址,流程繁琐易错。同时**后端云服务器部署完全缺失**:项目无 Dockerfile / docker-compose / 部署脚本 / Nginx 配置,用户无法将后端部署到生产环境。本 spec 旨在提供两条一键命令:`build-installer`(打包桌面安装包)与 `deploy-backend`(部署后端到云服务器),实现开箱即用的交付闭环。

## What Changes

### 用户端一键打包
- **新增一键打包脚本** `desktop/scripts/build-installer.ps1`(Windows)与 `desktop/scripts/build-installer.sh`(Mac/Linux)
  - 自动执行:typecheck → fetch-runtime → build → electron-builder → 生成 latest.yml → 校验产物
  - 支持参数:`-Target win|mac|all`、`-Version <semver>`、`-ApiBase <url>`
- **新增 `latest.yml` 自动生成器** `desktop/scripts/generate-latest-yml.ts`
  - 读取 `package.json` 版本号
  - 计算安装包 SHA-512 哈希(electron-updater 要求)
  - 读取文件大小
  - 输出标准 `latest.yml` 到 `dist/installer/latest.yml`
- **新增生产环境配置注入** `desktop/.env.production`
  - `VITE_API_BASE_URL` 可通过命令行参数或环境变量覆盖
  - `electron.vite.config.ts` 读取 `.env.production` 优先于 `.env`
- **新增打包后校验脚本** `desktop/scripts/verify-installer.ts`
  - 校验 `dist/installer/` 下产物存在性
  - 校验 `latest.yml` 格式与 SHA-512 一致性
  - 校验安装包体积在合理区间(50MB-500MB)
  - 输出打包报告(产物路径、大小、哈希、版本)

### 后端云服务器部署
- **新增 `backend/Dockerfile`** — 多阶段构建,产物镜像 < 300MB
  - Stage 1: `node:20-alpine` 安装依赖 + 编译 TypeScript
  - Stage 2: `node:20-alpine` 仅复制 dist + production node_modules
- **新增 `docker-compose.yml`** — 编排 MySQL 8 + Redis 7 + 后端 + Nginx
  - `mysql` 服务:持久化卷 + 健康检查 + 初始化脚本挂载
  - `redis` 服务:持久化卷 + 密码保护
  - `backend` 服务:依赖 mysql/redis + 环境变量注入 + 重启策略
  - `nginx` 服务:反向代理 + 静态文件服务(安装包下载 + 自动更新)
- **新增 `deploy/nginx.conf`** — Nginx 配置示例
  - API 反向代理(含 WebSocket 升级)
  - 安装包下载站(`update.shentong.ai`)
  - HTTPS 重定向(预留 certbot 接入)
- **新增 `deploy/deploy.sh`** — 一键部署脚本
  - 检查 Docker / Docker Compose 环境
  - 复制 `.env.example` 到 `.env`(若不存在)
  - 提示用户修改 `.env` 中的密码与密钥
  - `docker compose up -d --build`
  - 等待健康检查通过
  - 输出部署结果(访问地址、Swagger 文档地址)
- **新增 `deploy/upload-files.md`** — 上传文件清单
  - 明确列出需上传到服务器的目录与文件
  - 明确排除的目录(node_modules / dist / .git / .trae)
  - 服务器目录结构建议

## Impact
- **Affected specs**:
  - `build-shentong-downloadable-client` — 打包流程从手动升级为自动化,不影响客户端功能
  - `embed-local-services-runtime` — `fetch-runtime.ts` 被 `build-installer` 脚本调用,逻辑不变
  - `deploy-backend-skeleton` — 部署文档与脚本补齐,后端代码不变
- **Affected code**:
  - 新建:`desktop/scripts/build-installer.ps1`、`desktop/scripts/build-installer.sh`
  - 新建:`desktop/scripts/generate-latest-yml.ts`、`desktop/scripts/verify-installer.ts`
  - 新建:`desktop/.env.production`
  - 修改:`desktop/package.json`(新增 `pack:win` / `pack:mac` / `pack:all` 脚本)
  - 修改:`desktop/.gitignore`(忽略 `dist/installer/`、保留 `.env.production`)
  - 新建:`backend/Dockerfile`、`backend/.dockerignore`
  - 新建:`docker-compose.yml`(项目根目录)
  - 新建:`deploy/nginx.conf`、`deploy/deploy.sh`、`deploy/upload-files.md`
- **依赖**:Docker 24+、Docker Compose v2、PowerShell 5+(Windows 打包)、Bash(Mac 打包 + 服务器部署)

## ADDED Requirements

### Requirement: 一键打包脚本
系统 SHALL 提供 `npm run pack:win` / `npm run pack:mac` / `npm run pack:all` 一键命令,自动完成 typecheck → fetch-runtime → build → electron-builder → 生成 latest.yml → 校验产物 全流程,无需人工干预。

#### Scenario: Windows 一键打包
- **WHEN** 开发者在 `desktop/` 目录执行 `npm run pack:win`
- **THEN** 脚本依次执行:
  1. `npm run typecheck`(类型检查,失败则中断)
  2. `npm run fetch-runtime -- --win`(下载 Windows 平台运行时)
  3. `npm run build`(编译主进程 + preload + 渲染进程)
  4. `electron-builder --win`(打包 NSIS 安装程序)
  5. `tsx scripts/generate-latest-yml.ts`(生成 electron-updater 清单)
  6. `tsx scripts/verify-installer.ts`(校验产物完整性)
- **AND** 产物输出到 `desktop/dist/installer/`,包含:
  - `深瞳AI-<version>-win-x64.exe`
  - `latest.yml`
- **AND** 控制台输出打包报告(路径、大小、SHA-512、版本号)
- **AND** 任一步骤失败则中断并返回非零退出码

#### Scenario: 自定义 API 地址打包
- **WHEN** 开发者执行 `npm run pack:win -- --api-base https://api.example.com/api`
- **THEN** 脚本将 `VITE_API_BASE_URL=https://api.example.com/api` 写入 `.env.production`
- **AND** `electron.vite.config.ts` 优先读取 `.env.production`
- **AND** 渲染进程打包后的 `httpClient.baseURL` 为 `https://api.example.com/api`
- **AND** `electron-builder.yml` 的 `publish.url` 同步更新为 `https://update.example.com/desktop/`

### Requirement: latest.yml 自动生成
系统 SHALL 在打包完成后自动生成 `latest.yml` 文件,符合 electron-updater 规范,包含版本号、文件路径、SHA-512 哈希、文件大小、发布日期。

#### Scenario: 生成 latest.yml
- **WHEN** `generate-latest-yml.ts` 脚本执行
- **THEN** 读取 `package.json` 的 `version` 字段
- **AND** 扫描 `dist/installer/` 目录找到安装包文件(`.exe` 或 `.dmg`)
- **AND** 使用 `node:crypto` 计算 SHA-512 哈希
- **AND** 使用 `fs.statSync` 获取文件大小(字节)
- **AND** 生成 `latest.yml` 内容:
  ```yaml
  version: <version>
  files:
    - url: <filename>
      sha512: <hash>
      size: <bytes>
  path: <filename>
  sha512: <hash>
  releaseDate: '<ISO 8601>'
  ```
- **AND** 写入 `dist/installer/latest.yml`
- **AND** 控制台输出哈希与大小摘要

### Requirement: 打包后校验
系统 SHALL 在打包完成后自动校验产物完整性,确保安装包与 latest.yml 一致,体积在合理区间。

#### Scenario: 校验通过
- **WHEN** `verify-installer.ts` 脚本执行
- **THEN** 检查 `dist/installer/` 下存在至少一个安装包文件
- **AND** 检查 `latest.yml` 存在且可解析
- **AND** 重新计算安装包 SHA-512,与 `latest.yml` 中记录的哈希比对
- **AND** 检查安装包体积在 50MB-500MB 区间(超出则警告)
- **AND** 输出校验报告,所有项通过则退出码 0

#### Scenario: 校验失败
- **WHEN** 安装包哈希与 latest.yml 不一致
- **THEN** 输出错误详情(期望哈希 vs 实际哈希)
- **AND** 退出码 1,提示重新打包

### Requirement: 后端 Dockerfile
系统 SHALL 提供多阶段 Dockerfile,将 NestJS 后端容器化,最终镜像体积 < 300MB,启动命令 `node dist/main.js`。

#### Scenario: 构建镜像
- **WHEN** 执行 `docker build -t shentong-backend:1.0.0 backend/`
- **THEN** Stage 1(base)使用 `node:20-alpine`,执行 `npm install` 安装全部依赖
- **AND** Stage 1 执行 `npm run build` 编译 TypeScript 到 `dist/`
- **AND** Stage 2(prod)使用 `node:20-alpine`,仅复制 `dist/` + `package.json` + `package-lock.json`
- **AND** Stage 2 执行 `npm install --production` 安装生产依赖
- **AND** 最终镜像暴露端口 3001
- **AND** 启动命令 `CMD ["node", "dist/main.js"]`
- **AND** 镜像体积 < 300MB

#### Scenario: .dockerignore 排除
- **WHEN** Docker 构建上下文加载
- **THEN** `.dockerignore` 排除:`node_modules`、`dist`、`.git`、`.env`、`*.log`、`start_stdout.txt`、`start_stderr.txt`
- **AND** 仅保留 `src/`、`database/`、`sql/`、`package.json`、`package-lock.json`、`tsconfig.json`、`nest-cli.json`、`.env.example`

### Requirement: docker-compose 编排
系统 SHALL 提供 `docker-compose.yml`,一键编排 MySQL 8 + Redis 7 + 后端 + Nginx,所有服务可通过 `docker compose up -d` 启动。

#### Scenario: 一键启动全栈
- **WHEN** 在项目根目录执行 `docker compose up -d --build`
- **THEN** 启动 `mysql` 服务:MySQL 8.0,持久化卷 `mysql_data`,挂载 `backend/database/init.sql` 到 `/docker-entrypoint-initdb.d/`,健康检查 `mysqladmin ping`
- **AND** 启动 `redis` 服务:Redis 7 Alpine,持久化卷 `redis_data`,密码保护 `requirepass`,健康检查 `redis-cli ping`
- **AND** 启动 `backend` 服务:依赖 mysql(healthy)与 redis(healthy),环境变量从 `.env` 注入,重启策略 `unless-stopped`,暴露端口 3001
- **AND** 启动 `nginx` 服务:依赖 backend,挂载 `deploy/nginx.conf` 与 `updates/` 目录,暴露端口 80/443
- **AND** 所有服务使用同一自定义网络 `shentong-net`

#### Scenario: 数据持久化
- **WHEN** 执行 `docker compose down`(不加 `-v`)
- **THEN** 容器停止并删除
- **AND** `mysql_data` 与 `redis_data` 卷保留,数据不丢失
- **AND** 重新 `docker compose up -d` 后数据恢复

### Requirement: Nginx 反向代理配置
系统 SHALL 提供 Nginx 配置示例,实现 API 反向代理(含 WebSocket)、安装包下载站、HTTPS 预留。

#### Scenario: API 反向代理
- **WHEN** 客户端请求 `https://api.shentong.ai/api/*`
- **THEN** Nginx 反向代理到 `backend:3001`
- **AND** 设置 `Host`、`X-Real-IP`、`X-Forwarded-For` 头
- **AND** WebSocket 路径(`/api/socket.io/`)启用 `Upgrade` / `Connection` 头升级
- **AND`proxy_read_timeout 86400`(长连接)
- **AND** 文件上传 `client_max_body_size 100M`

#### Scenario: 安装包下载站
- **WHEN** 客户端请求 `https://update.shentong.ai/desktop/latest.yml`
- **THEN** Nginx 返回 `updates/latest.yml` 文件
- **AND** 响应头 `Access-Control-Allow-Origin: *`(允许客户端跨域检查更新)
- **AND** 目录列表启用(`autoindex on`)便于浏览

### Requirement: 一键部署脚本
系统 SHALL 提供 `deploy/deploy.sh`,在云服务器上一键部署后端全栈,无需手动操作。

#### Scenario: 首次部署
- **WHEN** 在服务器项目根目录执行 `bash deploy/deploy.sh`
- **THEN** 脚本检查 Docker 与 Docker Compose 是否安装(缺失则报错退出)
- **AND** 检查 `.env` 是否存在,不存在则从 `.env.example` 复制并提示修改密码与密钥
- **AND** 检查 `backend/dist/` 是否存在,不存在则提示先在本地打包或服务器上执行 `docker compose build`
- **AND** 执行 `docker compose up -d --build`
- **AND** 等待 mysql 与 redis 健康检查通过(最多 60 秒)
- **AND** 等待 backend 服务就绪(轮询 `http://localhost:3001/api/health`)
- **AND** 输出部署结果:访问地址、Swagger 文档地址、默认账号

#### Scenario: 更新部署
- **WHEN** 服务器上已有运行中的容器,再次执行 `bash deploy/deploy.sh`
- **THEN** 脚本执行 `docker compose up -d --build`(滚动更新)
- **AND** 仅重建镜像变化的容器
- **AND** 数据卷不受影响

### Requirement: 上传文件清单文档
系统 SHALL 提供 `deploy/upload-files.md`,明确列出需上传到云服务器的文件与目录,以及应排除的内容。

#### Scenario: 开发者查阅上传清单
- **WHEN** 开发者打开 `deploy/upload-files.md`
- **THEN** 文档列出必须上传的文件:
  - `backend/`(整个目录,含 src、database、package.json、.env.example)
  - `docker-compose.yml`
  - `deploy/`(nginx.conf、deploy.sh)
  - `desktop/dist/installer/`(安装包与 latest.yml,供下载)
- **AND** 文档列出必须排除的目录:
  - `node_modules/`、`dist/`(服务器重建)
  - `.git/`、`.trae/`
  - `*.md` 文档(非必需)
  - `frontend/user/`(旧版 Web,可选)
- **AND** 文档提供服务器目录结构建议
- **AND** 文档提供 `scp` 与 `rsync` 上传命令示例

## MODIFIED Requirements

### Requirement: desktop/package.json 脚本
**Modified**: 在现有 `build:win` / `build:mac` 基础上,新增 `pack:win` / `pack:mac` / `pack:all` 一键打包命令,封装完整打包流程。原 `build:win` / `build:mac` 保留作为底层命令。

### Requirement: desktop/electron.vite.config.ts 环境变量加载
**Modified**: 优先加载 `.env.production`(若存在),其次 `.env`,支持 `VITE_API_BASE_URL` 注入到渲染进程。

## REMOVED Requirements
(无移除项,本 spec 为增量补齐打包与部署能力)
