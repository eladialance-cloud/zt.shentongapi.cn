# 独立 Web 管理后台 Spec

## Why
当前管理后台页面内嵌在 Electron 桌面客户端（`desktop/src/pages/admin/`），运维/管理员必须安装桌面端才能操作，无法通过浏览器直接管理。同时落地站 `frontend/user/`（zt.shentongapi.cn）仅有 Landing/Login/Register 三页，缺失浏览器可访问的独立管理后台。后端 admin 基础端点（auth/roles/operation-logs）尚未实现，构成阻塞。

## What Changes
- **新增** `frontend/admin/` 目录：独立 Vite + React + TypeScript Web 管理后台应用
- **复用** `desktop/src/` 下的 admin 类型定义、admin API 客户端、admin store、admin 页面组件（迁移到 web 项目，去掉 Electron 依赖）
- **配置** Vite `base: '/admin/'` 与路由 `basename="/admin"`，部署到 zt.shentongapi.cn/admin/*
- **新增** 后端 admin 基础端点：
  - `POST /admin/auth/login` 管理员登录（用户名 + 密码 + 图形验证码）
  - `POST /admin/auth/logout` 管理员登出
  - `GET  /admin/auth/profile` 当前管理员信息 + 权限
  - `GET  /admin/roles` 角色列表
  - `PUT  /admin/roles/:id/permissions` 更新角色权限
  - `GET  /admin/operation-logs` 操作日志查询
- **新增** 后端 `AdminAuthModule`、`AdminRoleModule`（含 JWT 策略 + RolesGuard 复用 + Admin 实体）
- **新增** Nginx `/admin` location 块，指向 admin web 静态资源
- **新增** admin 种子数据脚本：默认超级管理员账号 + 默认角色 + 默认权限

## Impact
- Affected specs: `deploy-backend-skeleton`（新增 admin 模块）、`refine-landing-download-site`（同域名 /admin 路径共存）
- Affected code:
  - 新增 `frontend/admin/`（整个新项目）
  - 修改 `backend/src/app.module.ts`（注册 AdminAuthModule / AdminRoleModule）
  - 修改 `backend/src/modules/user/entities/role.entity.ts`（补充权限字段，若缺）
  - 修改 `backend/database/seed.sql`（admin 种子数据）
  - 修改 `deploy/nginx.conf`（/admin location）
- **BREAKING**：无（独立新增，不影响现有用户端与桌面端）

## ADDED Requirements

### Requirement: Web 管理后台独立部署
系统 SHALL 提供独立于桌面客户端的 Web 管理后台，部署在同域名 `/admin` 路径下，浏览器直接访问，无需安装任何客户端。

#### Scenario: 管理员浏览器访问
- **WHEN** 管理员在浏览器打开 `https://zt.shentongapi.cn/admin`
- **THEN** 重定向到 `/admin/login`，显示管理员登录页（用户名 + 密码 + 图形验证码）
- **AND** 登录成功后跳转 `/admin/dashboard`，渲染 12 项菜单的侧边栏布局

#### Scenario: 未登录访问受保护路由
- **WHEN** 未登录用户访问 `/admin/users`
- **THEN** 重定向到 `/admin/login`

#### Scenario: 权限不足
- **WHEN** 已登录但无 `user:write` 权限的管理员访问用户编辑页
- **THEN** 渲染 antd Result 403 页面

### Requirement: 管理员认证端点
后端 SHALL 提供独立的 admin 认证端点，使用独立 adminToken（不与用户端 accessToken 混淆）。

#### Scenario: 登录成功
- **WHEN** 客户端 POST `/admin/auth/login` body `{ username, password, captcha }`
- **THEN** 返回 `{ token, expiresAt, user, permissions }`
- **AND** 设置 HttpOnly cookie（可选）

#### Scenario: 凭证错误
- **WHEN** 用户名或密码错误
- **THEN** 返回 401 + `{ code, message: '用户名或密码错误' }`

#### Scenario: 获取当前管理员
- **WHEN** 客户端 GET `/admin/auth/profile` 携带 adminToken
- **THEN** 返回 `{ user, permissions }`

### Requirement: 角色与权限管理
后端 SHALL 提供角色列表查询与权限更新端点，前端 SHALL 提供角色权限编辑树。

#### Scenario: 更新角色权限
- **WHEN** 管理员 PUT `/admin/roles/:id/permissions` body `{ permissionCodes: string[] }`
- **THEN** 该角色权限更新，返回 200
- **AND** 操作记入 operation-logs

### Requirement: 操作日志
后端 SHALL 记录所有 admin 写操作，并暴露查询端点。

#### Scenario: 查询操作日志
- **WHEN** 管理员 GET `/admin/operation-logs?userId=&type=&startTime=&endTime=&page=&pageSize=`
- **THEN** 返回分页日志列表

### Requirement: 12 个管理模块页面
Web 管理后台 SHALL 复用桌面端 admin 页面，覆盖 12 个模块：仪表盘、用户管理、Key 池、Agent、工作流、插件、模型、财务、审核、统计、版本、系统。

#### Scenario: 模块导航
- **WHEN** 管理员点击侧边栏「用户管理」
- **THEN** 路由跳转 `/admin/users`，渲染用户列表页（复用 desktop/pages/admin/Users/index.tsx 逻辑）

### Requirement: 默认管理员种子数据
系统 SHALL 提供默认超级管理员账号，便于首次部署后立即登录。

#### Scenario: 首次部署
- **WHEN** 执行 `npm run seed:admin`
- **THEN** 创建超级管理员 `admin / Admin@123456`（强制首次登录改密）+ 默认超级角色 + 全部权限

## MODIFIED Requirements

### Requirement: Nginx 部署配置
原 nginx.conf 仅服务落地站根路径，现新增 `/admin` location 块指向 admin web 静态资源，并配置 try_files 支持 SPA 路由。

## REMOVED Requirements
无
