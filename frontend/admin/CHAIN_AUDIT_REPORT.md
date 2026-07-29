# 全链路审查报告：管理后台 → 后端 → 数据库 → 用户桌面端

**审查日期**: 2026-07-12  
**项目**: 深瞳AI 全栈系统

---

## 📊 总览

| 链路段 | 端点/文件数 | 通过 | 断链 | 状态 |
|--------|-----------|------|------|------|
| 管理后台前端 → 后端 | 142 端点 | 137 | **5** | ⚠️ 路径不匹配 |
| 用户桌面端 → 后端 | 64 端点 | 64 | 0 | ✅ |
| 后端 Entity → SQL 表 | 78 Entity | 59 | **19** | ❌ 缺建表SQL |
| 用户桌面端页面 → API | 13 引用 | 13 | 0 | ✅ |
| SQL 中无 Entity | 60 表 | 59 | **1** | ⚠️ n8n_webhook_logs |

---

## 🔴 问题一：管理后台 stats 路径不匹配（5个端点）

**严重程度**: 🔴 严重 — 管理后台统计数据页面完全不可用

**原因**: 前端调用 `/admin/stats/*`，但后端统计控制器路径是 `/statistics/*`

| 前端调用 | 后端实际路径 |
|---------|------------|
| GET /admin/stats/overview | GET /statistics/overview |
| GET /admin/stats/trends | GET /statistics/trends |
| GET /admin/stats/rankings | GET /statistics/rankings |
| GET /admin/stats/retention | GET /statistics/retention |
| GET /admin/stats/realtime | GET /statistics/realtime |

**修复方案**: 
- 方案A（推荐）: 后端 statistics.controller.ts 添加子路由 `/admin/stats` 或新增一个 AdminStatsController
- 方案B: 前端 admin-stats-api.ts 将路径改为 `/statistics/*`

---

## 🔴 问题二：19个 Entity 缺少建表 SQL

**严重程度**: 🔴 严重 — `synchronize: false` 模式下这些表不会被自动创建，运行时报错

后端配置 `synchronize: false, migrationsRun: true`，但 migration 是 SQL 格式而非 TypeORM TS 格式，且以下 19 个表没有任何 CREATE TABLE 语句：

| 表名 | 所属模块 | 影响 |
|------|---------|------|
| agent_categories | agent | Agent分类功能不可用 |
| ai_audit_config | admin-audit | AI审核配置不可用 |
| audit_queue | admin-audit | 审核队列不可用 |
| sensitive_words | admin-audit | 敏感词管理不可用 |
| invoices | admin-finance | 发票管理不可用 |
| announcements | admin-system | 公告管理不可用 |
| system_config | admin-system | 系统配置不可用 |
| tenants | admin-system | 租户管理不可用 |
| workflows | workflow | 工作流管理不可用 |
| api_key_pool | api-key-pool | Key池管理不可用 |
| credit_accounts | credits | 积分账户不可用 |
| credit_transactions | credits | 积分交易不可用 |
| credits_config | credits | 积分配置不可用 |
| user_plugins | plugin | 用户插件关联不可用 |
| reconciliation_diff | reconciliation | 对账差异不可用 |
| runtime_versions | runtime | 版本管理不可用 |
| daily_stats | statistics | 日统计不可用 |
| sync_records | sync | 同步记录不可用 |
| client_versions | version | 客户端版本不可用 |

**修复方案**: 创建一个 `008_create_missing_tables.sql` 补齐所有缺失的建表语句，与 Entity 定义一一对应。

---

## ⚠️ 问题三：SQL 有表但无 Entity（1个）

| 表名 | SQL 文件 | 说明 |
|------|---------|------|
| n8n_webhook_logs | 999_create_missing_tables.sql | 无对应 Entity，可能是废弃表或待实现 |

**建议**: 确认是否需要该表，如不需要则清理 SQL；如需要则创建 Entity。

---

## ✅ 用户桌面端链路验证

用户桌面端全部 64 个 API 调用均能在后端找到对应端点，路径完全匹配（含 API_PREFIX 前缀拼接）。页面引用的 13 个 API 模块全部存在。

---

## ✅ 管理后台其余链路

除 stats 5个端点外，其余 137 个管理后台 API 调用全部能在后端找到对应端点。

---

## 修复优先级

| 优先级 | 问题 | 工作量 | 影响 |
|--------|------|--------|------|
| **P0** | 19个缺失建表SQL | 中（2-3h） | 19个模块运行时崩溃 |
| **P0** | stats 路径不匹配 | 小（改前端或后端） | 统计页面不可用 |
| **P2** | n8n_webhook_logs 无Entity | 极小 | 可能废弃 |
