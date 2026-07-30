# 认证模块安全审查报告

> **审查时间**: 2026-07-30  
> **审查范围**: `backend/src/modules/admin-auth/*` 与 `backend/src/modules/auth/*`  
> **审查重点**: 守卫逻辑、Token 验证、bcrypt 一致性、DI 冲突、密码哈希、Token 过期/刷新机制

---

## 一、总体评估

| 维度 | 严重度 | 状态 |
|------|--------|------|
| 编译完整性（不存在的符号导入） | ✅ 无 | 通过 |
| bcrypt/bcryptjs 一致性 | ⚠️ 详见 §3 | 有隐患 |
| AdminJwtService DI 冲突 | ✅ 已规避 | 通过 |
| Token 签发与验证 | ⚠️ 详见 §5 | 有设计缺陷 |
| 密码重置安全性 | ⚠️ 详见 §6 | 有隐患 |
| 密码哈希算法一致性 | ✅ 统一 | 通过 |
| Token 过期/刷新机制 | ⚠️ 详见 §5 | 有缺陷 |

**总结**: 代码可以编译运行，不存在导入不存在符号的编译错误（502 根因排除）。但存在 **5 个中高危问题** 和 **4 个低危问题**，建议按优先级修复。

---

## 二、admin-auth 模块审查

### 2.1 admin.guard.ts — 守卫逻辑

**文件**: `admin-auth/admin.guard.ts`

#### ✅ 正确点

1. **直接使用 `jsonwebtoken` + `ADMIN_JWT_SECRET` 手动验证**，绕过了 `JwtService` DI 陷阱。注释明确说明了原因：AppModule 注册了全局 `JwtModule`（用户端 `JWT_SECRET`），若注入 `JwtService` 会拿到错误的 secret。这是正确的设计决策。

2. **Token 黑名单检查**：使用 SHA-256 哈希 token 后存入 Redis，登出时可吊销。前缀 `ADMIN_TOKEN_BLACKLIST_PREFIX` 从 `admin-auth.service.ts` 导入，路径正确。

3. **请求上下文注入**：`request.adminUser = { id: payload.userId, username: payload.username }`，后续控制器通过 `req.adminUser.id` 获取，逻辑清晰。

4. **Bearer Token 解析**：正则 `/^Bearer\s+(.+)$/i` 正确，大小写不敏感。

#### ⚠️ 问题 1 [中危] — logout 空实现，Token 黑名单未生效

**位置**: `admin-auth.service.ts` 第 108-111 行

```typescript
async logout(): Promise<void> {
  return;  // 空操作！
}
```

**问题**: `AdminGuard` 在第 49-55 行检查 Redis 黑名单 `admin:token:blacklist:<tokenHash>`，但 `logout()` 是空实现，**从不向 Redis 写入黑名单**。这意味着：
- 管理员登出后，已签发的 adminToken 在过期前（默认 8h）**仍然有效**。
- 黑名单机制形同虚设，只有代码路径但无实际写入。

**影响**: 管理员登出后无法吊销 token，存在安全风险（如共用电脑场景）。

**建议修复**:
```typescript
async logout(token: string): Promise<void> {
  const crypto = require('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const ttl = this.parseExpiresMs() / 1000; // 转秒
  await this.redisService.set(
    `${ADMIN_TOKEN_BLACKLIST_PREFIX}${tokenHash}`,
    '1',
    Math.ceil(ttl),
  );
}
```

同时修改控制器，将 token 传入 `logout()`：
```typescript
@Post('logout')
@Public()
@UseGuards(AdminGuard)
async logout(@Req() req: any) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  await this.service.logout(token);
  return null;
}
```

#### ⚠️ 问题 2 [低危] — AdminGuard 未检查用户状态

**位置**: `admin.guard.ts`

**问题**: Guard 验证 token 签名和黑名单后直接放行，**不检查用户当前状态**（如 `status === 'disabled'` 或 `status === 'banned'`）。一个被禁用的管理员只要持有有效 token，在 8 小时过期前仍可操作。

**建议**: 在 `canActivate` 中增加用户状态检查，或定期清理黑名单时同步验证。

---

### 2.2 admin-auth.service.ts — 登录服务

**文件**: `admin-auth/admin-auth.service.ts`

#### ✅ 正确点

1. **bcryptjs 统一使用**：`import * as bcrypt from 'bcryptjs'` — 与 `EncryptionService`（用户端）使用相同的 `bcryptjs` 库。密码比较一致。

2. **密码字段 select:false 手动 addSelect**：正确处理了 TypeORM `select: false` 列。

3. **角色校验**：只允许 `super_admin` 或 `admin` 角色登录管理端。

4. **强制改密**：返回 `mustChangePassword` 字段，前端可引导首次登录改密。

5. **bcrypt salt rounds = 12**：与 `EncryptionService` 的 `saltRounds = 12` 一致。

#### ✅ 正确点 — Token 签发使用本模块 JwtService

```typescript
const token = await this.jwtService.signAsync(payload);
```

`AdminAuthModule` 注册了自己的 `JwtModule.registerAsync({ secret: ADMIN_JWT_SECRET, ... })`，模块内的 `JwtService` 绑定的是 `ADMIN_JWT_SECRET`，不会与全局 `JwtModule` 冲突。NestJS 的 DI 容器会优先使用最近模块作用域的 provider。

#### ⚠️ 问题 3 [中危] — AdminAuthStrategy 注册但从未使用

**位置**: `admin-auth/admin-auth.strategy.ts`

**问题**: `AdminAuthStrategy`（Passport 策略名 `'admin-jwt'`）在模块 providers 中注册，但**没有任何路由使用 `@UseGuards(AuthGuard('admin-jwt'))`**。所有管理端路由使用的是 `AdminGuard`（手动验证）。

**影响**: 
- 代码冗余，增加维护成本。
- `AdminAuthStrategy` 构造函数注入 `ConfigService`，但不使用 `JwtService`，与 `AdminGuard` 形成两套验证逻辑。
- 若有人误用 `AuthGuard('admin-jwt')`，该策略**不做 Redis 黑名单检查**，安全降级。

**建议**: 要么删除 `AdminAuthStrategy`（当前不需要），要么在 `AdminGuard` 中改为使用该策略并补充黑名单逻辑。推荐删除以减少混淆。

---

### 2.3 admin-auth.module.ts — 模块配置

**文件**: `admin-auth/admin-auth.module.ts`

#### ✅ 正确点

1. **独立 JwtModule 注册**：使用 `ADMIN_JWT_SECRET` + `ADMIN_JWT_EXPIRES_IN`，与用户端 `JWT_SECRET` + `JWT_EXPIRES_IN` 隔离。

2. **exports 包含 JwtModule 和 AdminGuard**：其他 admin 模块导入 `AdminAuthModule` 时可复用 `AdminGuard` 和管理端 `JwtService`。

3. **CommonModule 导入**：获取 `RedisService`、`EncryptionService` 等。

#### ✅ 无 DI 冲突 — 全局 JwtModule vs 模块级 JwtModule

分析：
- `AppModule` 注册全局 `JwtModule.registerAsync({ secret: JWT_SECRET })` — 用户端
- `AdminAuthModule` 注册模块级 `JwtModule.registerAsync({ secret: ADMIN_JWT_SECRET })` — 管理端
- `AuthModule` 注册模块级 `JwtModule.registerAsync({ secret: JWT_SECRET })` — 用户端

NestJS 的 DI 机制：模块级 provider 优先于全局。`AdminAuthService` 注入的 `JwtService` 来自 `AdminAuthModule` 的 `JwtModule`（`ADMIN_JWT_SECRET`），而非全局。**无冲突**。

但 `AdminGuard` 绕过了 `JwtService`，直接使用 `jsonwebtoken` + `this.adminSecret`，进一步避免了歧义。**设计正确**。

---

### 2.4 admin-auth.strategy.ts — Passport 策略

**文件**: `admin-auth/admin-auth.strategy.ts`

#### ⚠️ 问题 3（重复）— 见 §2.2

策略已注册但未使用。详见上文。

---

### 2.5 dto/login.dto.ts — DTO 验证

**文件**: `admin-auth/dto/login.dto.ts`

#### ✅ 正确点

1. `AdminLoginDto`: `username` 和 `password` 都有 `@IsString()` + `@IsNotEmpty()`。
2. `AdminChangePasswordDto`: `newPassword` 有 `@MinLength(8)`。
3. `captcha` 字段标注 `@IsOptional()`，留有扩展空间。

#### ⚠️ 问题 4 [低危] — 密码复杂度验证不足

**位置**: `dto/login.dto.ts` — `AdminChangePasswordDto`

**问题**: 新密码只校验 `@MinLength(8)`，无最大长度限制，无复杂度要求（大小写混合、数字、特殊字符）。

**对比**: 用户端 `RegisterDto` 同样只 `@MinLength(8)` + `@MaxLength(64)`，至少有最大长度。

**建议**: 对管理员密码应更严格：
```typescript
@MinLength(8)
@MaxLength(64)
@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
  message: '密码必须包含大小写字母、数字和特殊字符',
})
newPassword: string;
```

---

## 三、bcrypt 一致性审查

### 3.1 依赖安装情况

`package.json` 中同时安装了：
```json
"bcrypt": "^5.1.1",        // native C++ binding
"bcryptjs": "^3.0.3",       // pure JavaScript
"@types/bcrypt": "^5.0.2",
"@types/bcryptjs": "^2.4.6"
```

两者均已在 `node_modules` 中安装。

### 3.2 使用情况

| 模块 | 文件 | 导入 | 使用方式 |
|------|------|------|----------|
| admin-auth | `admin-auth.service.ts` | `import * as bcrypt from 'bcryptjs'` | `bcrypt.compare()` + `bcrypt.hash(password, 12)` |
| auth (用户端) | `encryption.service.ts` | `import * as bcrypt from 'bcryptjs'` | `bcrypt.hash(plain, 12)` + `bcrypt.compare(plain, hash)` |

#### ✅ 结论：一致

**两个模块都使用 `bcryptjs`（pure JS）**，salt rounds 均为 12。密码哈希格式兼容，不会出现比较失败的问题。

**但存在隐患**：`package.json` 同时安装了 `bcrypt`（native）和 `bcryptjs`（JS），如果其他模块或第三方库误导入 `bcrypt`（native），在 Windows 上可能因 C++ 编译问题导致不可用。建议：

- 如果统一使用 `bcryptjs`，**移除 `bcrypt` 和 `@types/bcrypt` 依赖**，避免混淆。
- 如果需要 native 性能，统一使用 `bcrypt` 并确保编译环境。

---

## 四、auth 模块审查

### 4.1 auth.service.ts — 用户登录/注册/密码重置

**文件**: `auth/services/auth.service.ts`

#### ✅ 正确点

1. **注册流程事务化**：用户创建 + 邀请码消费在同一事务中，防止孤立用户。
2. **已删除/封禁用户拦截**：`status === 'deleted'` 统一返回 `INVALID_CREDENTIALS`（不泄露存在性），`status === 'banned'` 检查封禁是否过期。
3. **设备绑定限制**：最多 3 台设备，超过时提示解除绑定。
4. **refreshToken 轮换**：`refresh()` 先撤销旧 token 再签发新 token，防止重放。
5. **忘记密码静默返回**：用户不存在时静默返回，不泄露邮箱是否注册。
6. **密码重置 token**：64 字符随机串，30 分钟 TTL，使用后立即删除。
7. **HttpOnly Cookie**：refreshToken 通过 `httpOnly + secure + sameSite=lax` Cookie 下发，防 XSS 和 CSRF。

#### ⚠️ 问题 5 [高危] — 密码重置新密码强度不足

**位置**: `auth/dto/reset-password.dto.ts`

```typescript
@MinLength(6, { message: '密码至少 6 位' })
newPassword: string;
```

**问题**: 密码重置只需 6 位，而注册需要 8 位 (`RegisterDto`)。这意味着：
- 用户注册时密码 8 位，但重置后可以设 6 位，安全策略不一致。
- 6 位密码极易被暴力破解。

**建议**: 统一为 `@MinLength(8)` 并添加 `@MaxLength(64)`。

#### ⚠️ 问题 6 [中危] — login() 和 validateUser() 重复逻辑

**位置**: `auth/services/auth.service.ts`

`login()` 方法和 `validateUser()` 方法都包含：账号查找 → 密码比较 → 角色加载 → 返回用户信息。但 `login()` 包含设备绑定、token 生成、cookie 设置等额外逻辑，而 `validateUser()` 被 `LocalStrategy` 调用。

**问题**: 两处密码比较逻辑独立维护，若未来修改密码算法可能遗漏其一。

**建议**: 抽取公共方法 `verifyCredentials(account, password)` 供两者调用。

#### ⚠️ 问题 7 [低危] — ensureLlmProxyKey 中使用 require('crypto')

**位置**: `auth.service.ts` — `ensureLlmProxyKey` 方法

```typescript
const newKey = 'sk-shentong-' + require('crypto').randomBytes(16).toString('hex');
```

**问题**: 在 TypeScript 文件中运行时 `require('crypto')` 不符合规范，应使用顶部 `import * as crypto from 'crypto'`。

**影响**: 功能正常，但代码风格不一致，且某些打包工具可能不正确处理 `require()`。

---

### 4.2 auth.controller.ts — 路由与守卫

**文件**: `auth/controllers/auth.controller.ts`

#### ✅ 正确点

1. **公开端点标注 `@Public()`**：`register`、`login`、`refresh`、`forgot-password`、`reset-password`、`registration-config` 均标注。
2. **需认证端点标注 `@ApiBearerAuth()`**：`logout`、`profile`、`me`、`regenerateLlmProxy-key`。
3. **IP 提取兼容反向代理**：`getClientIp()` 从 `x-forwarded-for` 取首段。
4. **refresh 端点双通道获取 token**：优先 Cookie，回退 body（过渡期兼容）。
5. **logout 清除 Cookie**：`res.clearCookie('refreshToken', { path: '/api/auth' })`。

#### ⚠️ 问题 8 [低危] — getClientIp 信任 x-forwarded-for

**位置**: `auth.controller.ts` — `getClientIp()`

```typescript
function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip || '0.0.0.0';
}
```

**问题**: 直接信任 `x-forwarded-for`，若未在反向代理层（Nginx）覆盖该头，客户端可伪造 IP。此 IP 用于设备绑定记录，虽不影响认证安全性，但影响审计准确性。

**建议**: 确保在 Nginx 层 `proxy_set_header X-Forwarded-For $remote_addr;` 覆盖客户端值，或在代码中只信任已知代理 IP。

---

### 4.3 token.service.ts — Token 刷新逻辑

**文件**: `auth/services/token.service.ts`

#### ✅ 正确点

1. **accessToken**：使用 `JwtService.signAsync()` 签发，payload 包含 `sub/userId`、`username`、`email`、`roles`。
2. **refreshToken**：UUID v4 随机串，存入 Redis（`refresh_token:<uuid>` → `userId`），TTL = `JWT_REFRESH_EXPIRES_IN`（默认 7 天）。
3. **verifyRefreshToken**：从 Redis 读取，不存在则返回 `null`。
4. **revokeRefreshToken**：从 Redis 删除。
5. **TTL 解析**：支持 `15m`、`7d`、`3600` 等格式。

#### ✅ 无问题

Token 刷新机制完整：
- accessToken 短期（15 分钟），refreshToken 长期（7 天）。
- 刷新时撤销旧 refreshToken，签发新 refreshToken（轮换机制）。
- Redis 存储使 refreshToken 可主动吊销。

---

### 4.4 jwt.strategy.ts / local.strategy.ts — Passport 策略

**文件**: `auth/strategies/jwt.strategy.ts`、`auth/strategies/local.strategy.ts`

#### ✅ jwt.strategy.ts

1. 使用 `JWT_SECRET`（用户端 secret），与 `AuthModule` 的 `JwtModule` 配置一致。
2. `ignoreExpiration: false` — 不忽略过期。
3. `validate()` 返回 `{ userId, username, email, roles }`，被 `JwtAuthGuard` 注入 `req.user`。

#### ✅ local.strategy.ts

1. `usernameField: 'account'` — 适配 `LoginDto.account`（支持用户名或邮箱）。
2. 调用 `authService.validateUser()` 验证凭据。
3. 失败时抛出 `UnauthorizedException`。

#### ✅ 策略注册正确

`AuthModule` providers 包含 `JwtStrategy` 和 `LocalStrategy`，`PassportModule.register({ defaultStrategy: 'jwt' })` 设置默认策略为 `jwt`。全局 `JwtAuthGuard extends AuthGuard('jwt')` 使用该策略。

---

## 五、Token 过期与刷新机制完整性

### 5.1 用户端 Token 生命周期

| Token | 签发 | 存储 | 过期 | 刷新 | 吊销 |
|-------|------|------|------|------|------|
| accessToken | `JwtService.signAsync()` | 客户端内存/localStorage | `JWT_EXPIRES_IN`（默认 15m） | `refresh()` 签发新 token | ❌ 不可吊销（无状态 JWT） |
| refreshToken | `uuidv4()` | Redis + HttpOnly Cookie | `JWT_REFRESH_EXPIRES_IN`（默认 7d） | `refresh()` 轮换（旧 token 删除，新 token 写入） | ✅ `revokeRefreshToken()` 从 Redis 删除 |

#### ✅ 机制完整

- 刷新时先撤销旧 token 再签发新 token（防重放）。
- logout 时撤销 refreshToken。
- Redis 不可用时 refreshToken 失效（fail-safe）。

### 5.2 管理端 Token 生命周期

| Token | 签发 | 存储 | 过期 | 刷新 | 吊销 |
|-------|------|------|------|------|------|
| adminToken | `JwtService.signAsync()` (ADMIN_JWT_SECRET) | 客户端 localStorage | `ADMIN_JWT_EXPIRES_IN`（默认 8h） | ❌ 无刷新机制 | ❌ logout 空实现 |

#### ⚠️ 问题 9 [中危] — 管理端 Token 无刷新机制

**问题**: 管理员 token 8 小时过期后需要重新登录，没有 refreshToken 机制。对于长时间使用的管理后台，体验不佳。

**建议**: 可选方案：
1. **简化方案**：延长 adminToken 过期时间至 12h 或 24h（降低安全性换取体验）。
2. **完整方案**：为管理端增加 refreshToken 机制（类似用户端）。
3. **滑动过期**：在 AdminGuard 中检测 token 剩余有效期 < 1h 时自动续签（通过响应头返回新 token）。

#### ⚠️ 问题 1（重复）— logout 未实现吊销

见 §2.1。管理端 token 黑名单检查代码存在，但 logout 不写入黑名单，等于功能未实现。

---

## 六、密码哈希算法一致性

### 6.1 全局一致性矩阵

| 模块 | 哈希库 | salt rounds | compare 库 |
|------|--------|-------------|------------|
| admin-auth | bcryptjs | 12 | bcryptjs |
| auth (EncryptionService) | bcryptjs | 12 | bcryptjs |

#### ✅ 一致

两个模块统一使用 `bcryptjs`，salt rounds 均为 12。密码哈希完全兼容。

### 6.2 哈希存储格式

`bcryptjs` 输出标准 bcrypt 哈希字符串（`$2a$12$...`），存入 `UserEntity.password` 字段（`varchar(128)`，`select: false`）。长度足够（bcrypt 哈希约 60 字符）。

### 6.3 密码字段安全

- `select: false` — 默认不查询，需手动 `addSelect`。
- `admin-auth.service.ts` 和 `auth.service.ts` 都正确使用了 `addSelect` 或 `findByIdWithPassword`。

---

## 七、问题汇总与修复优先级

| # | 严重度 | 模块 | 问题 | 修复建议 |
|---|--------|------|------|----------|
| 1 | 🔴 高危 | admin-auth | logout 空实现，Token 黑名单未写入 Redis | logout 方法接收 token，计算 SHA-256 后写入 Redis 黑名单 |
| 5 | 🔴 高危 | auth | 密码重置新密码仅需 6 位（注册要求 8 位） | 统一为 `@MinLength(8) @MaxLength(64)` |
| 9 | 🟡 中危 | admin-auth | 管理端 Token 无刷新机制 | 延长过期或增加 refreshToken 机制 |
| 2 | 🟡 中危 | admin-auth | AdminGuard 不检查用户当前状态 | Guard 中增加用户状态查询 |
| 3 | 🟡 中危 | admin-auth | AdminAuthStrategy 注册但未使用（安全隐患） | 删除未使用的策略，或在其中补充黑名单检查 |
| 6 | 🟡 中危 | auth | login() 和 validateUser() 重复密码验证逻辑 | 抽取公共方法 |
| 4 | 🟢 低危 | admin-auth | 管理员改密 DTO 无最大长度和复杂度要求 | 添加 @MaxLength + @Matches |
| 7 | 🟢 低危 | auth | ensureLlmProxyKey 运行时 require('crypto') | 顶部 import |
| 8 | 🟢 低危 | auth | getClientIp 信任 x-forwarded-for | 在反向代理层覆盖该头 |
| — | 🟢 低危 | 全局 | package.json 同时安装 bcrypt 和 bcryptjs | 移除未使用的 bcrypt 依赖 |

---

## 八、编译完整性验证（502 根因排查）

### 8.1 不存在的符号导入检查

| 文件 | 导入的符号 | 来源 | 存在？ |
|------|-----------|------|--------|
| admin.guard.ts | `ADMIN_TOKEN_BLACKLIST_PREFIX` | admin-auth.service.ts | ✅ 已导出 |
| admin.guard.ts | `RedisService` | common/services/redis.service.ts | ✅ |
| admin.guard.ts | `jwt.verify` | jsonwebtoken (npm) | ✅ 已安装 |
| admin-auth.service.ts | `bcrypt` from 'bcryptjs' | bcryptjs (npm) | ✅ 已安装 |
| admin-auth.service.ts | `UserEntity`, `RoleEntity`, `UserRoleEntity` | user/entities/ | ✅ |
| admin-auth.module.ts | 所有 imports | — | ✅ |
| admin-auth.strategy.ts | `ExtractJwt`, `Strategy` from 'passport-jwt' | passport-jwt (npm) | ✅ |
| auth.service.ts | `EncryptionService`, `RedisService` | common.module.ts | ✅ 已导出 |
| token.service.ts | `REDIS_REFRESH_TOKEN_PREFIX` | common/constants/app.constant.ts | ✅ 已导出 |
| token.service.ts | `JwtPayload` | jwt.strategy.ts | ✅ 已导出 |
| jwt.strategy.ts | `ConfigService` | @nestjs/config | ✅ |
| local.strategy.ts | `AuthService` | services/auth.service.ts | ✅ |

**结论**: 所有导入的符号均存在，**不存在因导入不存在符号导致的编译错误**。502 错误（如曾出现）不是由认证模块的编译错误导致的。

### 8.2 DI 容器验证

- `AdminAuthService` 注入 `JwtService` ← 来自 `AdminAuthModule` 的 `JwtModule`（`ADMIN_JWT_SECRET`）✅
- `AdminGuard` 不注入 `JwtService`，直接使用 `jsonwebtoken` ← 避免 DI 冲突 ✅
- `AuthService` 注入 `JwtService` ← 来自 `AuthModule` 的 `JwtModule`（`JWT_SECRET`）✅
- `TokenService` 注入 `JwtService` ← 同上 ✅
- 全局 `JwtModule`（AppModule）← 供其他模块使用 `JWT_SECRET` ✅

**无 DI 冲突。**

---

## 九、结论

认证模块整体设计合理，架构分层清晰，用户端与管理端 JWT 隔离正确。核心安全问题集中在：

1. **管理端 logout 空实现**（高危）— Token 黑名单检查代码存在但不写入，等于功能缺失。
2. **密码重置强度不一致**（高危）— 注册 8 位，重置仅 6 位。
3. **管理端 Token 无刷新**（中危）— 8h 过期需重新登录。

建议按优先级从高到低修复，优先处理 #1 和 #5。
