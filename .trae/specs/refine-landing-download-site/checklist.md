# Checklist

## 配置与路由

- [x] `frontend/user/.env.production` 存在,包含 `VITE_DOWNLOAD_WIN_URL` / `VITE_DOWNLOAD_MAC_URL` / `VITE_APP_VERSION` 三个变量
- [x] `frontend/user/src/router/index.tsx` 仅包含 3 条路由(`/`、`/login`、`/register`)+ `*` 通配符
- [x] 路由中不再引用 `MainLayout` / `PageSkeleton` / `ProtectedRoute` / `AuthenticatedRoute`
- [x] 根路径 `/` 始终显示 Landing(无论登录态)

## 代码清理

- [x] `frontend/user/src/pages/` 下只剩 `Landing/`、`Login/`、`Register/` 三个目录
- [x] `frontend/user/src/components/` 下只剩 `ErrorBoundary/`、`MarkdownRenderer/`、`TechSpinner/`、`landing/`、`index.ts`
- [x] `frontend/user/src/store/` 下只剩 `auth.ts`、`index.ts`
- [x] `frontend/user/src/api/` 下只剩 `auth.ts`、`index.ts`
- [x] `frontend/user/src/types/` 下只剩 `api.ts`、`index.ts`
- [x] `frontend/user/src/hooks/` 下只剩 `index.ts`、`useDebounce.ts`
- [x] `frontend/user/src/utils/` 下只剩 `constants.ts`、`format.ts`、`request.ts`、`storage.ts`、`token.ts` <!-- FIXED: Task 14 已移除 mock-data.ts 及演示模式逻辑 -->
- [x] `store/index.ts` 只导出 `auth`
- [x] `api/index.ts` 只导出 `auth`
- [x] `types/index.ts` 只导出 `api`

## Landing 页面改造

- [x] Landing 页面所有 `shentong.ai` 已改为 `shentongapi.cn`
- [x] 顶部导航栏"客户端下载"按钮:未登录跳转 `/register`,已登录滚动到 `#download`
- [x] 新增"客户端下载" section(id="download"),位于 CTA section 之前
- [x] 下载区域包含 Windows 与 Mac 两张下载卡片
- [x] 每张卡片显示:操作系统图标 + 下载按钮 + 版本号(从 `VITE_APP_VERSION` 读取)
- [x] 卡片下方显示"更新日志"列表(至少 3 条)
- [x] 区域底部显示"支持 Windows 10+ / macOS 11+"提示
- [x] 未登录时下载按钮置灰显示"注册后下载",点击跳转 `/register`
- [x] 已登录时下载按钮可点击,点击 `window.open(url, '_blank')` 触发下载
- [x] CTA section "立即开始"按钮改为"立即注册",跳转 `/register`
- [x] CTA section "预约演示"按钮改为"登录",跳转 `/login`
- [x] Landing 读取 `import.meta.env.VITE_DOWNLOAD_WIN_URL` / `VITE_DOWNLOAD_MAC_URL` / `VITE_APP_VERSION`

## 登录注册跳转

- [x] Register 页面注册成功后保存 token 到 `useAuthStore`
- [x] Register 页面注册成功后跳转 `/`(不跳 `/dashboard`)
- [x] Login 页面登录成功后跳转 `/`(不跳 `/dashboard`)
- [x] Register 与 Login 页面无任何对 `/dashboard` 的引用

## 部署配置

- [x] `deploy/nginx.conf` 新增 `zt.shentongapi.cn` server 块
- [x] Nginx root 指向 `/usr/share/nginx/html/landing/`
- [x] Nginx `location /` 配置 `try_files $uri $uri/ /index.html`(SPA fallback)
- [x] Nginx `location /desktop/` alias 指向安装包目录,启用 CORS + sendfile
- [x] Nginx 静态资源缓存配置(js/css/png/jpg/svg expires 30d)
- [x] `docker-compose.yml` nginx 服务挂载 `./frontend/user/dist:/usr/share/nginx/html/landing:ro`
- [x] `deploy/upload-files.md` 新增 `frontend/user/dist/` 上传说明
- [x] `deploy/upload-files.md` 新增 rsync 上传命令示例

## 端到端验证

- [x] `cd frontend/user && npx tsc --noEmit` 退出码 0(无类型错误)
- [x] `cd frontend/user && npm run build` 成功产出 `dist/index.html`
- [x] `dist/assets/` 下有 JS 与 CSS 文件
- [ ] 本地 `npm run dev` 访问 `/` 显示 Landing 页面 <!-- SKIPPED: 需要浏览器运行时环境 -->
- [ ] 未登录时下载按钮置灰,点击跳转 `/register` <!-- SKIPPED: 需要浏览器交互验证 -->
- [ ] 注册成功后跳转回 `/`,下载按钮变可点击 <!-- SKIPPED: 需要浏览器交互验证 -->
- [ ] 已登录时点击下载按钮触发 `window.open` <!-- SKIPPED: 需要浏览器交互验证 -->
- [ ] 访问 `/login` 显示登录页 <!-- SKIPPED: 需要浏览器运行时环境 -->
- [ ] 访问 `/register` 显示注册页 <!-- SKIPPED: 需要浏览器运行时环境 -->
- [ ] 访问不存在的路由(如 `/dashboard`)重定向到 `/` <!-- SKIPPED: 需要浏览器运行时环境 -->
