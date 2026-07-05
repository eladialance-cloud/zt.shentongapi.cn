# 深瞳AI 可下载客户端 Spec

## Why
将基于 D:\AI Agent 的智能中台（已部署 NestJS 后端骨架 + 29张表 + 19个业务模块）封装为可下载的桌面软件，供用户在 Windows/Mac 本地安装使用。客户端采用 Electron 桌面框架，集成 OpenClaw/N8N/MCP 本地服务，提供 13 个用户功能模块 + 12 个管理功能模块 + 9 章节数据设计，并采用方案A侧边栏 + 方案D聊天优先融合的 UI 布局。

## What Changes
- **新增 Electron 桌面客户端工程**（`d:\二次开发\desktop\`），与已有 `backend/`、`frontend/user/` 共存
- **新增本地数据层**：SQLite + SQLCipher 加密本地数据库，缓存对话/工作流结果/离线调用队列
- **新增客户端↔云端同步协议**：上行批量上报（client_txn_id 幂等），下行 WebSocket 推送（版本号增量）
- **新增设备指纹绑定机制**：客户端 SDK 采集，最多 3 台设备绑定，超出需解绑
- **新增 HMAC-SHA256 签名**：客户端请求携带 `X-Timestamp + X-Nonce + X-Signature`，Redis 防重放
- **新增 API Key 池管理模块（🆕 管理端新增）**：`ApiKeyPoolEntity` + 轮询策略 + 日/月限额监控
- **新增客户端版本管理模块（🆕 管理端新增）**：版本发布、强制更新、灰度推送
- **新增对账体系**：`reconciliation_diff` 表 + ReconciliationService（流水vs余额/Token用量/支付流水/Key池扣减）
- **新增 N8N 本地编辑器嵌入**：iframe 嵌入 `127.0.0.1:5678`，本地启动 N8N 实例
- **新增客户端本地服务管理**：OpenClaw/N8N/MCP 三服务状态面板 + 系统托盘
- **新增自动更新机制**：基于 electron-updater，支持增量更新和强制更新
- **BREAKING**：管理端认证改为 AdminJwtAuthGuard + RolesGuard + PermissionGuard 三层守卫
- **BREAKING**：模型密钥获取流程扩展为优先从 Key 池获取，回退到 ModelConfigEntity.api_key

## Impact
- **Affected specs**：`deploy-backend-skeleton`（需扩展后端模块支持客户端同步）、`enhance-ui-cyber-tech`（用户端 UI 适配桌面客户端）
- **Affected code**：
  - 后端：`backend/src/modules/` 新增 sync/api-key-pool/version/device/reconciliation 模块
  - 前端用户端：`frontend/user/` 改造为 Electron renderer 进程
  - 新建：`desktop/` Electron 主进程工程
  - 数据库：新增 5 张表（`api_key_pool`、`user_devices`、`client_versions`、`reconciliation_diff`、`sync_queue`）

## ADDED Requirements

### Requirement: Electron 桌面客户端工程
The system SHALL provide an Electron-based desktop client for Windows and Mac that wraps the smart middle-platform backend, with main process managing local services (OpenClaw/N8N/MCP) and renderer process loading the React frontend.

#### Scenario: 首次启动引导
- **WHEN** 用户首次启动客户端
- **THEN** 显示全屏引导向导：环境检测 → 服务初始化（启动 OpenClaw/N8N/MCP 本地实例）→ 登录 → 进入主界面

#### Scenario: 系统托盘集成
- **WHEN** 用户关闭主窗口
- **THEN** 客户端最小化到系统托盘，托盘菜单提供"打开主界面/服务状态/退出"选项
- **AND** 本地服务（OpenClaw/N8N/MCP）持续运行不受主窗口关闭影响

### Requirement: 本地数据层（SQLite + SQLCipher）
The system SHALL use SQLite with SQLCipher encryption as the local data layer for caching conversations, workflow results, and offline call queues, with the encryption key derived from user login state and never persisted to disk.

#### Scenario: 离线调用队列
- **WHEN** 客户端网络中断期间产生对话/Agent调用/工作流执行
- **THEN** 调用记录先写入本地 SQLite 队列表，带 client_txn_id
- **AND** 网络恢复后批量上报云端，每批最多 100 条，云端按 client_txn_id 幂等去重

#### Scenario: 本地数据降级
- **WHEN** 本地 SQLite 初始化失败或加密失败
- **THEN** 客户端降级为纯云端模式（所有操作走 API），不影响功能可用性

### Requirement: 设备指纹绑定
The system SHALL bind device fingerprints on first login, limit to 3 devices per account, and prompt users to unbind old devices when exceeding the limit.

#### Scenario: 首次登录绑定设备
- **WHEN** 用户在未绑定设备上首次登录成功
- **THEN** 客户端采集设备指纹（User-Agent + IP + 客户端特征哈希），调用 `POST /api/devices/bind` 写入 `user_devices` 表
- **AND** 该用户已绑定设备数 +1

#### Scenario: 超出设备限制
- **WHEN** 用户尝试在已绑定 3 台设备的账号上登录第 4 台设备
- **THEN** 系统返回 `DEVICE_LIMIT_EXCEEDED` 错误
- **AND** 引导用户前往个人设置 > 设备管理解绑旧设备

### Requirement: HMAC-SHA256 签名传输安全
The system SHALL require all client-to-cloud API requests to carry `X-Timestamp`, `X-Nonce`, `X-Signature` headers, with the server validating signatures and rejecting replay attacks via Redis nonce cache (TTL 5 minutes).

#### Scenario: 签名验证失败
- **WHEN** 客户端请求的 X-Signature 与服务端计算结果不一致
- **THEN** 服务端返回 `SIGNATURE_INVALID` 错误（HTTP 401）
- **AND** 记录安全日志

#### Scenario: 防重放
- **WHEN** 同一 X-Nonce 在 5 分钟内被重复使用
- **THEN** 服务端返回 `NONCE_REPLAYED` 错误（HTTP 401）

### Requirement: API Key 池管理（🆕 管理端新增）
The system SHALL provide an API Key pool management module for admins to manage multiple API keys per provider with priority-based polling, daily/monthly quota limits, automatic exhaustion switching, and balance monitoring.

#### Scenario: Key 轮询分配
- **WHEN** 模型调用需要获取 API Key
- **THEN** `ApiKeyPoolService.getNextAvailableKey(provider)` 按 `priority ASC, used_quota ASC` 排序取第一个 `status=active AND remaining_quota > 0` 的 Key
- **AND** 跳过 error_count >= 5 的 Key

#### Scenario: Key 额度耗尽自动切换
- **WHEN** 某 Key 的 remaining_quota <= 0
- **THEN** 系统自动标记 `status=exhausted`
- **AND** 下一次调用切换到下一个可用 Key，不中断服务

#### Scenario: 定时余额检查
- **WHEN** 定时任务（每 10 分钟）执行
- **THEN** 检查所有 active 状态的 Key，调用提供商 API 查询余额，更新 remaining_quota
- **AND** 连续错误 >= 5 次的 Key 自动标记 `status=error` 并告警

### Requirement: 客户端版本管理（🆕 管理端新增）
The system SHALL provide a client version management module for admins to publish versions with semantic versioning, force-update flags, grayscale rollout percentages, and changelogs, with the client using electron-updater for auto-update.

#### Scenario: 强制更新
- **WHEN** 管理员发布新版本并标记 `forceUpdate=true`
- **THEN** 客户端启动时检测到强制更新
- **AND** 弹窗提示"必须更新才能继续使用"，提供"立即更新"按钮
- **AND** 用户无法关闭弹窗（除非退出应用）

#### Scenario: 灰度推送
- **WHEN** 管理员发布新版本，灰度比例 = 30%
- **THEN** 30% 的客户端在启动时收到更新提示
- **AND** 其余 70% 不受影响，24 小时后管理员可手动提升到 100%

### Requirement: 对账体系
The system SHALL provide a reconciliation system that runs daily batch jobs to verify credit transactions vs account balance, model call token usage vs provider records, payment records vs recharge orders, and API Key pool deductions vs provider bills.

#### Scenario: 积分流水vs余额对账
- **WHEN** 每日凌晨 02:00 定时任务执行
- **THEN** 系统从 `CreditTransactionEntity` 按 user_id 聚合所有流水
- **AND** 计算 `余额 = SUM(recharge) + SUM(reward) - SUM(consume) - SUM(settle 补扣)`
- **AND** 与 `CreditAccountEntity.balance` 比对，差异 < 10 积分自动修复并标记 resolved，>= 10 积分写入 `reconciliation_diff` 表并告警

#### Scenario: Token 用量对账
- **WHEN** 对账任务执行
- **THEN** 比对 `ModelCallLogEntity.input_tokens/output_tokens` 与深瞳中转 API 返回
- **AND** 差异阈值 ±5%，超阈值记录差异并告警

### Requirement: N8N 本地编辑器嵌入
The system SHALL embed N8N Web UI via iframe pointing to `http://127.0.0.1:5678`, with the client main process starting a local N8N instance on demand.

#### Scenario: 打开工作流编辑器
- **WHEN** 用户点击侧边栏"工作流" → "新建工作流"
- **THEN** 客户端主进程检查 N8N 本地服务是否运行
- **AND** 若未运行，启动 N8N 子进程监听 127.0.0.1:5678
- **AND** 渲染进程加载 iframe `http://127.0.0.1:5678/workflow`
- **AND** 通过 postMessage 与 N8N 通信

### Requirement: 客户端本地服务管理
The system SHALL provide a local service management module in the client that monitors and controls OpenClaw, N8N, and MCP Gateway local instances, with status visible in the bottom status bar and a detailed panel accessible via the [📊] button.

#### Scenario: 服务异常
- **WHEN** OpenClaw/N8N/MCP 任一服务进程退出或无响应
- **THEN** 底栏对应服务状态变为 🔴
- **AND** 弹窗提示用户"X 服务异常，点击重启"
- **AND** 用户点击"重启"后主进程重新拉起服务

#### Scenario: 首次服务初始化
- **WHEN** 用户首次启动客户端完成登录
- **THEN** 引导向导检测本地是否已安装 OpenClaw/N8N/MCP 运行时
- **AND** 若未安装，自动下载并安装（带进度条）
- **AND** 安装完成后启动三个服务，状态变为 🟢

### Requirement: UI 布局（方案A侧边栏 + 方案D聊天优先融合）
The system SHALL use a sidebar + chat-first fusion layout: 56px collapsed sidebar (icons only) expanding to 180px on hover (icon + text), default route to chat page with collapsible session list, top bar with search/notifications/credits/profile, bottom bar with service status icons and a [📊] status panel button.

#### Scenario: 侧边栏交互
- **WHEN** 鼠标悬浮在 56px 收起的侧边栏上
- **THEN** 侧边栏展开到 180px 显示图标+文字
- **AND** 鼠标移开后自动收回 56px

#### Scenario: 会话列表折叠
- **WHEN** 用户点击侧边栏 💬 对话图标
- **THEN** 对话页面的左侧会话列表折叠/展开切换
- **AND** 折叠后对话消息区域全宽展示

#### Scenario: 底栏状态面板
- **WHEN** 用户点击底栏 [📊] 按钮
- **THEN** 弹出右侧浮层面板，展示：积分余额 + 充值入口、本地服务状态（OpenClaw/N8N/MCP）、今日统计（对话次数 + 消耗积分）

## MODIFIED Requirements

### Requirement: 模型密钥获取
**Modified**: 模型调用获取 API Key 时，优先从 `ApiKeyPoolEntity` 池中按优先级+轮询策略获取，回退到 `ModelConfigEntity.api_key` 默认密钥。`ModelConfigService.getRawModelWithDecryptedKey()` 扩展为支持 Key 池获取。

### Requirement: 管理端认证守卫
**Modified**: 所有管理 Controller 改为 `@UseGuards(AdminJwtAuthGuard, RolesGuard, PermissionGuard)` 三层守卫，新增登录验证码（图形/滑块）防暴力破解，新增管理员登录异地通知。

### Requirement: 数据同步策略
**Modified**: 云端为主、本地为缓存的混合架构。云端 MySQL 为唯一可信源，客户端 SQLite 仅缓存近期对话/工作流结果/离线队列，不存储积分余额等敏感数据。双向同步：上行批量上报，下行 WebSocket 推送 + 离线重连按 `updated_at` 增量拉取。

## REMOVED Requirements
（无移除项，本 spec 为新增功能封装）
