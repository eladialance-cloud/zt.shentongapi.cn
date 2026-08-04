# v0.3.1 全链路数据流文档（Task 27）

> **已下线声明（2026-08-04）**：桌面端 `skill-api.ts` / `n8n-api.ts` / `notification-api.ts` / `task-api.ts` 为无页面引用的死代码，已删除。本文档第 2/4/5 节中涉及 `/skills*`、`/n8n/instances*`、`/notifications*`、`/tasks*` 的描述仅为历史设计参考，不再有对应代码。技能相关能力以 `hermes-api.ts`（/hermes/skills/*）与后端 `/skill-store/*` 为准。

> 本文档记录 v0.3.1 规范定义的 15 条全链路数据流，覆盖四大基座
> （OpenClaw / N8N / MCP / Hermes）、SKILL 系统、知识库与本地同步。
>
> 每条数据流包含：触发点、涉及组件、API 调用顺序、步骤间数据、
> 错误处理点、验证状态。

## 目录

1. [Chat 对话流](#1-chat-对话流)
2. [SKILL 调用流](#2-skill-调用流)
3. [OpenClaw 派发流](#3-openclaw-派发流)
4. [SKILL 嵌套流](#4-skill-嵌套流)
5. [Workflow 执行流](#5-workflow-执行流)
6. [Hermes 推理流](#6-hermes-推理流)
7. [MCP 工具调用流](#7-mcp-工具调用流)
8. [RAG 检索流](#8-rag-检索流)
9. [本地同步流](#9-本地同步流)
10. [支付流](#10-支付流)
11. [认证流](#11-认证流)
12. [设备绑定流](#12-设备绑定流)
13. [版本更新流](#13-版本更新流)
14. [远程控制流](#14-远程控制流)
15. [团队协作流](#15-团队协作流)

---

## 1. Chat 对话流

**链路**：用户 → OpenClaw → AI 员工 → MCP Gateway → SKILL/知识库 → 结果 → OpenClaw → 用户

| 项目 | 内容 |
|------|------|
| 触发点 | 用户在对话框输入消息并发送 |
| 涉及组件 | ChatUI、httpClient、OpenClaw 派发基座、AI 员工、MCP Gateway、SKILL/Hermes/N8N、知识库 |
| API 调用顺序 | 1. `POST /chat/sessions`（首次）<br>2. `POST /chat/sessions/:id/messages/stream`（SSE 流式）<br>3. 流中 `tool_call` 事件触发 `POST /mcp/call`<br>4. 若命中知识库：`POST /knowledge-bases/:id/search`<br>5. 若调用 SKILL：`POST /skills/:id/install` 或 Hermes execute |
| 步骤间数据 | 用户文本 → OpenClaw 意图解析结果 → AI 员工 ID + SKILL 路由 → 工具入参 → 流式 token 块 |
| 错误处理点 | SSE 401 自动刷新 token（`refreshAccessTokenIfNeeded`）；网络错误抛 `NetworkError`；业务码非 0 抛 `BusinessError` |
| 验证状态 | 已验证（chat-api.ts `streamMessage` 实现 SSE + 401 重试） |

## 2. SKILL 调用流

**链路**：AI 员工 → MCP Gateway → SKILL 路由（N8N/Hermes/MCP 原生）→ 执行 → 结果回传

| 项目 | 内容 |
|------|------|
| 触发点 | AI 员工在对话中决定调用某 SKILL |
| 涉及组件 | MCP Gateway、SKILL 路由器、N8N/Hermes/MCP 基座 |
| API 调用顺序 | 1. `GET /skills?type=&category=`（查询可用 SKILL）<br>2. 按 `SkillType` 路由：<br>　- flow → `POST /n8n/instances/:id/workflows/:wfId/trigger`<br>　- reasoning → `POST /hermes/instances/:id/execute`<br>　- tool → `POST /mcp/call`<br>3. 结果回传给 AI 员工 |
| 步骤间数据 | SKILL 元数据（type/config）→ 基座执行入参 → 执行结果（CallLog/executionId/tool output） |
| 错误处理点 | 基座执行失败由 MCP Gateway 捕获并回传错误；flow 触发失败可回退到 `/workflows/:id/execute` |
| 验证状态 | 已验证（skill-api.ts + n8n-api/hermes-api/mcp-api 路由逻辑） |

## 3. OpenClaw 派发流

**链路**：用户 → OpenClaw 意图解析 → SKILL 匹配 → 派发到垂直 AI 员工

| 项目 | 内容 |
|------|------|
| 触发点 | 用户消息进入 OpenClaw 派发基座 |
| 涉及组件 | OpenClaw（端口 51096）、意图解析模型、SKILL 匹配器、AI 员工池 |
| API 调用顺序 | 1. `GET /openclaw/health`（基座可用性检查）<br>2. `POST /openclaw/instances/:id/sync`（同步 AI 员工列表）<br>3. `GET /openclaw/instances/:id/status`（派发前状态确认）<br>4. 内部意图解析 + SKILL 匹配<br>5. 派发到匹配的 AI 员工 |
| 步骤间数据 | 用户文本 → 意图标签 + 置信度 → 匹配的 SKILL ID + AI 员工 ID → 派发任务 |
| 错误处理点 | OpenClaw 不可用时降级为直连 AI 员工；匹配无结果时返回兜底回复 |
| 验证状态 | 已验证（openclaw-api.ts 8 端点对齐） |

## 4. SKILL 嵌套流

**链路**：SKILL A → 调用 SKILL B → 调用 SKILL C → 结果层层回传

| 项目 | 内容 |
|------|------|
| 触发点 | SKILL A 执行过程中需要调用其他 SKILL |
| 涉及组件 | SKILL 路由器、N8N/Hermes/MCP 基座、调用栈管理 |
| API 调用顺序 | 1. `POST /skills/:idA/install` 执行 A<br>2. A 内部 `POST /mcp/call` 触发 B<br>3. B 内部 `POST /hermes/instances/:id/execute` 触发 C<br>4. C 结果回传 B → A |
| 步骤间数据 | 各层 SKILL 入参/出参；调用栈深度（防递归溢出） |
| 错误处理点 | 嵌套深度超限熔断；任一层失败向上冒泡；超时控制 |
| 验证状态 | 需后端支持（前端已具备调用链路，嵌套深度熔断需后端配合） |

## 5. Workflow 执行流

**链路**：用户触发 → N8N workflow → 节点链执行 → Webhook 回调

| 项目 | 内容 |
|------|------|
| 触发点 | 用户点击「执行工作流」或定时触发 |
| 涉及组件 | N8N 实例、工作流引擎、Webhook 回调端点 |
| API 调用顺序 | 1. `GET /n8n/instances`（选择实例）<br>2. `GET /n8n/instances/:id/workflows`（选择工作流）<br>3. `POST /n8n/instances/:id/workflows/:wfId/trigger`<br>4. `GET /n8n/instances/:id/executions/:executionId`（轮询状态）<br>5. `POST /n8n/webhook/:instanceId/:workflowId`（公共回调） |
| 步骤间数据 | inputData → executionId → 节点执行进度 → 最终输出 |
| 错误处理点 | 触发失败回退到 `/workflows/:id/execute`；执行失败记录 lastExecutionStatus |
| 验证状态 | 已验证（workflow-api.ts `executeWorkflow` 含 N8N 桥接 + 回退） |

## 6. Hermes 推理流

**链路**：AI 员工 → MCP Gateway → Hermes → 推理执行 → 积分扣减 → 结果返回

| 项目 | 内容 |
|------|------|
| 触发点 | SKILL 类型为 reasoning 的调用 |
| 涉及组件 | Hermes 实例、推理引擎、积分计费服务（HermesBillingService） |
| API 调用顺序 | 1. `GET /hermes/instances`（选择运行中实例）<br>2. `POST /hermes/instances/:id/execute`（执行推理）<br>3. 后端按分钟扣减积分<br>4. `GET /hermes/instances/:id/call-logs`（查询历史） |
| 步骤间数据 | ExecuteTaskDto → CallLog（含 durationMs、creditsCost） → 余额变更 |
| 错误处理点 | 积分不足拒绝执行；实例非 running 状态报错；超时记录 timeout |
| 验证状态 | 已验证（hermes-api.ts `executeTask` + `getCallLogs`） |

## 7. MCP 工具调用流

**链路**：AI 员工 → MCP Gateway → MCP Server → 工具执行 → 审计日志 → 结果返回

| 项目 | 内容 |
|------|------|
| 触发点 | SKILL 类型为 tool 的调用，或 AI 员工直接调用 MCP 工具 |
| 涉及组件 | MCP Gateway、MCP Server（stdio/http）、审计日志 |
| API 调用顺序 | 1. `GET /mcp/servers`（发现可用服务器）<br>2. `POST /mcp/servers/:id/probe`（探测连通性）<br>3. `GET /mcp/servers/:id/tools`（列举工具）<br>4. `POST /mcp/call`（调用工具） |
| 步骤间数据 | serverId + toolName + args → 工具执行结果 → 审计日志条目 |
| 错误处理点 | 探测失败标记 unreachable；工具执行异常回传 errorMessage |
| 验证状态 | 已验证（mcp-api.ts `probeServer` + `callTool`） |

## 8. RAG 检索流

**链路**：AI 员工 → MCP Gateway → 知识库检索 → RAG 增强 → 结果合并

| 项目 | 内容 |
|------|------|
| 触发点 | AI 员工判断需要知识库增强回答 |
| 涉及组件 | MCP Gateway、知识库服务、向量检索、RAG 合并器 |
| API 调用顺序 | 1. `GET /knowledge-bases?layer=`（按层级筛选知识库）<br>2. `POST /knowledge-bases/:id/search`（向量检索 topK 片段）<br>3. 合并片段到 prompt<br>4. 流式返回增强后的回答 |
| 步骤间数据 | query + topK → SearchResult[]（content/score/documentId）→ 增强 prompt |
| 错误处理点 | 检索为空时降级为无 RAG 回答；分块未就绪（chunkStatus）时跳过 |
| 验证状态 | 已验证（knowledge-api.ts `search` + 四层级 `listKnowledge`） |

## 9. 本地同步流

**链路**：本地 SQLite 变更 → pushPendingQueue → 后端 → 增量拉取

| 项目 | 内容 |
|------|------|
| 触发点 | 本地数据变更（离线操作）或网络恢复 |
| 涉及组件 | 本地 SQLite、pushPendingQueue、syncService、后端同步端点 |
| API 调用顺序 | 1. 离线时写入 SQLite + pushPendingQueue<br>2. 网络恢复后 `syncService.push()`<br>3. `POST /sync/push`（上行）<br>4. `GET /sync/pull?since=`（下行增量）<br>5. 合并到本地 |
| 步骤间数据 | 变更集（create/update/delete）→ 服务端最新版本号 → 增量数据 |
| 错误处理点 | 冲突解决（last-write-wins）；推送失败重试；离线队列持久化 |
| 验证状态 | 已验证（sync-service.ts + offline-queue.ts） |

## 10. 支付流

**链路**：用户选套餐 → 创建订单 → 支付回调 → 积分充值 → 通知用户

| 项目 | 内容 |
|------|------|
| 触发点 | 用户在积分中心选择充值套餐 |
| 涉及组件 | 积分服务、订单服务、支付网关、通知服务 |
| API 调用顺序 | 1. `GET /credits/recharge-plans`（套餐列表）<br>2. `POST /credits/recharge`（创建订单，返回支付链接）<br>3. 支付网关回调（后端）<br>4. `GET /credits/balance`（刷新余额）<br>5. `GET /credits/transactions`（查流水） |
| 步骤间数据 | planId + paymentMethod → 订单号 + 支付链接 → 充值积分 → 流水记录 |
| 错误处理点 | 支付超时查询订单状态；回调验签失败拒绝充值 |
| 验证状态 | 已验证（credits-api.ts 全端点） |

## 11. 认证流

**链路**：登录 → JWT access + refresh token → 401 自动刷新 → logout 清理

| 项目 | 内容 |
|------|------|
| 触发点 | 用户登录或 token 过期 |
| 涉及组件 | authStore、httpClient 拦截器、JWT 服务 |
| API 调用顺序 | 1. `POST /auth/login`（返回 access + refresh token）<br>2. 后续请求自动注入 Authorization<br>3. 401 时 `POST /auth/refresh`（并发去重）<br>4. 刷新失败 `POST /auth/logout` + 跳转登录 |
| 步骤间数据 | 账号密码 → access/refresh token → 新 access token |
| 错误处理点 | exp 预校验（< 60s 主动刷新）；并发请求挂入 failedQueue；刷新失败登出 |
| 验证状态 | 已验证（http-client.ts 拦截器 + `refreshAccessTokenIfNeeded`） |

## 12. 设备绑定流

**链路**：设备指纹 → 绑定校验 → 多设备管理

| 项目 | 内容 |
|------|------|
| 触发点 | 首次登录或新设备登录 |
| 涉及组件 | 设备指纹生成、绑定校验服务、多设备管理 |
| API 调用顺序 | 1. 登录时生成设备指纹<br>2. `POST /auth/login`（携带指纹）<br>3. `GET /devices`（已绑定设备列表）<br>4. `DELETE /devices/:id`（解绑设备） |
| 步骤间数据 | 指纹哈希 → 设备记录（名称/IP/最后登录）→ 绑定上限校验 |
| 错误处理点 | 超出绑定上限拒绝登录；异常设备触发风控 |
| 验证状态 | 需后端支持（前端登录已携带设备信息，设备管理端点待后端提供） |

## 13. 版本更新流

**链路**：检查更新 → 灰度命中 → 下载 → SHA256 校验 → 安装

| 项目 | 内容 |
|------|------|
| 触发点 | 用户点击「检查更新」或启动时自动检查 |
| 涉及组件 | 版本服务、灰度发布、下载器、Electron updater |
| API 调用顺序 | 1. `GET /version/check`（查询最新版本 + 灰度规则）<br>2. 灰度命中后 `GET /version/download`（下载包）<br>3. 本地 SHA256 校验<br>4. 触发 Electron autoUpdater 安装 |
| 步骤间数据 | 当前版本 + 平台 → 最新版本号 + 下载 URL + SHA256 → 安装包 |
| 错误处理点 | 灰度未命中不更新；SHA256 不符拒绝安装；下载中断续传 |
| 验证状态 | 已验证（Settings/About.tsx + admin-version-api） |

## 14. 远程控制流

**链路**：IM 指令 → 云端网关 → WebSocket 下发 → 桌面端执行 → 结果回传

| 项目 | 内容 |
|------|------|
| 触发点 | 管理员通过 IM 或管理端下发指令 |
| 涉及组件 | 云端网关、WebSocket（wsClient）、桌面端执行器 |
| API 调用顺序 | 1. 管理端下发指令到云端<br>2. `wsClient` 接收 `WsPushEvent`<br>3. 桌面端执行（启停服务/同步数据）<br>4. `POST /remote/report`（结果回传） |
| 步骤间数据 | 指令体（类型 + 参数）→ 执行结果 → 状态回执 |
| 错误处理点 | WebSocket 断线重连；指令执行超时；权限校验 |
| 验证状态 | 已验证（ws-client.ts 心跳 + 重连 + 事件派发） |

## 15. 团队协作流

**链路**：团队切换 → 共享资源加载 → 权限校验 → 协作操作

| 项目 | 内容 |
|------|------|
| 触发点 | 用户切换到某团队空间 |
| 涉及组件 | OPC 团队服务、资源共享层、权限服务 |
| API 调用顺序 | 1. `GET /opc/teams`（团队列表）<br>2. `GET /opc/teams/:id`（团队详情 + 工作流）<br>3. `GET /opc/teams/:id/members`（成员）<br>4. `GET /agents?ownerType=team`（共享 Agent）<br>5. `GET /mcp/servers?ownerType=team`（共享 MCP）<br>6. `PATCH /opc/tasks/:id`（协作更新任务） |
| 步骤间数据 | teamId → 成员角色（leader/member/observer）→ 资源权限矩阵 → 操作 |
| 错误处理点 | 非成员拒绝访问；observer 只读；leader 才能删除 |
| 验证状态 | 已验证（opc-api.ts + resource.ts `getAllowedActions` 权限矩阵） |

---

## 验证状态汇总

| # | 数据流 | 验证状态 |
|---|--------|----------|
| 1 | Chat 对话流 | 已验证 |
| 2 | SKILL 调用流 | 已验证 |
| 3 | OpenClaw 派发流 | 已验证 |
| 4 | SKILL 嵌套流 | 需后端支持（嵌套深度熔断） |
| 5 | Workflow 执行流 | 已验证 |
| 6 | Hermes 推理流 | 已验证 |
| 7 | MCP 工具调用流 | 已验证 |
| 8 | RAG 检索流 | 已验证 |
| 9 | 本地同步流 | 已验证 |
| 10 | 支付流 | 已验证 |
| 11 | 认证流 | 已验证 |
| 12 | 设备绑定流 | 需后端支持（设备管理端点） |
| 13 | 版本更新流 | 已验证 |
| 14 | 远程控制流 | 已验证 |
| 15 | 团队协作流 | 已验证 |

> 共 15 条数据流：13 条已验证，2 条需后端配合（SKILL 嵌套熔断、设备管理端点）。
