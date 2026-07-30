# 综合方案设计文档 — 团队 + 渠道 + 架构修复

> **Superpowers Phase 1: Brainstorming**
> 生成时间：2026-07-30 02:00
> 状态：待用户确认
> 关联文档：
> - `team_module_design_20260730.md`（团队模块详细设计）
> - `channel_integration_design_20260730.md`（渠道对接详细设计）
> - `architecture_fix_plan_20260730.md`（架构修复方案）
> - `architecture_diff_analysis_20260730.md`（架构差异分析）

---

## 1. 问题陈述

当前系统存在三个层面的问题需要同时解决：

1. **架构层**：调用链是"扁的"——OpenClaw 被当推理引擎而非网关，Hermes 被当 LLM 代理而非决策中枢，AI 员工纯动画无业务逻辑，N8N 被直接调用而非通过 MCP
2. **功能层**：缺少团队管理（Agent + 自定义职能）和外部渠道对接（输入端 + 发布端）
3. **数据层**：26 个格式损坏文件需恢复，OPC 表结构需替换，新表需创建

三者有强依赖关系：渠道消息需要团队处理，团队调用需要正确架构，架构修复涉及现有代码重构。

---

## 2. 现有系统盘点

### 2.1 后端模块（42 个）

```
核心业务模块：
  auth, user, agent, chat, knowledge, model, payment, credits
  plugin, workflow, file, storage, rag, mcp, n8n, opc, hermes
  statistics, system, tenant, device, sync, task, community
  runtime, skill-store, api-key-pool, version, codex, landing
  reconciliation

管理后台模块（14 个）：
  admin-auth, admin-role, admin-log, admin-user, admin-agent
  admin-workflow, admin-plugin, admin-model, admin-finance
  admin-audit, admin-mcp, admin-oss, admin-skill-store, admin-system
```

### 2.2 数据库

- **数据库**：MySQL，charset=utf8mb4，timezone=+08:00
- **ORM**：TypeORM，synchronize=false（生产），migrations 自动执行
- **实体基类**：`BaseEntity`（id bigint + createdAt + updatedAt）
- **加密**：`EncryptionService`（AES-256-GCM，格式 `base64(iv):base64(authTag):base64(ciphertext)`）
- **缓存**：`RedisService`（ioredis）
- **WebSocket**：`SyncGateway`（pushToUser / broadcast）

### 2.3 前端路由

- **客户端**：`/dashboard`, `/chat`, `/office`, `/opc`, `/hermes`, `/plugins`, `/knowledge`, `/team`, `/automation`, `/mcp-config`, `/settings`, `/services` 等
- **管理后台**：`/admin/*`（dashboard, users, agents, workflows, plugins, models, finance, audit, stats, versions, system）
- **侧边栏**：4 个分组 12 项导航（AI 办公区 / 工作区 / 资源区 / 设置区）
- **管理后台侧边栏**：12 项菜单（仪表盘 / 用户管理 / Key 池 / Agent / 工作流 / 插件 / 类型 / 财务 / 审核 / 统计 / 版本 / 系统）

### 2.4 现有 OPC 模块（需替换）

| 表 | 字段 | 问题 |
|---|---|---|
| `opc_teams` | name, description, member_count, creator_id | 成员是 userId 不是 agentId |
| `opc_team_members` | team_id, user_id, role(owner/admin/member) | 无职能概念 |
| `opc_tasks` | team_id, title, assignee_id, status, priority | assignee 是 userId |
| `opc_agent_repos` | team_id, agent_id, agent_name, version | 仓库式关联，无职能 |

### 2.5 现有 MCP 模块（渠道发布端复用）

- `mcp_servers` 表：name, transportType(stdio/http/streamable-http), command, args, env, url, headers
- `McpService`：listServers, createServer, callTool, probeServer
- `admin-mcp` 模块：servers/tools/resources CRUD + logs

### 2.6 现有 Chat 模块（渠道输入端复用）

- `ChatService.streamMessage`：核心消息处理，支持 Agent 上下文、工具调用、流式回复
- `ChatSessionEntity`：会话管理
- 输入端消息可直接复用此能力

### 2.7 现有 N8N 模块（自动化发布复用）

- `N8nService`：listWorkflows, triggerWorkflow, handleWebhook
- `N8nInstanceEntity`：N8N 实例管理
- 发布计划可触发 N8N 工作流执行多平台发布

### 2.8 格式损坏文件（26 个）

| 文件 | 恢复方式 |
|---|---|
| `api/http-client.ts` | Git dangling blob `c0e11607`（318行） |
| `store/auth.ts` | Git dangling blob `2f4648fc`（227行） |
| `api/opc-api.ts` | Git dangling blob `2301d216`（491行） |
| `api/chat-api.ts` | Git dangling blob `7527a5ba`（353行） |
| ... 其余 22 个 | 均有 dangling blob 对应 |

---

## 3. 方案探索

### 方案 A：三线并行开发

**做法**：同时启动架构修复、团队模块、渠道对接三条线

- 优点：总工期短
- 缺点：强依赖导致频繁冲突；架构修复改的文件可能和团队/渠道开发重叠
- 复杂度：高
- 风险：合并冲突多，调试困难

### 方案 B：串行开发（架构→团队→渠道）

**做法**：先修架构，再做团队，最后做渠道

- 优点：依赖关系清晰，每步都建立在稳固基础上
- 缺点：总工期长（30+ 天）
- 复杂度：低
- 风险：低

### 方案 C：分层推进，部分并行（推荐）

**做法**：
1. **第 0 步**：恢复 26 个损坏文件（前置条件，2 小时）
2. **第 1 步**：架构修复（修调用链，3-4 天）
3. **第 2 步**：团队模块 + 渠道模块**并行开发**（团队模块不依赖架构修复的 MCP 总线改造，渠道模块的 MCP 工具注册依赖架构修复完成）
   - 2a：团队模块后端+前端（5 天）
   - 2b：渠道模块后端骨架+适配器（5 天，与 2a 并行）
4. **第 3 步**：集成联调（团队+渠道+Office 动态化，2-3 天）
5. **第 4 步**：管理后台适配（1-2 天）

- 优点：关键路径上串行，非关键路径并行
- 缺点：需要良好的任务拆分
- 复杂度：中
- 风险：中

### 推荐方案：方案 C

**理由**：
- 架构修复必须先行（MCP 总线改造是渠道发布端的前提）
- 团队模块和渠道模块可以并行（数据模型独立，前端页面独立）
- 管理后台改动最小化（只加菜单项和列表页，不做复杂功能）

---

## 4. 技术架构（统一视图）

### 4.1 修复后的完整架构

```
┌─────────────────────────────────────────────────────────────┐
│                        桌面端 (Electron)                      │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 微信公众号 │  │ 飞书机器人 │  │ Telegram  │  │ 钉钉机器人 │    │
│  │ (输入端)  │  │ (输入端)  │  │ (输入端)  │  │ (输入端)  │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └──────────────┴──────────────┴──────────────┘          │
│                      ▼                                        │
│  ┌──────────────────────────────────────────┐                │
│  │        Channel Gateway (新)               │  统一渠道网关  │
│  │  Webhook接收 / 消息路由 / 凭证管理          │                │
│  └──────────────────┬───────────────────────┘                │
│                     ▼                                         │
│  ┌──────────────────────────────────────────┐                │
│  │        OpenClaw (修复后: 纯网关)           │  入口网关      │
│  │  鉴权 / 路由 / 状态管控 / 结果反馈          │                │
│  └──────────────────┬───────────────────────┘                │
│                     ▼                                         │
│  ┌──────────────────────────────────────────┐                │
│  │        Hermes (修复后: 决策中枢)           │  智能编排      │
│  │  任务拆解 / Agent调度 / Skill调用           │                │
│  └──────────────────┬───────────────────────┘                │
│                     ▼                                         │
│  ┌──────────────────────────────────────────┐                │
│  │     Team Members (新)                     │  团队执行      │
│  │  Agent + 自定义职能 (CEO/渠道/销售...)      │                │
│  └──────────────────┬───────────────────────┘                │
│                     ▼                                         │
│  ┌──────────────────────────────────────────┐                │
│  │     MCP Tool Bus (修复后: 统一总线)        │  能力总线      │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │                │
│  │  │ N8N  │ │ RAG  │ │抖音  │ │小红书 │   │  发布端工具    │
│  │  │工作流│ │知识库│ │发布  │ │发布  │   │                │
│  │  └──────┘ └──────┘ └──────┘ └──────┘   │                │
│  └──────────────────────────────────────────┘                │
│                                                               │
│  ┌──────────────────────────────────────────┐                │
│  │     Office (修复后: 动态化)               │  可视化        │
│  │  从团队成员动态生成工位 + 角色动画          │                │
│  └──────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 数据库变更总览

#### 新建表（5 张）

| 表名 | 用途 | 所属模块 |
|------|------|---------|
| `teams` | 团队 | team |
| `team_members` | 团队成员（Agent + 职能） | team |
| `team_tasks` | 团队任务 | team |
| `channels` | 渠道配置 | channel |
| `channel_messages` | 渠道消息记录 | channel |
| `publish_plans` | 发布计划 | channel |

> 共 6 张新表

#### 删除/替换表（4 张）

| 表名 | 处理方式 |
|------|---------|
| `opc_teams` | 数据迁移到 `teams` 后删除 |
| `opc_team_members` | 数据迁移到 `team_members` 后删除 |
| `opc_tasks` | 数据迁移到 `team_tasks` 后删除 |
| `opc_agent_repos` | 废弃（功能合并到 `team_members`） |

#### 修改表（现有表）

| 表名 | 修改内容 |
|------|---------|
| `mcp_servers` | 新增 `channel_id` 字段（关联渠道，可选） |
| `chat_sessions` | 新增 `channel_id` 字段（渠道消息映射会话） |

### 4.3 数据迁移策略

```sql
-- Step 1: 创建新表（migration）
-- Step 2: 数据迁移
INSERT INTO teams (id, name, description, member_count, creator_id, created_at, updated_at)
SELECT id, name, description, member_count, creator_id, created_at, updated_at FROM opc_teams;

-- opc_agent_repos → team_members（agentId + 默认职能"团队成员"）
INSERT INTO team_members (team_id, agent_id, agent_name, agent_avatar, role_title, role_description, sort_order, is_active, added_by, joined_at)
SELECT team_id, agent_id, agent_name, agent_avatar, '团队成员', description, 0, true, added_by, added_at FROM opc_agent_repos;

-- opc_tasks → team_tasks
INSERT INTO team_tasks (team_id, title, description, status, assignee_member_id, creator_id, priority, due_date, created_at, completed_at)
SELECT team_id, title, description, status, NULL, creator_id, priority, due_date, created_at, completed_at FROM opc_tasks;

-- Step 3: 验证数据完整性
-- Step 4: 删除旧表（下一个 migration）
```

### 4.4 管理后台配合修改

#### 新增管理后台菜单项

```typescript
// admin Layout 侧边栏新增
const menuItems = [
  // ... 现有 12 项 ...
  { key: 'team', label: '团队', icon: <TeamOutlined />, path: '/admin/teams' },
  { key: 'channel', label: '渠道', icon: <ApiOutlined />, path: '/admin/channels' },
  { key: 'publish', label: '发布', icon: <SendOutlined />, path: '/admin/publish' },
]
```

#### 新增管理后台页面

| 路由 | 页面 | 功能 |
|------|------|------|
| `/admin/teams` | 团队管理 | 查看所有用户的团队、成员、任务；可禁用团队 |
| `/admin/channels` | 渠道管理 | 查看所有渠道配置、凭证状态、消息统计；可禁用渠道 |
| `/admin/channels/:id/messages` | 消息记录 | 查看渠道消息流水 |
| `/admin/publish` | 发布管理 | 查看所有发布计划、状态、结果；可审核/取消发布 |

#### 新增管理后台后端模块

```
backend/src/modules/
  admin-team/           # 管理后台团队管理
    admin-team.module.ts
    admin-team.controller.ts
    admin-team.service.ts
  admin-channel/        # 管理后台渠道管理
    admin-channel.module.ts
    admin-channel.controller.ts
    admin-channel.service.ts
```

#### 管理后台 API

```
# 团队管理
GET    /api/admin/teams                    团队列表（支持按用户/状态筛选）
GET    /api/admin/teams/:id                团队详情
PATCH  /api/admin/teams/:id/status         禁用/启用团队
DELETE /api/admin/teams/:id                删除团队

# 渠道管理
GET    /api/admin/channels                 渠道列表
GET    /api/admin/channels/:id             渠道详情
GET    /api/admin/channels/:id/messages    消息记录
PATCH  /api/admin/channels/:id/status      禁用/启用渠道
DELETE /api/admin/channels/:id             删除渠道

# 发布管理
GET    /api/admin/publish/plans            发布计划列表
GET    /api/admin/publish/plans/:id        发布计划详情
PATCH  /api/admin/publish/plans/:id/status 审核（通过/拒绝）
POST   /api/admin/publish/plans/:id/cancel 取消发布
```

---

## 5. 分阶段实施计划

### Phase 0：前置修复（1 天）

| 任务 | 文件 | 验证 |
|------|------|------|
| 恢复 26 个损坏文件 | 从 Git dangling blobs 恢复 | TS 编译通过 |
| 修复 OpenClaw 端口不匹配 | 后端 `openclaw_instances.endpoint` 配置 | 端口=51096 |
| 修复后端 502 | SSH 登录服务器，重启后端进程 | 健康检查通过 |
| 修复 DNS | `api.shentong.ai` A 记录 | DNS 解析正确 |

### Phase 1：架构修复（3-4 天）

#### 1.1 MCP 总线改造（1 天）

**目标**：N8N 不再被直接调用，统一通过 MCP 工具调用

```
修改前: HermesService.dispatchTask → N8nService.triggerWorkflow (直接)
修改后: HermesService.dispatchTask → McpService.callTool("n8n_workflow") → N8nService (通过MCP)
```

**改动文件**：
- `backend/src/modules/hermes/services/hermes.service.ts` — `dispatchTask` 中 `runWorkflow` 改为调 MCP
- `backend/src/modules/mcp/services/mcp.service.ts` — 新增 N8N 工具注册
- `backend/src/modules/n8n/services/n8n.service.ts` — `triggerWorkflow` 包装为 MCP 工具

#### 1.2 OpenClaw 链路修正（1 天）

**目标**：OpenClaw 只做入口网关，不做推理

```
修改前: ChatService.streamMessage → OpenClawService.invokeAgent (做推理)
修改后: ChatService.streamMessage → OpenClawService.routeRequest → HermesService.orchestrate (做编排)
```

**改动文件**：
- `backend/src/modules/chat/services/chat.service.ts` — `streamMessage` 中 OpenClaw 分支改为路由
- `backend/src/modules/openclaw/services/openclaw.service.ts` — `invokeAgent` 改为 `routeRequest`
- `backend/src/modules/hermes/services/hermes.service.ts` — 新增 `orchestrate` 方法

#### 1.3 Hermes 编排层增强（1 天）

**目标**：Hermes 负责任务拆解、Agent 调度，而非直接做 LLM 代理

```
HermesService.orchestrate(task):
  1. 分析任务，拆解为子任务
  2. 分配给团队中的 Agent（根据职能匹配）
  3. 调用各 Agent 执行子任务
  4. 汇总结果
```

**改动文件**：
- `backend/src/modules/hermes/services/hermes.service.ts` — 新增 `orchestrate` 方法
- `backend/src/modules/hermes/services/instance-worker.service.ts` — Worker 通信增加团队调度

#### 1.4 AI 员工执行层（1 天）

**目标**：AI 员工不再是纯动画，接收 Hermes 派发的子任务并执行

**改动文件**：
- `src/pages/Office/services/officeBridge.ts` — 接收 Hermes 回调，触发动画
- `backend/src/modules/hermes/services/hermes.service.ts` — `dispatchTask` 中 `agent_invoke` 传入团队成员信息

### Phase 2a：团队模块（5 天，与 2b 并行）

| 天 | 任务 | 产出 |
|---|------|------|
| 1 | 后端实体 + Service + Controller + Module + Migration | 3 张表 + API 可用 |
| 2 | 前端类型 + API 封装 + 团队列表页 | 列表页可显示 |
| 3 | 创建团队弹窗（选 Agent + 自定义职能）| 可创建团队 |
| 4 | 团队详情页（成员管理 + 任务列表 + 看板）| 可管理团队 |
| 5 | OPC 数据迁移 + 旧模块删除 + 路由替换 | OPC → Team 完成 |

**后端文件清单**：
```
新建:
  backend/src/modules/team/team.module.ts
  backend/src/modules/team/controllers/team.controller.ts
  backend/src/modules/team/services/team.service.ts
  backend/src/modules/team/entities/team.entity.ts
  backend/src/modules/team/entities/team-member.entity.ts
  backend/src/modules/team/entities/team-task.entity.ts
  backend/src/modules/team/dto/team.dto.ts
  backend/src/migrations/CreateTeamTables.ts
  backend/src/migrations/MigrateOpcData.ts
  backend/src/migrations/DropOpcTables.ts

删除:
  backend/src/modules/opc/ (整个目录)

修改:
  backend/src/app.module.ts (移除 OpcModule, 加入 TeamModule)
```

**前端文件清单**：
```
新建:
  src/types/team.ts
  src/api/team-api.ts
  src/pages/Team/index.tsx
  src/pages/Team/Detail.tsx
  src/pages/Team/Board.tsx
  src/pages/Team/components/MemberEditor.tsx
  src/pages/Team/components/RolePicker.tsx
  src/pages/Team/styles.module.css

删除:
  src/pages/OPC/ (整个目录)
  src/types/opc.ts
  src/api/opc-api.ts

修改:
  src/router/index.tsx (路由替换)
  src/components/Sidebar/index.tsx (已有 team 项)
```

### Phase 2b：渠道模块（5 天，与 2a 并行）

| 天 | 任务 | 产出 |
|---|------|------|
| 1 | 后端实体 + Channel Module 骨架 + Migration | 3 张表 + 基础 API |
| 2 | BaseAdapter + 微信适配器 + Webhook 接收 | 微信消息可接收 |
| 3 | 飞书适配器 + 抖音适配器 + 小红书适配器 | 3 个平台适配器 |
| 4 | 前端渠道管理页 + 创建向导 | 可配置渠道 |
| 5 | 发布计划 Service + 前端发布页 + MCP 工具注册 | 可发布内容 |

**后端文件清单**：
```
新建:
  backend/src/modules/channel/channel.module.ts
  backend/src/modules/channel/controllers/channel.controller.ts
  backend/src/modules/channel/controllers/channel-webhook.controller.ts
  backend/src/modules/channel/controllers/publish.controller.ts
  backend/src/modules/channel/services/channel.service.ts
  backend/src/modules/channel/services/channel-router.service.ts
  backend/src/modules/channel/services/publish.service.ts
  backend/src/modules/channel/services/adapters/base.adapter.ts
  backend/src/modules/channel/services/adapters/wechat-official.adapter.ts
  backend/src/modules/channel/services/adapters/feishu.adapter.ts
  backend/src/modules/channel/services/adapters/dingtalk.adapter.ts
  backend/src/modules/channel/services/adapters/telegram.adapter.ts
  backend/src/modules/channel/services/adapters/douyin.adapter.ts
  backend/src/modules/channel/services/adapters/xiaohongshu.adapter.ts
  backend/src/modules/channel/services/adapters/weibo.adapter.ts
  backend/src/modules/channel/entities/channel.entity.ts
  backend/src/modules/channel/entities/channel-message.entity.ts
  backend/src/modules/channel/entities/publish-plan.entity.ts
  backend/src/modules/channel/dto/channel.dto.ts
  backend/src/migrations/CreateChannelTables.ts

修改:
  backend/src/app.module.ts (加入 ChannelModule)
  backend/src/modules/chat/services/chat.service.ts (新增 findOrCreateChannelSession)
  backend/src/modules/chat/entities/chat-session.entity.ts (新增 channelId 字段)
```

**前端文件清单**：
```
新建:
  src/types/channel.ts
  src/api/channel-api.ts
  src/api/publish-api.ts
  src/pages/Channels/index.tsx
  src/pages/Channels/Detail.tsx
  src/pages/Channels/components/ChannelWizard.tsx
  src/pages/Publish/index.tsx
  src/pages/Publish/Create.tsx
  src/pages/Publish/styles.module.css

修改:
  src/router/index.tsx (新增路由)
  src/components/Sidebar/index.tsx (新增"渠道中心"分组)
```

### Phase 3：集成联调（2-3 天）

| 天 | 任务 |
|---|------|
| 1 | Office 动态化：从团队成员生成工位 + officeBridge 动态映射 |
| 2 | 渠道→团队联动：入站消息路由到团队 Agent 处理 |
| 3 | 团队→发布联动：团队 Agent 生成内容 → 发布计划 → 多平台发布 |

### Phase 4：管理后台适配（1-2 天）

| 天 | 任务 |
|---|------|
| 1 | 后端：admin-team + admin-channel 模块 + 路由 |
| 1 | 前端：admin 菜单 + 团队/渠道/发布列表页 |
| 2 | 前端：消息记录页 + 发布审核页 |

**管理后台文件清单**：
```
新建:
  backend/src/modules/admin-team/admin-team.module.ts
  backend/src/modules/admin-team/admin-team.controller.ts
  backend/src/modules/admin-team/admin-team.service.ts
  backend/src/modules/admin-channel/admin-channel.module.ts
  backend/src/modules/admin-channel/admin-channel.controller.ts
  backend/src/modules/admin-channel/admin-channel.service.ts
  
  src/pages/admin/Teams/index.tsx
  src/pages/admin/Channels/index.tsx
  src/pages/admin/Channels/Messages.tsx
  src/pages/admin/Publish/index.tsx

修改:
  backend/src/app.module.ts (加入两个 admin 模块)
  src/pages/admin/Layout/index.tsx (侧边栏新增 3 项)
  src/router/index.tsx (新增 admin 路由)
```

---

## 6. 数据库 Migration 顺序

```sql
-- Migration 1: 恢复损坏文件（Phase 0，与DB无关，代码层）

-- Migration 2: 创建 team 表（Phase 2a）
CREATE TABLE teams (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  avatar VARCHAR(512),
  description VARCHAR(512),
  member_count INT DEFAULT 0,
  creator_id BIGINT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_teams_creator (creator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE team_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  team_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  agent_name VARCHAR(64) NOT NULL,
  agent_avatar VARCHAR(512),
  role_title VARCHAR(64) NOT NULL,
  role_description VARCHAR(512),
  role_emoji VARCHAR(16),
  theme_color VARCHAR(16),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  added_by BIGINT NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_team_member_agent (team_id, agent_id),
  INDEX idx_team_member_team (team_id),
  INDEX idx_team_member_agent (agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE team_tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  team_id BIGINT NOT NULL,
  title VARCHAR(128) NOT NULL,
  description VARCHAR(512),
  status ENUM('pending','in_progress','completed','failed') DEFAULT 'pending',
  assignee_member_id BIGINT,
  creator_id BIGINT NOT NULL,
  priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
  due_date DATETIME,
  result JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  INDEX idx_team_task_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migration 3: 数据迁移 OPC → Team
INSERT INTO teams SELECT * FROM opc_teams;
INSERT INTO team_members (team_id, agent_id, agent_name, agent_avatar, role_title, role_description, sort_order, is_active, added_by, joined_at)
SELECT team_id, agent_id, agent_name, agent_avatar, '团队成员', description, 0, true, added_by, added_at FROM opc_agent_repos;
INSERT INTO team_tasks (team_id, title, description, status, creator_id, priority, due_date, created_at, completed_at)
SELECT team_id, title, description, status, creator_id, priority, due_date, created_at, completed_at FROM opc_tasks;

-- Migration 4: 删除 OPC 表
DROP TABLE opc_agent_repos;
DROP TABLE opc_tasks;
DROP TABLE opc_team_members;
DROP TABLE opc_teams;

-- Migration 5: 创建 channel 表（Phase 2b）
CREATE TABLE channels (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  type ENUM('wechat_official','wechat_work','feishu_bot','dingtalk_bot','telegram_bot',
             'douyin','xiaohongshu','weibo','zhihu','bilibili',
             'wechat_official_bidirectional') NOT NULL,
  direction ENUM('inbound','outbound','bidirectional') DEFAULT 'inbound',
  agent_id BIGINT,
  team_id BIGINT,
  credentials JSON,
  webhook_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_message_at DATETIME,
  user_id BIGINT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_channels_user (user_id),
  INDEX idx_channels_type (type),
  INDEX idx_channels_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE channel_messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  channel_id BIGINT NOT NULL,
  external_msg_id VARCHAR(128) NOT NULL,
  direction ENUM('inbound','outbound') NOT NULL,
  message_type ENUM('text','image','video','link','file','voice','article') DEFAULT 'text',
  content TEXT NOT NULL,
  sender_external_id VARCHAR(128),
  sender_name VARCHAR(64),
  sender_avatar VARCHAR(512),
  recipient_external_id VARCHAR(128),
  chat_session_id BIGINT,
  team_task_id BIGINT,
  status ENUM('pending','processing','sent','delivered','failed','read') DEFAULT 'pending',
  error_message VARCHAR(512),
  raw_payload JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_channel_msg_channel (channel_id),
  INDEX idx_channel_msg_external (external_msg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE publish_plans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(128) NOT NULL,
  content_type ENUM('text','image','video','article') NOT NULL,
  content TEXT NOT NULL,
  media_urls JSON,
  target_channel_ids JSON NOT NULL,
  publish_mode ENUM('immediate','scheduled','recurring') DEFAULT 'immediate',
  scheduled_at DATETIME,
  cron_expr VARCHAR(64),
  team_id BIGINT,
  workflow_id BIGINT,
  status ENUM('draft','pending','publishing','published','partial_failed','failed','cancelled') DEFAULT 'draft',
  publish_results JSON,
  review_status ENUM('pending','approved','rejected','auto') DEFAULT 'auto',
  user_id BIGINT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  INDEX idx_publish_plans_user (user_id),
  INDEX idx_publish_plans_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migration 6: chat_sessions 新增 channel_id
ALTER TABLE chat_sessions ADD COLUMN channel_id BIGINT NULL;
```

---

## 7. 管理后台与客户端的配合关系

### 7.1 功能边界

| 功能 | 客户端（用户） | 管理后台（管理员） |
|------|---------------|------------------|
| 团队 | 创建/管理自己的团队 | 查看所有团队，可禁用 |
| 渠道 | 配置自己的渠道凭证 | 查看所有渠道，可禁用 |
| 发布 | 创建/管理自己的发布计划 | 审核发布计划，可取消 |
| 消息 | 查看自己渠道的消息 | 查看所有消息流水 |
| Office | 查看团队办公状态 | 不涉及 |

### 7.2 管理后台新增页面设计

**团队管理页（`/admin/teams`）**：
```
表格列: ID | 团队名 | 创建者 | 成员数 | 状态 | 创建时间 | 操作
操作: [查看详情] [禁用/启用] [删除]
筛选: 按状态 / 按创建者
```

**渠道管理页（`/admin/channels`）**：
```
表格列: ID | 渠道名 | 类型 | 方向 | 关联Agent/团队 | 状态 | 最后消息 | 操作
操作: [查看消息] [禁用/启用] [删除]
筛选: 按类型 / 按方向 / 按状态
```

**发布管理页（`/admin/publish`）**：
```
表格列: ID | 标题 | 目标平台 | 模式 | 状态 | 审核状态 | 创建者 | 操作
操作: [查看详情] [审核通过/拒绝] [取消发布]
筛选: 按状态 / 按审核状态
```

### 7.3 管理后台菜单更新

```typescript
// admin Layout/index.tsx — menuItems 新增
const menuItems = [
  // ... 现有 12 项 ...
  { key: 'team', label: '团队', icon: <TeamOutlined />, path: '/admin/teams' },
  { key: 'channel', label: '渠道', icon: <ApiOutlined />, path: '/admin/channels' },
  { key: 'publish', label: '发布', icon: <SendOutlined />, path: '/admin/publish' },
]
// 分组建议：
// 运营管理组: 团队 | 渠道 | 发布 | 审核
```

---

## 8. 关键风险与对策

| 风险 | 等级 | 对策 |
|------|------|------|
| 26 个损坏文件恢复后内容不一致 | 高 | 从 dangling blobs 恢复后，逐文件 diff 确认 |
| OPC 数据迁移丢失 | 高 | 迁移前备份；迁移后行数对比 |
| 架构修复影响现有功能 | 高 | 逐步修改，每步编译验证 |
| 平台 API 资质审核慢 | 中 | P0 平台先对接，P1/P2 按计划推进 |
| 管理后台改动影响现有功能 | 低 | 新增模块，不修改现有 admin 模块 |
| 前端 OPC 路由删除后 404 | 低 | 添加 redirect 规则 |

---

## 9. 总工期与里程碑

| 阶段 | 天数 | 里程碑 |
|------|------|--------|
| Phase 0: 前置修复 | 1 | 代码可编译，服务可运行 |
| Phase 1: 架构修复 | 3-4 | 调用链正确：OpenClaw→Hermes→Agent→MCP |
| Phase 2a: 团队模块 | 5 | 团队可创建，Office 可动态化 |
| Phase 2b: 渠道模块 | 5 | 渠道可配置，内容可发布 |
| Phase 3: 集成联调 | 2-3 | 全链路打通 |
| Phase 4: 管理后台 | 1-2 | 管理员可管控 |
| **合计** | **15-19** | |

### 关键路径

```
Phase 0 (1天) → Phase 1 (3-4天) → Phase 2a/2b 并行 (5天) → Phase 3 (2-3天) → Phase 4 (1-2天)
                                        ↑
                                   Phase 2b 依赖 Phase 1 完成（MCP 总线）
                                   Phase 2a 不依赖 Phase 1（可更早开始）
```

**优化**：Phase 2a 可以在 Phase 1 进行到一半时启动（架构修复的前半部分不影响团队模块）。

---

## 10. 待确认事项

1. **OPC 数据迁移**：现有 OPC 数据量是否很小，可以直接清空重建？还是必须迁移？
2. **管理后台审核流程**：发布计划需要人工审核还是自动发布？审核阈值是什么？
3. **渠道优先级**：P0 是微信公众号(输入) + 抖音(发布) + 小红书(发布)，这个顺序对吗？
4. **Office 精灵图**：超过 5 个团队成员时，是循环使用 5 套精灵图，还是需要制作更多？
5. **架构修复范围**：是否在本次一并修复所有 6 大架构差异，还是只修复关键路径（OpenClaw 入口 + MCP 总线），其余后续？
6. **管理后台必要性**：团队/渠道/发布的管理后台页面是否本次必须做，还是先做客户端，管理后台后续补充？
7. **服务器 502**：是否已有 SSH 权限可以排查？

---

## 附录

### A. 文件变更总清单

| 类型 | 后端 | 前端 | 合计 |
|------|------|------|------|
| 新建 | 24 | 18 | 42 |
| 修改 | 6 | 4 | 10 |
| 删除 | opc/ 目录 | OPC/ 目录 + 2 文件 | ~20 |
| Migration | 6 个 | - | 6 |

### B. 新建表总清单

| 表名 | 字段数 | 索引数 |
|------|--------|--------|
| teams | 7 | 1 |
| team_members | 13 | 3 |
| team_tasks | 12 | 1 |
| channels | 13 | 3 |
| channel_messages | 16 | 2 |
| publish_plans | 16 | 2 |

### C. 删除表总清单

| 表名 |
|---|
| opc_teams |
| opc_team_members |
| opc_tasks |
| opc_agent_repos |
