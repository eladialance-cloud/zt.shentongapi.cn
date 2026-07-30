# 深瞳AI 全栈代码审查 — 综合报告

**审查日期:** 2026-07-29  
**审查方法:** Superpowers 方法论 + 5 并行子代理  
**项目规模:** Backend 43 模块 / Desktop 21 页面 / Admin 33 页面 / User 4 页面 / 1500+ 源文件

---

## 总览

| 审查域 | Critical | Major | Minor | 合计 | 报告文件 |
|--------|----------|-------|-------|------|----------|
| Backend 核心 | 4 | 11 | 10 | 25 | review_backend_core.md |
| Desktop Electron | 2 | 8 | 9 | 19 | review_desktop_electron.md |
| Desktop 前端 | 0 | 11 | 20 | 31 | review_desktop_frontend.md |
| Frontend (Admin+User) | 7 | 10 | 6 | 23 | review_frontend.md |
| 基础设施/配置 | 4 | 8 | 7 | 19 | review_infra_config.md |
| **合计** | **17** | **48** | **52** | **117** | — |

---

## Critical 问题清单（17 个，需立即处理）

### 🔴 安全 — 硬编码密钥/凭据（5 个）

1. **[Backend] `auth.service.ts`:152-156** — `llmProxyKey` 以明文存入数据库，未加密
2. **[Electron] `service-manager.ts`** — Hermes API Server Key 硬编码在源码中
3. **[Infra] `backend/.env`** — 包含真实生产级密钥（JWT、AES、HMAC）
4. **[Infra] `register-config-fix.sh`** — 硬编码 MySQL 密码
5. **[Infra] `.env` Git 追踪风险** — 需确认 .env 是否曾被 Git 追踪

### 🔴 安全 — Token/凭据存储（2 个）

6. **[Frontend Admin] `admin-auth.ts`:88-95** — Admin token + refreshToken 全量持久化到 localStorage
7. **[Desktop 前端] `auth.ts` partialize** — `dbSecret`、`llmProxyKey`、`refreshToken` 持久化到 localStorage（虽为 Major，但风险极高）

### 🔴 路由/权限控制（2 个）

8. **[Frontend Admin]** — Admin 路由未集成 PermissionGate，任何登录管理员可访问所有 33 个页面
9. **[Frontend User]** — ProtectedRoute 组件缺失，路由引用不存在组件，无法运行

### 🔴 User 前端半成品（3 个）

10. **[Frontend User]** — 14+ 页面组件缺失（Dashboard、Chat、Agents 等全部路由目标不存在）
11. **[Frontend User]** — Landing 页面缺少 `./data` 模块
12. **[Frontend User]** — 所有文件中文注释乱码（BOM + 编码转换错误）

### 🔴 运行时/构建（3 个）

13. **[Infra] `manifest.json`** — 3/4 运行时组件 SHA256 与 CDN 实际文件不匹配
14. **[Backend] `auth.controller.ts`** — 注册接口缺少验证码/速率限制，可被批量注册攻击
15. **[Backend] `payment.service.ts`** — 支付回调签名验证使用同步 `verify` 但错误处理不完整
16. **[Backend] `hermes.service.ts`** — Hermes 进程启动失败无重试机制，且错误信息可能泄露路径
17. **[Electron] IPC 安全** — 同步队列 IPC 参数缺少枚举值验证和 payload 大小限制

---

## Major 问题清单（48 个，按优先级分组）

### 高优先级 Major（近期修复）

| # | 域 | 问题 | 文件 |
|---|-----|------|------|
| 1 | Backend | `require('crypto')` 在 ESM 环境可能失败 | auth.service.ts |
| 2 | Backend | 文件编码乱码（GBK），注释不可读 | main.ts 等多个 |
| 3 | Backend | N+1 查询：用户列表未分页 | user.service.ts |
| 4 | Backend | 支付订单查询缺少事务隔离 | payment.service.ts |
| 5 | Electron | 多个 IPC handler 缺少 sender 验证 | service-manager.ts |
| 6 | Electron | `DEFAULT_VERSIONS` 与 manifest 不一致 | runtime-downloader.ts |
| 7 | Electron | `verifyIntegrity` 不实际校验文件哈希 | runtime-downloader.ts |
| 8 | Electron | 前端库错误放在 dependencies 中 | package.json |
| 9 | Desktop 前端 | `RequireAuth` 仅检查标志，不验证 Token 有效性 | router/index.tsx |
| 10 | Desktop 前端 | 两个独立主题 Store，默认值矛盾 | settings/theme store |
| 11 | Frontend Admin | workflow-api 与 workflow-lib-api 同名导出冲突 | api/ |
| 12 | Infra | `npmRebuild: false` 依赖手动放置 native binary | electron-builder.yml |
| 13 | Infra | 249MB tar.gz 和构建产物未被 gitignore | .gitignore |
| 14 | Infra | 部署脚本临时开启 `DB_SYNCHRONIZE=true` | deploy/ |
| 15 | Infra | CORS 默认值为 `*` | backend config |

### 中优先级 Major（计划修复）

| # | 域 | 问题 |
|---|-----|------|
| 16-25 | Backend | DTO 验证缺失、错误处理不统一、Redis 连接池配置、日志级别硬编码等 |
| 26-30 | Electron | CSP connect-src 过宽、PowerShell 采样开销、版本比较函数重复等 |
| 31-38 | Desktop 前端 | HTTP Client 401 刷新竞态、SSE 断线重连缺失、大组件未拆分等 |
| 39-42 | Frontend | Admin 401 刷新无队列管理、User 前端 API baseURL 硬编码等 |
| 43-48 | Infra | Migration 命名不规范、CI 缺少测试/桌面构建/安全扫描、Vite 8.x 兼容性等 |

---

## 架构亮点（值得肯定）

### Backend
- NestJS 模块化设计清晰，43 个业务模块边界分明
- JWT + Redis Token 黑名单机制完善
- HMAC 签名中间件保障 API 完整性

### Desktop Electron
- BrowserWindow 安全配置完全正确（contextIsolation/sandbox/nodeIntegration）
- preload 使用 contextBridge，未启用时抛错
- 子进程使用 spawn + tree-kill，外部链接协议白名单
- 下载文件 SHA-256 校验

### Desktop 前端
- HTTP Client 拦截器设计成熟（HMAC 签名 + JWT 预校验 + 401 并发刷新）
- SSE 流式实现完整
- 离线同步三层体系

### Frontend Admin
- API 层 21 个模块文件分层清晰，端点契约注释完善
- 401 刷新机制含队列管理和防循环
- 无 XSS 漏洞（无 dangerouslySetInnerHTML / innerHTML / eval）
- PermissionCode 使用联合类型，类型系统完善

---

## 修复优先级建议

### P0 — 立即修复（阻塞发布）
1. 移除所有硬编码密钥，迁移到环境变量/SafeStorage
2. 修复 .env Git 追踪问题，添加到 .gitignore
3. 修复 manifest.json SHA256 不匹配
4. 修复 User 前端缺失组件（或移除不可用路由）
5. 修复 IPC 参数验证和 sender 验证

### P1 — 近期修复（本周内）
1. Admin 路由集成 PermissionGate
2. Token/密钥从 localStorage 迁移到 SafeStorage
3. 修复文件编码（GBK → UTF-8）
4. 添加 .gitignore 规则排除构建产物
5. 修复 `verifyIntegrity` 实际校验逻辑
6. 支付回调错误处理完善

### P2 — 计划修复（本月内）
1. 补齐测试文件（当前仅 2 个测试文件）
2. CI/CD 流水线完善
3. Migration 规范化和回滚脚本
4. 代码签名配置
5. 依赖兼容性验证（Vite 8.x + sqlcipher 6.0.0 + Electron 41）

---

## 结论

项目整体架构设计成熟，模块划分清晰，安全基础设施（JWT、HMAC、contextIsolation）已到位。主要问题集中在：

1. **凭据管理**：多处硬编码密钥和 localStorage 持久化敏感信息
2. **User 前端半成品**：大量缺失组件导致不可运行
3. **构建配置**：SHA256 不匹配、native binary 手动依赖
4. **代码规范**：文件编码混乱、测试覆盖几乎为零

建议按 P0 → P1 → P2 顺序修复，优先解决安全阻塞问题。
