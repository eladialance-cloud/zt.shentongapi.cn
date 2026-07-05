# Checklist

## P0 致命 bug 修复
- [x] `admin-log.controller.ts` 类级有 `@Public()` 装饰器
- [x] `admin-role.controller.ts` 类级有 `@Public()` 装饰器
- [x] `admin-auth.controller.ts` 的 `logout` 方法有 `@Public()`
- [x] `admin-auth.controller.ts` 的 `profile` 方法有 `@Public()`
- [x] `admin-auth.controller.ts` 头部注释准确描述 @Public + AdminGuard 协作
- [x] adminToken 访问 `/admin/operation-logs` 不再返回 401（全局守卫跳过 + AdminGuard 接管）

## JWT_SECRET 启动校验
- [x] `backend/src/common/utils/env-validator.ts` 存在，导出 `validateJwtSecrets()`
- [x] `main.ts` 在 bootstrap 前 `validateJwtSecrets()`
- [x] JWT_SECRET 等于默认值时启动失败退出码 1
- [x] ADMIN_JWT_SECRET 等于 JWT_SECRET 时启动失败

## SSL/HTTPS 部署
- [x] `docker-compose.yml` nginx volumes 含 `./nginx/ssl:/etc/nginx/ssl:ro`
- [x] `deploy/nginx.conf` 含 80 端口 `return 301 https://$host$request_uri` 重定向
- [x] `deploy/nginx.conf` 含 443 端口 server 块 + ssl_certificate 配置（zt.shentongapi.cn.crt/key）
- [x] `deploy/ssl/README.md` 说明证书放置路径

## admin-seed 安全加固
- [x] user.entity.ts 新增 `mustChangePassword` 字段
- [x] admin-auth.service.ts login 返回含 `mustChangePassword` 字段
- [x] admin-auth.controller.ts 新增 POST /admin/auth/change-password 端点
- [x] admin-auth.service.ts 新增 changePassword 方法（校验旧密码 + 更新 + 清除标记）
- [x] 前端 admin-auth-api.ts 类型含 `mustChangePassword` + changeAdminPassword API
- [x] 前端 admin store 登录后检查 mustChangePassword 并重定向改密页
- [x] 前端 ChangePassword 页面 + 路由 + AdminRouteGuard 强制重定向
- [x] admin-seed.sql 设置 must_change_password=1

## 9 个 Admin 业务控制器
- [x] `admin-user.controller.ts`：GET /、GET /:id、POST /:id/ban、POST /:id/unban、POST /:id/credits-adjust、POST /:id/reset-password、PUT /:id/level、GET /:id/orders、GET /:id/transactions（+ user-levels/recharge-orders/devices 控制器）
- [x] `admin-agent.controller.ts`：GET /、GET /:id、POST /:id/review、POST /:id/publish、POST /:id/unpublish、PUT /:id/pricing、GET /categories、POST /categories、PUT /categories/:id（+ import-github/review 端点）
- [x] `admin-workflow.controller.ts`：GET /、GET /:id、POST /:id/review、GET /stats（+ create/update/delete/approve/reject）
- [x] `admin-plugin.controller.ts`：GET /、GET /:id、POST /:id/review、POST /sync（+ publish/unpublish/sync-status）
- [x] `admin-model.controller.ts`：GET /、GET /:id、POST /:id/enable、POST /:id/disable、POST /:id/test（+ create/update/delete/providers/sync）
- [x] `admin-finance.controller.ts`：GET /transactions、GET /transactions/:id、GET /orders、GET /orders/:id、POST /orders/:id/refund、GET /invoices、GET /invoices/:id、POST /invoices/:id/audit（+ dashboard/reconciliation）
- [x] `admin-audit.controller.ts`：GET /queue、POST /queue/:id/approve、POST /queue/:id/reject、GET /sensitive-words、POST /sensitive-words、DELETE /sensitive-words/:id、GET /ai-config、PUT /ai-config（+ test/false-positive/batch）
- [x] `admin-system.controller.ts`：GET /config、PUT /config、GET /tenants、GET /announcements、POST /announcements、PUT /announcements/:id（+ cache/clear/suspend/publish/unpublish/delete）
- [x] 所有 admin 控制器均有 `@Public()` + `@UseGuards(AdminGuard)`
- [x] `app.module.ts` 注册 8 个新模块

## P2 改进
- [x] `backend/src/modules/admin-role/dto/update-permissions.dto.ts` 存在，含 class-validator 装饰器
- [x] `admin-role.controller.ts` 使用抽离的 DTO，无内联定义

## 类型检查
- [x] `backend/` 运行 `npx tsc --noEmit` 退出码 0
- [x] `frontend/admin/` 运行 `npx tsc --noEmit` 退出码 0

## 端点覆盖对照（前端 API → 后端控制器）
- [x] `frontend/admin/src/api/admin-auth-api.ts` 所有调用后端有对应端点（7 个）
- [x] `frontend/admin/src/api/admin-user-api.ts` 所有调用后端有对应端点（13 个）
- [x] `frontend/admin/src/api/admin-agent-api.ts` 所有调用后端有对应端点（14 个）
- [x] `frontend/admin/src/api/admin-workflow-api.ts` 所有调用后端有对应端点（8 个）
- [x] `frontend/admin/src/api/admin-plugin-api.ts` 所有调用后端有对应端点（11 个）
- [x] `frontend/admin/src/api/admin-model-api.ts` 所有调用后端有对应端点（4 个）
- [x] `frontend/admin/src/api/admin-finance-api.ts` 所有调用后端有对应端点（10 个）
- [x] `frontend/admin/src/api/admin-audit-api.ts` 所有调用后端有对应端点（11 个）
- [x] `frontend/admin/src/api/admin-system-api.ts` 所有调用后端有对应端点（13 个）
- [x] `frontend/admin/src/api/admin-stats-api.ts` 所有调用后端有对应端点（5 个）
- [x] `frontend/admin/src/api/admin-version-api.ts` 所有调用后端有对应端点（6 个）
- [x] `frontend/admin/src/api/admin-api-key-pool-api.ts` 所有调用后端有对应端点（7 个）

## 运行时验证（手动，需实际部署后验证）
- [ ] adminToken 访问 `/admin/operation-logs` 返回 200
- [ ] adminToken 访问 `/admin/users` 返回 200
- [ ] adminToken 访问 `/admin/agents` 返回 200
- [ ] 无 token 访问 admin 端点返回 401
- [ ] HTTP 访问 301 重定向到 HTTPS
- [ ] 后端使用默认 JWT_SECRET 启动失败
- [ ] 默认 admin 账号首次登录强制改密
