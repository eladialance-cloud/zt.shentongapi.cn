# Checklist

## 用户端一键打包

- [x] `desktop/.env.production` 文件存在,包含 `VITE_API_BASE_URL` 配置
- [x] `desktop/.gitignore` 未排除 `.env.production`(允许提交)
- [x] `desktop/electron.vite.config.ts` 优先加载 `.env.production`,渲染进程可通过 `import.meta.env.VITE_API_BASE_URL` 读取
- [x] `desktop/scripts/generate-latest-yml.ts` 存在且可执行
- [x] `generate-latest-yml.ts` 输出的 `latest.yml` 包含 version / files / path / sha512 / releaseDate 字段
- [x] `generate-latest-yml.ts` 计算的 SHA-512 与 `sha512sum` 命令结果一致
- [x] `desktop/scripts/verify-installer.ts` 存在且可执行
- [x] `verify-installer.ts` 能检测到安装包缺失并退出码 1
- [x] `verify-installer.ts` 能检测到 SHA-512 不匹配并退出码 1
- [x] `desktop/scripts/build-installer.ps1` 存在,支持 `-Target` / `-Version` / `-ApiBase` 参数
- [x] `desktop/scripts/build-installer.sh` 存在,支持 `--target` / `--version` / `--api-base` 参数
- [x] `desktop/package.json` 包含 `pack:win` / `pack:mac` / `pack:all` / `gen-latest-yml` / `verify-installer` 脚本
- [ ] 执行 `npm run pack:win` 后,`desktop/dist/installer/` 目录包含 `.exe` 安装包与 `latest.yml` <!-- SKIPPED: 需要完整 electron-builder 环境 + 运行时下载,当前环境无法执行实际打包 -->
- [x] 打包脚本任一步骤失败时,退出码为 1 并中断后续步骤

## 后端云服务器部署

- [x] `backend/.dockerignore` 存在,排除 `node_modules/` / `dist/` / `.env` / `*.log` / `start_*.txt`
- [x] `backend/Dockerfile` 存在,使用多阶段构建(`node:20-alpine`)
- [x] Dockerfile Stage 1 执行 `npm install` + `npm run build`
- [x] Dockerfile Stage 2 仅复制 `dist/` + 生产依赖,`CMD ["node", "dist/main.js"]`
- [ ] `docker compose build` 成功构建 `shentong-backend` 镜像,体积 < 300MB <!-- SKIPPED: 需要 Docker 环境,当前为 Windows 静态验证环境 -->
- [x] `docker-compose.yml` 存在于项目根目录
- [x] docker-compose 定义 `mysql` / `redis` / `backend` / `nginx` 四个服务
- [x] mysql 服务挂载 `init.sql` 到 `/docker-entrypoint-initdb.d/`,持久化卷 `mysql_data`
- [x] redis 服务启用密码保护,持久化卷 `redis_data`
- [x] backend 服务 depends_on mysql(healthy) + redis(healthy),env_file `.env`
- [x] nginx 服务挂载 `deploy/nginx.conf` 与 `updates/` 目录
- [x] `deploy/nginx.conf` 存在,包含 API 反向代理 + WebSocket 升级 + 下载站配置
- [x] Nginx `/api/socket.io/` location 包含 `proxy_set_header Upgrade $http_upgrade` 与 `Connection "upgrade"`
- [x] Nginx 下载站 location 包含 `Access-Control-Allow-Origin *`
- [x] `deploy/deploy.sh` 存在,可执行(`chmod +x`)
- [x] `deploy.sh` 检查 Docker 与 Docker Compose 是否安装
- [x] `deploy.sh` 在 `.env` 不存在时自动从 `.env.example` 复制
- [x] `deploy.sh` 执行 `docker compose up -d --build` 后等待服务就绪
- [x] `deploy/upload-files.md` 存在,列出必须上传的文件与目录
- [x] `upload-files.md` 列出必须排除的目录
- [x] `upload-files.md` 提供 `scp` 与 `rsync` 上传命令示例
- [x] `upload-files.md` 提供服务器目录结构建议

## 端到端验证

- [ ] 本地执行 `cd desktop && npm run pack:win` 成功产出安装包与 latest.yml <!-- SKIPPED: 需要 electron-builder 运行时环境与 Windows 打包工具链 -->
- [ ] 本地执行 `cd desktop && npm run verify-installer` 退出码 0 <!-- SKIPPED: 依赖先执行 pack:win 产出安装包 -->
- [ ] 本地执行 `docker compose up -d --build` 成功启动全栈 <!-- SKIPPED: 需要 Docker 环境 -->
- [ ] 浏览器访问 `http://localhost/api/health` 返回 `{ code: 0, data: { status: 'ok' } }` <!-- SKIPPED: 需要部署运行后访问 -->
- [ ] 浏览器访问 `http://localhost/api/docs` 可见 Swagger 文档 <!-- SKIPPED: 需要部署运行后访问 -->
- [ ] 执行 `docker compose down`(不加 `-v`)后,`docker compose up -d` 数据恢复 <!-- SKIPPED: 需要 Docker 环境与已持久化数据 -->
