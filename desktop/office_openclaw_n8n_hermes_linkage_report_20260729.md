# OpenClaw — N8N — Hermes — Office 链路结构报告

**生成时间:** 2026-07-29 23:17 GMT+8  
**项目路径:** `D:\二次开发`

---

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    桌面端 (Electron)                         │
│                                                             │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────────┐ │
│  │  Office   │   │ ServiceManager│   │   Main Process      │ │
│  │ (Renderer)│   │ (本地进程管理) │   │  (IPC + 生命周期)   │ │
│  └────┬─────┘   └──────┬───────┘   └──────────┬──────────┘ │
│       │                │                      │             │
│       │ HTTP API       │ spawn 子进程         │ IPC          │
│       ▼                ▼                      ▼             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              后端 (NestJS + MySQL)                      │ │
│  │                                                        │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐ │ │
│  │  │  OPC    │  │ Hermes  │  │  N8N    │  │ OpenClaw │ │ │
│  │  │ Module  │←→│ Module  │←→│ Module  │  │  Module  │ │ │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬─────┘ │ │
│  │       │            │            │            │        │ │
│  │       ▼            ▼            ▼            ▼        │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │              MySQL 数据库 (ai_agent)             │  │ │
│  │  └─────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            本地运行时 (runtime/)                       │  │
│  │  ┌──────────┐  ┌────────┐  ┌─────────┐  ┌────────┐  │  │
│  │  │ OpenClaw │  │  N8N   │  │  MCP    │  │ Hermes │  │  │
│  │  │ :51096   │  │ :5678  │  │  :3100  │  │ :8642  │  │  │
│  │  └──────────┘  └────────┘  └─────────┘  └────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、四大组件职责

| 组件 | 角色 | 部署方式 | 端口 |
|------|------|---------|------|
| **OpenClaw** | AI Agent 运行时，提供 Agent 推理能力 | 本地子进程 (spawn) | 51096 |
| **N8N** | 工作流引擎，提供自动化流程编排 | 本地子进程 (spawn) | 5678 |
| **Hermes** | 编排中枢，统一调度 Agent/工作流/工具/技能包 | 本地子进程 (spawn) + 后端服务 | 8642 (本地) / 后端 API |
| **Office** | 前端可视化，展示 Agent 状态、团队、任务 | Electron Renderer | — |

---

## 三、链路分析

### 3.1 Office → 后端 API → 数据库

```
Office (Renderer)
  │
  ├── opcApi.listTeams()          ──→ GET /api/opc/teams          ──→ opc_teams 表
  ├── opcApi.listMembers(teamId)  ──→ GET /api/opc/teams/:id/members ──→ opc_team_members 表
  ├── opcApi.listTeamAgents(teamId)──→ GET /api/opc/teams/:id/agents ──→ opc_agent_repos 表
  ├── hermesApi.listInstances()   ──→ GET /api/hermes/instances     ──→ hermes_instances 表
  ├── hermesApi.startInstance(id) ──→ POST /api/hermes/instances/:id/start
  ├── hermesApi.stopInstance(id)  ──→ POST /api/hermes/instances/:id/stop
  ├── hermesApi.executeTask(...)  ──→ POST /api/hermes/instances/:id/execute
  ├── announcementApi.listPublished() ──→ GET /api/admin/announcements
  │
  └── 所有 API 经 httpClient (src/api/http-client.ts)
       ├── 自动注入 JWT Authorization
       ├── HMAC-SHA256 请求签名 (X-Signature/X-Timestamp/X-Nonce)
       ├── 401 自动刷新 Token
       └── baseURL = VITE_API_BASE_URL || 'https://zt.shentongapi.cn/api'
```

**链路状态:**
- ✅ API 层代码完整 (hermes-api.ts 285行, announcement-api.ts 53行)
- 🔴 `opc-api.ts` 格式损坏 (1行/3330字符) — 代码内容完整但换行丢失
- 🔴 `http-client.ts` 格式损坏 (1行/11068字符) — 影响 TypeScript 编译
- 🔴 `store/auth.ts` 格式损坏 — 认证状态管理受影响
- ⚠️ 后端服务器 502 — `zt.shentongapi.cn` nginx 可达但后端进程未运行
- ⚠️ `api.shentong.ai` DNS 不存在 — 前端可能引用了错误域名

### 3.2 Office → Hermes → 后端 → 三大运行时

```
用户在 Office 点击"启动 Agent"
  │
  ▼
hermesApi.startInstance(id)
  │
  ▼
后端 HermesService.startInstance()
  ├── 更新 hermes_instances.status = 'running'
  ├── InstanceWorkerService.startWorker()
  │   └── 创建 Node.js Worker 线程 (hermes-worker.js)
  │       ├── 加载 skillIds 对应的技能包
  │       └── 定期上报 CPU/内存 → hermes_instances 表
  │
  └── SyncGateway.pushToUser() ──→ WebSocket 推送状态变更 ──→ Office 前端

用户在 Office 点击"执行任务"
  │
  ▼
hermesApi.executeTask(instanceId, dto)
  │
  ▼
后端 HermesService.executeTask()
  ├── 1. 冻结积分 (CreditsService.freezeCredits)
  ├── 2. 创建 CallLog (hermes_call_logs 表, status='running')
  ├── 3. dispatchTask(task) ──→ 根据 callType 分发:
  │       │
  │       ├── agent_invoke → OpenClawService.invokeAgent()
  │       │     └── HTTP 调用本地 OpenClaw (:51096) 的 Agent API
  │       │         └── openclaw_instances 表记录映射关系
  │       │
  │       ├── workflow_run → N8nService.triggerWorkflow()
  │       │     └── HTTP 调用本地 N8N (:5678) 的 REST API
  │       │         └── n8n_instances 表记录连接信息 (baseUrl/apiKey)
  │       │
  │       ├── tool_call → McpService.callTool()
  │       │     └── 通过 MCP Gateway (:3100) 调用注册的 MCP Server
  │       │         └── mcp_servers 表记录 Server 配置
  │       │
  │       └── skill_execute → SkillRunnerService.run()
  │             └── 根据 SkillExecConfig.type 执行:
  │                 ├── shell   → 子进程执行命令
  │                 ├── api     → HTTP 请求
  │                 ├── script  → JavaScript 代码
  │                 └── workflow_ref → 转发到 N8nService
  │
  ├── 4. 计算实际积分消耗
  ├── 5. 结算积分 (settleOrRefund)
  ├── 6. 更新 CallLog (status='success', durationMs, creditsCost)
  └── 7. WebSocket 推送 'hermes:task-completed' ──→ Office 前端
```

**链路状态:**
- ✅ 后端 Hermes 模块完整 (11个文件, ~1700行)
- ✅ dispatchTask 四种分发路径代码完整
- ✅ OpenClawService.invokeAgent() — 通过 HTTP 调用本地 OpenClaw
- ✅ N8nService.triggerWorkflow() — 通过 HTTP 调用本地 N8N
- ✅ McpService.callTool() — 通过 MCP Gateway 调用
- ✅ SkillRunnerService.run() — 四种执行类型
- ⚠️ InstanceWorkerService 依赖 `hermes-worker.js` 文件，首次部署可能缺失(有降级模拟模式)
- ⚠️ 后端未运行，以上链路无法实际执行

### 3.3 桌面端 ServiceManager → 本地运行时

```
Electron Main Process
  │
  ├── ServiceManager (electron/main/service-manager.ts)
  │   ├── openclaw: spawn → runtime/openclaw/openclaw.exe gateway start
  │   │   └── 端口 51096 就绪检测 (30s 超时)
  │   │   └── 启动前自动运行 `openclaw doctor --fix`
  │   │
  │   ├── n8n: spawn → runtime/n8n/n8n.exe.cmd start
  │   │   └── 环境变量: N8N_HOST=127.0.0.1, N8N_PORT=5678
  │   │   └── 端口 5678 就绪检测 (90s 超时, N8N 初始化慢)
  │   │
  │   ├── mcp: spawn → runtime/mcp/mcp-gateway.exe
  │   │   └── 环境变量: MCP_SERVER_URL = {backend}/api/mcp
  │   │   └── 不检测端口, 检测 stderr "MCP Gateway is running"
  │   │
  │   └── hermes: spawn → runtime/hermes/hermes.exe gateway run
  │       └── 环境变量:
  │           ├── HERMES_API_SERVER_KEY = 'shentong-local-hermes-key'
  │           ├── CUSTOM_API_KEY = (登录后通过 IPC 注入)
  │           └── CUSTOM_BASE_URL = {backend}/api/llm-proxy/v1
  │       └── 端口 8642 就绪检测 (30s 超时)
  │       └── 启动前检查 CUSTOM_API_KEY 是否已设置
  │
  ├── 异常自动重启 (最多3次, 间隔5s)
  ├── 每5秒采样 CPU/内存
  └── 每30秒云端服务健康检查 (Hermes 云端)

运行时解析 (runtime-resolver.ts):
  优先级: 内置 extraResources → userData 补丁 → 宿主机命令回退
  manifest.json 定义版本、入口、SHA-256 校验
```

**链路状态:**
- ✅ ServiceManager 代码完整 (~700行)，四个服务定义齐全
- ✅ runtime-resolver.ts 代码完整，三级回退解析逻辑正确
- ✅ manifest.json 完整 — 四个服务版本、SHA-256、下载URL 均已填写
- ✅ runtime/openclaw/ — 已存在 (383MB, 36369文件)
- ✅ runtime/n8n/ — 已存在 (711MB, 96015文件)
- ✅ runtime/mcp/ — 已存在 (97MB, 6530文件)
- ✅ runtime/hermes/ — 已存在 (77.6MB, 1984文件) [本次会话修复]
- ⚠️ Hermes 启动需要 CUSTOM_API_KEY，由用户登录后通过 IPC `hermes:set-llm-proxy-key` 注入
- ⚠️ MCP Gateway 是 SSE 客户端，依赖后端 `/api/mcp` 可达

### 3.4 Office 前端 → ServiceManager (IPC)

```
Office (Renderer)
  │
  ├── window.electronAPI.service.start('hermes')  ──→ IPC ──→ serviceManager.start('hermes')
  ├── window.electronAPI.service.stop('hermes')   ──→ IPC ──→ serviceManager.stop('hermes')
  ├── window.electronAPI.service.list()           ──→ IPC ──→ serviceManager.getAllInfo()
  ├── window.electronAPI.service.getStatus()      ──→ IPC ──→ serviceManager.getAllStatus()
  ├── window.electronAPI.service.checkEnv()       ──→ IPC ──→ serviceManager.checkEnvironment()
  └── window.electronAPI.service.install('hermes')──→ IPC ──→ serviceManager.install('hermes')

IPC 注册 (main/index.ts):
  service:start    → serviceManager.start(name)
  service:stop     → serviceManager.stop(name)
  service:restart  → serviceManager.restart(name)
  service:list     → serviceManager.getAllInfo()
  service:getStatus→ serviceManager.getAllStatus()
  service:status   → serviceManager.getStatus(name)
  service:checkEnv → serviceManager.checkEnvironment()
  service:install  → serviceManager.install(name, onProgress)
  
  hermes:set-llm-proxy-key → setHermesLlmProxyKey(key)  ← 登录后注入
  runtime:verify            → verifyAll()
  runtime:verify-one        → verifyIntegrity(name)
  runtime:download          → downloadRuntime(name)
  runtime:check-update      → 检查后端 /api/runtime/check-update
```

**链路状态:**
- ✅ IPC 注册完整，preload 暴露 `electronAPI` 对象
- ✅ 服务管理 IPC (start/stop/restart/list/status/install) 齐全
- ✅ Hermes LLM Proxy Key 注入链路完整
- ⚠️ Office 组件本身**没有直接调用** ServiceManager IPC — 服务管理由独立的"服务管理"页面负责

---

## 四、数据库链路

### 4.1 数据库配置

```
数据库: MySQL
配置文件: backend/src/config/database.ts
连接参数:
  host: DB_HOST (默认 localhost)
  port: DB_PORT (默认 3306)
  database: DB_DATABASE (默认 ai_agent)
  charset: utf8mb4
  timezone: +08:00
  连接池: 10
  synchronize: false (生产环境, 通过 migration 管理表结构)
```

### 4.2 各组件数据库表

```
┌─────────────────────────────────────────────────────────────┐
│                    MySQL: ai_agent                           │
│                                                             │
│  ── OPC 模块 (4张表) ──────────────────────────────────────│
│  │ opc_teams           团队 (id, name, avatar, creator_id) │
│  │ opc_team_members    成员 (team_id, user_id, role)       │
│  │ opc_tasks           任务 (team_id, title, status, ...)  │
│  │ opc_agent_repos     Agent仓库 (team_id, agent_id, ...)  │
│  │                                                         │
│  ── Hermes 模块 (4张表) ──────────────────────────────────│
│  │ hermes_instances    实例 (user_id, name, status, pid,   │
│  │                          skill_ids, cpu/memory 指标)    │
│  │ hermes_call_logs    任务日志 (instance_id, call_type,   │
│  │                          status, duration_ms, credits)  │
│  │ hermes_skills       技能包目录 (name, version, config,  │
│  │                          price_per_minute, avg_rating)  │
│  │ hermes_skill_ratings 评分 (user_id, skill_id, rating)   │
│  │                                                         │
│  ── N8N 模块 (3张表) ─────────────────────────────────────│
│  │ n8n_instances       N8N实例 (user_id, base_url,         │
│  │                          api_key, status, webhook_url)  │
│  │ n8n_workflows       工作流 (instance_id, workflow_id)   │
│  │ n8n_webhook_logs    Webhook日志                         │
│  │                                                         │
│  ── OpenClaw 模块 (1张表) ────────────────────────────────│
│  │ openclaw_instances  OC实例 (user_id, agent_id,          │
│  │                          openclaw_agent_id, endpoint,   │
│  │                          status, last_heartbeat_at)     │
│  │                                                         │
│  ── MCP 模块 (1张表) ─────────────────────────────────────│
│  │ mcp_servers         MCP服务器 (user_id, name,           │
│  │                          transport_type, command/url,   │
│  │                          status, tool_count)            │
│  │                                                         │
│  ── 通用模块 ─────────────────────────────────────────────│
│  │ users, agents, credits_transactions,                    │
│  │ sync_queue, devices, api_keys, ...                      │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 关键表关系

```
users
  │
  ├── 1:N ── opc_teams (creator_id)
  │             │
  │             ├── 1:N ── opc_team_members (team_id + user_id)
  │             ├── 1:N ── opc_tasks (team_id, assignee_id)
  │             └── 1:N ── opc_agent_repos (team_id + agent_id)
  │
  ├── 1:N ── hermes_instances (user_id)
  │             │
  │             ├── 1:N ── hermes_call_logs (instance_id)
  │             └── N:M ── hermes_skills (通过 skill_ids JSON 字段)
  │
  ├── 1:N ── n8n_instances (user_id)
  │             └── 1:N ── n8n_workflows
  │
  ├── 1:N ── openclaw_instances (user_id + agent_id)
  │
  ├── 1:N ── mcp_servers (user_id)
  │
  └── 1:N ── hermes_skill_ratings (user_id + skill_id)
```

### 4.4 Hermes 任务执行的数据库写入流

```
executeTask() 执行流程:
  1. INSERT hermes_call_logs (status='running', call_type, target)
  2. UPDATE credits_transactions (冻结积分)
  3. dispatchTask() 执行 (不写库, 调用外部服务)
  4. UPDATE hermes_call_logs (status='success', duration_ms, credits_cost)
  5. UPDATE credits_transactions (结算积分)
  6. WebSocket push 'hermes:task-completed'

异常流程:
  4'. UPDATE hermes_call_logs (status='failed'/'timeout', error_message)
  5'. UPDATE credits_transactions (退还冻结积分)
```

---

## 五、Office 与三大运行时的关系

### 5.1 Office 不直接调用运行时

Office 前端组件**不直接调用** OpenClaw / N8N / MCP 运行时进程。所有交互通过后端 API 中转：

```
Office → hermesApi → 后端 HermesService → dispatchTask → OpenClaw/N8N/MCP
```

### 5.2 Office 的数据获取链路

```
Office index.tsx 加载流程:
  1. opcApi.listTeams()           → 获取用户的所有团队
  2. 对每个团队:
     a. opcApi.listMembers(teamId) → 获取团队成员
     b. opcApi.listTeamAgents(teamId) → 获取团队关联的 Agent
  3. hermesApi.listInstances()    → 获取所有 Hermes 实例
  4. 将 OPC Agent 与 Hermes 实例匹配 → 生成 AgentInfo[]
     ├── 匹配逻辑: agent.agentId === instance.id
     ├── 提取: 名称、状态(running/stopped/error)、技能列表
     └── 映射到等距画布上的 AI 员工
  5. 定时轮询 announcementApi.listPublished() → 获取公告
```

### 5.3 Office 的操作链路

```
用户操作 → API 调用:
  ├── 点击 Agent 详情   → hermesApi.getInstance(id)
  ├── 启动 Agent        → hermesApi.startInstance(id)
  ├── 停止 Agent        → hermesApi.stopInstance(id)
  ├── 派发任务          → hermesApi.executeTask(id, dto)
  ├── 查看任务历史      → hermesApi.getCallLogs(id)
  ├── 挂载技能包        → hermesApi.mountSkill(id, skillId)
  └── 卸载技能包        → hermesApi.unmountSkill(id, skillId)

  以上全部经 httpClient → 后端 REST API → 数据库 + 运行时调用
```

### 5.4 officeBridge 事件桥接

`pages/Office/services/officeBridge.ts` (447行) 提供了聊天事件 → Office 动画的桥接：

```
聊天页面事件 → officeBridge:
  ├── onChatMessageSent()    → 触发 Agent "working" 动画
  ├── onAgentRetrieve()      → 触发 "retrieving" 动画
  ├── onToolCall(toolName)   → 触发 "tool call" 动画
  ├── onReplyGenerated()     → 触发 "reply" 动画
  ├── onReview()             → 触发 "review" 动画
  ├── onTaskComplete()       → 触发 "complete" 动画
  ├── onCreditsDeducted(amt) → 更新积分显示
  └── onSystemError(msg)     → 触发 "error" 动画
```

---

## 六、问题清单

### 🔴 阻塞级 (无法运行)

| # | 问题 | 影响 | 修复方案 |
|---|------|------|---------|
| 1 | **27个源文件格式损坏** | TypeScript 编译失败，无法构建 | 从 Git 历史恢复或重新格式化 |
| 2 | **后端服务 502** | 所有 API 不可用 | SSH 到服务器排查后端进程 |
| 3 | **`api.shentong.ai` DNS 不存在** | 若前端引用此域名则登录失败 | 添加 DNS A 记录或统一使用 `zt.shentongapi.cn` |

### ⚠️ 风险级 (功能受限)

| # | 问题 | 影响 |
|---|------|------|
| 4 | **Hermes 本地进程未实际验证** | hermes-worker.js 可能缺失，InstanceWorker 会降级为模拟模式 |
| 5 | **MCP Gateway 依赖后端 `/api/mcp`** | 后端 502 时 MCP Gateway 无法连接 |
| 6 | **Hermes 启动依赖登录** | CUSTOM_API_KEY 需登录后注入，未登录时启动失败 |
| 7 | **公告 API 走 admin 端点** | `GET /admin/announcements` 需 adminToken，普通用户可能 401 |
| 8 | **CDN 下载链路未验证** | `zt.shentongapi.cn/runtime/` 是否可访问未知 |

### 📋 待验证

| # | 项目 | 说明 |
|---|------|------|
| 9 | OPC Agent → Hermes 实例匹配 | `agent.agentId === instance.id` 的匹配逻辑需确认数据一致性 |
| 10 | OpenClaw 本地 :51096 与后端 OpenClawService 的通信 | 后端通过 `openclaw_instances.endpoint` (默认 localhost:8080) 调用，但本地运行时端口是 51096 — **端口不匹配** |
| 11 | N8N 本地 :5678 与后端 N8nService 的通信 | 后端通过 `n8n_instances.base_url` 调用，需确认用户创建实例时填入的是 127.0.0.1:5678 |
| 12 | hermes-worker.js 文件存在性 | InstanceWorkerService 依赖此文件，不存在时降级为模拟模式 |

---

## 七、端口映射对照

| 组件 | 本地运行时端口 | 后端连接端口 | 匹配状态 |
|------|--------------|------------|---------|
| OpenClaw | **51096** (ServiceManager) | `openclaw_instances.endpoint` 默认 `localhost:8080` | ⚠️ **不匹配** |
| N8N | **5678** (ServiceManager) | `n8n_instances.base_url` (用户填写) | ✅ 取决于用户输入 |
| MCP Gateway | **3100** (ServiceManager) | 不直接连接，MCP 是 SSE 客户端 | ✅ 正确 |
| Hermes | **8642** (ServiceManager) | 后端 Hermes 模块不直接调用本地 Hermes 进程 | ✅ 架构设计如此 |

**关键发现:** OpenClaw 本地运行时监听 51096，但后端 `OpenClawInstanceEntity.endpoint` 默认值为 `localhost:8080`。这意味着后端调用 OpenClaw Agent 时可能连接到错误端口。需要确认：
- `openclaw_instances` 表中实际存储的 endpoint 值
- ServiceManager 启动 OpenClaw 后是否通过 API 注册到后端并更新 endpoint
- 或者 OpenClaw 运行时自身是否同时监听 8080

---

## 八、完整数据流总结

```
用户登录
  │
  ├── IPC: hermes:set-llm-proxy-key → ServiceManager 设置 Hermes 环境变量
  │
  ├── ServiceManager.startAll()
  │   ├── OpenClaw (:51096) ←─ doctor --fix 预检
  │   ├── N8N (:5678)
  │   ├── MCP Gateway (:3100) ←─ SSE 连接后端 /api/mcp
  │   └── Hermes (:8642) ←─ CUSTOM_API_KEY + CUSTOM_BASE_URL
  │
  ├── 用户打开 Office 页面
  │   ├── opcApi.listTeams() → GET /api/opc/teams → MySQL: opc_teams
  │   ├── opcApi.listMembers() → GET /api/opc/teams/:id/members → MySQL: opc_team_members
  │   ├── opcApi.listTeamAgents() → GET /api/opc/teams/:id/agents → MySQL: opc_agent_repos
  │   ├── hermesApi.listInstances() → GET /api/hermes/instances → MySQL: hermes_instances
  │   └── 匹配 Agent ↔ Hermes 实例 → 渲染等距 2.5D 场景
  │
  ├── 用户点击"启动 Agent"
  │   ├── hermesApi.startInstance(id) → POST /api/hermes/instances/:id/start
  │   │   ├── MySQL: hermes_instances.status = 'running'
  │   │   ├── InstanceWorkerService.startWorker() → Worker 线程
  │   │   └── WebSocket push → Office 更新 UI
  │   └── ServiceManager.start('hermes') → spawn hermes.exe (本地 :8642)
  │
  ├── 用户点击"执行任务"
  │   ├── hermesApi.executeTask(id, {callType, target, input})
  │   │   ├── MySQL: INSERT hermes_call_logs (running)
  │   │   ├── MySQL: 冻结积分
  │   │   ├── dispatchTask():
  │   │   │   ├── agent_invoke → OpenClawService → HTTP → localhost:51096 ⚠️端口待确认
  │   │   │   ├── workflow_run → N8nService → HTTP → localhost:5678
  │   │   │   ├── tool_call → McpService → MCP Gateway → localhost:3100
  │   │   │   └── skill_execute → SkillRunnerService → shell/api/script
  │   │   ├── MySQL: UPDATE hermes_call_logs (success/failed)
  │   │   ├── MySQL: 结算积分
  │   │   └── WebSocket push → Office 更新动画
  │   └── officeBridge.onTaskComplete() → Agent "complete" 动画
  │
  └── 聊天页面事件 → officeBridge → Office 实时动画
```

---

## 九、结论

### 链路完整性评估

| 链路环节 | 代码完整 | 可运行 | 数据库 |
|---------|---------|--------|--------|
| Office → httpClient → 后端 API | ⚠️ 3文件损坏 | 🔴 后端502 | — |
| 后端 OPC Module | ✅ | 🔴 后端未运行 | ✅ 4张表定义完整 |
| 后端 Hermes Module | ✅ | 🔴 后端未运行 | ✅ 4张表定义完整 |
| 后端 N8N Module | ✅ | 🔴 后端未运行 | ✅ 3张表定义完整 |
| 后端 OpenClaw Module | ✅ | 🔴 后端未运行 | ✅ 1张表定义完整 |
| 后端 MCP Module | ✅ | 🔴 后端未运行 | ✅ 1张表定义完整 |
| ServiceManager → 本地运行时 | ✅ | ⚠️ 未实际验证 | — |
| Office 渲染层 | ✅ 21文件完好 | ✅ (模拟模式可用) | — |
| Hermes Worker 线程 | ✅ | ⚠️ worker.js 待确认 | — |

### 核心阻塞项

1. **27个源文件格式损坏** — 阻塞 TypeScript 编译和打包
2. **后端服务 502** — 阻塞所有 API 调用
3. **OpenClaw 端口不匹配** (51096 vs 8080) — 可能导致后端调用本地 OpenClaw 失败
4. **Hermes worker.js 存在性** — 影响 InstanceWorker 实际运行

### 代码层面链路完整性

**代码是完整的**。从 Office 前端 → httpClient → 后端 API → Hermes 编排 → OpenClaw/N8N/MCP 分发 → 数据库写入，整条链路的代码都已实现。问题集中在：
- 格式损坏（可修复）
- 后端运行状态（运维问题）
- 端口配置一致性（需确认）
- 运行时实际验证（需端到端测试）
