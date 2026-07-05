# Tasks

## 阶段一：客户端工程脚手架与基础设施

- [x] Task 1: 创建 Electron 客户端工程脚手架
  - [x] SubTask 1.1: 在 `d:\二次开发\desktop\` 初始化 Electron + Vite + React + TypeScript 工程
  - [x] SubTask 1.2: 配置 electron-builder 打包（Windows nsis + Mac dmg），输出目录 `dist/installer/`
  - [x] SubTask 1.3: 集成 electron-updater 自动更新，配置 update server URL
  - [x] SubTask 1.4: 实现系统托盘（Tray）+ 最小化到托盘 + 托盘菜单（打开主界面/服务状态/退出）
  - [x] SubTask 1.5: 实现首次启动引导向导（环境检测 → 服务初始化 → 登录 → 主界面）

- [x] Task 2: 实现本地数据层（SQLite + SQLCipher）
  - [x] SubTask 2.1: 集成 better-sqlite3 + sqlcipher，封装 `LocalDbService`（主进程）
  - [x] SubTask 2.2: 创建本地表结构：`local_chat_sessions`、`local_chat_messages`、`local_workflow_executions`、`local_plugin_call_logs`、`local_sync_queue`（与云端 schema 子集对齐）
  - [x] SubTask 2.3: 实现加密密钥派生（基于用户登录态 PBKDF2 派生，不落盘）
  - [x] SubTask 2.4: 实现降级策略（SQLite 初始化失败 → 纯云端模式）

- [x] Task 3: 实现客户端↔云端通信层
  - [x] SubTask 3.1: 封装 `HttpClient`（axios + 拦截器），自动注入 `X-Timestamp/X-Nonce/X-Signature` HMAC-SHA256 签名
  - [x] SubTask 3.2: 封装 `WebSocketClient`（socket.io-client），支持心跳、断线重连、增量拉取
  - [x] SubTask 3.3: 实现 `SyncService`：上行批量上报（每批 100 条，client_txn_id 幂等），下行推送监听
  - [x] SubTask 3.4: 实现离线调用队列：网络中断期间调用写本地 → 网络恢复批量上报

## 阶段二：用户端核心功能模块

- [x] Task 4: 实现设备指纹与绑定机制
  - [x] SubTask 4.1: 客户端 SDK 采集设备指纹（User-Agent + IP + 客户端特征哈希）
  - [x] SubTask 4.2: 后端新增 `DeviceModule`（device.entity.ts + device.service.ts + device.controller.ts）
  - [x] SubTask 4.3: 创建 `user_devices` 表（userId、deviceFingerprint、deviceName、lastLoginAt、createdAt）
  - [x] SubTask 4.4: 实现 API：`POST /api/devices/bind`、`GET /api/devices`、`DELETE /api/devices/:id`
  - [x] SubTask 4.5: 登录流程集成设备校验（超出 3 台返回 DEVICE_LIMIT_EXCEEDED）

- [x] Task 5: 实现注册登录与认证模块（复用后端 AuthModule + 扩展）
  - [x] SubTask 5.1: 客户端登录页 UI（用户名/邮箱 + 密码 + 忘记密码链接）
  - [x] SubTask 5.2: 客户端注册页 UI（用户名 + 邮箱 + 密码 + 邀请码可选）
  - [x] SubTask 5.3: 集成 JWT + RefreshToken 双令牌机制（accessToken 15min + refreshToken 7d）
  - [x] SubTask 5.4: 实现密码重置令牌生成 + 邮件发送服务
  - [x] SubTask 5.5: 实现邀请码生成与管理服务

- [x] Task 6: 实现积分中心模块
  - [x] SubTask 6.1: 余额总览页 UI（当前余额 + 冻结 + 累计充值 + 累计消费 + 充值按钮）
  - [x] SubTask 6.2: 充值页 UI（套餐选择 + 微信/支付宝/Stripe 三渠道）
  - [x] SubTask 6.3: 流水查询页 UI（按时间范围/来源筛选 + 分页表格）
  - [x] SubTask 6.4: 消费明细页 UI（按 model_call/plugin_call/workflow_call 分类查看）
  - [x] SubTask 6.5: 客户端本地缓存积分余额（只读，云端推送更新）

- [x] Task 7: 实现 Agent 市场模块
  - [x] SubTask 7.1: 市场首页 UI（官方推荐/社区标签 + 分类筛选 + 卡片列表）
  - [x] SubTask 7.2: Agent 详情页 UI（名称/描述/使用示例/评分/价格/评价列表 + 收藏按钮）
  - [x] SubTask 7.3: Agent 调用流程（预扣 freezeCredits → 执行 → 结算 settleCredits → 失败退款 refundCredits）
  - [x] SubTask 7.4: 创作者分成结算（70% 分成 + 失败写入 RevenueCompensationEntity）
  - [x] SubTask 7.5: 我的收藏页 + 我的使用记录页

- [x] Task 8: 实现对话功能模块（核心）
  - [x] SubTask 8.1: 对话页面 UI（方案A布局：左侧会话列表可折叠 + 中间消息区 + 顶部模型/Agent/知识库选择器）
  - [x] SubTask 8.2: 会话列表（置顶/今日/昨天/7天内分组 + 新建对话 + 搜索）
  - [x] SubTask 8.3: SSE 流式消息接收（通过 OpenClaw 引擎）
  - [x] SubTask 8.4: 工具调用展示（[🔧 工具调用] 标签 + 执行耗时 + 积分消耗）
  - [x] SubTask 8.5: 计费提示（每次对话后显示消耗积分 + 余额）
  - [x] SubTask 8.6: 附件上传（MinIO 存储，路径 `{userId}/{fileId}.ext`）

- [x] Task 9: 实现工作流功能模块（含 N8N 本地编辑器）
  - [x] SubTask 9.1: 工作流模板列表页 UI（按 category 筛选 + 使用次数排序）
  - [x] SubTask 9.2: 工作流详情页 UI（预览图 + 输入输出 Schema + 执行历史）
  - [x] SubTask 9.3: N8N 本地编辑器嵌入（iframe `http://127.0.0.1:5678/workflow` + postMessage 通信）
  - [x] SubTask 9.4: 客户端主进程启动/停止 N8N 子进程
  - [x] SubTask 9.5: 工作流执行计费（pricePerExecution 积分扣减 + 执行日志记录）

- [x] Task 10: 实现插件功能模块
  - [x] SubTask 10.1: 插件市场页 UI（按 tool/connector/knowledge_base/workflow 分类）
  - [x] SubTask 10.2: 已安装插件页 UI（启用/禁用 + 配置入口）
  - [x] SubTask 10.3: 插件调用记录页 UI（时间/插件/输入输出/积分消耗）
  - [x] SubTask 10.4: MCP 网关调用封装（PluginService.syncPluginToMcp）

- [x] Task 11: 实现知识库功能模块
  - [x] SubTask 11.1: 知识库列表页 UI（新建 + 删除 + 进入详情）
  - [x] SubTask 11.2: 文档管理页 UI（上传 + 分块状态 + 删除）
  - [x] SubTask 11.3: 检索测试页 UI（输入查询 + 返回 Top-K 文档片段）
  - [x] SubTask 11.4: Qdrant 集成（collection 命名 `knowledge_base_{id}`）
  - [x] SubTask 11.5: MinIO 文档存储（bucket `aia-files`）

- [x] Task 12: 实现 Agent 创建模块（创作者）
  - [x] SubTask 12.1: 创建 Agent 表单 UI（基本信息 + 系统提示词 + 使用示例 + 模型绑定 + 定价配置）
  - [x] SubTask 12.2: 我的 Agent 列表 + 编辑 + 提交审核
  - [x] SubTask 12.3: 收益中心页 UI（累计收益 + 调用次数 + 提现申请）

- [x] Task 13: 实现 Hermes 实例管理模块
  - [x] SubTask 13.1: 实例列表页 UI（创建/启动/停止/删除实例）
  - [x] SubTask 13.2: 实例详情页 UI（CPU/内存/任务历史 + 技能包挂载）
  - [x] SubTask 13.3: 技能包市场页 UI（浏览/安装技能包）
  - [x] SubTask 13.4: 按分钟计费（HermesBillingService）

- [x] Task 14: 实现 OPC 虚拟团队模块
  - [x] SubTask 14.1: 团队列表页 UI（创建/查看/删除团队）
  - [x] SubTask 14.2: 团队详情页 UI（成员列表 + 任务分配 + 协作流程）
  - [x] SubTask 14.3: 看板视图 UI（任务状态列：待办/进行中/已完成）

- [x] Task 15: 实现个人设置模块
  - [x] SubTask 15.1: 资料编辑页（头像上传 + 用户名/邮箱/手机号）
  - [x] SubTask 15.2: 修改密码页
  - [x] SubTask 15.3: API Key 管理页（AES 加密存储 + 显示/隐藏 + 删除）
  - [x] SubTask 15.4: 设备管理页（已绑定设备列表 + 解绑按钮）
  - [x] SubTask 15.5: 通知设置页（邮件/客户端推送开关）

- [x] Task 16: 实现客户端本地服务管理模块
  - [x] SubTask 16.1: 服务状态面板 UI（OpenClaw/N8N/MCP 三服务的运行状态 + 端口 + 启动/停止/重启按钮）
  - [x] SubTask 16.2: 主进程 ServiceManager（child_process.spawn 启动三个服务子进程）
  - [x] SubTask 16.3: 服务异常检测 + 自动重启 + 弹窗通知
  - [x] SubTask 16.4: 底栏状态指示器（🟢/🔴 实时反映三服务状态）

## 阶段三：管理端核心功能模块

- [x] Task 17: 实现管理端认证与权限模块
  - [x] SubTask 17.1: 管理员登录页 UI（用户名 + 密码 + 图形验证码）
  - [x] SubTask 17.2: AdminJwtAuthGuard + RolesGuard + PermissionGuard 三层守卫集成
  - [x] SubTask 17.3: 角色权限管理页（admin/super_admin + @RequirePermissions 权限编码体系）
  - [x] SubTask 17.4: 操作日志查询页（OperationLogInterceptor 自动记录）

- [x] Task 18: 实现用户管理模块
  - [x] SubTask 18.1: 用户列表页 UI（分页 + keyword/status/level 筛选 + 封禁/解封操作）
  - [x] SubTask 18.2: 用户等级管理页（查看/调整等级 + 关联限流配额）
  - [x] SubTask 18.3: 积分账户管理页（余额查看 + 手动调整 + admin_adjust 流水）
  - [x] SubTask 18.4: 充值订单管理页（按状态/支付方式/时间筛选）
  - [x] SubTask 18.5: 设备管理页（用户设备列表 + 远程解绑）

- [x] Task 19: 实现 API Key 池管理模块（🆕 新增）
  - [x] SubTask 19.1: 创建 `ApiKeyPoolEntity`（api_key_pool 表：provider/api_key AES加密/alias/priority/status/quota 字段）
  - [x] SubTask 19.2: 实现 `ApiKeyPoolService`（CRUD + getNextAvailableKey + markExhausted + resetDailyQuota/resetMonthlyQuota Cron）
  - [x] SubTask 19.3: Key 池管理页 UI（列表 + 新增/编辑/删除 + 状态监控面板）
  - [x] SubTask 19.4: Key 状态监控接口（`GET /api/admin/api-key-pool/stats` + 日/月趋势图）
  - [x] SubTask 19.5: 限额配置接口（`PUT /api/admin/api-key-pool/:id/limits`）
  - [x] SubTask 19.6: 集成 ModelConfigService（getRawModelWithDecryptedKey 优先从 Key 池获取）
  - [x] SubTask 19.7: 定时余额检查任务（每 10 分钟调用提供商 API 更新 remaining_quota）

- [x] Task 20: 实现 Agent 市场管理模块
  - [x] SubTask 20.1: 官方 Agent 发布/编辑/下架页 UI（含 GitHub 仓库异步导入）
  - [x] SubTask 20.2: Agent 审核队列页 UI（pending_review 列表 + approve/reject + 强制下架）
  - [x] SubTask 20.3: Agent 定价管理（pricePerCall + pricePerToken input/output）
  - [x] SubTask 20.4: Agent 分类/标签管理（office/programming/copywriting/data_analysis/other）

- [x] Task 21: 实现工作流模板管理模块
  - [x] SubTask 21.1: 工作流模板 CRUD 页 UI（创建/编辑/删除 + N8N 配置 + 输入输出 Schema）
  - [x] SubTask 21.2: 工作流定价管理（pricePerExecution 配置）
  - [x] SubTask 21.3: 工作流审核与分类管理（按 engineType n8n/coze 筛选 + 统计页）

- [x] Task 22: 实现插件管理模块
  - [x] SubTask 22.1: 官方插件发布/编辑/下架页 UI（含沙箱配置）
  - [x] SubTask 22.2: 插件审核队列页 UI（安全检查 + 性能检查结果展示 + 人工审核）
  - [x] SubTask 22.3: 插件定价管理（pricePerCall + pricePerToken）
  - [x] SubTask 22.4: 插件同步状态监控（syncStatus pending/synced/failed + 手动同步）

- [x] Task 23: 实现大模型配置模块
  - [x] SubTask 23.1: 模型列表页 UI（按 provider 筛选 + enabled 切换）
  - [x] SubTask 23.2: 模型新增/编辑表单（AES 加密 api_key + input/output 单价 + 等级控制 minUserLevel）
  - [x] SubTask 23.3: 模型同步 OpenClaw 状态监控（syncStatus pending/synced/failed）

- [x] Task 24: 实现积分财务管理模块
  - [x] SubTask 24.1: 积分流水查询页 UI（按 type/source/userId/时间筛选）
  - [x] SubTask 24.2: 订单管理页 UI（充值订单 + 退款流程）
  - [x] SubTask 24.3: 发票管理页 UI（基于充值订单申请发票）
  - [x] SubTask 24.4: 对账中心页 UI（流水vs余额 + Token用量 + 支付流水 + Key池扣减 四类对账）

- [x] Task 25: 实现内容审核模块
  - [x] SubTask 25.1: 敏感词管理页 UI（CRUD + 分类）
  - [x] SubTask 25.2: AI 审核配置页（审核模型选择 + 阈值配置）
  - [x] SubTask 25.3: 审核队列页 UI（对话/Agent/插件/工作流内容审核）

- [x] Task 26: 实现数据统计运营模块
  - [x] SubTask 26.1: 数据大盘页 UI（DailyStatsEntity 预聚合：DAU/新增/调用量/收入）
  - [x] SubTask 26.2: 趋势分析页 UI（日/周/月趋势图）
  - [x] SubTask 26.3: 排行榜页 UI（热门 Agent/工作流/插件 + 模型消耗占比）
  - [x] SubTask 26.4: 用户留存分析页（cohort 分析 + Day+1/+7/+30）
  - [x] SubTask 26.5: 实时数据 WebSocket 推送（在线用户/实时调用）

- [x] Task 27: 实现客户端版本管理模块（🆕 新增）
  - [x] SubTask 27.1: 创建 `ClientVersionEntity`（client_versions 表：version/platform/downloadUrl/forceUpdate/grayscalePercent/changelog）
  - [x] SubTask 27.2: 版本发布页 UI（新增版本 + 上传安装包 + 灰度配置）
  - [x] SubTask 27.3: 客户端检查更新接口（`GET /api/version/check?platform=&currentVersion=`）
  - [x] SubTask 27.4: 客户端 electron-updater 集成（启动时检查 + 强制更新拦截 + 灰度命中判断）

- [x] Task 28: 实现系统配置模块
  - [x] SubTask 28.1: 系统参数页 UI（三级缓存配置 + 限流配置 + 通知配置）
  - [x] SubTask 28.2: 多租户配置页 UI（开关 + 配额）
  - [x] SubTask 28.3: 公告管理页 UI（CRUD + 推送）

## 阶段四：数据端实现

- [x] Task 29: 实现积分数据流完整链路
  - [x] SubTask 29.1: 充值数据流（PaymentService → CreditsService.recharge → CreditAccount + CreditTransaction + 状态机白名单）
  - [x] SubTask 29.2: 消费数据流（freezeCredits Redis 分布式锁 + 乐观锁 → settleCredits 多退少补 → refundCredits 退款）
  - [x] SubTask 29.3: 退款数据流（ChatBillingService.refund + HermesBillingService.refundSkillCall）
  - [x] SubTask 29.4: 对账数据流（每次结算写流水 + 更新 totalConsumed + BillingStatsService 聚合）

- [x] Task 30: 实现对账体系
  - [x] SubTask 30.1: 创建 `ReconciliationDiffEntity`（reconciliation_diff 表：type/userId/diffAmount/detail/status pending|resolved|ignored）
  - [x] SubTask 30.2: 实现 `ReconciliationService`（4 类对账任务：流水vs余额 / Token用量 / 支付流水 / Key池扣减）
  - [x] SubTask 30.3: 定时任务（每日凌晨 02:00 跑批 + 小额自动修复 + 大额告警）
  - [x] SubTask 30.4: 管理员审核差异接口（adjustCredits 手动调整 / 标记 ignored）

- [x] Task 31: 实现数据同步设计
  - [x] SubTask 31.1: 创建 `SyncModule`（sync.service.ts + sync.controller.ts）
  - [x] SubTask 31.2: 上行同步接口（`POST /api/sync/batch` 接收客户端批量上报，client_txn_id 幂等）
  - [x] SubTask 31.3: 下行同步接口（`GET /api/sync/pull?since=&types=` 增量拉取）
  - [x] SubTask 31.4: WebSocket 推送通道（Agent配置/工作流模板/插件配置/积分余额/公告/模型配置/用户等级 7 类推送）

- [x] Task 32: 实现数据安全设计
  - [x] SubTask 32.1: HMAC-SHA256 签名中间件（验签 + Redis nonce 防重放 TTL 5 分钟）
  - [x] SubTask 32.2: AES 加密扩展（ApiKeyPoolEntity.api_key 复用 ModelConfigService.encryptApiKey）
  - [x] SubTask 32.3: SQLCipher 本地加密（客户端密钥派生 + 不落盘）
  - [x] SubTask 32.4: 三层限流验证（RateLimitService：日调用/并发/月积分）
  - [x] SubTask 32.5: 数据备份策略（MySQL 每日全量+binlog / Redis AOF+RDB / Qdrant snapshot / MinIO 版本化）

- [x] Task 33: 实现统计报表数据源
  - [x] SubTask 33.1: 扩展 `LogCollectionService.aggregateDailyStats()` 写入 DailyStatsEntity 预聚合表
  - [x] SubTask 33.2: 扩展 `DashboardStatsService`（getOverview/getTrend/getModelConsumption/getUserRetention/getHotAgents/getHotWorkflows/getHotPlugins）
  - [x] SubTask 33.3: 查询策略实现（大盘优先预聚合表，缺失回退实时聚合）

## 阶段五：UI 布局实现与集成测试

- [x] Task 34: 实现方案A + 方案D融合的 UI 布局
  - [x] SubTask 34.1: 主窗口骨架（顶栏 48px + 56px 可展开侧边栏 + 主内容区 + 底栏 32px）
  - [x] SubTask 34.2: 侧边栏组件（默认 56px 图标，hover 展开 180px 图标+文字，7 个导航项：💬对话/🤖Agent/📋工作流/🔌插件/📚知识库/👥团队/⚙️设置）
  - [x] SubTask 34.3: 底栏组件（OpenClaw/N8N/MCP 三服务状态图标 + [📊]状态面板按钮 + 版本号）
  - [x] SubTask 34.4: [📊] 状态面板浮层（积分余额 + 充值入口 + 服务状态 + 今日统计）
  - [x] SubTask 34.5: 对话页面会话列表折叠/展开切换
  - [x] SubTask 34.6: 顶栏组件（搜索框 + 🔔通知 + 💎积分余额点击进入积分中心 + 👤头像菜单）

- [x] Task 35: 客户端打包与发布
  - [x] SubTask 35.1: Windows nsis 打包配置（含图标 + 安装向导 + 注册表关联）
  - [x] SubTask 35.2: Mac dmg 打包配置（含签名 + 公证 + 图标）
  - [x] SubTask 35.3: 安装包自动更新测试（electron-updater 增量更新 + 强制更新拦截）
  - [x] SubTask 35.4: 灰度发布测试（30% 灰度命中 + 24h 后提升 100%）

- [x] Task 36: 端到端集成测试
  - [x] SubTask 36.1: 客户端↔云端同步链路测试（上行批量 + 下行推送 + 离线队列）
  - [x] SubTask 36.2: 计费全链路测试（freeze → settle → refund → 分成 → 对账）
  - [x] SubTask 36.3: API Key 池测试（轮询 + 限额 + 故障切换 + 余额监控）
  - [x] SubTask 36.4: 三阶段计费测试（对话/Agent/工作流/Hermes 四场景）
  - [x] SubTask 36.5: 设备绑定测试（3 台限制 + 解绑 + 异设备登录）
  - [x] SubTask 36.6: HMAC 签名测试（验签 + 防重放 + 时钟漂移容忍）

# Task Dependencies
- [Task 4 设备指纹] depends on [Task 1 客户端脚手架]
- [Task 5-16 用户端功能] depend on [Task 1 客户端脚手架, Task 2 本地数据层, Task 3 通信层, Task 4 设备指纹]
- [Task 17-28 管理端功能] depend on [Task 1 客户端脚手架]（管理端独立于用户端可并行开发）
- [Task 29-33 数据端] depend on [Task 19 API Key池, Task 27 版本管理]（新增 Entity 后才能实现数据流）
- [Task 34 UI布局] depends on [Task 1 客户端脚手架]
- [Task 35 打包发布] depends on [Task 1-34 全部完成]
- [Task 36 集成测试] depends on [Task 35 打包发布]
- **可并行**：[Task 17-28 管理端] 与 [Task 5-16 用户端] 可并行开发（独立 UI 工程）
- **可并行**：[Task 19 API Key池] 与 [Task 27 版本管理] 可并行（独立 Entity）
