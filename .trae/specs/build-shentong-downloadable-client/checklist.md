# Checklist

## 阶段一：客户端工程脚手架与基础设施

- [x] Electron 客户端工程已初始化（`d:\二次开发\desktop\`），含 Electron + Vite + React + TypeScript
- [x] electron-builder 打包配置完成（Windows nsis + Mac dmg，输出 `dist/installer/`）
- [x] electron-updater 自动更新已集成，update server URL 已配置
- [x] 系统托盘功能实现（最小化到托盘 + 托盘菜单：打开主界面/服务状态/退出）
- [x] 首次启动引导向导实现（环境检测 → 服务初始化 → 登录 → 主界面）
- [x] SQLite + SQLCipher 本地数据库已集成（`LocalDbService` 主进程封装）
- [x] 本地表结构创建完成（local_chat_sessions/messages/workflow_executions/plugin_call_logs/sync_queue）
- [x] 加密密钥派生实现（PBKDF2 基于登录态派生 + 不落盘）
- [x] 降级策略实现（SQLite 初始化失败 → 纯云端模式不中断功能）
- [x] HttpClient HMAC-SHA256 签名注入实现（X-Timestamp/X-Nonce/X-Signature）
- [x] WebSocketClient 实现心跳 + 断线重连 + 增量拉取
- [x] SyncService 实现（上行批量 100 条/批 + client_txn_id 幂等 + 下行推送监听）
- [x] 离线调用队列实现（网络中断写本地 → 恢复批量上报）

## 阶段二：用户端核心功能模块

- [x] 设备指纹 SDK 采集实现（User-Agent + IP + 客户端特征哈希）
- [x] 后端 DeviceModule 创建（device.entity/service/controller）
- [x] `user_devices` 表创建（userId/deviceFingerprint/deviceName/lastLoginAt/createdAt）
- [x] 设备 API 实现（`POST /api/devices/bind`、`GET /api/devices`、`DELETE /api/devices/:id`）
- [x] 登录流程集成设备校验（超出 3 台返回 DEVICE_LIMIT_EXCEEDED）
- [x] 登录页 UI 实现（用户名/邮箱 + 密码 + 忘记密码链接）
- [x] 注册页 UI 实现（用户名 + 邮箱 + 密码 + 邀请码可选）
- [x] JWT + RefreshToken 双令牌集成（access 15min + refresh 7d）
- [x] 密码重置令牌 + 邮件发送服务实现
- [x] 邀请码生成与管理服务实现
- [x] 积分中心余额总览页 UI（当前余额 + 冻结 + 累计充值 + 累计消费 + 充值按钮）
- [x] 充值页 UI（套餐选择 + 微信/支付宝/Stripe 三渠道）
- [x] 流水查询页 UI（时间范围/来源筛选 + 分页表格）
- [x] 消费明细页 UI（model_call/plugin_call/workflow_call 分类查看）
- [x] 客户端本地缓存积分余额（只读 + 云端推送更新）
- [x] Agent 市场首页 UI（官方推荐/社区标签 + 分类筛选 + 卡片列表）
- [x] Agent 详情页 UI（不含 systemPrompt + 评价列表 + 收藏按钮）
- [x] Agent 调用三阶段计费流程（freeze → settle → refund）
- [x] 创作者 70% 分成结算 + 失败写入 RevenueCompensationEntity
- [x] 我的收藏页 + 我的使用记录页实现
- [x] 对话页面 UI 实现（方案A布局：可折叠会话列表 + 消息区 + 模型/Agent/知识库选择器）
- [x] 会话列表分组（置顶/今日/昨天/7天内 + 新建 + 搜索）
- [x] SSE 流式消息接收实现（OpenClaw 引擎）
- [x] 工具调用展示（[🔧 工具调用] 标签 + 耗时 + 积分）
- [x] 计费提示（每次对话后显示消耗积分 + 余额）
- [x] 附件上传实现（MinIO 存储，路径 `{userId}/{fileId}.ext`）
- [x] 工作流模板列表页 UI（category 筛选 + 使用次数排序）
- [x] 工作流详情页 UI（预览图 + 输入输出 Schema + 执行历史）
- [x] N8N 本地编辑器 iframe 嵌入（`http://127.0.0.1:5678/workflow` + postMessage）
- [x] 客户端主进程启动/停止 N8N 子进程实现
- [x] 工作流执行计费实现（pricePerExecution 扣减 + 日志记录）
- [x] 插件市场页 UI（tool/connector/knowledge_base/workflow 分类）
- [x] 已安装插件页 UI（启用/禁用 + 配置入口）
- [x] 插件调用记录页 UI（时间/插件/输入输出/积分）
- [x] MCP 网关调用封装实现
- [x] 知识库列表页 UI（新建/删除/进入详情）
- [x] 文档管理页 UI（上传/分块状态/删除）
- [x] 检索测试页 UI（查询 + Top-K 文档片段）
- [x] Qdrant 集成（collection `knowledge_base_{id}`）
- [x] MinIO 文档存储集成（bucket `aia-files`）
- [x] Agent 创建表单 UI（基本信息 + systemPrompt + 使用示例 + 模型 + 定价）
- [x] 我的 Agent 列表 + 编辑 + 提交审核实现
- [x] 收益中心页 UI（累计收益 + 调用次数 + 提现申请）
- [x] Hermes 实例列表页 UI（创建/启动/停止/删除）
- [x] Hermes 实例详情页 UI（CPU/内存/任务历史 + 技能包挂载）
- [x] 技能包市场页 UI（浏览/安装）
- [x] Hermes 按分钟计费实现
- [x] OPC 团队列表页 UI（创建/查看/删除）
- [x] OPC 团队详情页 UI（成员 + 任务 + 协作流程）
- [x] OPC 看板视图 UI（待办/进行中/已完成）
- [x] 个人资料编辑页（头像 + 用户名/邮箱/手机号）
- [x] 修改密码页实现
- [x] API Key 管理页（AES 加密存储 + 显示/隐藏 + 删除）
- [x] 设备管理页（已绑定设备列表 + 解绑按钮）
- [x] 通知设置页（邮件/客户端推送开关）
- [x] 服务状态面板 UI（OpenClaw/N8N/MCP 状态 + 端口 + 启动/停止/重启）
- [x] 主进程 ServiceManager 实现（child_process.spawn 启动三服务子进程）
- [x] 服务异常检测 + 自动重启 + 弹窗通知实现
- [x] 底栏状态指示器实现（🟢/🔴 实时反映三服务状态）

## 阶段三：管理端核心功能模块

- [x] 管理员登录页 UI（用户名 + 密码 + 图形验证码）
- [x] AdminJwtAuthGuard + RolesGuard + PermissionGuard 三层守卫集成
- [x] 角色权限管理页 UI（admin/super_admin + 权限编码体系）
- [x] 操作日志查询页 UI（OperationLogInterceptor 自动记录）
- [x] 用户列表页 UI（分页 + keyword/status/level 筛选 + 封禁/解封）
- [x] 用户等级管理页 UI（查看/调整 + 关联限流配额）
- [x] 积分账户管理页 UI（余额 + 手动调整 + admin_adjust 流水）
- [x] 充值订单管理页 UI（按状态/支付方式/时间筛选）
- [x] 设备管理页 UI（用户设备列表 + 远程解绑）
- [x] `ApiKeyPoolEntity` 创建（api_key_pool 表 + AES 加密 api_key）
- [x] `ApiKeyPoolService` 实现（CRUD + getNextAvailableKey + markExhausted + Cron 重置配额）
- [x] Key 池管理页 UI（列表 + 新增/编辑/删除 + 状态监控）
- [x] Key 状态监控接口（`GET /api/admin/api-key-pool/stats` + 趋势图）
- [x] 限额配置接口（`PUT /api/admin/api-key-pool/:id/limits`）
- [x] ModelConfigService 扩展（优先从 Key 池获取）
- [x] 定时余额检查任务（每 10 分钟调用提供商 API 更新 remaining_quota）
- [x] 官方 Agent 发布/编辑/下架页 UI（含 GitHub 仓库异步导入）
- [x] Agent 审核队列页 UI（pending_review + approve/reject + 强制下架）
- [x] Agent 定价管理实现（pricePerCall + pricePerToken input/output）
- [x] Agent 分类/标签管理实现
- [x] 工作流模板 CRUD 页 UI（创建/编辑/删除 + N8N 配置 + Schema）
- [x] 工作流定价管理实现（pricePerExecution 配置接口）
- [x] 工作流审核与分类管理实现（engineType 筛选 + 统计页）
- [x] 官方插件发布/编辑/下架页 UI（含沙箱配置）
- [x] 插件审核队列页 UI（安全检查 + 性能检查 + 人工审核）
- [x] 插件定价管理实现（pricePerCall + pricePerToken）
- [x] 插件同步状态监控实现（syncStatus + 手动同步）
- [x] 模型列表页 UI（provider 筛选 + enabled 切换）
- [x] 模型新增/编辑表单实现（AES 加密 api_key + 单价 + 等级控制）
- [x] 模型同步 OpenClaw 状态监控实现
- [x] 积分流水查询页 UI（type/source/userId/时间筛选）
- [x] 订单管理页 UI（充值订单 + 退款流程）
- [x] 发票管理页 UI（基于充值订单申请）
- [x] 对账中心页 UI（四类对账：流水vs余额 + Token + 支付 + Key池）
- [x] 敏感词管理页 UI（CRUD + 分类）
- [x] AI 审核配置页 UI（模型 + 阈值）
- [x] 审核队列页 UI（对话/Agent/插件/工作流内容审核）
- [x] 数据大盘页 UI（DailyStatsEntity 预聚合：DAU/新增/调用量/收入）
- [x] 趋势分析页 UI（日/周/月趋势图）
- [x] 排行榜页 UI（热门 Agent/工作流/插件 + 模型消耗占比）
- [x] 用户留存分析页（cohort + Day+1/+7/+30）
- [x] 实时数据 WebSocket 推送（在线用户/实时调用）
- [x] `ClientVersionEntity` 创建（client_versions 表）
- [x] 版本发布页 UI（新增版本 + 上传安装包 + 灰度配置）
- [x] 客户端检查更新接口（`GET /api/version/check?platform=&currentVersion=`）
- [x] electron-updater 集成（启动时检查 + 强制更新拦截 + 灰度命中判断）
- [x] 系统参数页 UI（三级缓存 + 限流 + 通知配置）
- [x] 多租户配置页 UI（开关 + 配额）
- [x] 公告管理页 UI（CRUD + 推送）

## 阶段四：数据端实现

- [x] 充值数据流完整实现（PaymentService → CreditsService.recharge → 状态机白名单）
- [x] 消费数据流完整实现（freezeCredits Redis 锁 + 乐观锁 + settleCredits + refundCredits）
- [x] 退款数据流完整实现（ChatBillingService.refund + HermesBillingService.refundSkillCall）
- [x] 对账数据流完整实现（流水 + totalConsumed + BillingStatsService 聚合）
- [x] `ReconciliationDiffEntity` 创建（reconciliation_diff 表）
- [x] `ReconciliationService` 实现（4 类对账任务）
- [x] 定时对账任务实现（每日 02:00 + 小额修复 + 大额告警）
- [x] 管理员审核差异接口实现（adjustCredits / 标记 ignored）
- [x] `SyncModule` 创建（sync.service.ts + sync.controller.ts）
- [x] 上行同步接口实现（`POST /api/sync/batch` + client_txn_id 幂等）
- [x] 下行同步接口实现（`GET /api/sync/pull?since=&types=` 增量拉取）
- [x] WebSocket 推送通道实现（7 类推送：Agent/工作流模板/插件/积分/公告/模型/等级）
- [x] HMAC-SHA256 签名中间件实现（验签 + Redis nonce 防重放 TTL 5 分钟）
- [x] AES 加密扩展实现（ApiKeyPoolEntity.api_key 复用 ModelConfigService）
- [x] SQLCipher 本地加密实现（密钥派生 + 不落盘）
- [x] 三层限流验证实现（日调用/并发/月积分）
- [x] 数据备份策略实现（MySQL/Redis/Qdrant/MinIO 四类备份）
- [x] `LogCollectionService.aggregateDailyStats()` 扩展实现（写入 DailyStatsEntity）
- [x] `DashboardStatsService` 扩展实现（getOverview/getTrend/getModelConsumption/getUserRetention/getHot*）
- [x] 查询策略实现（大盘优先预聚合表 + 缺失回退实时聚合）

## 阶段五：UI 布局实现与集成测试

- [x] 主窗口骨架实现（顶栏 48px + 56px 可展开侧边栏 + 主内容区 + 底栏 32px）
- [x] 侧边栏组件实现（默认 56px 图标，hover 展开 180px 图标+文字，7 个导航项）
- [x] 底栏组件实现（OpenClaw/N8N/MCP 状态图标 + [📊]按钮 + 版本号）
- [x] [📊] 状态面板浮层实现（积分余额 + 充值入口 + 服务状态 + 今日统计）
- [x] 对话页面会话列表折叠/展开切换实现
- [x] 顶栏组件实现（搜索 + 🔔通知 + 💎积分点击进入积分中心 + 👤头像菜单）
- [x] Windows nsis 打包配置完成（图标 + 安装向导 + 注册表关联）
- [x] Mac dmg 打包配置完成（签名 + 公证 + 图标）
- [x] 安装包自动更新测试通过（增量更新 + 强制更新拦截）
- [x] 灰度发布测试通过（30% 灰度命中 + 24h 后提升 100%）
- [x] 客户端↔云端同步链路测试通过（上行批量 + 下行推送 + 离线队列）
- [x] 计费全链路测试通过（freeze → settle → refund → 分成 → 对账）
- [x] API Key 池测试通过（轮询 + 限额 + 故障切换 + 余额监控）
- [x] 三阶段计费测试通过（对话/Agent/工作流/Hermes 四场景）
- [x] 设备绑定测试通过（3 台限制 + 解绑 + 异设备登录）
- [x] HMAC 签名测试通过（验签 + 防重放 + 时钟漂移容忍）

## TypeScript 与代码质量

- [x] 所有新增 TypeScript 文件 GetDiagnostics 零类型错误（desktop `npm run typecheck` exit 0 + backend `npm run build` exit 0）
- [x] 后端新增模块遵循 NestJS 10 模块化规范（controller + service + module + entities + dto）
- [x] 客户端代码遵循 Electron 主进程/渲染进程分离规范（IPC 通信明确）
- [x] 数据库新增表遵循 InnoDB + utf8mb4_unicode_ci + BIGINT UNSIGNED PK + snake_case 字段命名
- [x] TypeORM Entity 属性使用 camelCase，与 snake_case 数据库字段通过 @Column name 映射
- [x] 所有新增 API 端点遵循统一响应格式 `{ code, data, message, timestamp }`
