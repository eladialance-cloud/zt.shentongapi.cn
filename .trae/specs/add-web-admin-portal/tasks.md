# Tasks

- [x] Task 1: 创建 frontend/admin 项目骨架
  - [x] SubTask 1.1: 在 `frontend/admin/` 初始化 Vite + React + TS 项目，复用 user 端的 package.json 依赖（antd/zustand/react-router-dom/axios/echarts/dayjs）
  - [x] SubTask 1.2: 配置 `vite.config.ts`（`base: '/admin/'`、`build.outDir: 'dist'`、alias `@` → `src`）
  - [x] SubTask 1.3: 配置 `tsconfig.json`、`tsconfig.node.json`（与 user 端对齐）
  - [x] SubTask 1.4: 创建 `index.html`（root 挂载点）、`src/main.tsx`、`src/App.tsx`、`src/env.d.ts`
  - [x] SubTask 1.5: 创建 `.env.production`（`VITE_API_BASE_URL=/api`）

- [x] Task 2: 迁移 admin 类型与 API 客户端
  - [x] SubTask 2.1: 从 `desktop/src/types/admin-*.ts` 复制 12 个 admin 类型文件到 `frontend/admin/src/types/`
  - [x] SubTask 2.2: 从 `desktop/src/api/admin-auth-api.ts` 复制到 `frontend/admin/src/api/`，调整 import 路径
  - [x] SubTask 2.3: 从 `desktop/src/api/admin-*-api.ts` 复制其余 11 个 admin API 文件，统一使用 `adminRequest` helper
  - [x] SubTask 2.4: 从 `desktop/src/utils/errors.ts` 复制 `BusinessError`/`NetworkError`（admin API 依赖）

- [x] Task 3: 迁移 admin store 与路由守卫
  - [x] SubTask 3.1: 从 `desktop/src/store/admin-auth.ts` 复制到 `frontend/admin/src/store/`
  - [x] SubTask 3.2: 创建 `src/store/index.ts` 统一导出
  - [x] SubTask 3.3: 从 `desktop/src/pages/admin/components/AdminRouteGuard.tsx` 复制 `AdminRouteGuard` + `PermissionGate`

- [x] Task 4: 迁移 12 个 admin 页面模块
  - [x] SubTask 4.1: 复制 `desktop/src/pages/admin/Layout/`（顶栏 + 侧边栏布局）
  - [x] SubTask 4.2: 复制 `desktop/src/pages/admin/Login/`（含图形验证码 canvas）
  - [x] SubTask 4.3: 复制 `desktop/src/pages/admin/Dashboard/`
  - [x] SubTask 4.4: 复制 `desktop/src/pages/admin/Users/`（含 Credits/Devices/Levels/Orders 子页）
  - [x] SubTask 4.5: 复制 `desktop/src/pages/admin/ApiKeyPool/`（含 Stats 子页）
  - [x] SubTask 4.6: 复制 `desktop/src/pages/admin/Agents/`（含 Review/Pricing/Categories 子页）
  - [x] SubTask 4.7: 复制 `desktop/src/pages/admin/Workflows/`（含 Review/Stats 子页）
  - [x] SubTask 4.8: 复制 `desktop/src/pages/admin/Plugins/`（含 Review/Sync 子页）
  - [x] SubTask 4.9: 复制 `desktop/src/pages/admin/Models/`
  - [x] SubTask 4.10: 复制 `desktop/src/pages/admin/Finance/`（含 Transactions/Orders/Invoices/Reconciliation 子页）
  - [x] SubTask 4.11: 复制 `desktop/src/pages/admin/Audit/`（含 SensitiveWords/AIConfig/Queue 子页）
  - [x] SubTask 4.12: 复制 `desktop/src/pages/admin/Stats/`（含 Overview/Trends/Rankings/Retention 子页）
  - [x] SubTask 4.13: 复制 `desktop/src/pages/admin/Versions/`
  - [x] SubTask 4.14: 复制 `desktop/src/pages/admin/System/`（含 Config/Tenant/Announcements 子页）
  - [x] SubTask 4.15: 复制 `desktop/src/pages/admin/Roles/` + `OperationLogs/`
  - [x] SubTask 4.16: 复制 `desktop/src/pages/admin/shared.module.css`
  - [x] SubTask 4.17: 检查每个页面 import 路径，确保无 Electron 依赖（如 service-manager-api/hermes-api 等桌面端独有模块不应被 admin 页面引用）

- [x] Task 5: 配置路由
  - [x] SubTask 5.1: 创建 `src/router/index.tsx`，使用 `createBrowserRouter`（非 hash），`basename="/admin"`
  - [x] SubTask 5.2: 配置 `/admin/login` 公开路由
  - [x] SubTask 5.3: 配置 `/admin/*` 受保护路由（AdminRouteGuard + AdminLayout），含全部子路由（参考 desktop/src/router/index.tsx 第 151-215 行）
  - [x] SubTask 5.4: 根路径 `/` 重定向到 `/admin/dashboard`

- [x] Task 6: 全局样式与主题
  - [x] SubTask 6.1: 创建 `src/styles/global.css`、`src/styles/variables.css`（与 user 端对齐）
  - [x] SubTask 6.2: App.tsx 配置 antd ConfigProvider（dark 主题、colorPrimary #6366f1、zhCN locale）

- [x] Task 7: 后端 AdminAuth 模块
  - [x] SubTask 7.1: 创建 `backend/src/modules/admin-auth/admin-auth.module.ts`
  - [x] SubTask 7.2: 创建 `admin-auth.controller.ts`（POST /admin/auth/login、POST /admin/auth/logout、GET /admin/auth/profile）
  - [x] SubTask 7.3: 创建 `admin-auth.service.ts`（校验用户名密码、签发 adminToken、查询 permissions）
  - [x] SubTask 7.4: 创建 `admin-auth.strategy.ts`（JWT 策略，复用 JwtModule 但使用独立 secret/audience）
  - [x] SubTask 7.5: 创建 `AdminGuard`（校验 adminToken + 注入 adminUser 到 request）
  - [x] SubTask 7.6: 在 `app.module.ts` 注册 AdminAuthModule

- [x] Task 8: 后端 AdminRole 模块
  - [x] SubTask 8.1: 检查 `backend/src/modules/user/entities/role.entity.ts` 是否含 permissions 字段，缺则补充
  - [x] SubTask 8.2: 创建 `backend/src/modules/admin-role/admin-role.module.ts`
  - [x] SubTask 8.3: 创建 `admin-role.controller.ts`（GET /admin/roles、PUT /admin/roles/:id/permissions）
  - [x] SubTask 8.4: 创建 `admin-role.service.ts`
  - [x] SubTask 8.5: 在 `app.module.ts` 注册 AdminRoleModule

- [x] Task 9: 后端 OperationLog 模块
  - [x] SubTask 9.1: 创建 `backend/src/modules/admin-log/admin-log.module.ts`
  - [x] SubTask 9.2: 创建 `operation-log.entity.ts`（id/userId/username/type/target/operation/ip/ua/createdAt）
  - [x] SubTask 9.3: 创建 `admin-log.controller.ts`（GET /admin/operation-logs 分页查询）
  - [x] SubTask 9.4: 创建 `admin-log.service.ts`
  - [x] SubTask 9.5: 创建 `OperationLogInterceptor`，自动记录 admin 写操作
  - [x] SubTask 9.6: 在 `app.module.ts` 注册 AdminLogModule

- [x] Task 10: 后端 admin 种子数据
  - [x] SubTask 10.1: 创建 `backend/sql/admin-seed.sql`：插入超级管理员账号（密码 bcrypt 哈希）、超级角色、全部权限关联
  - [x] SubTask 10.2: 在 `backend/package.json` 添加 `seed:admin` 脚本（执行 SQL）
  - [x] SubTask 10.3: 更新 `.env.example` 添加 `ADMIN_JWT_SECRET`、`ADMIN_JWT_EXPIRES_IN`

- [x] Task 11: Nginx 配置更新
  - [x] SubTask 11.1: 修改 `deploy/nginx.conf`，新增 `location /admin/ { alias /usr/share/nginx/html/admin/; try_files $uri /admin/index.html; }`
  - [x] SubTask 11.2: `/api/admin/` 由现有 `location /api/` 反代覆盖，无需单独配置

- [x] Task 12: 部署与文档
  - [x] SubTask 12.1: 在 `frontend/admin/package.json` 添加 `build` 脚本，输出到 `dist/`
  - [x] SubTask 12.2: 创建 `frontend/admin/.env.production`（`VITE_API_BASE_URL=/api`）
  - [x] SubTask 12.3: 更新 `deploy/deploy.sh` 与 `deploy/upload-files.md`，增加 admin 前端构建产物上传步骤

- [x] Task 13: 类型检查与构建验证
  - [x] SubTask 13.1: 在 `frontend/admin/` 运行 `npx tsc --noEmit`，确保零类型错误（退出码 0）
  - [x] SubTask 13.2: 运行 `npm run build`，确保构建产物生成（dist/index.html + assets/）
  - [x] SubTask 13.3: 在 `backend/` 运行 `npx tsc --noEmit`，确保后端零类型错误（退出码 0）

# Task Dependencies
- Task 2 → Task 3 → Task 4 → Task 5（前端依赖链）
- Task 7 → Task 8 → Task 9（后端依赖链，AdminGuard 被后续模块复用）
- Task 1 与 Task 7 可并行（前端骨架与后端模块独立）
- Task 11 依赖 Task 12（先有构建产物再配 nginx）
- Task 13 依赖所有前置任务
