# Checklist

## 前端项目骨架
- [x] `frontend/admin/` 目录已创建，包含 package.json / vite.config.ts / tsconfig.json / index.html
- [x] `vite.config.ts` 配置 `base: '/admin/'`，alias `@` → `src`
- [x] `src/main.tsx` 挂载到 `#root`，包裹 ConfigProvider + RouterProvider
- [x] `.env.production` 设置 `VITE_API_BASE_URL=/api`

## 类型与 API 迁移
- [x] `frontend/admin/src/types/` 下存在 12 个 admin-*.ts 类型文件
- [x] `frontend/admin/src/api/admin-auth-api.ts` 导出 `adminRequest`、`adminLogin`、`adminLogout`、`getAdminProfile`、`listAdminRoles`、`updateRolePermissions`、`listOperationLogs`、`ALL_PERMISSIONS`
- [x] 其余 11 个 admin-*-api.ts 文件均复用 `adminRequest` helper
- [x] `src/utils/errors.ts` 导出 `BusinessError`、`NetworkError`
- [x] 所有 import 路径无 `@/api/http-client`、`@/api/ws-client` 等 Electron 桌面端独有模块引用

## Store 与守卫
- [x] `frontend/admin/src/store/admin-auth.ts` 导出 `useAdminAuthStore`，含 `token/expiresAt/user/permissions/setAdminAuth/clearAdminAuth/isAuthenticated/hasPermission`
- [x] `AdminRouteGuard` 未登录重定向到 `/admin/login`
- [x] `PermissionGate` 无权限渲染 antd Result 403

## 12 个管理模块页面
- [x] Layout（顶栏 + 侧边栏 12 项菜单 + Outlet）
- [x] Login（用户名 + 密码 + 图形验证码 canvas）
- [x] Dashboard
- [x] Users（含 Credits/Devices/Levels/Orders 子页）
- [x] ApiKeyPool（含 Stats 子页）
- [x] Agents（含 Review/Pricing/Categories 子页）
- [x] Workflows（含 Review/Stats 子页）
- [x] Plugins（含 Review/Sync 子页）
- [x] Models
- [x] Finance（含 Transactions/Orders/Invoices/Reconciliation 子页）
- [x] Audit（含 SensitiveWords/AIConfig/Queue 子页）
- [x] Stats（含 Overview/Trends/Rankings/Retention 子页）
- [x] Versions
- [x] System（含 Config/Tenant/Announcements 子页）
- [x] Roles + OperationLogs
- [x] shared.module.css 已复制

## 路由配置
- [x] 使用 `createBrowserRouter`，`basename="/admin"`
- [x] `/admin/login` 公开路由
- [x] `/admin/*` 受 AdminRouteGuard + AdminLayout 包裹的子路由，覆盖全部页面
- [x] 根路径 `/` 重定向到 `/admin/dashboard`

## 后端 AdminAuth 模块
- [x] `backend/src/modules/admin-auth/` 目录存在，含 module/controller/service/strategy/guard/dto 文件
- [x] `POST /admin/auth/login` 接收 `{ username, password, captcha }`，返回 `{ token, expiresAt, user, permissions }`
- [x] `POST /admin/auth/logout` 返回 200
- [x] `GET /admin/auth/profile` 返回 `{ user, permissions }`
- [x] AdminGuard 校验 adminToken 并注入 adminUser 到 request
- [x] `app.module.ts` 已注册 AdminAuthModule
- [x] `.env.example` 含 `ADMIN_JWT_SECRET`、`ADMIN_JWT_EXPIRES_IN`

## 后端 AdminRole 模块
- [x] `backend/src/modules/admin-role/` 目录存在
- [x] `GET /admin/roles` 返回角色列表
- [x] `PUT /admin/roles/:id/permissions` 更新角色权限
- [x] `role.entity.ts` 含 `permissions` 字段（JSON）+ 新增 `code` 唯一字段
- [x] `app.module.ts` 已注册 AdminRoleModule

## 后端 OperationLog 模块
- [x] `backend/src/modules/admin-log/` 目录存在
- [x] `operation-log.entity.ts` 含 id/userId/username/type/target/operation/ip/ua/createdAt 字段
- [x] `GET /admin/operation-logs` 支持分页与筛选（userId/type/startTime/endTime）
- [x] OperationLogInterceptor 自动记录 admin 写操作（APP_INTERCEPTOR 全局注册，仅对 /admin/ 路径生效）
- [x] `app.module.ts` 已注册 AdminLogModule

## 种子数据
- [x] `backend/sql/admin-seed.sql` 存在，含超级管理员 + 超级角色 + 全部权限
- [x] 管理员密码使用 bcrypt 哈希存储（已验证 bcrypt.compare 通过）
- [x] `backend/package.json` 含 `seed:admin` 脚本

## Nginx 与部署
- [x] `deploy/nginx.conf` 含 `location /admin/` 块，alias 指向 `/usr/share/nginx/html/admin/`，try_files 支持 SPA
- [x] `/api/admin/` 由现有 `location /api/` 反代覆盖
- [x] `frontend/admin/package.json` 含 `build` 脚本
- [x] `deploy/deploy.sh` 部署报告含管理后台访问地址
- [x] `deploy/upload-files.md` 含 admin 前端构建产物上传步骤
- [x] `docker-compose.yml` nginx 服务挂载 `./frontend/admin/dist:/usr/share/nginx/html/admin:ro`
- [x] `docker-compose.yml` backend 服务注入 `ADMIN_JWT_SECRET`、`ADMIN_JWT_EXPIRES_IN` 环境变量

## 类型检查与构建
- [x] `frontend/admin/` 运行 `npx tsc --noEmit` 退出码 0
- [x] `frontend/admin/` 运行 `npm run build` 退出码 0，产物在 `dist/`（index.html + assets/）
- [x] `backend/` 运行 `npx tsc --noEmit` 退出码 0

## 运行时验证（手动，需实际部署后验证）
- [ ] 浏览器访问 `https://zt.shentongapi.cn/admin` 重定向到 `/admin/login`
- [ ] 使用默认管理员账号 `admin / Admin@123456` 登录成功，跳转 `/admin/dashboard`
- [ ] 侧边栏 12 项菜单均可点击跳转
- [ ] 错误密码登录返回 401 提示
- [ ] 退出登录后重定向到 `/admin/login`
- [ ] 直接访问 `/admin/users` 未登录时重定向到 `/admin/login`
- [ ] 后端执行 `npm run seed:admin` 成功创建超级管理员
