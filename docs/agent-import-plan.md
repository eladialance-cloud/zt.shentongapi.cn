# GitHub Agent 批量导入方案

> 仓库：https://github.com/jnMetaCode/agency-agents-zh
> 统计：21 个分类目录，254 个 Agent Markdown 文件
> 目标：将这批 Agent 导入深瞳AI平台，在用户前端展示并供用户调用

---

## 一、源仓库分析

### 1.1 仓库结构

```
agency-agents-zh/
├── academic/              # 学术类 (6个)
├── design/                # 设计类 (9个)
├── engineering/           # 工程类 (41个)
├── finance/               # 金融类 (8个)
├── game-development/      # 游戏开发 (5个)
├── gis/                   # 地理信息 (13个)
├── hr/                    # 人力资源 (2个)
├── integrations/          # 集成工具 (含子目录，每子目录1个README)
├── legal/                 # 法务类 (2个)
├── marketing/             # 营销类 (42个)
├── paid-media/            # 付费媒体 (7个)
├── product/               # 产品类 (5个)
├── project-management/    # 项目管理 (7个)
├── sales/                 # 销售类 (9个)
├── security/              # 安全类 (10个)
├── spatial-computing/     # 空间计算 (6个)
├── specialized/           # 专业领域 (58个)
├── strategy/              # 战略类 (3个)
├── supply-chain/          # 供应链 (5个)
├── support/               # 客户支持 (7个)
├── testing/               # 测试类 (9个)
├── examples/              # 示例 (6个，可选导入)
└── assets/                # 静态资源（不导入）
```

### 1.2 Agent 文件格式

每个 `.md` 文件由两部分组成：

**Frontmatter（YAML 元数据头）**
```yaml
---
name: AI 工程师
description: 精通机器学习模型开发与部署的 AI 工程专家，擅长从数据处理到模型上线的全链路工程化...
emoji: 🤖
color: purple
---
```

**正文（System Prompt）**
```markdown
# AI 工程师

你是**AI 工程师**，一位在模型开发和工程化落地之间架桥的实战派...

## 你的身份与记忆
- 角色：机器学习工程师与 AI 系统架构师
- 个性：务实、数据驱动...

## 核心使命
### 模型开发与训练
...

## 关键规则
...

## 技术交付物
...
```

### 1.3 可提取字段

| Frontmatter 字段 | 用途 | 示例 |
|---|---|---|
| `name` | Agent 名称 | `AI 工程师` |
| `description` | 简介 | `精通机器学习模型开发与部署...` |
| `emoji` | 头像 Emoji | `🤖` |
| `color` | 主题色 | `purple` |
| **正文全文** | System Prompt | `你是**AI 工程师**...` |
| **所在目录名** | 源分类标签 | `engineering` |

---

## 二、数据库映射方案

### 2.1 目标表：`agents`

现有 `agents` 表已有完整字段设计，直接写入即可。

### 2.2 字段映射

| 数据库字段 | 来源 | 值示例 | 说明 |
|---|---|---|---|
| `name` | frontmatter.name | `AI 工程师` | |
| `description` | frontmatter.description | `精通机器学习...` | |
| `avatar` | frontmatter.emoji | `🤖` | 用 emoji 作为头像 |
| `system_prompt` | 正文全文（frontmatter 之后） | `你是**AI 工程师**...` | 核心字段 |
| `usage_example` | 正文中的"技术交付物"段落 | `（提取或不填）` | 可选 |
| `model_id` | 固定值 | `gpt-4o-mini` | 默认模型，后续可改 |
| `price_per_call` | 固定值 | `0` | 免费 |
| `creator_id` | 系统管理员 ID | `1` | admin 用户 |
| `creator_type` | 固定值 | `official` | 官方创建 |
| `status` | 固定值 | `published` | 直接上架 |
| `category` | 目录名映射 | `programming` | 见下方映射表 |
| `tags` | frontmatter 无此字段，用目录名 | `["engineering"]` | |
| `source_type` | 固定值 | `imported` | 标记来源 |
| `source_name` | 固定值 | `agency-agents-zh` | |
| `source_repo_url` | 固定值 | `https://github.com/jnMetaCode/agency-agents-zh` | |
| `source_file_path` | `目录/文件名` | `engineering/engineering-ai-engineer.md` | 去重依据 |
| `source_category` | 目录名 | `engineering` | 原始分类 |
| `source_version` | 固定值 | `1.0` | |
| `runtime_type` | 固定值 | `openclaw` | |
| `is_official` | 固定值 | `1` | 官方 Agent |
| `official_visible` | 固定值 | `1` | 前台可见 |
| `sync_status` | 固定值 | `pending` | 尚未同步到 OpenClaw |
| `user_id` | 系统管理员 ID | `1` | |

### 2.3 分类映射

数据库 `category` 字段是 5 值枚举，需要把 21 个源目录映射进去：

| GitHub 目录 | 数据库 category | 说明 |
|---|---|---|
| `engineering` | `programming` | 工程开发 |
| `testing` | `programming` | 测试 |
| `security` | `programming` | 安全 |
| `game-development` | `programming` | 游戏开发 |
| `marketing` | `copywriting` | 营销 |
| `sales` | `copywriting` | 销售 |
| `paid-media` | `copywriting` | 付费媒体 |
| `finance` | `data_analysis` | 金融 |
| `supply-chain` | `data_analysis` | 供应链 |
| `strategy` | `data_analysis` | 战略 |
| `design` | `office` | 设计 |
| `product` | `office` | 产品 |
| `project-management` | `office` | 项目管理 |
| `hr` | `office` | 人力资源 |
| `academic` | `other` | 学术 |
| `gis` | `other` | 地理信息 |
| `spatial-computing` | `other` | 空间计算 |
| `specialized` | `other` | 专业领域 |
| `support` | `other` | 客户支持 |
| `legal` | `other` | 法务 |
| `integrations` | `other` | 集成工具 |

> `examples/` 目录是示例文件，不导入。

### 2.4 去重策略

数据库已有唯一索引：`uniq_agents_source_repo_file (source_repo_url, source_file_path)`，同一文件不会重复导入。脚本中也先查 `source_file_path` 做软判断。

---

## 三、后端呈现方案

### 3.1 现有后端状态

| 模块 | 现状 |
|---|---|
| `AgentModule` (用户端) | 只有 `health()` 方法，**无列表/详情 API** |
| `AdminAgentModule` (管理端) | 完整 CRUD + 审核 + GitHub导入 + 分类管理 |
| `agents` 表 | 建表语句完整，字段齐全 |
| `ChatModule` | SSE 流式对话，`chat_sessions` 表有 `agent_id` 字段 |

### 3.2 需要补充的用户端 API

管理端已完整，用户端需要补 3 个接口：

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/agents` | GET | 已上架 Agent 列表（分页、分类筛选、关键词搜索、排序） |
| `/api/agents/categories` | GET | 分类列表（含每个分类的 Agent 数量） |
| `/api/agents/:id` | GET | Agent 详情（含 system_prompt） |

#### 接口1：Agent 列表

```
GET /api/agents?page=1&pageSize=20&category=programming&keyword=AI&sort=newest
```

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `page` | number | 1 | 页码 |
| `pageSize` | number | 20 | 每页条数（最大100） |
| `category` | string | - | 分类筛选：office/programming/copywriting/data_analysis/other |
| `keyword` | string | - | 搜索名称和描述 |
| `sort` | string | `newest` | 排序：newest（按上架时间）/ popular（按调用量）/ rating（按评分） |

**响应**

```json
{
  "list": [
    {
      "id": 1,
      "name": "AI 工程师",
      "description": "精通机器学习模型开发与部署...",
      "avatar": "🤖",
      "category": "programming",
      "tags": ["engineering"],
      "modelId": "gpt-4o-mini",
      "pricePerCall": 0,
      "rating": 4.5,
      "ratingCount": 12,
      "callCount": 348,
      "isOfficial": true,
      "sourceCategory": "engineering"
    }
  ],
  "total": 254,
  "page": 1,
  "pageSize": 20,
  "totalPages": 13
}
```

#### 接口2：分类列表

```
GET /api/agents/categories
```

**响应**

```json
[
  { "category": "programming", "displayName": "编程", "agentCount": 65 },
  { "category": "copywriting", "displayName": "文案", "agentCount": 58 },
  { "category": "data_analysis", "displayName": "数据分析", "agentCount": 16 },
  { "category": "office", "displayName": "办公", "agentCount": 23 },
  { "category": "other", "displayName": "其他", "agentCount": 92 }
]
```

#### 接口3：Agent 详情

```
GET /api/agents/:id
```

**响应**

```json
{
  "id": 1,
  "name": "AI 工程师",
  "description": "精通机器学习模型开发与部署...",
  "avatar": "🤖",
  "systemPrompt": "你是**AI 工程师**...",
  "usageExample": "...",
  "category": "programming",
  "tags": ["engineering"],
  "modelId": "gpt-4o-mini",
  "pricePerCall": 0,
  "rating": 4.5,
  "ratingCount": 12,
  "callCount": 348,
  "isOfficial": true,
  "sourceCategory": "engineering",
  "sourceName": "agency-agents-zh",
  "createdAt": "2026-07-06T...",
  "publishedAt": "2026-07-06T..."
}
```

### 3.3 管理端 API（已有，无需修改）

管理端 `AdminAgentController` 已有以下完整接口：
- `GET /api/admin/agents` - Agent 列表
- `POST /api/admin/agents` - 新增 Agent
- `PATCH /api/admin/agents/:id` - 编辑
- `DELETE /api/admin/agents/:id` - 删除
- `POST /api/admin/agents/:id/publish` - 上架
- `POST /api/admin/agents/:id/unpublish` - 下架
- `POST /api/admin/agents/import-github` - GitHub 导入（已有占位实现）
- `GET /api/admin/agents/import-github/:taskId` - 查询导入任务
- `GET /api/admin/agents/review` - 审核队列
- `POST /api/admin/agents/:id/approve` - 通过审核
- `POST /api/admin/agents/:id/reject` - 驳回
- `POST /api/admin/agents/:id/force-unpublish` - 强制下架
- `GET /api/admin/agents/categories` - 分类列表
- `PATCH /api/admin/agents/categories/:category` - 更新分类显示名

---

## 四、前端呈现方案

### 4.1 管理后台前端（已有）

管理后台 `frontend/admin` 已有完整的 Agent 管理页面：
- `pages/Agents/` - Agent 列表、创建、编辑、审核
- `api/admin-agent-api.ts` - API 封装
- `types/admin-agent.ts` - 类型定义

导入后管理员可在管理后台直接看到所有导入的 Agent，进行编辑、下架、删除等操作。

### 4.2 用户前台前端（需开发）

用户前台 `frontend/user` 目前只有 Landing/Login/Register 三个页面，**Agent 市场页面是空目录**，需要开发以下页面：

#### 页面1：Agent 市场（`/agents`）

```
路由：/agents
文件：src/pages/agent/AgentMarket/index.tsx
```

**功能**
- 顶部搜索栏（关键词搜索）
- 左侧分类筛选（5 大分类 + 数量标签）
- 右上角排序选择（最新/最热/评分最高）
- Agent 卡片网格展示（名称、头像 emoji、描述、分类标签、评分、调用量）
- 点击卡片跳转详情页
- 分页

**组件结构**
```
AgentMarket/
├── index.tsx          # 主页面
├── AgentCard.tsx      # 单个 Agent 卡片
├── CategoryFilter.tsx # 分类筛选侧栏
└── SearchBar.tsx      # 搜索栏
```

#### 页面2：Agent 详情（`/agents/:id`）

```
路由：/agents/:id
文件：src/pages/agent/AgentDetail/index.tsx
```

**功能**
- Agent 名称、头像、描述
- 分类标签、评分、调用量统计
- System Prompt 预览（折叠/展开）
- 使用示例展示
- **「开始对话」按钮** → 创建聊天会话，跳转到聊天页

#### 页面3：聊天对话（`/chat`）

```
路由：/chat
文件：src/pages/chat/index.tsx
```

**功能**
- 左侧会话列表
- 右侧聊天窗口
- 创建会话时选择 Agent
- SSE 流式接收回复（已有后端 `POST /api/chat/sessions/:id/messages/stream`）
- `chat_sessions.agent_id` 关联选中的 Agent

### 4.3 前端路由更新

```typescript
// router/index.tsx 新增路由
{ path: '/agents', element: withSuspense(<AgentMarket />) },
{ path: '/agents/:id', element: withSuspense(<AgentDetail />) },
{ path: '/chat', element: withSuspense(<Chat />) },
{ path: '/chat/:sessionId', element: withSuspense(<Chat />) },
```

### 4.4 前端 API 封装

```typescript
// api/agent.ts
export const agentApi = {
  list: (params) => request.get('/agents', { params }),
  categories: () => request.get('/agents/categories'),
  detail: (id) => request.get(`/agents/${id}`),
};

// api/chat.ts
export const chatApi = {
  createSession: (data) => request.post('/chat/sessions', data),
  streamMessage: (sessionId, data) => /* SSE 流式请求 */,
  listSessions: () => request.get('/chat/sessions'),
};
```

---

## 五、用户调用链路

### 5.1 完整流程

```
用户浏览 Agent 市场
    ↓
选择分类 / 搜索关键词
    ↓
点击 Agent 卡片 → 查看详情
    ↓
点击「开始对话」
    ↓
前端创建 ChatSession（携带 agent_id + model_id）
    ↓
跳转到 /chat/:sessionId
    ↓
用户输入消息
    ↓
POST /api/chat/sessions/:id/messages/stream (SSE)
    ↓
后端读取 Agent 的 system_prompt
    ↓
拼接 system_prompt + 用户消息 → 调用 LLM
    ↓
SSE 流式返回给前端
    ↓
扣减积分（price_per_call）
    ↓
更新 Agent 的 call_count
```

### 5.2 后端调用逻辑（ChatService 需补充）

当前 `ChatService` 是占位实现（mock 流式输出）。真实实现需要：

```typescript
// chat.service.ts 核心逻辑
async streamMessage(sessionId, content, userId, res) {
  // 1. 查询会话
  const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
  
  // 2. 查询关联的 Agent
  let systemPrompt = '';
  if (session.agentId) {
    const agent = await this.agentRepo.findOne({ 
      where: { id: session.agentId } 
    });
    systemPrompt = agent?.systemPrompt || '';
  }
  
  // 3. 查询用户积分余额
  const balance = await this.creditsService.getBalance(userId);
  if (balance < 1) throw new BusinessException('积分不足');
  
  // 4. 调用 LLM（通过 ModelService 或 OpenClaw 引擎）
  const stream = await this.llmService.chat({
    model: session.modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content }
    ],
    stream: true,
  });
  
  // 5. SSE 流式转发
  for await (const chunk of stream) {
    res.write(`event: message\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
  }
  
  // 6. 扣费
  await this.creditsService.deduct(userId, 5);
  
  // 7. 更新 Agent 调用次数
  await this.agentRepo.increment({ id: session.agentId }, 'callCount', 1);
  
  // 8. 完成
  res.write(`event: done\ndata: ${JSON.stringify({ usage })}\n\n`);
  res.end();
}
```

---

## 六、导入执行方案

### 6.1 导入方式

在服务器上执行一次性 Node.js 脚本，流程：

```
1. git clone 源仓库到 /tmp
2. 遍历 21 个目录的所有 .md 文件
3. 解析 frontmatter（name, description, emoji）+ 正文（system_prompt）
4. 按 source_file_path 去重
5. 批量 INSERT 到 agents 表（每批 50 条）
6. status = published（直接上架，无需审核）
```

### 6.2 导入后验证

```sql
-- 统计导入数量
SELECT source_category, category, COUNT(*) as cnt 
FROM agents WHERE source_type = 'imported' 
GROUP BY source_category, category;

-- 总数
SELECT COUNT(*) as total FROM agents WHERE source_type = 'imported';
```

### 6.3 后续维护

- **增量更新**：源仓库更新后，重新运行脚本，已存在的 `source_file_path` 会自动跳过
- **下架管理**：在管理后台 `/admin/agents` 对不需要的 Agent 执行下架
- **编辑**：管理员可在后台修改 system_prompt、分类、模型等

---

## 七、实施步骤总结

| 步骤 | 内容 | 依赖 |
|---|---|---|
| 1 | 在服务器执行导入脚本，写入 254 条 Agent 记录 | 数据库可用 |
| 2 | 后端补充用户端 `AgentController`（列表/详情/分类） | 步骤1完成 |
| 3 | 重建后端 Docker 容器 | 步骤2完成 |
| 4 | 开发用户前台 Agent 市场页面 | 步骤3完成、API可用 |
| 5 | 开发用户前台 Agent 详情页面 | 步骤4完成 |
| 6 | 完善 ChatService 真实 LLM 调用 | 步骤3完成、LLM API可用 |
| 7 | 开发用户前台聊天页面 | 步骤5、6完成 |
| 8 | 端到端测试：浏览Agent → 选Agent → 对话 | 全部完成 |

---

## 八、注意事项

1. **`source_repo_url` / `source_file_path` 字段长度**：数据库定义为 VARCHAR(512)，源仓库 URL 长度约 50 字符，文件路径最长约 60 字符，无超长风险。

2. **emoji 编码**：frontmatter 中的 emoji 是 UTF-8 编码，数据库 `avatar` 字段为 VARCHAR(512)，需确保数据库连接使用 `utf8mb4`。

3. **正文中的代码块**：部分 Agent 的 system_prompt 含有较长代码示例，`system_prompt` 字段为 TEXT 类型（最大 65535 字节），足够存储。

4. **`integrations/` 目录特殊处理**：该目录下是子目录结构（如 `integrations/openclaw/README.md`），每个子目录通常只有 1 个 README.md。可选择导入或不导入。如果导入，`source_file_path` 记录完整路径如 `integrations/openclaw/README.md`。

5. **`creator_id` 外键约束**：`agents` 表有 `fk_agents_creator_id` 外键指向 `users` 表，导入前确保 admin 用户（ID=1）存在。

6. **导入后 Agent 状态为 `published`**：直接上架，用户前端立即可见。如果希望先审核再上架，改为 `pending_review`。
