# 实现计划 — 团队 + 渠道 + 架构修复 + 管理后台

> **Superpowers Phase 3: Implementation Planning**
> 生成时间：2026-07-30 02:10
> 前置文档：`design.md`（已确认）

---

## 用户确认决策

1. ✅ OPC 数据：清空重建（不需迁移）
2. ✅ 发布审核：可选择（自动 or 人工审核）
3. ✅ 渠道优先级：P0 = 微信公众号(输入) + 抖音(发布) + 小红书(发布)
4. ✅ Office 精灵图：循环使用 5 套
5. ✅ 架构修复：6 项全部修复
6. ✅ 管理后台：本次一起做
7. ✅ 服务器 502：先不排查

---

## Phase 0：前置修复（27 个损坏文件恢复）

### 任务 0.1：从 main 分支恢复 27 个损坏文件
- **文件**：27 个前端源文件（见下方完整列表）
- **方式**：从 git commit `8dafbdaf`（main 分支）恢复
- **验证**：TS 编译通过，无 1 行损坏文件
- **依赖**：无
- **预计**：30 分钟

文件列表：
```
src/api/http-client.ts          (251 lines)
src/api/opc-api.ts              (110 lines)
src/api/chat-api.ts             (274 lines)
src/api/admin-auth-api.ts       (234 lines)
src/api/admin-user-api.ts       (153 lines)
src/api/knowledge-api.ts        (162 lines)
src/api/sync-service.ts         (327 lines)
src/api/workflow-api.ts         (61 lines)
src/store/auth.ts               (180 lines)
src/store/admin-auth.ts         (87 lines)
src/types/admin-user.ts         (155 lines)
src/types/knowledge.ts          (55 lines)
src/components/MainLayout/index.tsx   (22 lines)
src/components/MainLayout/TopBar.tsx  (139 lines)
src/pages/AgentMarket/index.tsx       (345 lines)
src/pages/Chat/components/MessageList.tsx    (130 lines)
src/pages/Chat/components/ToolCallBadge.tsx  (113 lines)
src/pages/Credits/index.tsx     (164 lines)
src/pages/Hermes/Detail.tsx     (525 lines)
src/pages/Hermes/SkillMarket.tsx (244 lines)
src/pages/Knowledge/index.tsx   (230 lines)
src/pages/Plugin/index.tsx      (265 lines)
src/pages/Workflow/Detail.tsx   (367 lines)
src/pages/Workflow/Editor.tsx   (303 lines)
src/pages/Workflow/index.tsx    (218 lines)
src/env.d.ts                    (17 lines)
src/main.tsx                    (8 lines)
```

---

## Phase 1：架构修复（6 项全修，3-4 天）

### 任务 1.1：MCP 总线改造 — N8N 通过 MCP 调用
- **文件**：
  - `backend/src/modules/hermes/services/hermes.service.ts` — `dispatchTask` 中 `runWorkflow` 改为通过 MCP callTool
  - `backend/src/modules/mcp/services/mcp.service.ts` — 新增 N8N 工具注册方法 `registerBuiltinTools()`
  - `backend/src/modules/n8n/services/n8n.service.ts` — 导出 `triggerWorkflow` 供 MCP 调用
- **验证**：`dispatchTask` 中 `workflow_run` 类型走 MCP 通道
- **依赖**：无
- **预计**：4 小时

### 任务 1.2：MCP 总线改造 — RAG 通过 MCP 调用
- **文件**：
  - `backend/src/modules/hermes/services/hermes.service.ts` — `callTool` 中 RAG 调用改为 MCP
  - `backend/src/modules/mcp/services/mcp.service.ts` — 注册 RAG 工具
  - `backend/src/modules/rag/services/rag.service.ts` — 导出查询方法
- **验证**：RAG 查询走 MCP 通道
- **依赖**：1.1
- **预计**：2 小时

### 任务 1.3：OpenClaw 链路修正 — 只做入口网关
- **文件**：
  - `backend/src/modules/chat/services/chat.service.ts` — `streamMessage` 中 OpenClaw 分支改为路由到 Hermes
  - `backend/src/modules/openclaw/services/openclaw.service.ts` — `invokeAgent` 改为 `routeRequest`（鉴权 + 路由，不做推理）
- **验证**：ChatService 消息流：OpenClaw(鉴权路由) → Hermes(编排)
- **依赖**：1.1, 1.2
- **预计**：4 小时

### 任务 1.4：Hermes 编排层 — 新增 orchestrate 方法
- **文件**：
  - `backend/src/modules/hermes/services/hermes.service.ts` — 新增 `orchestrate(userId, task)` 方法
  - `backend/src/modules/hermes/services/instance-worker.service.ts` — Worker 通信增加团队调度
- **验证**：`orchestrate` 能拆解任务并分配给 Agent
- **依赖**：1.3
- **预计**：4 小时

### 任务 1.5：ChatService 统一入口 — 去除越权
- **文件**：
  - `backend/src/modules/chat/services/chat.service.ts` — 移除直接调用 OpenClaw/Hermes 的分支，统一走 `OpenClawService.routeRequest → HermesService.orchestrate`
- **验证**：ChatService 不直接调用推理引擎
- **依赖**：1.3, 1.4
- **预计**：3 小时

### 任务 1.6：AI 员工执行层 — 接收 Hermes 回调
- **文件**：
  - `src/pages/Office/services/officeBridge.ts` — 接收 Hermes 回调事件
  - `backend/src/modules/hermes/services/hermes.service.ts` — `dispatchTask` 中 `agent_invoke` 传入团队成员信息
- **验证**：Hermes 派发任务时 Office 有动画响应
- **依赖**：1.4
- **预计**：3 小时

---

## Phase 2a：团队模块（5 天，与 2b 并行）

### 任务 2a.1：后端 — Team 实体 + Service + Controller + Module
- **新建文件**：
  - `backend/src/modules/team/team.module.ts`
  - `backend/src/modules/team/controllers/team.controller.ts`
  - `backend/src/modules/team/services/team.service.ts`
  - `backend/src/modules/team/entities/team.entity.ts`
  - `backend/src/modules/team/entities/team-member.entity.ts`
  - `backend/src/modules/team/entities/team-task.entity.ts`
  - `backend/src/modules/team/dto/team.dto.ts`
- **修改文件**：
  - `backend/src/app.module.ts` — 移除 OpcModule，加入 TeamModule
- **验证**：API 可用（GET /api/teams 返回空列表）
- **依赖**：无
- **预计**：1 天

### 任务 2a.2：数据库 Migration — 创建 team 表 + 删除 OPC 表
- **新建文件**：
  - `backend/src/migrations/CreateTeamTables.ts` — 创建 teams, team_members, team_tasks
  - `backend/src/migrations/DropOpcTables.ts` — 删除 opc_teams, opc_team_members, opc_tasks, opc_agent_repos
- **验证**：migration 执行成功
- **依赖**：2a.1
- **预计**：2 小时

### 任务 2a.3：后端 — 删除 OPC 模块
- **删除文件**：
  - `backend/src/modules/opc/` 整个目录
- **修改文件**：
  - `backend/src/app.module.ts` — 移除 OpcModule import
- **验证**：后端编译通过，无 OPC 引用
- **依赖**：2a.1
- **预计**：30 分钟

### 任务 2a.4：前端 — 类型定义 + API 封装
- **新建文件**：
  - `src/types/team.ts` — TeamMember, Team, CreateTeamDto 等类型 + PRESET_ROLES
  - `src/api/team-api.ts` — listTeams, createTeam, getTeamDetail 等
- **验证**：类型可导入，API 可调用
- **依赖**：2a.1
- **预计**：3 小时

### 任务 2a.5：前端 — 团队列表页
- **新建文件**：
  - `src/pages/Team/index.tsx` — 团队列表 + 创建弹窗
  - `src/pages/Team/styles.module.css`
- **验证**：页面可显示，创建弹窗可弹出
- **依赖**：2a.4
- **预计**：1 天

### 任务 2a.6：前端 — 创建团队弹窗（选 Agent + 自定义职能）
- **新建文件**：
  - `src/pages/Team/components/MemberEditor.tsx` — Agent 选择 + 职能输入
  - `src/pages/Team/components/RolePicker.tsx` — 预设职能 + 自定义输入
- **修改文件**：
  - `src/pages/Team/index.tsx` — 集成创建弹窗
- **验证**：可选择 Agent、输入职能、创建团队
- **依赖**：2a.5
- **预计**：1 天

### 任务 2a.7：前端 — 团队详情页 + 看板
- **新建文件**：
  - `src/pages/Team/Detail.tsx` — 成员管理 + 任务列表
  - `src/pages/Team/Board.tsx` — 看板视图
- **修改文件**：
  - `src/router/index.tsx` — 替换 OPC 路由为 Team 路由
- **删除文件**：
  - `src/pages/OPC/` 整个目录
  - `src/types/opc.ts`
  - `src/api/opc-api.ts`
- **验证**：路由 /team 可访问，/opc 重定向到 /team
- **依赖**：2a.6
- **预计**：1 天

### 任务 2a.8：Office 动态化
- **新建文件**：
  - `src/pages/Office/dynamic-employees.ts` — 从团队成员生成 AIEmployee[]
- **修改文件**：
  - `src/pages/Office/types.ts` — role 类型扩展为 string + 新增 agentId/memberId 字段
  - `src/pages/Office/employees.ts` — 保留默认5个，新增导出 `createEmployeesFromTeam()`
  - `src/pages/Office/office-2d-config.ts` — 工位坐标支持动态扩展
  - `src/pages/Office/services/officeBridge.ts` — `ROLE_TO_EMPLOYEE` 改为动态映射
  - `src/pages/Office/Office2DPage.tsx` — 加载团队数据生成员工
- **验证**：Office 根据团队成员动态显示
- **依赖**：2a.4
- **预计**：1 天

---

## Phase 2b：渠道模块（5 天，与 2a 并行）

### 任务 2b.1：后端 — Channel 实体 + Service + Controller + Module
- **新建文件**：
  - `backend/src/modules/channel/channel.module.ts`
  - `backend/src/modules/channel/controllers/channel.controller.ts`
  - `backend/src/modules/channel/controllers/channel-webhook.controller.ts`
  - `backend/src/modules/channel/controllers/publish.controller.ts`
  - `backend/src/modules/channel/services/channel.service.ts`
  - `backend/src/modules/channel/services/channel-router.service.ts`
  - `backend/src/modules/channel/services/publish.service.ts`
  - `backend/src/modules/channel/entities/channel.entity.ts`
  - `backend/src/modules/channel/entities/channel-message.entity.ts`
  - `backend/src/modules/channel/entities/publish-plan.entity.ts`
  - `backend/src/modules/channel/dto/channel.dto.ts`
- **修改文件**：
  - `backend/src/app.module.ts` — 加入 ChannelModule
  - `backend/src/modules/chat/entities/chat-session.entity.ts` — 新增 `channelId` 字段
- **验证**：API 可用（GET /api/channels 返回空列表）
- **依赖**：Phase 1 完成（MCP 总线）
- **预计**：1 天

### 任务 2b.2：数据库 Migration — 创建 channel 表
- **新建文件**：
  - `backend/src/migrations/CreateChannelTables.ts` — channels, channel_messages, publish_plans
  - `backend/src/migrations/AddChannelIdToChatSessions.ts` — chat_sessions 加 channel_id
- **验证**：migration 执行成功
- **依赖**：2b.1
- **预计**：2 小时

### 任务 2b.3：后端 — BaseAdapter + 微信适配器
- **新建文件**：
  - `backend/src/modules/channel/services/adapters/base.adapter.ts`
  - `backend/src/modules/channel/services/adapters/wechat-official.adapter.ts`
- **验证**：微信 Webhook 验签 + 消息解析
- **依赖**：2b.1
- **预计**：1 天

### 任务 2b.4：后端 — 飞书 + 抖音 + 小红书适配器
- **新建文件**：
  - `backend/src/modules/channel/services/adapters/feishu.adapter.ts`
  - `backend/src/modules/channel/services/adapters/douyin.adapter.ts`
  - `backend/src/modules/channel/services/adapters/xiaohongshu.adapter.ts`
- **验证**：各适配器 verifyWebhook + publishContent 可调用
- **依赖**：2b.3
- **预计**：1.5 天

### 任务 2b.5：后端 — 消息路由 + 发布编排
- **修改文件**：
  - `backend/src/modules/channel/services/channel-router.service.ts` — 实现消息路由到 Chat/Team
  - `backend/src/modules/channel/services/publish.service.ts` — 实现多平台同步发布 + 定时发布
  - `backend/src/modules/chat/services/chat.service.ts` — 新增 `findOrCreateChannelSession()`
- **验证**：入站消息可路由到 ChatService，发布计划可执行
- **依赖**：2b.3, 2b.4
- **预计**：1 天

### 任务 2b.6：后端 — MCP 工具注册（发布端）
- **修改文件**：
  - `backend/src/modules/mcp/services/mcp.service.ts` — 注册 `publish_douyin`, `publish_xiaohongshu`, `publish_weibo`, `publish_wechat_article` 工具
- **验证**：MCP callTool 可调用发布工具
- **依赖**：2b.4
- **预计**：3 小时

### 任务 2b.7：前端 — 渠道管理页
- **新建文件**：
  - `src/types/channel.ts`
  - `src/api/channel-api.ts`
  - `src/pages/Channels/index.tsx` — 渠道列表 + 创建向导
  - `src/pages/Channels/components/ChannelWizard.tsx` — 分步创建（选平台→配置→测试）
  - `src/pages/Channels/Detail.tsx` — 渠道详情 + 消息记录
- **修改文件**：
  - `src/router/index.tsx` — 新增 /channels 路由
  - `src/components/Sidebar/index.tsx` — 新增"渠道中心"分组
- **验证**：渠道列表可显示，创建向导可配置
- **依赖**：2b.1
- **预计**：1.5 天

### 任务 2b.8：前端 — 内容发布页
- **新建文件**：
  - `src/api/publish-api.ts`
  - `src/pages/Publish/index.tsx` — 发布计划列表
  - `src/pages/Publish/Create.tsx` — 创建发布（选平台→编辑内容→定时/立即→审核模式）
- **修改文件**：
  - `src/router/index.tsx` — 新增 /publish 路由
- **验证**：可创建发布计划，支持自动/人工审核
- **依赖**：2b.7
- **预计**：1 天

---

## Phase 3：集成联调（2-3 天）

### 任务 3.1：渠道 → 团队联动
- **修改文件**：
  - `backend/src/modules/channel/services/channel-router.service.ts` — 渠道绑定团队时，消息路由到 `HermesService.orchestrate(teamId, ...)`
- **验证**：外部消息进来 → 团队 Agent 处理 → 回复到外部平台
- **依赖**：2a.1 + 2b.5 + Phase 1
- **预计**：1 天

### 任务 3.2：团队 → 发布联动
- **修改文件**：
  - `backend/src/modules/hermes/services/hermes.service.ts` — `orchestrate` 结果可生成发布计划
  - `backend/src/modules/channel/services/publish.service.ts` — 接受 Hermes 生成的发布内容
- **验证**：团队 Agent 生成内容 → 发布计划 → 多平台发布
- **依赖**：3.1
- **预计**：1 天

### 任务 3.3：Office 完整联动测试
- **验证**：
  - 创建团队 → Office 动态显示成员
  - 渠道消息进来 → Office 对应角色动画
  - 发布完成 → Office 状态更新
- **依赖**：2a.8 + 3.2
- **预计**：1 天

---

## Phase 4：管理后台适配（1-2 天）

### 任务 4.1：后端 — admin-team + admin-channel 模块
- **新建文件**：
  - `backend/src/modules/admin-team/admin-team.module.ts`
  - `backend/src/modules/admin-team/admin-team.controller.ts`
  - `backend/src/modules/admin-team/admin-team.service.ts`
  - `backend/src/modules/admin-channel/admin-channel.module.ts`
  - `backend/src/modules/admin-channel/admin-channel.controller.ts`
  - `backend/src/modules/admin-channel/admin-channel.service.ts`
- **修改文件**：
  - `backend/src/app.module.ts` — 加入两个 admin 模块
- **验证**：管理 API 可用
- **依赖**：Phase 2a + 2b
- **预计**：1 天

### 任务 4.2：前端 — 管理后台页面
- **新建文件**：
  - `src/pages/admin/Teams/index.tsx` — 团队管理表格
  - `src/pages/admin/Channels/index.tsx` — 渠道管理表格
  - `src/pages/admin/Channels/Messages.tsx` — 消息记录
  - `src/pages/admin/Publish/index.tsx` — 发布管理 + 审核
- **修改文件**：
  - `src/pages/admin/Layout/index.tsx` — 侧边栏新增 团队/渠道/发布 3 项
  - `src/router/index.tsx` — 新增 admin 路由
- **验证**：管理后台可查看团队/渠道/发布，可审核
- **依赖**：4.1
- **预计**：1 天

---

## 任务依赖图

```
Phase 0 (0.1)
    ↓
Phase 1: 1.1 → 1.2 → 1.3 → 1.4 → 1.5
                       1.4 → 1.6
    ↓
Phase 2a: 2a.1 → 2a.2 + 2a.3 (并行)
    2a.1 → 2a.4 → 2a.5 → 2a.6 → 2a.7
    2a.4 → 2a.8
         ↓
Phase 2b: 2b.1 → 2b.2
    2b.1 → 2b.3 → 2b.4 → 2b.5
                     2b.4 → 2b.6
    2b.1 → 2b.7 → 2b.8
         ↓
Phase 3: 3.1 (需 2a + 2b + P1) → 3.2 → 3.3
         ↓
Phase 4: 4.1 → 4.2
```

## 关键路径

```
0.1 (30min) → 1.1 (4h) → 1.2 (2h) → 1.3 (4h) → 1.4 (4h) → 1.5 (3h)
→ 2b.1 (1d) → 2b.3 (1d) → 2b.4 (1.5d) → 2b.5 (1d) → 3.1 (1d) → 3.2 (1d) → 3.3 (1d) → 4.1 (1d) → 4.2 (1d)
```

**关键路径总计**：约 16 个工作日

**并行优化后**：Phase 2a 可在 Phase 1 完成后立即开始（不依赖 MCP），与 Phase 2b 并行，实际约 15 个工作日。

---

## 文件变更总表

### 新建文件（42 个）

**后端（24 个）**：
```
backend/src/modules/team/team.module.ts
backend/src/modules/team/controllers/team.controller.ts
backend/src/modules/team/services/team.service.ts
backend/src/modules/team/entities/team.entity.ts
backend/src/modules/team/entities/team-member.entity.ts
backend/src/modules/team/entities/team-task.entity.ts
backend/src/modules/team/dto/team.dto.ts
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
backend/src/modules/channel/services/adapters/douyin.adapter.ts
backend/src/modules/channel/services/adapters/xiaohongshu.adapter.ts
backend/src/modules/channel/entities/channel.entity.ts
backend/src/modules/channel/entities/channel-message.entity.ts
backend/src/modules/channel/entities/publish-plan.entity.ts
backend/src/modules/channel/dto/channel.dto.ts
backend/src/modules/admin-team/ (3 files: module, controller, service)
backend/src/modules/admin-channel/ (3 files: module, controller, service)
```

**前端（18 个）**：
```
src/types/team.ts
src/types/channel.ts
src/api/team-api.ts
src/api/channel-api.ts
src/api/publish-api.ts
src/pages/Team/index.tsx
src/pages/Team/Detail.tsx
src/pages/Team/Board.tsx
src/pages/Team/components/MemberEditor.tsx
src/pages/Team/components/RolePicker.tsx
src/pages/Team/styles.module.css
src/pages/Office/dynamic-employees.ts
src/pages/Channels/index.tsx
src/pages/Channels/Detail.tsx
src/pages/Channels/components/ChannelWizard.tsx
src/pages/Publish/index.tsx
src/pages/Publish/Create.tsx
src/pages/admin/Teams/index.tsx
src/pages/admin/Channels/index.tsx
src/pages/admin/Channels/Messages.tsx
src/pages/admin/Publish/index.tsx
```

**Migration（4 个）**：
```
backend/src/migrations/CreateTeamTables.ts
backend/src/migrations/DropOpcTables.ts
backend/src/migrations/CreateChannelTables.ts
backend/src/migrations/AddChannelIdToChatSessions.ts
```

### 修改文件（10 个）
```
backend/src/app.module.ts (移除 OpcModule, 加入 TeamModule + ChannelModule + AdminTeamModule + AdminChannelModule)
backend/src/modules/hermes/services/hermes.service.ts (MCP总线 + orchestrate方法)
backend/src/modules/mcp/services/mcp.service.ts (注册N8N/RAG/发布工具)
backend/src/modules/n8n/services/n8n.service.ts (导出供MCP调用)
backend/src/modules/openclaw/services/openclaw.service.ts (改为纯网关)
backend/src/modules/chat/services/chat.service.ts (统一入口 + findOrCreateChannelSession)
backend/src/modules/chat/entities/chat-session.entity.ts (新增 channelId)
src/router/index.tsx (路由变更)
src/components/Sidebar/index.tsx (新增渠道中心分组)
src/pages/admin/Layout/index.tsx (新增3个管理菜单项)
```

### 修改文件（Office 动态化，5 个）
```
src/pages/Office/types.ts (role 扩展为 string)
src/pages/Office/employees.ts (新增 createEmployeesFromTeam)
src/pages/Office/office-2d-config.ts (工位动态扩展)
src/pages/Office/services/officeBridge.ts (动态角色映射)
src/pages/Office/Office2DPage.tsx (加载团队数据)
```

### 删除文件（~20 个）
```
backend/src/modules/opc/ (整个目录, ~8 files)
src/pages/OPC/ (整个目录, ~3 files)
src/types/opc.ts
src/api/opc-api.ts
```

---

## 验收标准

### Phase 0 验收
- [ ] 27 个文件全部恢复，无 1 行损坏文件
- [ ] `npx tsc --noEmit` 通过

### Phase 1 验收
- [ ] N8N 通过 MCP 调用（不再直接调用）
- [ ] RAG 通过 MCP 调用
- [ ] OpenClaw 只做鉴权路由（不做推理）
- [ ] Hermes 有 orchestrate 方法
- [ ] ChatService 统一走 OpenClaw → Hermes 链路
- [ ] Office 接收 Hermes 回调有动画

### Phase 2a 验收
- [ ] 可创建团队（名称 + 描述）
- [ ] 可添加成员（选 Agent + 输入自定义职能）
- [ ] 可管理成员（编辑职能、排序、激活/停用）
- [ ] 可创建/分配/管理任务
- [ ] Office 根据团队成员动态显示
- [ ] /opc 重定向到 /team
- [ ] OPC 旧表已删除

### Phase 2b 验收
- [ ] 可配置微信公众号渠道（Webhook 验证通过）
- [ ] 可配置抖音/小红书发布渠道
- [ ] 微信消息可接收并路由到 Chat/Team 处理
- [ ] 可创建发布计划（多平台同步 + 定时）
- [ ] 发布计划支持自动/人工审核
- [ ] MCP 工具 publish_douyin 等可调用

### Phase 3 验收
- [ ] 渠道消息 → 团队 Agent 处理 → 回复到外部平台
- [ ] 团队 Agent 生成内容 → 发布计划 → 多平台发布
- [ ] Office 全链路联动动画正确

### Phase 4 验收
- [ ] 管理后台可查看所有团队/渠道/发布计划
- [ ] 管理员可禁用/启用团队和渠道
- [ ] 管理员可审核/取消发布计划
- [ ] 管理后台侧边栏显示新增菜单项
