# 部署后端骨架 Spec

## Why
前端骨架已完成、数据库 29 张表与 30 个 TypeORM Entity 已就绪,但缺少 NestJS 后端运行骨架。需要搭建可启动、可联调的最小可用后端,使前端能够打通登录、用户、Agent、Chat 等核心接口,验证前后端契约一致性。

## What Changes
- 新建 NestJS 10 项目脚手架(package.json / tsconfig.json / nest-cli.json / .env.example)
- 创建应用入口 `src/main.ts` 与根模块 `src/app.module.ts`,启用 Swagger、CORS、全局管道/过滤器/拦截器、`/api` 前缀
- 完善配置层 `src/config/`(database / redis / jwt / swagger / cors / throttler)
- 构建 `src/common/` 公共基础设施:装饰器(current-user / public / roles)、守卫(jwt / roles / throttler)、过滤器(all-exceptions)、拦截器(logging / transform)、管道(validation)、中间件(logger)、类型(api-response / pagination)、工具(date / string / file)、服务(redis / cache / encryption)
- 实现认证模块 `auth`(controller / service / token.service / jwt.strategy / local.strategy / dto),支持注册、登录、刷新 Token、登出
- 实现用户模块 `user`(controller / service / dto),支持用户 CRUD、个人信息、修改密码
- 为其余业务模块创建骨架(controller / service / module / 基础 dto):agent、chat、knowledgeBase、model、payment、credits、plugin、workflow、file、storage、rag、mcp、n8n、opc、statistics、system、tenant
- 复用已存在的 30 个 Entity 文件,在各自模块通过 `TypeOrmModule.forFeature([...])` 注册
- 健康检查端点 `GET /api/health` 与 Swagger 文档 `GET /api/docs`
- **BREAKING**:首次引入后端项目,无现有 API 兼容性负担

## Impact
- Affected specs: 数据库设计文档(已就绪)、前端开发指南(API 契约对齐)
- Affected code:
  - 新建 `D:\二次开发\backend\package.json`、`tsconfig.json`、`nest-cli.json`、`.env.example`
  - 新建 `src/main.ts`、`src/app.module.ts`、`src/app.controller.ts`、`src/app.service.ts`
  - 新建 `src/config/*.ts`(7 个配置文件)
  - 新建 `src/common/**`(装饰器、守卫、过滤器、拦截器、管道、中间件、服务、类型、工具)
  - 新建 `src/modules/auth/**`、`src/modules/user/**`(完整实现)
  - 新建 `src/modules/{agent,chat,knowledgeBase,model,payment,credits,plugin,workflow,file,storage,rag,mcp,n8n,opc,statistics,system,tenant}/**`(骨架)
  - 复用现有 `src/modules/*/entities/*.entity.ts` 与 `src/common/entities/base.entity.ts`

## ADDED Requirements

### Requirement: 后端项目可启动
系统 SHALL 提供一个可通过 `npm install && npm run start:dev` 启动的 NestJS 项目,监听端口 3001(可通过 PORT 环境变量配置)。

#### Scenario: 启动成功
- **WHEN** 开发者执行 `npm run start:dev`
- **THEN** 应用启动并监听 3001 端口
- **AND** 数据库连接成功
- **AND** Swagger 文档可在 `http://localhost:3001/api/docs` 访问
- **AND** 健康检查 `GET /api/health` 返回 `{ code: 0, data: { status: 'ok' }, message: 'success' }`

### Requirement: 统一 API 响应格式
系统 SHALL 对所有成功响应使用统一格式 `{ code: number, data: any, message: string, timestamp: number }`,通过全局 `TransformInterceptor` 实现。

#### Scenario: 成功响应
- **WHEN** 任意接口被成功调用
- **THEN** 返回 `{ code: 0, data: <结果>, message: 'success', timestamp: <毫秒时间戳> }`

### Requirement: 全局异常处理
系统 SHALL 通过全局 `AllExceptionsFilter` 捕获所有异常并返回统一错误格式,业务异常携带错误码,校验异常返回 400。

#### Scenario: 业务异常
- **WHEN** Service 抛出 `BusinessException`
- **THEN** 返回 HTTP 200,响应体 `{ code: <业务码>, data: null, message: <错误信息>, timestamp: <毫秒> }`

#### Scenario: 校验异常
- **WHEN** DTO 校验失败
- **THEN** 返回 HTTP 400,响应体 `{ code: 400, data: null, message: <字段错误详情>, timestamp: <毫秒> }`

### Requirement: JWT 认证机制
系统 SHALL 使用 Passport JWT 策略保护需要认证的接口,通过 `@Public()` 装饰器标记公开接口。

#### Scenario: 受保护接口无 Token
- **WHEN** 未携带 Authorization 头访问受保护接口
- **THEN** 返回 401,`{ code: 401, message: '未授权' }`

#### Scenario: 携带有效 Token
- **WHEN** 携带 `Authorization: Bearer <validToken>` 访问
- **THEN** 通过守卫,Controller 可通过 `@CurrentUser()` 获取当前用户

### Requirement: 认证模块核心接口
系统 SHALL 提供以下认证接口,与前端 `api/auth.ts` 契约对齐:
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录(返回 accessToken + refreshToken)
- `POST /api/auth/refresh` - 刷新 Token
- `POST /api/auth/logout` - 登出
- `GET /api/auth/profile` - 获取当前用户信息

#### Scenario: 登录成功
- **WHEN** 用户使用正确邮箱/用户名 + 密码登录
- **THEN** 返回 `{ accessToken, refreshToken, user: { id, username, email, avatar, roles } }`

### Requirement: 用户模块核心接口
系统 SHALL 提供以下用户接口,与前端 `api/user-center.ts` 契约对齐:
- `GET /api/users/profile` - 获取个人信息
- `PATCH /api/users/:id` - 更新个人信息
- `POST /api/users/avatar` - 上传头像(multipart/form-data)
- `PATCH /api/users/password` - 修改密码

### Requirement: 业务模块骨架
系统 SHALL 为以下模块创建可挂载的骨架(controller + service + module + 基础 dto),路由前缀 `/api/<module>`:
agent、chat、knowledgeBase、model、payment、credits、plugin、workflow、file、storage、rag、mcp、n8n、opc、statistics、system、tenant

#### Scenario: 骨架模块加载
- **WHEN** 应用启动
- **THEN** 所有 17 个业务模块被成功导入到 AppModule
- **AND** 每个模块至少提供一个 `GET /api/<module>/health` 或类似占位端点

### Requirement: CORS 与安全
系统 SHALL 启用 CORS 允许 `http://localhost:3000` 前端跨域访问,启用 Helmet 中间件、限流守卫(默认 60 次/分钟)。

### Requirement: 配置管理
系统 SHALL 通过 `@nestjs/config` 加载 `.env` 文件,所有配置(database / redis / jwt / port / cors origins)通过 `ConfigService` 注入,严禁硬编码。
