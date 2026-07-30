# 架构差异分析：代码实现 vs 正确架构

> 生成时间：2026-07-30 01:30
> 对照来源：用户提供的「四大工具+AI办公室员工 核心功能总结」 vs 代码实现

---

## 一、总览：正确架构 vs 代码实现

### 正确架构（用户定义）

```
用户 → OpenClaw（唯一入口：鉴权、建档、路由、状态管控、结果反馈）
  → Hermes（决策中枢：任务拆解、调度AI员工、Skill复用、经验沉淀）
    → AI员工（执行单元：专业业务工作）
      → 需要外部能力时 → MCP（唯一能力出口：统一总线）
        → MCP 调用 N8N工作流 / 知识库 / 第三方API / 数据库
    → Hermes 汇总结果，沉淀经验
  → OpenClaw 统一返回结果给用户
```

### 代码实际实现

```
用户 → ChatService.streamMessage（后端聊天服务，直接处理）
  ├─ 如果 agent.runtimeType === 'openclaw' → 直接调 OpenClawService.invokeAgent()
  │    └─ OpenClawService 直接 fetch http://localhost:8080/api/chat（把OpenClaw当推理引擎）
  ├─ 如果 agent.runtimeType === 'hermes' → 退回预冻结积分，返回 hermes_local_execute 指令
  │    └─ 前端 hermes-local.ts 直接调 127.0.0.1:8642/v1/chat/completions（把Hermes当LLM）
  └─ 其他情况 → LlmClient.streamChat（后端直接调LLM API）
       └─ MCP 工具作为 LLM 的 function calling 执行

另一条路径：HermesService.executeTask（Office页面手动派发）
  ├─ agent_invoke → OpenClawService.invokeAgent()（同上，当推理引擎调）
  ├─ workflow_run → N8nService.triggerWorkflow()（直接调N8N，绕过MCP）
  ├─ tool_call    → McpService.callTool()（正确，但Hermes直接调，不是AI员工调）
  └─ skill_execute → SkillRunnerService.run()
```

---

## 二、逐组件差异分析

### 差异 1：OpenClaw 被当作「推理引擎」而非「任务网关」

| 维度 | 正确架构 | 代码实现 |
|------|---------|---------|
| 定位 | 全局任务网关，唯一入口/出口 | 被当作 LLM 推理引擎调用 |
| 职责 | 鉴权、建档、路由、状态管控、结果反馈 | 仅提供 `/api/chat` 接口被 fetch 调用 |
| 调用关系 | 用户→OpenClaw→Hermes | 用户→ChatService→(条件分支)→OpenClaw |

**代码证据：**

`chat.service.ts` 第 7-8 行：ChatService 直接处理用户消息，绕过了 OpenClaw 网关。

`openclaw.service.ts` `invokeAgent()` 方法：直接 `fetch http://localhost:8080/api/chat`，把 OpenClaw 当成一个 LLM API 用。

**问题：**
- OpenClaw 没有承担「唯一入口」的职责，ChatService 才是实际入口
- OpenClaw 没有做任务路由分发到 Hermes
- OpenClaw 被降级为一个被动的 HTTP API 端点

---

### 差异 2：Hermes 被当作「LLM 代理」而非「决策中枢」

| 维度 | 正确架构 | 代码实现 |
|------|---------|---------|
| 定位 | 智能推理大脑，决策中枢 | 被当作 OpenAI 兼容的 LLM 代理 |
| 职责 | 任务拆解、调度AI员工、Skill复用、经验沉淀 | 提供 `/v1/chat/completions` 接口 |
| 调用关系 | Hermes→AI员工→MCP | 前端直接调 Hermes 的 chat completions API |

**代码证据：**

`chat.service.ts`：当 `agent.runtimeType === 'hermes'` 时，后端退回积分，返回 `hermes_local_execute` 指令给前端。

`hermes-local.ts`：前端直接调 `127.0.0.1:8642/v1/chat/completions`，用 OpenAI 兼容格式，model 固定为 `custom/deep-shentong`。

**问题：**
- Hermes 没有做任务拆解、AI员工调度
- Hermes 没有调用 MCP 获取外部能力
- Hermes 没有做经验沉淀
- Hermes 被降级为一个流式 LLM API 代理

---

### 差异 3：N8N 被「直接调用」而非「通过 MCP 调用」

| 维度 | 正确架构 | 代码实现 |
|------|---------|---------|
| 定位 | 确定性流程执行器 | 同 |
| 调用关系 | Hermes/AI员工 → MCP → N8N | Hermes → 直接调 N8nService |

**代码证据：**

`hermes.service.ts` `dispatchTask()` 方法：
```typescript
case 'workflow_run':
  return this.n8nService.triggerWorkflow(...)  // 直接调 N8N，绕过 MCP
```

**问题：**
- 违反「所有外部能力统一走 MCP」原则
- N8N 工作流没有封装为 MCP 工具
- 如果 N8N 工作流需要鉴权/限流/审计，无法统一管控

---

### 差异 4：AI办公室员工是「动画角色」而非「业务执行单元」

| 维度 | 正确架构 | 代码实现 |
|------|---------|---------|
| 定位 | 角色化业务执行单元（子Agent） | 纯前端动画驱动器 |
| 职责 | 接收Hermes派发的子任务，执行专业工作 | 根据聊天事件播放动画 |
| 调用关系 | Hermes→AI员工→MCP | Chat回调→officeBridge→window接口→Canvas动画 |

**代码证据：**

`officeBridge.ts`：8个业务事件函数全部是**前端动画驱动**：
- `onChatMessageSent()` → 主管切 WORKING_DEEP 状态 + 气泡
- `onAgentRetrieve()` → 检索员移动到资料室 + 气泡
- `onToolCall(toolName)` → 市场员移动到技能墙 + 气泡
- `onReplyGenerated()` → 撰写员切 WORKING_DEEP + 气泡
- `onReview()` → 审核员拜访撰写员 + 气泡
- `onTaskComplete()` → 所有人回工位 IDLE
- `onCreditsDeducted(amount)` → 所有人看大屏 + 气泡
- `onSystemError(msg)` → 主管错误气泡

**问题：**
- AI员工没有实际执行任何业务逻辑
- AI员工没有接收 Hermes 的子任务派发
- AI员工没有调用 MCP 获取能力
- AI员工没有返回执行结果给 Hermes
- Office 页面是纯视觉反馈层，不是业务执行层

---

### 差异 5：MCP 被当作「工具箱」而非「统一能力总线」

| 维度 | 正确架构 | 代码实现 |
|------|---------|---------|
| 定位 | 全栈统一能力标准总线 | MCP Server 管理器 |
| 职责 | 封装所有外部能力（含N8N、知识库、API） | 仅管理 stdio/http MCP Server |
| 调用关系 | AI员工→MCP→N8N/知识库/API | LLM function calling→McpService |

**代码证据：**

`mcp.service.ts`：实现的是 MCP Server CRUD + JSON-RPC 通信，功能正确但范围窄。

`chat.service.ts`：MCP 工具被加载为 OpenAI function calling tools，由 LLM 决定调用时机。调用链：LLM→function_call→ChatService→McpService.callTool()。

**问题：**
- N8N 工作流没有封装为 MCP 工具（差异3已述）
- 知识库/RAG 没有通过 MCP 暴露（后端有独立的 rag 模块）
- MCP 没有成为「唯一能力出口」，只是众多直接调用中的一个

---

### 差异 6：ChatService 越权承担了 OpenClaw+Hermes 的职责

| 维度 | 正确架构 | 代码实现 |
|------|---------|---------|
| 入口 | OpenClaw | ChatService |
| 决策 | Hermes | ChatService（条件分支） |
| 执行 | AI员工 | ChatService→LLM/OpenClaw/Hermes |

**代码证据：**

`chat.service.ts` `streamMessage()` 方法做了本应由三个组件分别做的事：
1. **入口管控**（应属OpenClaw）：会话校验、用户消息保存、积分预扣
2. **路由决策**（应属Hermes）：根据 `agent.runtimeType` 判断走 OpenClaw/Hermes/LLM
3. **业务执行**（应属AI员工）：调用 LLM、加载 MCP 工具、执行 function calling
4. **结果反馈**（应属OpenClaw）：保存AI消息、结算积分、更新调用次数

---

## 三、差异汇总表

| # | 组件 | 正确角色 | 代码实际角色 | 严重程度 | 修复方向 |
|---|------|---------|-------------|---------|---------|
| 1 | OpenClaw | 唯一任务网关 | 被动LLM API端点 | 🔴 严重 | OpenClaw应接管入口职责 |
| 2 | Hermes | 决策中枢/调度大脑 | LLM流式代理 | 🔴 严重 | Hermes应做任务拆解+AI员工调度 |
| 3 | N8N | 通过MCP被调用 | 被Hermes直接调用 | 🟡 中等 | N8N工作流封装为MCP工具 |
| 4 | AI员工 | 业务执行子Agent | 纯前端动画 | 🔴 严重 | 需要实现真正的子Agent执行层 |
| 5 | MCP | 统一能力总线 | MCP Server管理器 | 🟡 中等 | N8N/RAG/外部API封装为MCP工具 |
| 6 | ChatService | 不应存在 | 越权承担3个组件职责 | 🔴 严重 | 拆分职责到OpenClaw/Hermes/AI员工 |

---

## 四、当前可用的正确部分

1. **MCP Server 管理和 JSON-RPC 通信** — `mcp.service.ts` 实现正确，只是范围窄
2. **N8N 工作流执行和Webhook回传** — `n8n.service.ts` 实现完整，只是调用路径不对
3. **积分冻结/结算/退款** — `credits.service.ts` 流程完整
4. **Office 动画联动** — `officeBridge.ts` 作为视觉反馈层是正确的，缺的是底层业务执行
5. **Hermes 技能包管理** — `skill-runner.service.ts` 存在，但未被正确集成
6. **WebSocket 推送** — `sync.gateway.ts` 状态推送机制可用

---

## 五、建议的修复路径（分阶段）

### 阶段1：修正调用链路（最小改动）
- ChatService 中的 OpenClaw 路由分支：改为调用 OpenClaw 的任务提交接口（而非 /api/chat）
- ChatService 中的 Hermes 路由分支：改为调用 Hermes 的任务编排接口（而非退回前端调 /v1/chat/completions）
- HermesService.dispatchTask 中 workflow_run 分支：改为通过 McpService 调用

### 阶段2：实现 AI 员工执行层
- 定义 AI员工子Agent 接口（接收Hermes子任务、调用MCP、返回结果）
- 实现5个岗位的子Agent（商务/内容/交付/客服/财务）
- officeBridge 的动画事件改为由 AI员工执行生命周期事件驱动

### 阶段3：统一 MCP 能力总线
- N8N 工作流封装为 MCP 工具
- RAG 知识库检索封装为 MCP 工具
- 第三方 API 封装为 MCP 工具
- 所有外部能力调用统一走 McpService

### 阶段4：OpenClaw 接管入口
- OpenClaw 实现任务接入、鉴权、建档、路由、状态管控
- ChatService 降级为 OpenClaw 的消息转发层
- 积分管控移至 OpenClaw 层
