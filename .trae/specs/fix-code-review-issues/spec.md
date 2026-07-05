# 代码审查问题修复 Spec

## Why
代码审查报告（`c:\Users\Administrator\.qclaw\workspace\code_review_20260705.md`）指出管理后台存在安全问题与前后端接口不对齐。经核查，报告部分为误报（AdminGuard 已异步、CommonModule 已导入、baseURL 已是 /api、vite proxy 已是 3001、operation_logs 建表已存在），但发现一个**更严重的真实 bug**：admin-log/admin-role 控制器及 admin-auth 的 logout/profile 方法未标 @Public()，会被全局 JwtAuthGuard（用户端 JWT_SECRET）先拦截，adminToken（ADMIN_JWT_SECRET 签发）必然校验失败 → 所有受保护 admin 端点返回 401，管理后台除登录外完全不可用。同时 9 个 admin 业务控制器确实缺失，前端 12 个模块中大部分页面调用将 404。

## What Changes

### P0 安全与可用性修复
- **修复致命 bug**：为 `AdminLogController`、`AdminRoleController` 类级添加 `@Public()`，为 `AdminAuthController` 的 `logout`/`profile` 方法添加 `@Public()`，使其跳过全局 JwtAuthGuard，由 `AdminGuard`（admin secret）接管校验
- **JWT_SECRET 启动校验**：后端启动时检查 `JWT_SECRET` 与 `ADMIN_JWT_SECRET` 不等于 `.env.example` 中的默认值，否则拒绝启动并报错
- **docker-compose.yml 补充 SSL 挂载**：nginx 服务挂载 `./nginx/ssl:/etc/nginx/ssl:ro`
- **nginx.conf 补充 HTTPS server 块**：新增 443 端口 SSL 配置 + 80→443 重定向
- **admin-seed.sql 安全加固**：超级管理员添加 `must_change_password` 标记字段（若 user 表支持），首次登录强制改密；部署文档已提示，不在代码库存储额外密钥

### P1 前后端接口对齐（核心）
新增 9 个 admin 业务控制器，匹配前端 `frontend/admin/src/api/` 已有契约：
- `AdminUserController` → `admin/users`（列表/详情/封禁/解禁/调整积分/重置密码）
- `AdminAgentController` → `admin/agents`（列表/详情/审核/上下架/定价/分类）
- `AdminWorkflowController` → `admin/workflows`（列表/详情/审核/统计）
- `AdminPluginController` → `admin/plugins`（列表/详情/审核/同步）
- `AdminModelController` → `admin/models`（列表/详情/启用禁用/测试）
- `AdminTransactionController` → `admin/transactions`（交易列表/统计）
- `AdminOrderController` → `admin/orders`（充值订单列表/详情/退款）
- `AdminInvoiceController` → `admin/invoices`（发票列表/详情/审核）
- `AdminAuditController` → `admin/audit`（审核队列/敏感词/AI 配置）
- `AdminSystemController` → `admin/system`（系统配置/租户/公告）

### P2 改进
- `UpdatePermissionsDto` 从 `admin-role.controller.ts` 内联定义抽离到 `dto/update-permissions.dto.ts`，添加 class-validator 装饰器
- 修正 `admin-auth.controller.ts` 头部注释（当前注释描述与实际行为相反）

## Impact
- Affected specs: `add-web-admin-portal`（修复其遗留的 @Public bug）、`deploy-backend-skeleton`（新增 admin 控制器）、`package-and-deploy`（SSL/HTTPS 配置）
- Affected code:
  - 修改 `backend/src/modules/admin-auth/admin-auth.controller.ts`（logout/profile 加 @Public、修正注释）
  - 修改 `backend/src/modules/admin-log/admin-log.controller.ts`（类级加 @Public）
  - 修改 `backend/src/modules/admin-role/admin-role.controller.ts`（类级加 @Public、DTO 抽离）
  - 新增 `backend/src/modules/admin-user/`、`admin-agent/`、`admin-workflow/`、`admin-plugin/`、`admin-model/`、`admin-finance/`、`admin-audit/`、`admin-system/` 8 个模块目录
  - 修改 `backend/src/app.module.ts`（注册新模块 + JWT_SECRET 启动校验）
  - 修改 `backend/src/main.ts`（启动前校验 JWT_SECRET）
  - 修改 `deploy/nginx.conf`（HTTPS server 块）
  - 修改 `docker-compose.yml`（SSL 挂载）
- **BREAKING**：无（仅新增与修复，不改变现有用户端契约）

## ADDED Requirements

### Requirement: Admin 端点跳过全局 JwtAuthGuard
所有 `admin/*` 路径的控制器 SHALL 标注 `@Public()` 以跳过全局 JwtAuthGuard（用户端 secret），由 `AdminGuard`（ADMIN_JWT_SECRET）统一接管认证。

#### Scenario: adminToken 访问受保护 admin 端点
- **WHEN** 客户端 GET `/admin/operation-logs` 携带 adminToken（ADMIN_JWT_SECRET 签发）
- **THEN** 全局 JwtAuthGuard 因 @Public() 跳过
- **AND** AdminGuard 用 ADMIN_JWT_SECRET 校验通过
- **AND** 返回 200 + 日志列表

#### Scenario: 无 token 访问
- **WHEN** 客户端 GET `/admin/operation-logs` 无 Authorization 头
- **THEN** AdminGuard 返回 401

### Requirement: JWT_SECRET 启动校验
后端启动时 SHALL 校验 `JWT_SECRET` 与 `ADMIN_JWT_SECRET` 不等于默认占位值，否则拒绝启动。

#### Scenario: 使用默认 secret 启动
- **WHEN** 环境变量 `JWT_SECRET=change-me-in-production-at-least-32-chars-please`
- **THEN** 后端启动失败，日志输出 "JWT_SECRET 不能使用默认值，请配置 .env"
- **AND** 进程退出码 1

### Requirement: 9 个 Admin 业务控制器
后端 SHALL 新增 9 个 admin 业务控制器，端点契约与前端 `frontend/admin/src/api/` 完全对齐。

#### Scenario: 用户管理列表
- **WHEN** 管理员 GET `/admin/users?page=1&pageSize=20&keyword=`
- **THEN** 返回 `{ list, total, page, pageSize }`

#### Scenario: 封禁用户
- **WHEN** 管理员 POST `/admin/users/:id/ban` body `{ reason, duration }`
- **THEN** 用户状态更新，返回 200

#### Scenario: Agent 列表
- **WHEN** 管理员 GET `/admin/agents`
- **THEN** 返回 Agent 分页列表

### Requirement: HTTPS 部署
nginx.conf SHALL 提供 443 端口 HTTPS server 块与 80→443 重定向，docker-compose SHALL 挂载 SSL 证书目录。

#### Scenario: HTTP 访问
- **WHEN** 客户端访问 `http://zt.shentongapi.cn/admin/`
- **THEN** 301 重定向到 `https://zt.shentongapi.cn/admin/`

## MODIFIED Requirements

### Requirement: AdminAuth 控制器注释
修正 `admin-auth.controller.ts` 头部注释，准确描述 @Public 与 AdminGuard 的协作机制。

## REMOVED Requirements
无
