# 深瞳 AI 智能中台 — 数据库架构审查报告

**审查日期**: 2026-07-30  
**审查范围**: backend/database/init.sql, seed.sql, Entity 定义, TypeORM 配置, 迁移脚本  
**审查人**: 数据库架构审查 Agent

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [严重问题 (Critical)](#2-严重问题-critical)
3. [高危问题 (High)](#3-高危问题-high)
4. [中危问题 (Medium)](#4-中危问题-medium)
5. [低危问题 (Low)](#5-低危问题-low)
6. [详细对比分析](#6-详细对比分析)
7. [迁移系统分析](#7-迁移系统分析)
8. [建议修复方案](#8-建议修复方案)

---

## 1. 执行摘要

| 维度 | 评价 |
|------|------|
| 表结构完整性 | ⚠️ 中等 — init.sql 定义了 30 张表，但 Entity 中引用的多列在 init.sql 中不存在 |
| 种子数据有效性 | 🔴 严重 — 密码哈希为伪造值，无法通过 bcrypt 验证，登录必定失败 |
| Entity-SQL 一致性 | 🔴 严重 — 多个 Entity 字段在 SQL 中不存在（chat_sessions.pinned, plugins.pricing_mode 等） |
| 类型一致性 | ⚠️ 中等 — Entity 用 `enum` 类型，SQL 用 `VARCHAR` 存储，synchronize=false 时不匹配 |
| 数据库名一致性 | ✅ 通过 — 所有地方统一使用 `ai_agent` |
| 迁移系统 | 🔴 严重 — migrations 目录下全是 .sql 文件，TypeORM 配置只匹配 .ts/.js，迁移永远不会执行 |
| db-migration.ts | ⚠️ 高危 — 文件存在编码乱码，启动迁移脚本可能在生产环境导致 process.exit(1) |

**问题统计**: 3 Critical, 4 High, 5 Medium, 2 Low

---

## 2. 严重问题 (Critical)

### 🔴 C1: seed.sql 密码哈希为伪造值 — 登录必定失败

**文件**: `backend/database/seed.sql` 第 47-48 行

**现状**:
```sql
-- admin/admin123
'$2b$12$5.4NWtoO/vcIplDWk.yBKupS8vFWgZG6xCVcJITB5pMAuyxsWSJfW'
-- test/test123
'$2b$12$ltRbwpQ9a0lN5YdL.rafoODf.oRftbiBa3LIufLGqWGhUmoZvgngy'
```

**验证结果**: 使用 bcryptjs 对 `admin123` 和 `test123` 进行比对，**两个哈希均验证失败**。这些哈希是手工编造的字符串，不是真实的 bcrypt 输出。

seed.sql 的注释也承认：
> 密码哈希占位说明：以下 password 字段为 bcrypt 格式占位哈希 (cost=10)

但 cost 实际写的是 12（`$2b$12$`），与注释不一致。

**影响**: 
- Docker 首次启动时，MySQL 会执行 init.sql + seed.sql 创建表和数据
- 用户尝试用 admin/admin123 登录时，bcrypt.compare 返回 false → 登录失败 → 系统无法使用
- 这是阻塞性 bug，系统部署后无法登录管理后台

**修复方案**: 使用 Node.js 生成真实哈希：
```bash
node -e "const b=require('bcryptjs'); console.log(b.hashSync('admin123',12)); console.log(b.hashSync('test123',12))"
```

验证可用哈希（cost=12）：
```
admin123: $2b$12$8ST/oIbKLCAkNmG3xKZ.ReboxViuS9zBuH6h3FDgopxOkhY89nD.G
test123:  $2b$12$595voZ.woydJLTCVrgj0te11JG5WivWilh2QhMwLOhrU2YIdK0sNS
```

---

### 🔴 C2: TypeORM 迁移系统完全失效 — SQL 迁移文件不会被自动执行

**文件**: `backend/src/config/database.ts` 第 19-20 行

**现状**:
```typescript
migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
migrationsRun: true,
```

但 `backend/migrations/` 目录下所有 15 个迁移文件都是 **`.sql` 文件**，不是 `.ts` 或 `.js` 文件：
```
001_create_agent_department.sql
002_create_agent_tag.sql
003_alter_agents_add_fields.sql
004_create_mcp_global_tables.sql
005_create_sys_oss_config.sql
006_create_n8n_workflow_lib.sql
007_create_task_tables.sql
008_create_missing_tables.sql
009_create_pricing_config.sql
010_create_team_tables.sql
011_create_channel_tables.sql
hermes_stage1.sql
hermes_stage234.sql
upgrade-v0.5.0.sql
```

**影响**:
- `migrationsRun: true` 不会执行任何 `.sql` 文件
- TypeORM 只能执行实现了 `MigrationInterface` 的 `.ts/.js` 类文件
- 以下由迁移脚本创建的表和字段在全新部署中不会存在：
  - `agent_department`, `agent_tag`, `agent_tag_map` 表
  - `agents` 表的 `dept_id`, `agent_key`, `output_rule`, `model_config`, `use_codex`, `version`, `display_name`, `pricing_strategy` 列
  - `mcp_server_config`, `mcp_tool_registry`, `mcp_resource_registry`, `mcp_call_log` 表
  - `sys_oss_config` 表
  - `n8n_workflow_lib`, `n8n_workflow_exec_log`, `workflow_mcp_bind` 表
  - `agent_task`, `task_output_item` 表
  - `agent_categories`, `ai_audit_config`, `audit_queue`, `sensitive_words`, `invoices`, `announcements`, `system_config`, `tenants`, `workflows`, `api_key_pool`, `credit_accounts`, `credit_transactions`, `credits_config`, `user_plugins`, `reconciliation_diff`, `runtime_versions`, `daily_stats`, `sync_records`, `client_versions` 表（共 19 张缺失表）
  - `channels`, `channel_messages`, `publish_plans` 表
  - `teams`, `team_members`, `team_tasks` 表（010 重新定义版本）
  - `hermes_skills` 相关表和数据
  - `models` 表的 `api_endpoint`, `api_key`, `connection_status`, `last_tested_at` 列
  - `workflows` 表的大量补充列

**注意**: `db-migration.ts` 中的 `runStartupMigrations()` 确实手动执行了部分迁移（users.must_change_password, roles.code, user_devices, client_versions, runtime_versions, users.status enum 扩展），但**不覆盖**上述 15 个 SQL 迁移文件中的任何内容。

**修复方案**:
1. 将所有 `.sql` 迁移文件转换为 TypeORM 格式的 `.ts` 迁移类（实现 `MigrationInterface`，在 `up()` 中用 `query()` 执行原始 SQL）
2. 或者：在 `runStartupMigrations()` 中增加读取并执行 `migrations/*.sql` 文件的逻辑
3. 或者：在 docker-compose 的 MySQL 启动挂载中追加迁移 SQL 文件（但会重复执行，需 IF NOT EXISTS 保护）

---

### 🔴 C3: Entity 字段在 init.sql 中不存在 — 将导致 SQL 500 错误

当 `synchronize=false`（生产默认）时，TypeORM 不会自动创建列。如果 Entity 定义了 init.sql 中不存在的列，查询时会触发 MySQL 错误。

#### 受影响的 Entity 对比：

| Entity | 不存在于 init.sql 的字段 | 来源 |
|--------|------------------------|------|
| **ChatSessionEntity** | `pinned`, `status`, `last_message_at` | 代码追加，未同步到 init.sql |
| **PluginEntity** | `type`, `pricing_mode`, `price_per_call`, `price_per_token_input`, `price_per_token_output`, `sandbox_config`, `review_status`, `reject_reason` | 代码追加 |
| **MembershipPlanEntity** | `description`, `credits`, `duration_days`, `features` | Entity 和 init.sql 设计不同 |
| **AgentEntity** | `display_name`, `version`, `pricing_strategy`, `model_config`, `output_rule`, `use_codex`, `dept_id` | 来自 003/009 迁移，未同步到 init.sql |
| **ModelEntity** | `api_endpoint`, `api_key`, `connection_status`, `last_tested_at` | 来自 upgrade-v0.5.0.sql，未同步到 init.sql |

**影响**:
- 查询 `chat_sessions` 时 SELECT 包含 `pinned` 列 → MySQL 报错 `Unknown column 'pinned'` → API 返回 500
- 同理影响 plugins、membership_plans、agents、models 表的查询和写入
- 如果 `synchronize=true`（开发环境），TypeORM 会自动添加缺失列，但生产环境 `synchronize=false` 时不会

**修复方案**: 将所有迁移 SQL 的表结构变更合并回 init.sql，确保 init.sql 是完整的基线 schema。

---

## 3. 高危问题 (High)

### 🟠 H1: db-migration.ts 文件编码损坏 — 中文注释全部乱码

**文件**: `backend/src/common/utils/db-migration.ts`

**现状**: 整个文件的中文注释和字符串都是乱码，例如：
```typescript
// 鍚姩鏃惰嚜鍔ㄨ縼绉绘鏌?  ← 应为「启动时自动迁移检查」
// 纭繚 Entity 涓柊澧炵殑瀛楁鍦ㄦ暟鎹簱涓瓨鍦?  ← 应为「确保 Entity 中新增的字段在数据库中存在」
```

SQL 字符串中的 COMMENT 也是乱码：
```sql
COMMENT '鏄惁闇€瑕佷慨鏀瑰瘑鐮?  ← 应为「是否需要修改密码」
```

**原因**: 文件很可能以 GBK 编码保存，但被 UTF-8 读取，导致双字节字符损坏。

**影响**:
- 功能上不影响 JS 执行（SQL 语句本身是 ASCII）
- 但严重影响可维护性和代码审查
- SQL COMMENT 写入乱码到数据库中

---

### 🟠 H2: Entity 使用 ENUM 类型，init.sql 使用 VARCHAR — 类型不匹配

**涉及表和字段**:

| 表 | 字段 | Entity 类型 | SQL 类型 | 影响 |
|----|------|------------|---------|------|
| agents | status | `enum` | `VARCHAR(16)` | INSERT 时 TypeORM 生成 ENUM 语法，MySQL VARCHAR 列接受字符串值，实际上不会报错 |
| agents | creator_type | `enum` | `VARCHAR(16)` | 同上 |
| agents | category | `enum` | `VARCHAR(32)` | 同上 |
| agents | source_type | `enum` | `VARCHAR(16)` | 同上 |
| agents | runtime_type | `enum` | `VARCHAR(16)` | 同上 |
| agents | sync_status | `enum` | `VARCHAR(16)` | 同上 |
| agents | pricing_strategy | `enum` | 不存在（迁移添加 VARCHAR） | 先解决 C2/C3 |
| payment_records | channel | `enum` | `VARCHAR(16)` | 同上 |
| payment_records | status | `enum` | `VARCHAR(16)` | 同上 |
| knowledge_bases | visibility | `enum` | `VARCHAR(16)` | 同上 |
| knowledge_bases | status | `enum` | `VARCHAR(16)` | 同上 |
| plugins | review_status | `enum` | 不存在 | 先解决 C3 |
| files | storage_type | `enum` | `VARCHAR(16)` | 同上 |
| users | ban_duration | `enum` | `VARCHAR(16)` | 同上 |

**分析**: 
- TypeORM 在 `synchronize=false` 时不会尝试修改列类型，所以查询和插入不会直接报错
- 但当 `synchronize=true` 时，TypeORM 会尝试将 VARCHAR 列改为 ENUM 类型，可能导致数据丢失或 ALTER 失败
- 更深层的问题：MySQL ENUM 和 VARCHAR 的索引行为不同，查询优化器处理方式也不同
- INSERT 时如果传入 SQL ENUM 不支持的值（虽然 VARCHAR 允许），可能导致数据不一致

**建议**: 统一选择一种方案：
- 方案 A：SQL 使用 ENUM 类型，与 Entity 对齐
- 方案 B：Entity 使用 VARCHAR 类型（`type: 'varchar'`），与 SQL 对齐
- 推荐 A，因为 ENUM 在数据库层提供了约束

---

### 🟠 H3: users.status ENUM 值不一致 — Entity 有 'deleted'，init.sql 没有

**Entity** (`user.entity.ts`):
```typescript
@Column({
  type: 'enum',
  enum: ['active', 'banned', 'deleted'],
  default: 'active',
})
status: 'active' | 'banned' | 'deleted';
```

**init.sql**:
```sql
`status` ENUM('active', 'banned') NOT NULL DEFAULT 'active'
```

**db-migration.ts** 中有修复逻辑：
```typescript
// 检查并扩展 ENUM
if (usersStatusCol.COLUMN_TYPE === "enum('active','banned')") {
  ALTER TABLE users MODIFY COLUMN `status` ENUM('active', 'banned', 'deleted') ...
}
```

但这个修复依赖 `runStartupMigrations()` 被正确执行。如果迁移失败（见 C2），则 `deleted` 值无法写入。

**影响**: 软删除用户时 INSERT/UPDATE `status='deleted'` → MySQL 报错 `Data truncated for column 'status'`

---

### 🟠 H4: 010_create_team_tables.sql 与 init.sql 重复定义 teams 表 — 结构冲突

**init.sql** 中的 `teams` 表：
```sql
CREATE TABLE `teams` (
  `id`, `name`, `owner_id`, `description`, `created_at`, `updated_at`
  -- 外键 fk_teams_owner_id → users(id)
)
```

**010_create_team_tables.sql** 中的 `teams` 表：
```sql
CREATE TABLE IF NOT EXISTS teams (
  `id`, `name`, `avatar`, `description`, `member_count`, `creator_id`, `created_at`, `updated_at`
  -- 索引 idx_teams_creator_id，无外键约束
)
```

两处定义的列完全不同：
- init.sql 有 `owner_id`，无 `avatar`/`member_count`/`creator_id`
- 010 有 `creator_id`/`avatar`/`member_count`，无 `owner_id`

同理 `team_members` 表：
- init.sql 版本：`team_id`, `user_id`, `role`, `joined_at`
- 010 版本：`team_id`, `agent_id`, `agent_name`, `agent_avatar`, `role_title`, `role_description`, `role_emoji`, `theme_color`, `sort_order`, `is_active`, `added_by`, `joined_at`, `updated_at`

这两个 team_members 表的语义完全不同 — init.sql 是人员成员关系，010 是 Agent 成员关系。

**影响**: 如果 010 迁移执行了（`IF NOT EXISTS`），init.sql 的 `CREATE TABLE teams` 会失败（表已存在），导致 docker 启动时 init.sql 执行报错。反之，如果 init.sql 先执行，010 的 `IF NOT EXISTS` 会跳过，但 Entity 期望的是 010 版本的列。

---

## 4. 中危问题 (Medium)

### 🟡 M1: docker-compose init 脚本执行顺序问题

**现状**: docker-compose.yml 挂载了两个初始化脚本：
```yaml
volumes:
  - ./backend/database/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
  - ./backend/database/seed.sql:/docker-entrypoint-initdb.d/seed.sql:ro
```

MySQL 的 `docker-entrypoint-initdb.d` 按文件名字母顺序执行。`init.sql` 在 `seed.sql` 之前，顺序正确。

但 init.sql 中的 `DROP DATABASE IF EXISTS ai_agent; CREATE DATABASE ai_agent;` 会在每次容器首次启动时执行（只在数据卷为空时才执行 init scripts）。如果数据卷已存在数据，init.sql 和 seed.sql 不会被执行。这是 MySQL Docker 的标准行为，但需要在文档中明确说明。

---

### 🟡 M2: seed.sql 只重置了 5 张表的 AUTO_INCREMENT

**现状**:
```sql
ALTER TABLE `users` AUTO_INCREMENT = 1;
ALTER TABLE `roles` AUTO_INCREMENT = 1;
ALTER TABLE `models` AUTO_INCREMENT = 1;
ALTER TABLE `plugins` AUTO_INCREMENT = 1;
ALTER TABLE `membership_plans` AUTO_INCREMENT = 1;
```

但其他有数据的表（如 `agent_import_tasks` 等）没有重置。虽然 seed.sql 通过 `DELETE FROM` 清空了所有表，但 AUTO_INCREMENT 不会自动重置。

**影响**: 重新执行 seed 后，ID 不从 1 开始，可能导致 user_roles 中的固定 ID 关联失败（seed 假设 admin id=1, test id=2）。

---

### 🟡 M3: hermes_stage1.sql 重复 INSERT 风险

**现状**: `hermes_stage1.sql` 和 `hermes_stage234.sql` 都插入了相同名称的技能数据（PDF摘要生成、语音转文字等）。

- `hermes_stage1.sql` 插入 10 条
- `hermes_stage234.sql` 又插入 10 条相同名称的数据

如果 `hermes_skills` 表没有唯一约束在 `name` 列上，执行两次会产生重复数据。

---

### 🟡 M4: 009_create_pricing_config.sql 使用 MySQL 不支持的 `ADD COLUMN IF NOT EXISTS` 语法

**现状**:
```sql
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS level INT DEFAULT 0;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS period VARCHAR(32) DEFAULT '月';
```

MySQL 8.0 不支持 `ADD COLUMN IF NOT EXISTS` 语法（MariaDB 支持）。这会导致 SQL 执行错误。

**修复**: 使用条件性添加或先检查列是否存在。

---

### 🟡 M5: BaseEntity 的 bigint transformer 可能导致精度丢失

**现状**: `base.entity.ts` 中 `bigintTransformer` 将 bigint 转为 `Number`：
```typescript
from: (value: string | null): number | null => {
  return Number(value);
}
```

JavaScript `Number` 类型最大安全整数是 `2^53 - 1 = 9007199254740991`。MySQL `BIGINT UNSIGNED` 最大值是 `2^64 - 1`。对于 ID 自增列，在数据量极大时可能丢失精度。

**建议**: 对 ID 列考虑使用 `string` 类型，或在注释中记录此限制。

---

## 5. 低危问题 (Low)

### 🟢 L1: init.sql 中 users 表列定义顺序不规范

`must_change_password` 和 `llm_proxy_key` 列定义在 `updated_at` 之前，打破了"`created_at` 和 `updated_at` 在最后"的惯例。虽然功能无影响，但影响可读性。

---

### 🟢 L2: 多个 Entity 文件存在编码乱码

以下 Entity 文件的中文注释显示为乱码（疑似 GBK/UTF-8 编码问题）：
- `chat-session.entity.ts` — `title: '新会话'` 显示为乱码
- `chat-group.entity.ts`
- `membership-plan.entity.ts`
- `main.ts` — 大量中文注释为乱码

---

## 6. 详细对比分析

### 6.1 User Entity vs init.sql users 表

| Entity 字段 | SQL 列 | 类型匹配 | 备注 |
|------------|--------|---------|------|
| id | id | ✅ bigint | — |
| username | username | ✅ varchar(64) | — |
| email | email | ✅ varchar(128) | — |
| password | password | ✅ varchar(128) | — |
| phone | phone | ✅ varchar(20) | — |
| avatar | avatar | ✅ varchar(512) | — |
| status | status | ⚠️ enum vs enum | Entity 有 'deleted'，SQL 没有 |
| realNameVerified | real_name_verified | ✅ boolean | — |
| level | level | ✅ int | — |
| banReason | ban_reason | ✅ varchar(512) | — |
| banDuration | ban_duration | ⚠️ enum vs varchar | Entity 用 enum，SQL 用 varchar |
| banUntil | ban_until | ✅ datetime | — |
| registerSource | register_source | ⚠️ enum vs varchar | 同上 |
| inviterId | inviter_id | ✅ bigint | — |
| inviteCode | invite_code | ✅ varchar(32) | — |
| needsTenantSetup | needs_tenant_setup | ✅ boolean | — |
| mustChangePassword | must_change_password | ✅ boolean | — |
| llmProxyKey | llm_proxy_key | ✅ varchar(64) | — |
| createdAt | created_at | ✅ datetime | — |
| updatedAt | updated_at | ✅ datetime | — |

**结论**: User Entity 基本匹配，但 `status` 和 `ban_duration` 的 enum/varchar 类型不一致。

### 6.2 Agent Entity vs init.sql agents 表

| Entity 字段 | SQL 列 | 匹配 | 备注 |
|------------|--------|------|------|
| name | name | ✅ | — |
| displayName | display_name | ❌ 缺失 | 来自 003 迁移，未同步 |
| description | description | ✅ | — |
| avatar | avatar | ✅ | — |
| systemPrompt | system_prompt | ✅ | — |
| usageExample | usage_example | ✅ | — |
| modelId | model_id | ✅ | — |
| pricePerCall | price_per_call | ✅ | — |
| pricePerToken | price_per_token | ✅ | — |
| creatorId | creator_id | ✅ | — |
| creatorType | creator_type | ⚠️ | enum vs varchar |
| status | status | ⚠️ | enum vs varchar |
| category | category | ⚠️ | enum vs varchar |
| tags | tags | ✅ | — |
| ... | ... | ✅ | 其他字段匹配 |
| version | version | ❌ 缺失 | 来自 003 迁移 |
| pricingStrategy | pricing_strategy | ❌ 缺失 | 来自 009 迁移 |
| modelConfig | model_config | ❌ 缺失 | 来自 003 迁移 |
| outputRule | output_rule | ❌ 缺失 | 来自 003 迁移 |
| useCodex | use_codex | ❌ 缺失 | 来自 003 迁移 |
| deptId | dept_id | ❌ 缺失 | 来自 003 迁移 |

### 6.3 ChatSession Entity vs init.sql chat_sessions 表

| Entity 字段 | SQL 列 | 匹配 | 备注 |
|------------|--------|------|------|
| title | title | ✅ | — |
| modelId | model_id | ✅ | — |
| agentId | agent_id | ✅ | — |
| groupId | group_id | ✅ | — |
| attachedKnowledgeBaseIds | attached_knowledge_base_ids | ✅ | — |
| enabledPluginIds | enabled_plugin_ids | ✅ | — |
| enabledWorkflowIds | enabled_workflow_ids | ✅ | — |
| userId | user_id | ✅ | — |
| **pinned** | — | ❌ 缺失 | Entity 独有 |
| **status** | — | ❌ 缺失 | Entity 独有 |
| **lastMessageAt** | — | ❌ 缺失 | Entity 独有 |

### 6.4 Plugin Entity vs init.sql plugins 表

| Entity 字段 | SQL 列 | 匹配 | 备注 |
|------------|--------|------|------|
| name | name | ✅ | — |
| description | description | ✅ | — |
| **type** | — | ❌ 缺失 | Entity 独有 |
| version | version | ✅ | — |
| mcpServerUrl | mcp_server_url | ✅ | — |
| config | config | ✅ | — |
| isOfficial | is_official | ✅ | — |
| isActive | is_active | ✅ | — |
| **pricingMode** | — | ❌ 缺失 | Entity 独有 |
| **pricePerCall** | — | ❌ 缺失 | Entity 独有 |
| **pricePerTokenInput** | — | ❌ 缺失 | Entity 独有 |
| **pricePerTokenOutput** | — | ❌ 缺失 | Entity 独有 |
| **sandboxConfig** | — | ❌ 缺失 | Entity 独有 |
| **reviewStatus** | — | ❌ 缺失 | Entity 独有 |
| **rejectReason** | — | ❌ 缺失 | Entity 独有 |

### 6.5 MembershipPlan Entity vs init.sql membership_plans 表

| Entity 字段 | SQL 列 | 匹配 | 备注 |
|------------|--------|------|------|
| name | name | ✅ | — |
| **description** | — | ❌ 缺失 | Entity 独有 |
| price | price | ✅ | — |
| **credits** | — | ❌ 缺失 | Entity 独有 |
| **durationDays** | — | ❌ 缺失 | Entity 独有 |
| level | level | ✅ | — |
| period | period | ✅ | — |
| benefits | benefits | ✅ | — |
| **features** | — | ❌ 缺失 | Entity 独有 |
| isActive | is_active | ✅ | — |

---

## 7. 迁移系统分析

### 7.1 迁移文件清单

| 文件 | 内容 | 是否会被 TypeORM 执行 | 是否被 db-migration.ts 覆盖 |
|------|------|---------------------|---------------------------|
| 001_create_agent_department.sql | 创建 agent_department 表 | ❌ 否 | ❌ 否 |
| 002_create_agent_tag.sql | 创建 agent_tag + agent_tag_map 表 | ❌ 否 | ❌ 否 |
| 003_alter_agents_add_fields.sql | agents 表追加 7 列 | ❌ 否 | ❌ 否 |
| 004_create_mcp_global_tables.sql | 创建 4 张 MCP 表 | ❌ 否 | ❌ 否 |
| 005_create_sys_oss_config.sql | 创建 sys_oss_config 表 | ❌ 否 | ❌ 否 |
| 006_create_n8n_workflow_lib.sql | 创建 3 张 N8N 表 | ❌ 否 | ❌ 否 |
| 007_create_task_tables.sql | 创建 agent_task + task_output_item 表 | ❌ 否 | ❌ 否 |
| 008_create_missing_tables.sql | 创建 19 张缺失表 | ❌ 否 | ❌ 否 |
| 009_create_pricing_config.sql | 追加定价字段（语法错误） | ❌ 否 | ❌ 否 |
| 010_create_team_tables.sql | 重定义 teams 相关表（冲突） | ❌ 否 | ❌ 否 |
| 011_create_channel_tables.sql | 创建 3 张渠道表 | ❌ 否 | ❌ 否 |
| hermes_stage1.sql | hermes_skills 追加列 + 10 条数据 | ❌ 否 | ❌ 否 |
| hermes_stage234.sql | hermes_skills 追加 5 列 + 评分表 + 重复数据 | ❌ 否 | ❌ 否 |
| upgrade-v0.5.0.sql | models/agents/workflows 追加列 | ❌ 否 | ❌ 否 |

### 7.2 db-migration.ts 覆盖范围

`runStartupMigrations()` 只处理了：
1. `users.must_change_password` 列
2. `roles.code` 列
3. `user_devices` 表
4. `client_versions` 表
5. `runtime_versions` 表
6. `users.status` ENUM 扩展

**未覆盖**: 上述 15 个 SQL 迁移文件的全部内容。

### 7.3 执行流程图

```
Docker 启动 (首次, 空数据卷)
├── MySQL 容器启动
│   ├── 执行 init.sql → 创建 30 张表
│   └── 执行 seed.sql → 插入种子数据 (密码哈希无效!)
└── Backend 容器启动
    ├── NestJS 初始化
    ├── TypeORM 连接
    │   ├── migrationsRun: true
    │   ├── 匹配 migrations/*.ts|js → 无匹配!
    │   └── 零个迁移被执行
    ├── runStartupMigrations()
    │   ├── 添加 users.must_change_password ✅
    │   ├── 添加 roles.code ✅
    │   ├── 创建 user_devices ✅
    │   ├── 创建 client_versions ✅
    │   ├── 创建 runtime_versions ✅
    │   └── 扩展 users.status ENUM ✅
    └── 应用启动
        └── 查询 ChatSession → SELECT pinned → Unknown column 'pinned' → 500!
```

---

## 8. 建议修复方案

### 8.1 紧急修复 (P0)

1. **替换 seed.sql 中的密码哈希** — 用真实 bcrypt 哈希替换伪造值
2. **将所有迁移 SQL 合并到 init.sql** — 确保 init.sql 是完整基线 schema
3. **将 Entity 独有的字段添加到 init.sql** — pinned, status, last_message_at (chat_sessions); type, pricing_mode 等 (plugins); credits, duration_days, features (membership_plans)
4. **解决 teams 表重复定义** — 选择一个版本，删除另一个

### 8.2 短期修复 (P1)

5. **修复 db-migration.ts 编码** — 用 UTF-8 重新保存文件
6. **修复 009 迁移语法** — 移除 `IF NOT EXISTS`，改用条件检查
7. **统一 ENUM vs VARCHAR** — 选择一种类型策略并统一
8. **修复 hermes_stage234.sql 重复数据** — 使用 INSERT IGNORE 或 ON DUPLICATE KEY UPDATE

### 8.3 长期改进 (P2)

9. **建立迁移文件规范** — 将 .sql 迁移转为 .ts 迁移类，或修改 runStartupMigrations 自动执行 .sql 文件
10. **添加 CI 检查** — Entity 字段与 DB schema 的自动对比检查
11. **统一所有文件编码为 UTF-8** — 修复所有乱码文件
12. **添加数据库 schema 版本表** — 记录已执行的迁移，避免重复执行

---

## 附录: 文件索引

| 文件 | 路径 |
|------|------|
| 初始化 SQL | backend/database/init.sql |
| 种子数据 | backend/database/seed.sql |
| User Entity | backend/src/modules/user/entities/user.entity.ts |
| Agent Entity | backend/src/modules/agent/entities/agent.entity.ts |
| ChatSession Entity | backend/src/modules/chat/entities/chat-session.entity.ts |
| Plugin Entity | backend/src/modules/plugin/entities/plugin.entity.ts |
| MembershipPlan Entity | backend/src/modules/payment/entities/membership-plan.entity.ts |
| Model Entity | backend/src/modules/model/entities/model.entity.ts |
| Base Entity | backend/src/common/entities/base.entity.ts |
| TypeORM 配置 | backend/src/config/database.ts |
| 启动迁移 | backend/src/common/utils/db-migration.ts |
| 主入口 | backend/src/main.ts |
| Docker Compose | docker-compose.yml |
| 环境变量 | backend/.env |
| 迁移目录 | backend/migrations/ (15 个 .sql 文件) |

---

**报告结束** — 共发现 14 个问题，其中 3 个 Critical、4 个 High、5 个 Medium、2 个 Low。
