# 架构修复方案（分阶段）

> 生成时间：2026-07-30 01:20
> 基于代码实际状态制定，每阶段独立可交付

---

## 修复总原则

1. **不破坏现有功能** — 每阶段完成后系统仍可运行
2. **渐进式重构** — 从最小改动开始，逐步逼近正确架构
3. **先修调用链路，再补执行层** — 路径对了再填内容
4. **每阶段都有验证点** — 不靠感觉，靠可运行的验证

---

## 阶段1：修正 Hermes 调用链路（N8N → MCP）

**目标：** 让 N8N 工作流通过 MCP 调用，而不是 Hermes 直接调

**改动文件：**
- `backend/src/modules/hermes/services/hermes.service.ts` — `runWorkflow()` 方法

**当前代码：**
```typescript
private async runWorkflow(task: HermesTask): Promise<unknown> {
  return this.n8nService.triggerWorkflow(
    task.userId, task.n8nInstanceId, task.workflowId, task.input,
  );
}
```

**改为：**
```typescript
private async runWorkflow(task: HermesTask): Promise<unknown> {
  // 通过 MCP 调用 N8N 工作流（统一能力总线）
  // 需要预先将 N8N 工作流注册为 MCP 工具
  return this.mcpService.callTool(task.userId, {
    serverId: `n8n-bridge-${task.n8nInstanceId}`,
    toolName: `workflow_${task.workflowId}`,
    args: task.input || {},
  });
}
```

**前置工作：**
- 新建 `backend/src/modules/mcp/services/n8n-mcp-bridge.service.ts`
- 将 N8N 实例的工作流自动注册为 MCP 工具（动态 MCP Server）
- 工具命名规范：`workflow_{workflowId}`，参数即工作流输入

**验证点：**
- Hermes `dispatchTask('workflow_run')` 走 MCP 通道
- N8N 工作流执行结果不变
- MCP 调用日志中有记录

**工作量：** ~1天

---

## 阶段2：修正 ChatService → Hermes 调用路径

**目标：** Hermes 分支不再退回前端执行，改为后端直接调 Hermes 任务编排接口

**改动文件：**
- `backend/src/modules/chat/services/chat.service.ts` — Hermes 分支
- `backend/src/modules/hermes/controllers/hermes.controller.ts` — 新增编排接口
- `backend/src/modules/hermes/services/hermes.service.ts` — 新增 `orchestrateTask()` 方法

**当前流程（错误）：**
```
ChatService → 返回 hermes_local_execute 指令 → 前端调 127.0.0.1:8642/v1/chat/completions
```

**改为：**
```
ChatService → 调 Hermes 后端 orchestrateTask() → Hermes 拆解任务 → 派发子任务 → 汇总结果
```

**具体改动：**

### 2.1 Hermes 后端新增编排接口

`hermes.controller.ts` 新增：
```typescript
@Post('instances/:id/orchestrate')
async orchestrate(
  @Req() req: AuthenticatedRequest,
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: OrchestrateTaskDto,
) {
  return this.hermesService.orchestrateTask(req.user.id, id, dto);
}
```

`hermes.service.ts` 新增：
```typescript
/**
 * 编排任务 — Hermes 作为决策中枢
 * 1. 接收用户消息
 * 2. 调用 Hermes Agent 进行任务拆解
 * 3. 根据拆解结果派发子任务（dispatchTask）
 * 4. 汇总结果返回
 */
async orchestrateTask(
  userId: number,
  instanceId: number,
  dto: OrchestrateTaskDto,
): Promise<{ taskId: string; result: unknown }> {
  // 1. 校验实例
  const instance = await this.getInstance(userId, instanceId);

  // 2. 调用 Hermes Agent API（本地 8642）做任务拆解
  const planResponse = await fetch(
    `${instance.endpoint || 'http://127.0.0.1:8642'}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.HERMES_API_SERVER_KEY || ''}`,
      },
      body: JSON.stringify({
        model: 'custom/deep-shentong',
        messages: [
          { role: 'system', content: dto.systemPrompt || '你是任务编排器...' },
          ...dto.history,
          { role: 'user', content: dto.message },
        ],
        // 使用 function calling 让 Hermes 输出结构化任务计划
        tools: TASK_PLANNING_TOOLS,
        tool_choice: 'auto',
      }),
    },
  );

  const plan = await planResponse.json();

  // 3. 解析任务计划，逐步 dispatchTask
  const subTasks = this.parseTaskPlan(plan);
  const results = [];
  for (const subTask of subTasks) {
    const result = await this.dispatchTask(subTask);
    results.push({ task: subTask, result });
  }

  // 4. 汇总结果（可选：再调 Hermes 生成总结）
  return { taskId: generateTaskId(), result: results };
}
```

### 2.2 ChatService Hermes 分支改为调后端

`chat.service.ts` Hermes 分支改为：
```typescript
if (agent && (agent.runtimeType === 'hermes' || agent.runtimeType === 'hybrid')) {
  // 不再退回积分、不再返回 hermes_local_execute
  // 改为调 Hermes 后端编排接口
  const hermesInstance = await this.hermesService.findInstanceByUserId(userId);
  const result = await this.hermesService.orchestrateTask(userId, hermesInstance.id, {
    message: content,
    systemPrompt: agent.systemPrompt,
    history: history.map(m => ({ role: m.role, content: m.content })),
  });
  // 流式返回结果
  callbacks.onMessage(JSON.stringify(result));
  callbacks.onDone({ input: 0, output: 0, total: 0 });
  return;
}
```

### 2.3 前端移除 hermes-local.ts 的直接调用

`chat-api.ts` 中 `handleHermesLocalExecute` 可保留作为 fallback，但主路径改为后端处理。后续可移除。

**验证点：**
- Hermes 分支不再返回 `hermes_local_execute` 指令
- 任务编排在后端完成
- 前端只收到正常的流式消息

**工作量：** ~2天

---

## 阶段3：修正 ChatService → OpenClaw 调用路径

**目标：** OpenClaw 不再被当作 LLM 推理引擎，改为任务网关

**改动文件：**
- `backend/src/modules/openclaw/services/openclaw.service.ts`
- `backend/src/modules/chat/services/chat.service.ts` — OpenClaw 分支

**当前代码（错误）：**
```typescript
// OpenClawService.invokeAgent() 直接调 /api/chat
const response = await fetch(`${instance.endpoint}/api/chat`, { ... });
```

**改为：**

### 3.1 OpenClawService 新增任务提交接口

```typescript
async submitTask(
  userId: number,
  openclawAgentId: string,
  message: string,
  history: Array<{ role: string; content: string }>,
): Promise<unknown> {
  // 不再直接调 /api/chat
  // 改为调 OpenClaw 的任务提交接口
  const response = await fetch(
    `${instance.endpoint}/api/tasks`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        agentId: openclawAgentId,
        message,
        history,
        // 让 OpenClaw 做鉴权、建档、路由
        // OpenClaw 内部决定是否调 Hermes
      }),
    },
  );
  // 处理流式或非流式响应
  return response;
}
```

### 3.2 ChatService OpenClaw 分支

```typescript
if (agent && agent.runtimeType === 'openclaw' && agent.openclawAgentId) {
  // 不再直接调 OpenClaw /api/chat
  // 改为提交任务，让 OpenClaw 做网关路由
  const result = await this.openclawService.submitTask(
    userId, agent.openclawAgentId, content,
    history.map(m => ({ role: m.role, content: m.content })),
  );
  // 处理结果...
}
```

**验证点：**
- OpenClaw 收到任务后能路由到 Hermes
- OpenClaw 负责鉴权和状态管控
- ChatService 不再做路由决策

**工作量：** ~2天（依赖 OpenClaw 侧接口配合）

---

## 阶段4：实现 AI 员工执行层

**目标：** AI员工从纯动画变为真正的业务执行子Agent

**新增文件：**
- `backend/src/modules/hermes/services/ai-employee.service.ts` — AI员工执行引擎
- `backend/src/modules/hermes/dto/ai-employee.dto.ts` — 子任务 DTO

**设计：**

```typescript
/**
 * AI员工子Agent执行服务
 * 每个岗位（商务/内容/交付/客服/财务）对应一个子Agent
 * 接收 Hermes 派发的子任务，调用 MCP 执行，返回结果
 */
@Injectable()
export class AiEmployeeService {
  private readonly employees: Map<string, EmployeeConfig> = new Map([
    ['business', { name: '商务AI', role: 'manager', skills: ['planning', 'coordination'] }],
    ['content',  { name: '内容AI', role: 'writer', skills: ['writing', 'summarization'] }],
    ['delivery', { name: '交付AI', role: 'retriever', skills: ['search', 'rag'] }],
    ['service',  { name: '客服AI', role: 'marketer', skills: ['tools', 'api'] }],
    ['finance',  { name: '财务AI', role: 'reviewer', skills: ['review', 'audit'] }],
  ]);

  /**
   * 执行子任务
   * 1. 根据员工角色加载 systemPrompt
   * 2. 调用 LLM（通过 Hermes Agent）处理任务
   * 3. 需要外部能力时通过 MCP 调用
   * 4. 返回执行结果
   */
  async executeSubTask(
    employeeId: string,
    task: SubTask,
    context: TaskContext,
  ): Promise<SubTaskResult> {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new NotFoundException(`员工不存在: ${employeeId}`);

    // 1. 构建员工 systemPrompt
    const systemPrompt = this.buildEmployeePrompt(employee, context);

    // 2. 调用 LLM 处理任务
    const llmResponse = await this.callLlm(systemPrompt, task.description, context.history);

    // 3. 如果 LLM 要求调用工具，通过 MCP 执行
    if (llmResponse.toolCalls) {
      for (const toolCall of llmResponse.toolCalls) {
        const result = await this.mcpService.callTool(context.userId, {
          serverId: toolCall.serverId,
          toolName: toolCall.name,
          args: toolCall.args,
        });
        // 将工具结果反馈给 LLM 继续处理
      }
    }

    // 4. 返回最终结果
    return { employeeId, task, result: llmResponse.content };
  }
}
```

**集成到 Hermes 编排流程：**

`hermes.service.ts` `orchestrateTask()` 中：
```typescript
// Hermes 拆解出子任务后，派发给对应AI员工
const subTasks = this.parseTaskPlan(plan);
const results = [];
for (const subTask of subTasks) {
  const employeeId = this.mapTaskToEmployee(subTask.type);
  const result = await this.aiEmployeeService.executeSubTask(employeeId, subTask, context);
  results.push(result);
  // 通过 WebSocket 推送员工状态（驱动前端动画）
  this.syncGateway.pushToUser(userId, 'office:employee-status', {
    employeeId, status: 'WORKING_DEEP', task: subTask.description,
  });
}
```

**前端 officeBridge 改动：**
- `officeBridge.ts` 的 8 个事件函数不变
- 但触发源从「Chat 回调」改为「WebSocket 事件」
- `Chat/index.tsx` 中的 officeBridge 调用移除，改为监听 WebSocket 事件

**验证点：**
- AI员工实际执行了业务逻辑（有 LLM 调用 + MCP 工具调用）
- 员工执行状态通过 WebSocket 推送到前端动画
- officeBridge 动画与实际业务执行同步

**工作量：** ~3-4天

---

## 阶段5：统一 MCP 能力总线

**目标：** 所有外部能力（N8N/RAG/第三方API）统一封装为 MCP 工具

**新增文件：**
- `backend/src/modules/mcp/services/rag-mcp-bridge.service.ts` — RAG 知识库 MCP 封装
- `backend/src/modules/mcp/services/n8n-mcp-bridge.service.ts` — N8N 工作流 MCP 封装（阶段1已建）

**改动：**
- RAG 检索从后端直接调用改为通过 MCP
- 第三方 API 调用封装为 MCP 工具
- `mcp.service.ts` 支持动态注册内置 MCP 工具（非 stdio/http，而是进程内调用）

**验证点：**
- 所有外部能力调用都经过 `McpService.callTool()`
- MCP 调用日志统一
- 可以在 MCP 层做限流/审计/缓存

**工作量：** ~2天

---

## 阶段6：OpenClaw 接管入口职责

**目标：** ChatService 降级为消息转发层，OpenClaw 成为真正入口

**改动：**
- ChatService 的会话管理、积分管控移至 OpenClaw 层
- ChatService 只负责消息接收和转发
- OpenClaw 负责鉴权、建档、路由到 Hermes、状态管控

**验证点：**
- OpenClaw 成为唯一入口
- ChatService 不再做路由决策
- 积分管控在 OpenClaw 层统一处理

**工作量：** ~3天（依赖 OpenClaw 侧改造）

---

## 阶段优先级与依赖关系

```
阶段1（N8N→MCP）  ──────────────┐
                                 ├──→ 阶段4（AI员工）──→ 阶段5（统一MCP）──→ 阶段6（OpenClaw入口）
阶段2（Hermes链路）──→ 阶段3（OpenClaw链路）─┘
```

- **阶段1和阶段2可并行**，互不依赖
- **阶段3依赖阶段2**（Hermes 链路修好后才能让 OpenClaw 路由到 Hermes）
- **阶段4依赖阶段2+3**（调用链路修好后才能实现AI员工）
- **阶段5依赖阶段1+4**（AI员工需要通过MCP调能力）
- **阶段6依赖阶段4+5**（所有组件就位后OpenClaw才能接管）

## 总工作量估算

| 阶段 | 内容 | 工作量 | 依赖 |
|------|------|--------|------|
| 1 | N8N→MCP | 1天 | 无 |
| 2 | Hermes链路修正 | 2天 | 无 |
| 3 | OpenClaw链路修正 | 2天 | 阶段2 |
| 4 | AI员工执行层 | 3-4天 | 阶段2+3 |
| 5 | 统一MCP总线 | 2天 | 阶段1+4 |
| 6 | OpenClaw接管入口 | 3天 | 阶段4+5 |
| **合计** | | **13-14天** | |

---

## 风险与注意事项

1. **OpenClaw 侧改造（阶段3+6）依赖 OpenClaw 本身的接口支持** — 需要确认 OpenClaw 是否提供任务提交/路由接口，还是只有 `/api/chat`
2. **Hermes Agent 的任务拆解能力（阶段2+4）依赖 Hermes 本身的 LLM 能力** — 当前 Hermes 只提供 `/v1/chat/completions`，需要通过 function calling 让它输出结构化任务计划
3. **阶段4的AI员工执行层是最复杂的部分** — 需要定义子任务接口、员工能力矩阵、工具调用权限等
4. **每个阶段完成后需要回归测试** — 确保聊天、Office动画、积分扣减等功能不受影响
5. **前端改动最小化** — 阶段1-3前端几乎不改，阶段4-5前端改 officeBridge 触发源即可
