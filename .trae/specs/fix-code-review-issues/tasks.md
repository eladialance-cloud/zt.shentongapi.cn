# Tasks

- [x] Task 1: 修复 admin 控制器 @Public 缺失致命 bug
  - [x] SubTask 1.1: `admin-log.controller.ts` 类级添加 `@Public()` 装饰器
  - [x] SubTask 1.2: `admin-role.controller.ts` 类级添加 `@Public()` 装饰器
  - [x] SubTask 1.3: `admin-auth.controller.ts` 的 `logout` 和 `profile` 方法添加 `@Public()`
  - [x] SubTask 1.4: 修正 `admin-auth.controller.ts` 头部注释

- [x] Task 2: JWT_SECRET 启动校验
  - [x] SubTask 2.1: 创建 `backend/src/common/utils/env-validator.ts`
  - [x] SubTask 2.2: 在 `main.ts` bootstrap 前 `await validateJwtSecrets()`
  - [x] SubTask 2.3: 校验 ADMIN_JWT_SECRET !== JWT_SECRET

- [x] Task 3: SSL/HTTPS 部署配置
  - [x] SubTask 3.1: `docker-compose.yml` 已有 SSL 挂载（无需修改）
  - [x] SubTask 3.2: `nginx.conf` 已有 80→443 重定向
  - [x] SubTask 3.3: `nginx.conf` 已有 443 SSL server 块，证书文件名对齐为 zt.shentongapi.cn.crt/key
  - [x] SubTask 3.4: `deploy/ssl/README.md` 已创建

- [x] Task 4: admin-seed.sql 安全加固
  - [x] SubTask 4.1: user 实体新增 `mustChangePassword` 字段
  - [x] SubTask 4.2: admin-auth.service.ts login 返回 `mustChangePassword`，新增 changePassword 方法 + change-password 端点
  - [x] SubTask 4.3: 前端 admin-auth-api.ts 类型添加 `mustChangePassword`，新增 changeAdminPassword API
  - [x] SubTask 4.4: 前端 admin store 登录后检查 mustChangePassword，创建 ChangePassword 页面 + 路由 + AdminRouteGuard 强制重定向
  - [x] SubTask 4.5: admin-seed.sql 设置 must_change_password=1

- [x] Task 5: 新增 AdminUser 控制器
  - [x] SubTask 5.1-5.4: 创建 admin-user 模块（含 4 个控制器：users/user-levels/recharge-orders/devices）+ service + 8 个 DTO

- [x] Task 6: 新增 AdminAgent 控制器
  - [x] SubTask 6.1-6.4: 创建 admin-agent 模块 + controller + service + agent-category 实体 + 7 个 DTO

- [x] Task 7: 新增 AdminWorkflow 控制器
  - [x] SubTask 7.1-7.4: 创建 admin-workflow 模块 + controller + service + workflow 实体 + 2 个 DTO

- [x] Task 8: 新增 AdminPlugin 控制器
  - [x] SubTask 8.1-8.4: 创建 admin-plugin 模块 + controller + service（复用 PluginEntity）+ 2 个 DTO

- [x] Task 9: 新增 AdminModel 控制器
  - [x] SubTask 9.1-9.4: 创建 admin-model 模块 + controller + service（复用 ModelEntity）+ 3 个 DTO

- [x] Task 10: 新增 AdminFinance 控制器
  - [x] SubTask 10.1-10.4: 创建 admin-finance 模块 + controller + service + invoice 实体 + 8 个 DTO

- [x] Task 11: 新增 AdminAudit 控制器
  - [x] SubTask 11.1-11.4: 创建 admin-audit 模块（含 2 个控制器：audit/sensitive-words）+ service + 3 个实体 + 7 个 DTO

- [x] Task 12: 新增 AdminSystem 控制器
  - [x] SubTask 12.1-12.4: 创建 admin-system 模块（含 3 个控制器：system/tenants/announcements）+ service + 3 个实体 + 8 个 DTO

- [x] Task 13: P2 小改进
  - [x] SubTask 13.1: 创建 `admin-role/dto/update-permissions.dto.ts`
  - [x] SubTask 13.2: `admin-role.controller.ts` 使用抽离的 DTO

- [x] Task 14: 类型检查与验证
  - [x] SubTask 14.1: `backend/` 运行 `npx tsc --noEmit` 退出码 0
  - [x] SubTask 14.2: 所有 admin 控制器均有 @Public + @UseGuards(AdminGuard)
  - [x] SubTask 14.3: 前端 admin API 调用的端点后端全部覆盖（13 个 API 文件全覆盖）
  - [x] SubTask 14.4: `frontend/admin/` 运行 `npx tsc --noEmit` 退出码 0
  - [x] SubTask 14.5: 8 个新模块已注册到 app.module.ts

# Task Dependencies
- Task 1 独立，最高优先级（修复致命 bug）✅
- Task 2 独立（启动校验）✅
- Task 3 独立（SSL/HTTPS）✅
- Task 4 依赖 Task 1（先修复 @Public）✅
- Task 5-12 可并行（各 admin 控制器独立）✅
- Task 13 独立 ✅
- Task 14 依赖所有前置任务 ✅
