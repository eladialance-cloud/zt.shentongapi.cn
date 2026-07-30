# 前端与桌面端架构审查报告

> **审查日期**: 2026-07-30  
> **审查范围**: `frontend/admin/`、`frontend/user/`、`desktop/`、`deploy/nginx.conf`  
> **审查人**: 前端架构审查专家（AI 子代理）

---

## 目录

1. [管理后台 (frontend/admin/)](#1-管理后台-frontendadmin)
2. [用户端 (frontend/user/)](#2-用户端-frontenduser)
3. [桌面端 (desktop/)](#3-桌面端-desktop)
4. [Nginx 配置 (deploy/nginx.conf)](#4-nginx-配置-deploynginxconf)
5. [问题汇总表](#5-问题汇总表)

---

## 1. 管理后台 (frontend/admin/)

### 1.1 目录结构和路由配置

**结构概览**:
```
frontend/admin/src/
├── api/           # 20 个 admin API 模块文件
├── components/    # AdminRouteGuard, ErrorBoundary
├── pages/         # 30+ 页面目录（Dashboard, Users, Agents, Finance, Audit 等）
├── router/        # createBrowserRouter + basename
├── store/         # Zustand admin-auth store
├── styles/        # global.css, variables.css
├── types/         # TypeScript 类型定义
├── utils/         # errors.ts (BusinessError, NetworkError)
├── App.tsx        # 根组件
└── main.tsx       # 入口
```

**路由配置** ✅ 良好:
- 使用 `createBrowserRouter` + `basename: '/admin'`，所有路由路径不含 `/admin` 前缀
- 公开路由 `/login`，受保护路由通过 `AdminRouteGuard` 包裹
- 所有页面组件使用 `React.lazy + Suspense` 懒加载，减小首屏体积
- 路由结构清晰，按功能分组（用户、Agent、工作流、插件、财务、审核、统计、版本、系统）
- 兜底路由 `*` 重定向到 `/`

**评价**: 目录结构清晰，模块划分合理，API / types / pages 一一对应。

### 1.2 API 请求层

**baseURL 配置** ✅ 正确:
```ts
// admin-auth-api.ts
const ADMIN_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
// .env.production
VITE_API_BASE_URL=/api
```
- 生产环境使用相对路径 `/api`，由 Nginx 反向代理到后端，避免了跨域问题。

**独立 axios 实例** ✅ 设计合理:
- 管理端使用独立的 `adminAxios` 实例，不复用用户端的 `httpClient`
- 注释说明原因："httpClient 的请求拦截器会注入用户端 accessToken，会覆盖管理端 token"
- 通过 `adminRequest` 统一方法从 `adminStore` 读取 token 并注入 Authorization 头

**拦截器** ✅ 完善:
- **响应拦截器**: 解包 `response.data.data`，业务码 `code === 0` 为成功
- **401 自动刷新**: 实现了 `tryAdminRefreshToken()` + 请求队列机制
  - 使用独立的 `axios.post` 调用 `/admin/auth/refresh`，绕过自身拦截器避免循环
  - 并发请求通过 `adminFailedQueue` 队列管理，刷新成功后批量重试
  - 刷新失败清除登录态并跳转 `/admin/login`
- **网络错误**: 区分超时（`ECONNABORTED`）和断网，抛出 `NetworkError`
- **业务错误**: 抛出 `BusinessError`（含 code + message + data）

**问题** ⚠️:
- **P2 — `withCredentials: true` 可能不必要**: 管理端使用 Bearer token 认证，refresh token 通过请求体传递而非 Cookie。`withCredentials: true` 在跨域时可能导致 CORS 问题，但在同源部署下无影响。

### 1.3 认证流程

**登录流程** ✅ 完整:
1. 用户输入用户名/密码/验证码 → `POST /admin/auth/login`
2. 返回 `{ token, refreshToken, expiresAt, user, permissions, mustChangePassword }`
3. 调用 `setAdminAuth()` 持久化到 `localStorage`（Zustand persist）
4. `AdminRouteGuard` 检查 `isAuthenticated()`：token 存在且未过期

**Token 刷新** ✅ 完善:
- 401 触发 `tryAdminRefreshToken()`，用 `refreshToken` 调用 `/admin/auth/refresh`
- 返回新的 `accessToken` + `refreshToken`，更新 store
- 并发请求排队，刷新完成后批量重试

**路由守卫** ✅ 三层守卫:
1. `AdminRouteGuard`: 检查 token 存在且未过期；`mustChangePassword` 时强制跳转改密页
2. `PermissionGate`: 检查 `permissions` 数组是否包含指定权限编码，否则渲染 403
3. `hasPermission(code)`: Store 提供的编程式权限检查

**启动时验证** ✅:
- `App.tsx` 的 `useEffect` 中检查持久化 token
- token 过期 → 清除登录态
- token 未过期 → 调用 `getAdminProfile()` 验证并刷新管理员信息/权限
- 验证失败 → 清除登录态

**问题** ⚠️:
- **P3 — token 过期时间前端校验不严格**: `isAuthenticated()` 使用 `expiresAt` 判断过期，但 `expiresAt` 是登录时设定的值。如果后端提前吊销 token，前端在过期前仍认为有效。`getAdminProfile` 调用会捕获此情况，但存在窗口期。

### 1.4 构建配置

**vite.config.ts** ✅ 合理:
- `base: '/admin/'`：部署在子路径，与 Nginx `location /admin/` 配合
- 手动 chunk 分包：`react-vendor`、`antd-vendor`、`echarts-vendor`
- 开发代理 `/api` → `http://localhost:3001`
- `sourcemap: false`：生产环境不暴露源码

**环境变量** ✅:
- `.env.production`: `VITE_API_BASE_URL=/api`（相对路径，正确）
- 无敏感信息泄露

**问题** ⚠️:
- **P3 — vite.config.ts 有 UTF-8 BOM**: 文件以 `EF BB BF` 开头。虽然 Vite 能正确处理，但不规范。
- **P3 — admin-auth-api.ts 无 BOM 但有中文**: 文件以 `2F 2F 20 E7` 开头（`// 管`），UTF-8 无 BOM，编码正确。

---

## 2. 用户端 (frontend/user/)

### 2.1 目录结构和路由配置

**结构概览**:
```
frontend/user/src/
├── api/           # auth.ts（仅认证 API）
├── components/    # landing/ParticleMatrix.tsx（仅 1 个组件）
├── pages/         # Landing, Login, Register（仅 3 个页面）
├── router/        # index.tsx
├── store/         # auth.ts, index.ts
├── types/         # api.ts
└── utils/         # constants.ts, request.ts
```

**路由配置** ❌ 严重问题:
- 路由引用了大量不存在的页面组件和 `ProtectedRoute`：
  - `import { ProtectedRoute } from '@/components/ProtectedRoute'` — **文件不存在**
  - `Dashboard`, `Chat`, `Agents`, `AgentDetail`, `Profile`, `Credits`, `Recharge` — **均不存在**
  - `SkillStore`, `McpServers`, `N8nWorkflows`, `OpenClaw`, `HermesInstances` 等 — **均不存在**
- 实际 `pages/` 目录下只有 `Landing`, `Login`, `Register` 三个页面

**评价**: 用户端前端是一个**未完成的项目骨架**。路由配置引用了大量不存在的模块，无法正常构建。仅有 Landing/Login/Register 三个页面可用。

### 2.2 API 请求层

**baseURL 配置** ✅ 正确但有重要差异:
```ts
// constants.ts
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
// .env.production
VITE_API_BASE_URL=https://zt.shentongapi.cn/api
```

**⚠️ 重要发现**: 用户端生产环境使用**绝对 URL** `https://zt.shentongapi.cn/api`，而管理后台使用相对路径 `/api`。

这意味着：
- 用户端请求会直接发到 `zt.shentongapi.cn` 域名
- 需要后端配置 CORS 允许跨域
- 与桌面端（也指向同一 API）一致

**问题** ❌:
- **P1 — vite.config.ts 缺少 `base` 配置**: 用户端没有设置 `base`，默认为 `/`。如果部署在子路径下会有资源路径问题。但根据 Nginx 配置，用户端前端**实际上没有在 Nginx 中配置**（见 Nginx 部分），所以这可能不是当前问题。

**拦截器** ⚠️ 部分实现:
- 请求拦截器：注入 `Authorization: Bearer ${token}`
- 响应拦截器：业务码检查 + 401 刷新机制
- 401 刷新使用 `HttpOnly Cookie` 携带 refreshToken（与管理端用请求体传 refreshToken 不同）

**问题** ⚠️:
- **P2 — 401 刷新机制与后端可能不匹配**: 用户端 `tryRefreshToken()` 不传 refreshToken 参数，依赖 HttpOnly Cookie。但 `constants.ts` 仍定义了 `STORAGE_KEYS.REFRESH_TOKEN`，且 `auth.ts` store 中未使用。设计不一致。

### 2.3 认证流程

**登录** ✅ 基本完整:
- `POST /auth/login` → 返回 `{ accessToken, user }`
- `login()` 设置 `accessToken` + `user` + `isAuthenticated = true`
- refreshToken 通过 HttpOnly Cookie 管理，前端不持有明文

**注册** ✅:
- `POST /auth/register` → 返回与登录相同的响应

**Token 持久化策略** ⚠️:
- `accessToken` **不持久化**（`partialize` 中未包含）
- `isAuthenticated` 和 `user` 持久化
- 刷新页面时 `isAuthenticated = true` 但 `accessToken = null`
- 需要 `ProtectedRoute` 检查 token 并触发 refresh — 但 `ProtectedRoute` 组件**不存在**

**问题** ❌:
- **P1 — ProtectedRoute 组件缺失**: 路由配置 `import { ProtectedRoute } from '@/components/ProtectedRoute'` 引用的文件不存在，导致整个应用无法构建。
- **P2 — accessToken 不持久化但无恢复机制**: 页面刷新后 `isAuthenticated = true` 但 `accessToken = null`。需要 `ProtectedRoute` 或类似机制触发 `refreshToken()` 获取新的 accessToken，但该组件不存在。

### 2.4 环境变量

**.env.production**:
```
VITE_API_BASE_URL=https://zt.shentongapi.cn/api
VITE_DOWNLOAD_WIN_URL=https://zt.shentongapi.cn/desktop/ShenTongAI-Setup-0.4.2-x64.exe.zip
VITE_DOWNLOAD_MAC_URL=https://zt.shentongapi.cn/desktop/深瞳AI-0.1.0-mac-arm64.dmg
VITE_APP_VERSION=0.4.1
```

**问题** ⚠️:
- **P2 — 版本号过时**: `VITE_APP_VERSION=0.4.1`，但桌面端已是 `0.5.2`，下载链接指向 `0.4.2` 版本
- **P3 — 下载链接可能失效**: Windows 下载链接为 `.exe.zip`，但 Nginx 下载站和桌面端构建产物使用的是 `ShenTongAI-Setup-${version}-${arch}.${ext}`（NSIS 安装包 `.exe`），不是 `.zip`
- **P3 — Mac 下载链接版本 0.1.0**: 严重过时
- **P3 — .env.production 有 UTF-8 BOM**: 文件以 `EF BB BF` 开头

### 2.5 文件编码 ❌ 严重问题

**所有用户端 `.ts/.tsx` 源文件都存在严重的编码损坏**:

经字节级检测，以下文件均存在 **UTF-8 BOM + 内容被 GBK 二次编码** 的问题：

| 文件 | BOM | 实际内容 |
|------|-----|----------|
| `src/utils/request.ts` | ✅ EF BB BF | 中文注释全部乱码 |
| `src/utils/constants.ts` | ✅ EF BB BF | 中文注释全部乱码 |
| `src/store/auth.ts` | ✅ EF BB BF | 中文注释全部乱码 |
| `src/router/index.tsx` | ✅ EF BB BF | 中文注释全部乱码 |
| `src/api/auth.ts` | ✅ EF BB BF | 中文注释全部乱码 |

**乱码示例**:
- `request.ts` 开头注释本应为"Axios HTTP 客户端封装"，实际显示为"Axios HTTP 鐎广垺鍩涚粩顖氱殱鐟"
- `constants.ts` 开头"常量定义"变为"鐢悂鍣虹€规矮绠"
- `auth.ts` 开头"认证状态管理 (Zustand)"变为"鐠併倛鐦夐悩鑸碘偓浣侯吀閻"

**根因分析**: 文件原本是 UTF-8 编码，但被某个编辑器或工具以 GBK 编码读取后重新保存，导致中文字符的 UTF-8 字节序列被当作 GBK 字符再次编码为 UTF-8（即"锟斤拷"类乱码的变体）。

**影响**:
- 注释完全不可读，影响维护
- 代码中的字符串字面量如果包含中文也会受损
- TypeScript 编译不受影响（中文仅在注释中），但严重影响可维护性

**对比**: 管理后台 `frontend/admin/` 的文件编码正常（UTF-8 无 BOM 或有 BOM 但内容正确）。

---

## 3. 桌面端 (desktop/)

### 3.1 Electron 主进程和预加载脚本

**主进程 (`electron/main/index.ts`)** ✅ 架构合理:
- 单实例锁（`app.requestSingleInstanceLock()`）防止多开
- 主窗口 + 系统托盘 + 服务管理器 + 自动更新器
- IPC 处理器注册清晰：服务管理、应用信息、自动更新、设备指纹、窗口控制、本地数据库、同步队列、运行时校验
- 退出时停止所有本地服务（`serviceManager.stopAll()`）

**预加载脚本 (`electron/preload/index.ts`)** ✅ 安全:
- 使用 `contextBridge.exposeInMainWorld` 暴露 API
- 类型定义完整（`ElectronAPI`、`RuntimeAPI` 接口）
- 事件监听器返回取消监听函数（符合 React useEffect cleanup 模式）

**问题** ⚠️:
- **P3 — 预加载脚本 fallback 不安全**: 当 `contextIsolation` 为 false 时，直接挂载到 `window` 对象。虽然主窗口配置了 `contextIsolation: true`，但 fallback 代码存在安全隐患，应移除或抛出错误。

### 3.2 IPC 通信安全

**主窗口配置** (`electron/main/windows/main-window.ts`):
```ts
webPreferences: {
  preload: join(__dirname, "../preload/index.js"),
  contextIsolation: true,    // ✅ 启用上下文隔离
  nodeIntegration: false,    // ✅ 禁用 Node.js 集成
  sandbox: false,            // ⚠️ 未启用沙箱
}
```

**评价** ✅ 基本安全:
- `contextIsolation: true`：渲染进程无法直接访问 Node.js API
- `nodeIntegration: false`：渲染进程无法 require Node.js 模块
- 所有特权操作通过 IPC `ipcMain.handle` / `ipcMain.on` 暴露

**问题** ⚠️:
- **P2 — `sandbox: false`**: 未启用渲染进程沙箱。虽然 `contextIsolation` 和 `nodeIntegration` 配置正确，但禁用沙箱降低了安全边界。Electron 官方推荐启用 `sandbox: true`。
- **P3 — 部分 IPC 使用 `ipcMain.on`（单向）而非 `ipcMain.handle`（双向）**: `window:minimize`、`window:maximize`、`window:close`、`db:close`、`db:isDegraded` 使用 `ipcMain.on`。其中 `db:isDegraded` 使用 `sendSync` 同步返回值，虽然注释说明"开销极小"，但同步 IPC 会阻塞渲染进程。
- **P3 — 外部链接处理**: `setWindowOpenHandler` 中所有外部链接都用系统浏览器打开，没有 URL 白名单过滤。

### 3.3 自动更新

**配置** (`electron/main/updater.ts`) ✅ 完善:
- 基于 `electron-updater`，生产环境启用
- `autoDownload = false`：需用户确认（强制更新除外）
- `autoInstallOnAppQuit = false`：仅通过显式 `installUpdate()` 安装
- **强制更新**: 模态对话框阻断用户操作，单按钮"立即更新"，下载完成后自动安装重启
- **灰度发布**: 客户端生成 0-100 随机数，`<= grayscalePercent` 则命中
  - 灰度结果持久化到 `userData/update-grayscale.json`，避免每次重新随机
  - 版本/灰度比例变更时重新随机
- 更新下载完成后清理旧的 `userData/runtime/` 补丁
- 任务栏进度条显示下载进度

**electron-builder.yml**:
```yaml
publish:
  provider: generic
  url: https://zt.shentongapi.cn/desktop/
  channel: latest
```

**问题** ⚠️:
- **P2 — 更新服务器 URL 不一致**: `updater.ts` 中硬编码 `UPDATE_SERVER_URL = 'https://update.shentong.ai/desktop/'`，但 `electron-builder.yml` 中配置为 `https://zt.shentongapi.cn/desktop/`。`autoUpdater.setFeedURL()` 使用了硬编码的 URL，electron-builder 的 `publish` 配置仅用于 `publish` 命令。如果 `update.shentong.ai` 未配置或指向不同位置，自动更新将失败。
- **P3 — 灰度随机数持久化文件权限**: `saveGrayscaleResult` 使用 `mode: 0o600`，但文件路径在 `userData` 目录下，Windows 上文件权限语义不同。
- **P3 — 更新日志国际化**: `releaseNotes` 直接展示，未做国际化处理。

### 3.4 API 请求层

**桌面端 HTTP 客户端** (`desktop/src/api/http-client.ts`) ✅ 设计最完善:
- 基于 axios 的类封装（`HttpClient` class），单例模式
- **HMAC-SHA256 请求签名**: 每个请求自动注入 `X-Timestamp`、`X-Nonce`、`X-Signature`
  - 签名白名单：`/auth/login`、`/auth/register`、`/auth/refresh` 不签名
  - 从 auth store 读取 `secretKey` 进行签名
- 401 自动刷新机制（与 admin 端类似）
- 完整的错误类型：`BusinessError`、`NetworkError`

**与前端 API 层的差异**:

| 特性 | 管理后台 | 用户端 | 桌面端 |
|------|----------|--------|--------|
| HTTP 客户端 | 独立 axios 实例 | 独立 axios 实例 | 类封装单例 |
| 认证方式 | Bearer token (admin) | Bearer token + HttpOnly Cookie | Bearer token + HMAC 签名 |
| 401 刷新 | refreshToken in body | HttpOnly Cookie | refreshToken in body |
| 请求签名 | 无 | 无 | HMAC-SHA256 |
| 错误类型 | BusinessError + NetworkError | 原生 Error | BusinessError + NetworkError |
| baseURL 来源 | VITE_API_BASE_URL | VITE_API_BASE_URL | VITE_API_BASE_URL (electron-vite define) |

**问题** ⚠️:
- **P3 — httpClient 跳转登录页使用 hash 路由**: `redirectToLogin()` 使用 `window.location.hash = '#/login'`，但桌面端确实使用 `createHashRouter`，所以这是正确的。

### 3.5 构建配置

**electron.vite.config.ts** ✅ 合理:
- 三入口配置：main（CJS）、preload（CJS）、renderer（ESM）
- `externalizeDepsPlugin()` 外部化 dependencies
- `define` 注入环境变量到渲染进程
- 开发环境 fallback: `VITE_API_BASE_URL || "http://localhost:3001/api"`

**electron-builder.yml** ✅ 详细:
- Windows: NSIS 安装包，x64
- Mac: DMG，x64 + arm64
- `npmRebuild: false`：避免 @journeyapps/sqlcipher 编译问题
- `asar: true`：打包为 asar
- 代码签名通过环境变量配置（`CSC_LINK`、`CSC_KEY_PASSWORD`）
- `extraResources` 包含 `resources/` 和 `runtime/`

**问题** ⚠️:
- **P3 — Mac hardenedRuntime + gatekeeperAssess: false**: `hardenedRuntime: true` 但 `gatekeeperAssess: false`，可能导致公证问题。
- **P3 — 版本号不一致**: `package.json` version 为 `0.5.2`，但 `dist/` 下有 `installer-v0.4.9`、`installer-v0.5.1` 等旧版本目录。

### 3.6 桌面端编码问题 ⚠️

**部分桌面端文件也存在编码损坏**:

| 文件 | BOM | 编码状态 |
|------|-----|----------|
| `src/router/index.tsx` | ✅ EF BB BF | ❌ 中文注释乱码 |
| `src/store/auth.ts` | ❌ 无 BOM | ✅ UTF-8 正确 |
| `src/api/http-client.ts` | ❌ 无 BOM | ✅ UTF-8 正确 |
| `electron/main/index.ts` | ❌ 无 BOM | ✅ UTF-8 正确 |
| `electron/preload/index.ts` | ❌ 无 BOM | ✅ UTF-8 正确 |
| `electron/main/updater.ts` | ❌ 无 BOM | ✅ UTF-8 正确 |

仅 `desktop/src/router/index.tsx` 存在与用户端相同的编码损坏问题。

---

## 4. Nginx 配置 (deploy/nginx.conf)

### 4.1 管理后台路由

```nginx
location /admin/ {
    alias /usr/share/nginx/html/admin/;
    index index.html;
    try_files $uri $uri/ /admin/index.html;
}
```

**评价** ✅ 正确:
- `alias` 路径正确，指向 admin 前端构建产物
- `try_files` 支持 SPA 客户端路由（所有未知路径回退到 `index.html`）
- 静态资源（js/css/png/jpg/...）设置 30 天缓存 + immutable
- 与 `vite.config.ts` 的 `base: '/admin/'` 配合正确

**问题** ⚠️:
- **P2 — `alias` 末尾斜杠与 `try_files` 回退路径**: `alias /usr/share/nginx/html/admin/;` + `try_files $uri $uri/ /admin/index.html;`。当请求 `/admin/` 时，`$uri` 为 `/admin/`，alias 解析为 `/usr/share/nginx/html/admin/`，`index index.html` 正确。但当请求 `/admin/dashboard` 时，`$uri` 为 `/admin/dashboard`，alias 解析为 `/usr/share/nginx/html/admin/dashboard`（不存在），回退到 `/admin/index.html`。这里回退路径是 URI 而非文件路径，Nginx 会重新匹配 location，最终再次命中 `/admin/` location，返回 `index.html`。这是正确的，但存在内部重定向开销。

### 4.2 API 代理

```nginx
location /api/ {
    proxy_pass http://shentong_backend;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

**评价** ✅ 正确:
- 代理到 `backend:3001`（NestJS 后端）
- 请求头传递完整（Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto）
- 超时设置合理（60s）
- `keepalive 32` 上游连接池

**同时配置在两个 server 块**:
- `api.shentong.ai`（HTTP 80 端口）
- `zt.shentongapi.cn`（HTTPS 443 端口）

### 4.3 用户端前端 ❌ 缺失

**严重问题**: Nginx 配置中**没有用户端前端 (`frontend/user/`) 的 location 配置**。

当前 `zt.shentongapi.cn` HTTPS server 块中:
- `/` → 返回 404（"Landing 站点已移除"）
- `/admin/` → 管理后台
- `/api/` → API 代理
- `/desktop/` → 安装包下载

**用户端前端无法通过 Web 访问**。

但根据 `.env.production` 中 `VITE_API_BASE_URL=https://zt.shentongapi.cn/api`，用户端设计上应该是一个独立的 Web 应用。目前的 Nginx 配置没有为它配置 server 或 location。

**影响**:
- 用户无法通过浏览器访问用户端 Web 应用
- 用户端 `.env.production` 指向 `zt.shentongapi.cn` 域名，但没有对应的 Nginx 配置
- 可能是设计决策（用户端仅通过桌面端使用），但 `.env.production` 的存在暗示曾计划部署 Web 版

### 4.4 WebSocket 代理

```nginx
location /api/socket.io/ {
    proxy_pass http://shentong_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;  # 24h
    proxy_send_timeout 86400s;
}
```

**评价** ✅ 正确:
- WebSocket 升级头设置完整（`Upgrade`、`Connection`）
- 24 小时超时，适合长连接
- 路径 `/api/socket.io/` 与 Socket.IO 默认路径一致
- 同时配置在 `api.shentong.ai` 和 `zt.shentongapi.cn` 两个 server 块

### 4.5 SSL 证书配置

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name zt.shentongapi.cn;

    ssl_certificate /etc/nginx/ssl/zt.shentongapi.cn.crt;
    ssl_certificate_key /etc/nginx/ssl/zt.shentongapi.cn.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
}
```

**评价** ✅ 基本正确:
- TLS 1.2 + 1.3，禁用了不安全的旧版本
- HSTS 头（`max-age=31536000; includeSubDomains`）
- HTTP → HTTPS 重定向
- ACME challenge 目录配置（用于 certbot 续签）

**问题** ⚠️:
- **P2 — `api.shentong.ai` 和 `update.shentong.ai` 仅 HTTP**: 这两个子域名只监听 80 端口，没有 HTTPS 配置。`api.shentong.ai` 提供的 API 接口通过 HTTP 明文传输，存在安全风险。虽然用户端和桌面端实际请求的是 `zt.shentongapi.cn`（HTTPS），但 `api.shentong.ai` 仍然可达。
- **P3 — 缺少 OCSP Stapling**: 可提升 TLS 握手性能和隐私。
- **P3 — `ssl_ciphers HIGH:!aNULL:!MD5`**: 过于宽泛，建议使用更严格的密码套件列表。

### 4.6 安全响应头 ✅

所有 server 块都配置了:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

**问题** ⚠️:
- **P3 — 缺少 Content-Security-Policy**: 未配置 CSP 头，建议为管理后台添加 `default-src 'self'` 策略。
- **P3 — X-XSS-Protection 已弃用**: 现代浏览器已移除此功能，可替换为 CSP。

---

## 5. 问题汇总表

### 🔴 P1 — 严重（影响功能）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 1 | `frontend/user/src/router/index.tsx` | `ProtectedRoute` 组件导入但不存在，导致应用无法构建 | 创建 `frontend/user/src/components/ProtectedRoute.tsx`，或改用内联守卫 |
| 2 | `frontend/user/src/router/index.tsx` | 路由引用大量不存在的页面（Dashboard, Chat, Agents 等 15+ 个） | 要么创建缺失的页面组件，要么精简路由为仅 Landing/Login/Register |
| 3 | `deploy/nginx.conf` | 用户端前端无 Nginx 配置，Web 版用户端无法访问 | 如需 Web 版，添加 server 或 location 块；如仅桌面端使用，移除用户端 `.env.production` |

### 🟡 P2 — 重要（应尽快修复）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 4 | `frontend/user/` 所有 .ts/.tsx 文件 | 中文注释全部乱码（UTF-8 被 GBK 二次编码） | 使用 `iconv` 或脚本批量修复编码 |
| 5 | `desktop/src/router/index.tsx` | 同上，中文注释乱码 | 同上 |
| 6 | `desktop/electron/main/updater.ts` | 更新服务器 URL 硬编码为 `update.shentong.ai`，与 electron-builder.yml 的 `zt.shentongapi.cn` 不一致 | 统一为一个域名，建议使用环境变量 |
| 7 | `desktop/electron/main/windows/main-window.ts` | `sandbox: false` 未启用渲染进程沙箱 | 设置 `sandbox: true` |
| 8 | `deploy/nginx.conf` | `api.shentong.ai` 和 `update.shentong.ai` 仅 HTTP 无 SSL | 为所有子域名配置 HTTPS 或重定向 |
| 9 | `frontend/user/.env.production` | 版本号过时（0.4.1），下载链接版本（0.4.2/0.1.0）严重落后 | 更新为当前版本 0.5.x |
| 10 | `frontend/user/src/store/auth.ts` | accessToken 不持久化但无恢复机制（依赖缺失的 ProtectedRoute） | 在应用初始化时自动调用 `refreshToken()` |

### 🔵 P3 — 次要（建议改进）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 11 | `frontend/admin/vite.config.ts` | UTF-8 BOM | 移除 BOM |
| 12 | `frontend/user/.env.production` | UTF-8 BOM | 移除 BOM |
| 13 | `frontend/user/.env.production` | Windows 下载链接为 `.exe.zip`，与实际产物 `.exe` 不匹配 | 更新下载链接格式 |
| 14 | `deploy/nginx.conf` | 缺少 Content-Security-Policy 头 | 添加 CSP 头 |
| 15 | `deploy/nginx.conf` | `X-XSS-Protection` 已弃用 | 移除或替换为 CSP |
| 16 | `deploy/nginx.conf` | 缺少 OCSP Stapling | 添加 `ssl_stapling on` |
| 17 | `desktop/electron/preload/index.ts` | contextIsolation=false 时的 fallback 不安全 | 移除 fallback，强制 contextIsolation |
| 18 | `desktop/electron/main/index.ts` | `db:isDegraded` 使用 `sendSync` 阻塞渲染进程 | 改为异步 `ipcMain.handle` |
| 19 | `desktop/electron-builder.yml` | 版本号 0.5.2 但 dist 下有多个旧版本目录 | 清理旧构建产物 |
| 20 | `frontend/admin/src/api/admin-auth-api.ts` | `withCredentials: true` 在 Bearer token 认证下可能不必要 | 评估是否需要保留 |
| 21 | `frontend/user/src/utils/constants.ts` | `STORAGE_KEYS.REFRESH_TOKEN` 已定义但未使用 | 清理无用代码 |
| 22 | `desktop/electron/main/windows/main-window.ts` | 外部链接无 URL 白名单过滤 | 添加 URL 协议/域名白名单 |

---

## 总结

### 架构成熟度评估

| 组件 | 成熟度 | 说明 |
|------|--------|------|
| 管理后台 | ⭐⭐⭐⭐ | 架构完善，代码质量高，可直接部署 |
| 用户端 | ⭐⭐ | 未完成的项目骨架，仅 3 个页面，路由引用大量不存在的组件，文件编码损坏 |
| 桌面端 | ⭐⭐⭐⭐ | 架构最完善，HMAC 签名、SQLCipher 加密、自动更新灰度发布，少量编码问题 |
| Nginx | ⭐⭐⭐ | API 代理和 WebSocket 配置正确，但缺少用户端前端配置和部分子域名 SSL |

### 优先修复建议

1. **立即修复**: 用户端 `ProtectedRoute` 组件缺失 + 路由引用不存在的页面
2. **尽快修复**: 用户端/桌面端文件编码损坏（批量转码修复）
3. **尽快修复**: 桌面端更新服务器 URL 不一致
4. **短期修复**: Nginx 为所有子域名配置 HTTPS
5. **短期修复**: 用户端 `.env.production` 版本号和下载链接更新

---

*报告结束*
