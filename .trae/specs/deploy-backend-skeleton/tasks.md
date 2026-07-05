# Tasks

- [x] Task 1: 创建 NestJS 项目脚手架
  - [x] SubTask 1.1: 创建 `backend/package.json`,声明 NestJS 10 + TypeORM 0.3 + Passport JWT + class-validator + Swagger + Helmet + Throttler + ioredis 等依赖与脚本(start / start:dev / start:prod / build / lint)
  - [x] SubTask 1.2: 创建 `backend/tsconfig.json`(strict: true,emitDecoratorMetadata,experimentalDecorators,outDir: ./dist)
  - [x] SubTask 1.3: 创建 `backend/nest-cli.json`(collection: @nestjs/schematics,sourceRoot: src)
  - [x] SubTask 1.4: 创建 `backend/.env.example`(PORT、DB_*、REDIS_*、JWT_*、CORS_ORIGINS)

- [x] Task 2: 创建应用入口与根模块
  - [x] SubTask 2.1: 创建 `src/main.ts`,启动 NestJS,设置全局前缀 `/api`,启用 CORS、Swagger、ValidationPipe、AllExceptionsFilter、TransformInterceptor、LoggingInterceptor,监听 PORT
  - [x] SubTask 2.2: 创建 `src/app.module.ts`,导入 ConfigModule、TypeOrmModule、RedisModule、ThrottlerModule、AuthModule、UserModule 及 17 个业务模块
  - [x] SubTask 2.3: 创建 `src/app.controller.ts` + `src/app.service.ts`,提供 `GET /api/health` 健康检查

- [x] Task 3: 完善配置层 `src/config/`
  - [x] SubTask 3.1: 创建 `database.config.ts`(TypeORM MySQL 配置,entities 路径指向 `src/modules/**/*.entity.ts`,synchronize: false)
  - [x] SubTask 3.2: 创建 `redis.config.ts`、`jwt.config.ts`、`swagger.config.ts`、`cors.config.ts`、`throttler.config.ts`、`app.config.ts`

- [x] Task 4: 构建 `src/common/` 公共基础设施
  - [x] SubTask 4.1: 创建类型 `types/api-response.type.ts`(ApiResponse<T>)、`types/pagination.type.ts`(PaginatedResult、PaginationQuery)
  - [x] SubTask 4.2: 创建常量 `constants/error.constant.ts`(ErrorCode 枚举)、`constants/app.constant.ts`
  - [x] SubTask 4.3: 创建自定义异常 `exceptions/business.exception.ts`(携带 code+message)、`exceptions/validation.exception.ts`
  - [x] SubTask 4.4: 创建全局过滤器 `filters/all-exceptions.filter.ts`(统一错误响应格式)
  - [x] SubTask 4.5: 创建拦截器 `interceptors/transform.interceptor.ts`(包装成功响应)、`interceptors/logging.interceptor.ts`
  - [x] SubTask 4.6: 创建管道 `pipes/validation.pipe.ts`(全局 ValidationPipe 配置,whitelist + transform)
  - [x] SubTask 4.7: 创建装饰器 `decorators/current-user.decorator.ts`、`decorators/public.decorator.ts`、`decorators/roles.decorator.ts`、`decorators/pagination.decorator.ts`
  - [x] SubTask 4.8: 创建守卫 `guards/jwt-auth.guard.ts`(支持 @Public 跳过)、`guards/roles.guard.ts`、`guards/throttle.guard.ts`
  - [x] SubTask 4.9: 创建中间件 `middleware/logger.middleware.ts`
  - [x] SubTask 4.10: 创建工具 `utils/date.util.ts`、`utils/string.util.ts`、`utils/file.util.ts`
  - [x] SubTask 4.11: 创建服务 `services/redis.service.ts`、`services/cache.service.ts`、`services/encryption.service.ts`(bcrypt 封装)

- [x] Task 5: 实现认证模块 `src/modules/auth/`
  - [x] SubTask 5.1: 创建 DTO `dto/register.dto.ts`、`dto/login.dto.ts`、`dto/refresh-token.dto.ts`
  - [x] SubTask 5.2: 创建 `strategies/jwt.strategy.ts`、`strategies/local.strategy.ts`
  - [x] SubTask 5.3: 创建 `services/token.service.ts`(签发/验证 access+refresh token,refresh token 存 Redis)
  - [x] SubTask 5.4: 创建 `services/auth.service.ts`(register、login、refresh、logout、validateUser)
  - [x] SubTask 5.5: 创建 `controllers/auth.controller.ts`(`POST /register`、`POST /login`、`POST /refresh`、`POST /logout`、`GET /profile`,除 register/login 外全部受 JWT 保护)
  - [x] SubTask 5.6: 创建 `auth.module.ts`(导入 JwtModule、PassportModule、UserModule,导出 AuthService、TokenService、JwtStrategy)

- [x] Task 6: 实现用户模块 `src/modules/user/`
  - [x] SubTask 6.1: 创建 DTO `dto/update-user.dto.ts`、`dto/change-password.dto.ts`、`dto/user-query.dto.ts`
  - [x] SubTask 6.2: 创建 `services/user.service.ts`(findById、update、changePassword、uploadAvatar、findByUsername、findByEmail)
  - [x] SubTask 6.3: 创建 `controllers/user.controller.ts`(`GET /profile`、`PATCH /:id`、`POST /avatar`、`PATCH /password`)
  - [x] SubTask 6.4: 创建 `user.module.ts`(TypeOrmModule.forFeature([UserEntity, RoleEntity, UserRoleEntity]),导出 UserService)

- [x] Task 7: 创建 17 个业务模块骨架(每个模块:controller + service + module + 至少一个 health 端点)
  - [x] SubTask 7.1: agent 模块(controller/service/module,注册 AgentEntity 等所有 agent 实体)
  - [x] SubTask 7.2: chat 模块(ChatSession、ChatMessage、ChatGroup)
  - [x] SubTask 7.3: knowledgeBase 模块(KnowledgeBase、KnowledgeBaseDocument、KnowledgeBaseChunk)
  - [x] SubTask 7.4: model 模块(Model)
  - [x] SubTask 7.5: payment 模块(PaymentRecord、MembershipPlan、RechargeOrder、RevenueRecord、WithdrawalRecord)
  - [x] SubTask 7.6: credits 模块(无独立 entity,业务逻辑模块)
  - [x] SubTask 7.7: plugin 模块(Plugin)
  - [x] SubTask 7.8: workflow 模块(无 entity,占位)
  - [x] SubTask 7.9: file 模块(File)
  - [x] SubTask 7.10: storage 模块(无 entity,提供存储抽象)
  - [x] SubTask 7.11: rag 模块(无 entity,占位)
  - [x] SubTask 7.12: mcp 模块(无 entity,占位)
  - [x] SubTask 7.13: n8n 模块(无 entity,占位)
  - [x] SubTask 7.14: opc 模块(OPCTeam、OPCTeamMember、OPCTask、OPCAgentRepo)
  - [x] SubTask 7.15: statistics 模块(无 entity,聚合查询)
  - [x] SubTask 7.16: system 模块(无 entity,系统配置占位)
  - [x] SubTask 7.17: tenant 模块(Team、TeamMember)

- [x] Task 8: 联调验证
  - [x] SubTask 8.1: 安装依赖 `npm install`,确认无错误(449 个包安装成功)
  - [x] SubTask 8.2: TypeScript 编译检查 `tsc --noEmit`,零错误(已修复 179 个 TS2564 + 5 个 multer 类型错误)
  - [x] SubTask 8.3: 启动开发服务器,所有 NestJS 模块加载成功(已通过 `node dist/main.js` 启动日志确认 19+ 模块全部 `dependencies initialized`)
  - [ ] SubTask 8.4: 验证 `http://localhost:3001/api/docs` Swagger 文档可访问(**待 MySQL/Redis 启动后验证**)
  - [ ] SubTask 8.5: 验证 `GET /api/health` 返回统一格式(**待 MySQL/Redis 启动后验证**)
  - [ ] SubTask 8.6: 验证 `POST /api/auth/register` + `POST /api/auth/login` 流程(**待 MySQL/Redis 启动后验证**)
  - [ ] SubTask 8.7: 验证受保护接口 `GET /api/auth/profile` 需 Token(**待 MySQL/Redis 启动后验证**)

# 待办:基础设施部署
- [ ] Task 9: 安装并启动 MySQL 8.0 与 Redis 7.0(用户操作)
  - 安装 MySQL 8.0,创建数据库 `ai_agent`,执行 `database/init.sql` 与 `database/seed.sql`
  - 安装 Redis 7.0,默认端口 6379
  - 在 `.env` 中配置正确的 DB_USER/DB_PASSWORD
  - 完成后重新执行 `npm run start:dev` 验证 Swagger 与接口测试

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3、Task 4 可与 Task 2 并行,但 Task 2 中的 AppModule 需引用 Task 3 的配置
- Task 5、Task 6 依赖 Task 4(公共守卫/装饰器/异常)
- Task 7 依赖 Task 4(公共模块)
- Task 8 依赖 Task 1-7 全部完成
- Task 5 与 Task 6 可并行
- Task 7 内 17 个子任务可并行执行
- Task 9(基础设施)是 Task 8.4-8.7 的前置条件
