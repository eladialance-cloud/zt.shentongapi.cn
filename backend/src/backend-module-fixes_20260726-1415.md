# 深瞳AI后端模块修复报告

## 日期：2026-07-26 14:15 GMT+8

## 任务概述

对深瞳AI后端进行 4 项修复任务，涵盖模块注册、空壳 Service 实现、日志拦截器完善和数据库迁移失败处理改进。

## 任务 1: 注册 8 个遗漏模块到 AppModule

**文件**: `app.module.ts`

### 新增 import 语句（按字母顺序插入）
- `AdminMcpModule` — from `./modules/admin-mcp/admin-mcp.module`
- `AdminOssModule` — from `./modules/admin-oss/admin-oss.module`
- `AdminSkillStoreModule` — from `./modules/admin-skill-store/admin-skill-store.module`
- `CodexModule` — from `./modules/codex/codex.module`
- `LandingModule` — from `./modules/landing/landing.module`
- `RuntimeModule` — from `./modules/runtime/runtime.module`
- `SkillStoreModule` — from `./modules/skill-store/skill-store.module`
- `TaskModule` — from `./modules/task/task.module`

### imports 数组变更
- 非 admin 模块（CodexModule, LandingModule, RuntimeModule, SkillStoreModule, TaskModule）放在 CommunityModule 之后
- Admin 模块（AdminMcpModule, AdminOssModule, AdminSkillStoreModule）放在 AdminAuditModule 和 AdminSystemModule 之间

## 任务 2a: McpService — 实现 callTool 方法

**文件**: `modules/mcp/services/mcp.service.ts`

### 变更
- 注入 `McpServerEntity` 和 `McpToolRegistryEntity` 仓库
- 实现 `callTool(userId, params)` 方法：
  1. 查找用户 MCP Server 配置
  2. 查找 Tool 注册信息
  3. 通过 HTTP POST 调用 MCP Server 的 `/tools/call` 端点
  4. 30s 超时（AbortController）
  5. 调用成功后递增工具调用计数
  6. 完整错误处理（NotFound、禁用、超时、HTTP 错误）
- 保留 `health()` 方法

### McpModule 变更
- 新增 `TypeOrmModule.forFeature([McpServerEntity, McpToolRegistryEntity])` 导入
- McpToolRegistryEntity 从 admin-mcp 模块引用

## 任务 2b: N8nService — 实现 triggerWorkflow 方法

**文件**: `modules/n8n/services/n8n.service.ts`

### 变更
- 注入 `ConfigService`
- 从 `N8N_BASE_URL` 环境变量读取 baseUrl（默认 `http://localhost:5678`）
- 实现 `triggerWorkflow(userId, instanceId, workflowId, input)` 方法：
  1. 构造 webhook URL: `${baseUrl}/webhook/${workflowId}`
  2. POST 请求发送输入数据 + 用户上下文元数据
  3. 60s 超时（AbortController）
  4. 支持 JSON 和文本响应
  5. 完整错误处理
- 保留 `health()` 方法

## 任务 2c: RagService — 添加基本 RAG 能力

### 新建文件
- `modules/rag/entities/rag-document.entity.ts` — RAG 文档分块实体
  - 字段: userId, documentId, title, chunkIndex, content, chunkSize, metadata
  - 索引: idx_user_doc(userId, documentId)

### 变更

**`modules/rag/rag.module.ts`**:
- 新增 `TypeOrmModule.forFeature([RagDocumentEntity])` 导入

**`modules/rag/services/rag.service.ts`**:
- 注入 `RagDocumentEntity` 仓库
- 实现 `ingest(userId, documentId, content, metadata?)`:
  - 滑动窗口分块（chunkSize=1000, overlap=200）
  - 智能截断（句子边界）
  - 批量存储分块
  - 重新摄入时自动删除旧分块
- 实现 `search(userId, query, topK?)`:
  - 简化版关键词搜索（LIKE）
  - 返回匹配分块列表
  - 后续可替换为向量搜索
- 实现 `deleteDocument(userId, documentId)`:
  - 删除文档所有分块
  - 404 处理
- 保留 `health()` 方法

## 任务 3: LoggingInterceptor 完善失败请求日志

**文件**: `common/interceptors/logging.interceptor.ts`

### 变更
- 新增 `catchError` 操作符：记录失败请求（method, url, 耗时, 错误信息）
- 新增 `finalize` 操作符：兜底确保所有请求都有日志，慢请求（>5s）额外 warn
- 成功请求日志格式: `${method} ${url} - ${elapsed}ms - success`
- 失败请求日志格式: `${method} ${url} - ${elapsed}ms - failed - ${errorMsg}`
- 错误重新抛出，不改变原有错误处理流程

## 任务 4: 数据库迁移失败处理改进

**文件**: `main.ts`

### 变更
- 生产环境（`NODE_ENV === 'production'`）: `logger.error` + `process.exit(1)`
- 非生产环境: 保持 `logger.warn`（原有行为）

## 影响文件清单

| 文件 | 操作 |
|------|------|
| `app.module.ts` | 修改（新增 8 个模块导入和注册） |
| `modules/mcp/mcp.module.ts` | 修改（新增 TypeOrmModule.forFeature） |
| `modules/mcp/services/mcp.service.ts` | 重写（实现 callTool） |
| `modules/n8n/services/n8n.service.ts` | 重写（实现 triggerWorkflow） |
| `modules/rag/rag.module.ts` | 修改（新增 TypeOrmModule.forFeature） |
| `modules/rag/entities/rag-document.entity.ts` | 新建 |
| `modules/rag/services/rag.service.ts` | 重写（实现 ingest/search/deleteDocument） |
| `common/interceptors/logging.interceptor.ts` | 修改（新增 catchError + finalize） |
| `main.ts` | 修改（迁移失败处理改进） |
