# Checklist

## 项目脚手架
- [x] `backend/package.json` 存在,包含 NestJS 10、TypeORM 0.3、Passport JWT、class-validator、Swagger、Helmet、Throttler、ioredis 等核心依赖
- [x] `backend/package.json` 包含 `start`、`start:dev`、`start:prod`、`build`、`lint` 脚本
- [x] `backend/tsconfig.json` 配置 strict: true、emitDecoratorMetadata、experimentalDecorators(strictPropertyInitialization: false,TypeORM 实体模式标准做法)
- [x] `backend/nest-cli.json` 配置 sourceRoot: src、collection: @nestjs/schematics
- [x] `backend/.env.example` 包含 PORT、DB_HOST/PORT/USER/PASSWORD/DATABASE、REDIS_URL、JWT_SECRET/EXPIRES_IN/REFRESH_EXPIRES_IN、CORS_ORIGINS

## 应用入口与根模块
- [x] `src/main.ts` 启动 NestJS 应用,设置全局前缀 `/api`
- [x] `src/main.ts` 启用 Swagger,文档路径 `/api/docs`
- [x] `src/main.ts` 启用 CORS,允许 `http://localhost:3000`
- [x] `src/main.ts` 注册全局 ValidationPipe(whitelist + transform)
- [x] `src/main.ts` 注册全局 AllExceptionsFilter、TransformInterceptor、LoggingInterceptor
- [x] `src/main.ts` 监听 `process.env.PORT || 3001`
- [x] `src/app.module.ts` 导入 ConfigModule.forRoot({ isGlobal: true })
- [x] `src/app.module.ts` 导入 TypeOrmModule.forRootAsync(使用 database.config)
- [x] `src/app.module.ts` 导入 ThrottlerModule
- [x] `src/app.module.ts` 导入 AuthModule、UserModule 与 17 个业务模块(启动日志确认 19+ 模块全部 `dependencies initialized`)
- [x] `src/app.controller.ts` 提供 `GET /api/health` 返回 `{ code: 0, data: { status: 'ok' }, message: 'success', timestamp }`

## 配置层
- [x] `src/config/database.ts` 返回 TypeORM MySQL 配置,entities 路径为 `src/modules/**/*.entity.{ts,js}`,synchronize: false
- [x] `src/config/redis.config.ts`、`jwt.config.ts`、`swagger.config.ts`、`cors.config.ts`、`throttler.config.ts`、`app.config.ts` 均存在且通过 ConfigService 读取环境变量

## 公共基础设施
- [x] `src/common/types/api-response.type.ts` 定义 `ApiResponse<T>` 接口 `{ code, data, message, timestamp }`
- [x] `src/common/types/pagination.type.ts` 定义 `PaginatedResult<T>` 与 `PaginationQuery`
- [x] `src/common/constants/error.constant.ts` 定义 ErrorCode 枚举(0=SUCCESS、1001=USER_NOT_FOUND、1002=INVALID_CREDENTIALS、1003=TOKEN_EXPIRED、1004=TOKEN_INVALID、1005=VALIDATION_FAILED、1006=UNAUTHORIZED、1007=FORBIDDEN、1008=NOT_FOUND、1099=INTERNAL_ERROR)
- [x] `src/common/exceptions/business.exception.ts` 继承 HttpException,携带 code + message + 静态 throw 方法
- [x] `src/common/filters/all-exceptions.filter.ts` 统一处理 HttpException、BusinessException、ValidationError、未知异常,输出统一格式
- [x] `src/common/interceptors/transform.interceptor.ts` 包装成功响应为 `{ code: 0, data, message: 'success', timestamp }`
- [x] `src/common/interceptors/logging.interceptor.ts` 记录请求耗时
- [x] `src/common/pipes/validation.pipe.ts` 配置全局 ValidationPipe
- [x] `src/common/decorators/current-user.decorator.ts` 实现 `@CurrentUser()` 参数装饰器 + `ICurrentUser` 接口
- [x] `src/common/decorators/public.decorator.ts` 实现 `@Public()` 方法/类装饰器,设置 IS_PUBLIC_KEY metadata
- [x] `src/common/decorators/roles.decorator.ts` 实现 `@Roles(...roles)` 装饰器
- [x] `src/common/decorators/pagination.decorator.ts` 实现 `@Pagination()` 装饰器,从 query 提取 page/pageSize
- [x] `src/common/guards/jwt-auth.guard.ts` 继承 AuthGuard('jwt'),支持通过 `@Public()` 跳过(已注册为 APP_GUARD)
- [x] `src/common/guards/roles.guard.ts` 配合 `@Roles()` 校验角色
- [x] `src/common/services/encryption.service.ts` 封装 bcryptjs hash/compare(由 bcrypt 切换至 bcryptjs 解决 Windows 原生编译问题)
- [x] `src/common/services/redis.service.ts` 封装 Redis get/set/del/expire
- [x] `src/common/utils/date.util.ts`、`string.util.ts`、`file.util.ts` 存在
- [x] `src/common/common.module.ts` 聚合 EncryptionService、RedisService、CacheService 并 export

## 认证模块
- [x] `src/modules/auth/dto/register.dto.ts` 字段:username、email、password(MinLength 8)、inviteCode?
- [x] `src/modules/auth/dto/login.dto.ts` 字段:account(用户名或邮箱)、password
- [x] `src/modules/auth/dto/refresh-token.dto.ts` 字段:refreshToken
- [x] `src/modules/auth/strategies/jwt.strategy.ts` 继承 PassportStrategy(Strategy),从 Bearer 提取 token,validate 返回 `{ userId, username, email, roles }`
- [x] `src/modules/auth/strategies/local.strategy.ts` 实现 username+password 校验(使用 account 字段)
- [x] `src/modules/auth/services/token.service.ts` 实现 generateAccessToken、generateRefreshToken、verifyRefreshToken、revokeRefreshToken,refresh token 存 Redis(支持 15m/7d/3600 TTL 格式)
- [x] `src/modules/auth/services/auth.service.ts` 实现 register、login、refresh、logout、validateUser
- [x] `src/modules/auth/controllers/auth.controller.ts` 提供 `POST /api/auth/register`(Public)、`POST /api/auth/login`(Public)、`POST /api/auth/refresh`(Public)、`POST /api/auth/logout`、`GET /api/auth/profile`、`GET /api/auth/me`(前端兼容别名)
- [x] 登录返回 `{ accessToken, refreshToken, user: { id, username, email, avatar, roles, ... } }`

## 用户模块
- [x] `src/modules/user/dto/update-user.dto.ts` 支持 username、email、phone、avatar 局部更新
- [x] `src/modules/user/dto/change-password.dto.ts` 字段:oldPassword、newPassword
- [x] `src/modules/user/dto/create-user.dto.ts` 供 AuthModule 调用
- [x] `src/modules/user/services/user.service.ts` 实现 findById、findByIdWithPassword、findByUsername、findByEmail、createUser、update、changePassword、updateAvatar、findUserRoles、paginate
- [x] `src/modules/user/controllers/user.controller.ts` 提供 `GET /api/users/profile`、`PATCH /api/users/:id`、`POST /api/users/avatar`、`PATCH /api/users/password`(路由顺序:静态路径在 :id 之前)
- [x] 头像上传接口显式设置 `Content-Type: multipart/form-data`(使用 @UseInterceptors(FileInterceptor) + @UploadedFile,已修复 multer 类型)

## 业务模块骨架
- [x] 17 个业务模块均存在 `*.module.ts`、`controllers/*.controller.ts`、`services/*.service.ts`
- [x] agent 模块通过 TypeOrmModule.forFeature 注册 6 个 agent 实体
- [x] chat 模块注册 ChatSession、ChatMessage、ChatGroup
- [x] knowledgeBase 模块注册 3 个 knowledge 实体(文件夹为 knowledge/,模块类名为 KnowledgeBaseModule)
- [x] model 模块注册 Model 实体
- [x] payment 模块注册 5 个 payment 实体
- [x] plugin 模块注册 Plugin 实体
- [x] file 模块注册 File 实体
- [x] opc 模块注册 4 个 opc 实体
- [x] tenant 模块注册 Team、TeamMember 实体(从 user/entities/ 导入)
- [x] 每个业务模块的 controller 至少提供 `GET /api/<module>/health` 返回 `{ status: 'ok', module: '<name>' }`
- [x] 所有业务模块均被 AppModule imports(启动日志确认)

## 联调验证
- [x] `npm install` 执行成功,无致命错误(449 个包安装)
- [x] `npx tsc --noEmit` 零 TypeScript 错误(已修复 179 个 TS2564 实体初始化错误 + 5 个 multer 类型错误)
- [x] `npm run build` 成功(nest build 通过)
- [x] `node dist/main.js` 启动确认所有 NestJS 模块加载成功(TypeOrmModule、PassportModule、JwtModule、AgentModule、ChatModule、KnowledgeBaseModule、ModelModule、PaymentModule、CreditsModule、PluginModule、WorkflowModule、FileModule、StorageModule、RagModule、McpModule、N8nModule、OpcModule、StatisticsModule、SystemModule、TenantModule、ConfigModule、ThrottlerModule、CommonModule、AppModule 全部 `dependencies initialized`)
- [ ] `npm run start:dev` 启动成功,监听 3001 端口(**待 MySQL 启动后验证** - 当前 TypeORM 连接失败导致进程退出,非代码问题)
- [ ] `http://localhost:3001/api/docs` 可访问 Swagger UI(**待 MySQL 启动后验证**)
- [ ] `GET /api/health` 返回 `{ code: 0, data: { status: 'ok' }, message: 'success', timestamp: <number> }`(**待 MySQL 启动后验证**)
- [ ] `POST /api/auth/register` 可注册新用户,密码 bcrypt 加密(**待 MySQL 启动后验证**)
- [ ] `POST /api/auth/login` 可登录并返回 accessToken + refreshToken(**待 MySQL 启动后验证**)
- [ ] `GET /api/auth/profile` 不带 Token 返回 401,带 Token 返回用户信息(**待 MySQL 启动后验证**)
- [ ] `PATCH /api/users/:id` 可更新用户信息(**待 MySQL 启动后验证**)
- [ ] 所有 17 个业务模块的 `/api/<module>/health` 端点返回 200(**待 MySQL 启动后验证**)

## 待用户操作:启动基础设施
执行以下步骤后即可完成剩余运行时验证:
1. 安装 MySQL 8.0,创建数据库 `ai_agent`,执行 `database/init.sql` 与 `database/seed.sql`
2. 安装 Redis 7.0(默认端口 6379)
3. 编辑 `.env` 文件,设置正确的 `DB_USER`、`DB_PASSWORD`
4. 运行 `npm run start:dev`,访问 `http://localhost:3001/api/docs`
