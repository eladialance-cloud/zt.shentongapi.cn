# 单页 Landing 站点改造 Spec

## Why
当前 `frontend/user` 是一个完整的 Web 应用(含 Landing + Dashboard + Chat + Agent + Knowledge + OPC 等用户端模块),但产品定位调整为:**只保留一个营销首页,用户注册后即可下载桌面客户端**。同时域名 `zt.shentongapi.cn` 需指向该首页,首页的"客户端下载"按钮需关联云服务器上的安装包链接。现状是 Landing 已存在但下载按钮无链接,且包含大量未使用的用户端代码。

## What Changes

### 路由精简(**BREAKING**)
- 删除 `frontend/user/src/router/index.tsx` 中所有用户端路由:`/dashboard` 及其子路由(chat/market/creator/knowledge/user/opc 等)
- 根路径 `/` 改为始终显示 Landing(移除 `AuthenticatedRoute` 重定向到 `/dashboard` 的逻辑)
- 保留 3 条路由:`/`(Landing)、`/login`、`/register`
- 注册成功后跳转回 `/`(Landing),不再跳转 Dashboard

### 页面与代码删除(**BREAKING**)
- 删除用户端页面目录:`pages/Dashboard/`、`pages/chat/`、`pages/agent/`、`pages/knowledge/`、`pages/user/`、`pages/opc/`
- 删除用户端布局:`components/MainLayout/`、`components/PageSkeleton/`
- 删除业务组件:`components/AgentCard/`、`components/ChatMessage/`、`components/DataForm/`、`components/DataTable/`
- 删除业务 store:`store/agent.ts`、`store/chat.ts`、`store/knowledge.ts`、`store/opc.ts`、`store/user-center.ts`、`store/user.ts`、`store/settings.ts`(保留 `store/auth.ts`、`store/index.ts`)
- 删除业务 api:`api/agent.ts`、`api/chat.ts`、`api/knowledge.ts`、`api/opc.ts`、`api/user-center.ts`、`api/user.ts`(保留 `api/auth.ts`、`api/index.ts`)
- 删除业务 types:`types/agent.ts`、`types/chat.ts`、`types/knowledge.ts`、`types/opc.ts`、`types/user-center.ts`、`types/user.ts`(保留 `types/api.ts`、`types/index.ts`)
- 删除未使用的 utils:`utils/mock-data.ts`、`utils/socket.ts`、`utils/useWebSocket`(若存在)
- 删除未使用的 hooks:`hooks/usePagination.ts`、`hooks/useWebSocket.ts`(保留 `hooks/index.ts`、`hooks/useDebounce.ts`)
- 保留组件:`components/ErrorBoundary/`、`components/MarkdownRenderer/`、`components/TechSpinner/`、`components/landing/ParticleMatrix.tsx`

### Landing 页面改造
- **品牌域名更新**:所有 `shentong.ai` → `shentongapi.cn`(邮箱、电话、地址文案)
- **导航栏"客户端下载"按钮**:根据登录态切换行为
  - 未登录:点击跳转 `/register`
  - 已登录:点击平滑滚动到下载区域
- **新增"客户端下载" section**(位于 CTA section 之前):
  - 显示 Windows 下载按钮(关联 `VITE_DOWNLOAD_WIN_URL`)
  - 显示 Mac 下载按钮(关联 `VITE_DOWNLOAD_MAC_URL`)
  - 显示版本号(从 `package.json` 读取)
  - 显示更新日志(简单列表,3-5 条最近更新)
  - 未登录时按钮置灰显示"注册后下载",点击跳转 `/register`
  - 已登录时按钮可点击,`window.open(url, '_blank')` 触发下载
- **CTA section 改造**:"立即开始"按钮改为"立即注册",跳转 `/register`
- **登录态获取**:使用 `useAuthStore` 读取 `isAuthenticated`

### 注册流程改造
- 修改 `pages/Register/index.tsx`:注册成功后自动登录(后端 `/auth/register` 已返回 token),跳转 `/`
- 修改 `pages/Login/index.tsx`:登录成功后跳转 `/`(不再跳转 `/dashboard`)

### 下载链接配置
- 新建 `frontend/user/.env.production`:
  - `VITE_DOWNLOAD_WIN_URL=https://zt.shentongapi.cn/desktop/深瞳AI-0.1.0-win-x64.exe`
  - `VITE_DOWNLOAD_MAC_URL=https://zt.shentongapi.cn/desktop/深瞳AI-0.1.0-mac-arm64.dmg`
  - `VITE_APP_VERSION=0.1.0`
- 修改 `frontend/user/vite.config.ts`:确保 `.env.production` 在 build 时加载

### Nginx 配置新增
- 修改 `deploy/nginx.conf`:新增 `zt.shentongapi.cn` server 块
  - `/` → 静态文件服务,root 指向 `/usr/share/nginx/html/landing/`(挂载 `frontend/user/dist`)
  - `/desktop/` → alias 指向安装包目录(与 `update.shentongapi.cn` 共享)
  - SPA fallback:`try_files $uri $uri/ /index.html`
  - CORS:`/desktop/` 启用 `Access-Control-Allow-Origin *`

### docker-compose.yml 新增 landing 服务
- 新增 `landing` 服务:nginx:alpine,挂载 `frontend/user/dist` + `deploy/nginx.conf`,暴露 80 端口
- 或复用现有 nginx 服务,在 nginx.conf 中新增 server 块(推荐,减少服务数)

### 部署文档更新
- 更新 `deploy/upload-files.md`:新增 `frontend/user/dist/` 上传说明

## Impact
- **Affected specs**:
  - `package-and-deploy` — nginx.conf 与 docker-compose.yml 需同步更新
  - `build-shentong-downloadable-client` — 桌面客户端不受影响,但 Web 端用户端代码删除
- **Affected code**:
  - 修改:`frontend/user/src/router/index.tsx`、`frontend/user/src/pages/Landing/index.tsx`、`frontend/user/src/pages/Landing/styles.module.css`、`frontend/user/src/pages/Register/index.tsx`、`frontend/user/src/pages/Login/index.tsx`、`frontend/user/src/store/index.ts`、`frontend/user/src/api/index.ts`、`frontend/user/src/types/index.ts`、`frontend/user/vite.config.ts`、`frontend/user/package.json`、`deploy/nginx.conf`、`deploy/upload-files.md`
  - 新建:`frontend/user/.env.production`
  - 删除:大量用户端页面/组件/store/api/types 文件(详见 What Changes)
- **保留**:AuthModule 后端接口无需改动(register 已返回 token);桌面客户端不受影响

## ADDED Requirements

### Requirement: 单页 Landing 站点
系统 SHALL 将 `frontend/user` 精简为只有 3 条路由的单页站点:`/`(Landing)、`/login`、`/register`,根路径始终显示 Landing 页面。

#### Scenario: 访客访问根路径
- **WHEN** 未登录用户访问 `https://zt.shentongapi.cn/`
- **THEN** 显示 Landing 首页(8大员工/组织架构/业务飞轮/技术底座/下载区域/CTA/Footer)
- **AND** 顶部"客户端下载"按钮点击跳转 `/register`
- **AND** 下载区域的 Windows/Mac 下载按钮置灰显示"注册后下载",点击跳转 `/register`

#### Scenario: 已注册用户访问根路径
- **WHEN** 已登录用户访问 `https://zt.shentongapi.cn/`
- **THEN** 显示 Landing 首页(同上)
- **AND** 顶部"客户端下载"按钮点击平滑滚动到下载区域
- **AND** 下载区域的 Windows/Mac 下载按钮可点击,点击触发 `window.open(downloadUrl, '_blank')` 下载

#### Scenario: 注册成功后跳转
- **WHEN** 用户在 `/register` 页面完成注册
- **THEN** 后端返回 accessToken + refreshToken
- **AND** 前端 `useAuthStore` 保存 token
- **AND** 跳转到 `/`(Landing 首页)
- **AND** 下载按钮变为可点击状态

### Requirement: 客户端下载区域
Landing 页面 SHALL 在 CTA section 之前新增"客户端下载"区域,展示 Windows/Mac 下载按钮、版本号与更新日志。

#### Scenario: 下载区域展示
- **WHEN** 用户访问 Landing 页面并滚动到下载区域
- **THEN** 显示区域标题"客户端下载"
- **AND** 显示两张下载卡片:Windows 与 Mac
- **AND** 每张卡片显示:操作系统图标、按钮、版本号(`VITE_APP_VERSION`)
- **AND** 卡片下方显示"更新日志"列表(3-5 条)
- **AND** 区域底部显示提示文案"支持 Windows 10+ / macOS 11+"

#### Scenario: 未登录点击下载
- **WHEN** 未登录用户点击下载按钮
- **THEN** 按钮显示"注册后下载"灰色样式
- **AND** 点击跳转到 `/register` 页面

#### Scenario: 已登录点击下载
- **WHEN** 已登录用户点击 Windows 下载按钮
- **THEN** 触发 `window.open(VITE_DOWNLOAD_WIN_URL, '_blank')`
- **AND** 浏览器开始下载安装包

### Requirement: 下载链接配置
系统 SHALL 通过环境变量配置下载链接,便于后续上传新版本安装包时无需改代码。

#### Scenario: 配置下载链接
- **WHEN** 开发者在 `frontend/user/.env.production` 中设置:
  ```
  VITE_DOWNLOAD_WIN_URL=https://zt.shentongapi.cn/desktop/深瞳AI-0.1.0-win-x64.exe
  VITE_DOWNLOAD_MAC_URL=https://zt.shentongapi.cn/desktop/深瞳AI-0.1.0-mac-arm64.dmg
  VITE_APP_VERSION=0.1.0
  ```
- **THEN** `npm run build` 时 Vite 读取 `.env.production`
- **AND** Landing 页面通过 `import.meta.env.VITE_DOWNLOAD_WIN_URL` 获取下载链接
- **AND** 安装包上传到服务器 `/opt/shentong/updates/` 目录后,下载链接即可访问

### Requirement: Nginx 站点配置
系统 SHALL 在 `deploy/nginx.conf` 中新增 `zt.shentongapi.cn` server 块,提供 Landing 静态文件服务与安装包下载服务。

#### Scenario: 访问 Landing 站点
- **WHEN** 用户访问 `https://zt.shentongapi.cn/`
- **THEN** Nginx 返回 `frontend/user/dist/index.html`
- **AND** 静态资源(CSS/JS/图片)从 `frontend/user/dist/` 提供
- **AND** SPA fallback:`try_files $uri $uri/ /index.html`(刷新子路由不 404)

#### Scenario: 下载安装包
- **WHEN** 用户访问 `https://zt.shentongapi.cn/desktop/深瞳AI-0.1.0-win-x64.exe`
- **THEN** Nginx 返回 `/usr/share/nginx/html/desktop/深瞳AI-0.1.0-win-x64.exe`
- **AND** 响应头 `Access-Control-Allow-Origin: *`
- **AND** 启用 `sendfile` + `tcp_nopush` 大文件优化

## MODIFIED Requirements

### Requirement: frontend/user 路由
**Modified**: 从完整 Web 应用(15+ 路由)精简为 3 路由单页站点(`/`、`/login`、`/register`),根路径不再重定向到 Dashboard。

### Requirement: Register 页面跳转
**Modified**: 注册成功后跳转 `/`(原跳转 `/dashboard`),并自动保存 token 实现自动登录。

### Requirement: Login 页面跳转
**Modified**: 登录成功后跳转 `/`(原跳转 `/dashboard`)。

### Requirement: nginx.conf
**Modified**: 新增 `zt.shentongapi.cn` server 块,提供 Landing 静态文件服务,与现有 `api.shentongapi.cn` / `update.shentongapi.cn` 共存。

## REMOVED Requirements

### Requirement: Dashboard 与用户端功能
**Reason**: 产品定位调整,Web 端只保留营销首页,用户端功能由桌面客户端承载
**Migration**: 用户端代码从 `frontend/user` 删除,桌面客户端 `desktop/` 已完整覆盖所有用户端功能
