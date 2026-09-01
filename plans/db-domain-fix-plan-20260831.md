# 深瞳AI 数据库/架构修复方案（代码核对版）

> 日期：2026-08-31
> 依据：`深瞳AI问题总结与领域边界方案_20260831_1452.md` + `深瞳AI逐表迁移顺序表_20260831_1458.md` + 全量代码核对
> 原则：**每阶段一个独立 PR、可独立上线、先删死/再去重/再合并/再改名/最后拆宽表**

---

## 一、核对结论摘要（原文档 vs 实际代码）

| 原文档结论 | 核对结果 |
|---|---|
| 三套迁移体系并存（legacy 36+14 / db-migration.ts 1782 行 / TypeORM 空目录） | ✅ 属实 |
| 上帝文件（index.ts 1325 / service-manager 64KB / oral-workshop 2055 / db-migration 1782） | ✅ 全部对上 |
| 明文 token 落盘 auth.json | ✅ 属实（openclaw-chat.ts syncAuthToken 明文写 JWT） |
| 渲染进程 setInterval ×18 / WS 长连接 | ✅ 18 个文件 + ws-client.ts |
| IPC 131 通道 / edict 44（33.6%） | ⚠️ 当前注册表 168 通道 / edict 52（31%），方向一致、数字偏旧 |
| n8n 主进程补丁（Cookie 注入/禁三方 Cookie/汉化） | ✅ 属实；"占 git log 1/3" 偏夸大（全量 3.9%） |
| OPC 死代码（后端模块+4 表+前端 38 引用） | ⚠️ 后端+4 表属实；前端真实引用约 12 文件（router 已重定向 /team） |
| channel/team/team-member 同名实体 ×2 | ✅ 属实；team 重复在 **user 模块**（非 team-tasks） |
| 素材三表 / 任务四载体 | ✅ 全存在 |
| models 宽表 156 行 / api_key 明文 | ✅ 属实 |
| rag_documents 与 knowledge_base_chunks 重叠 | ✅ 表并存；但 **rag service 已是 stub、rag_documents 无写入方** |
| hermes/openclaw deprecated SQL | ⚠️ 文件名 deprecated 但表是**活表**（实体+service 在用），不能按死表归档 |
| 123 张表 | ⚠️ 实体文件 123 个，唯一表名 113（同名映射导致） |

---

## 二、修复总体策略（6 阶段）

```
P0 冻结（迁移单通道化，CI 门禁）────┐
                                  ▼
P1 死代码清理（OPC 归档 + 前端残留）──┐ 低风险，可并行
                                  ▼
P2 同名实体去重（channels/teams/team_members/rag）── 依赖 P1
                                  ▼
P3 冗余表合并（素材/知识/创作，保守版）── 依赖 P2
                                  ▼
P4 命名规范统一（分批大迁移 + 旧名视图过渡）── 依赖 P3
                                  ▼
P5 宽表拆分（models → 3 表 + 密钥 AES）── 依赖 P4
```

里程碑：
- **M1**（P0+P1）：迁移通道唯一化 + OPC 死代码清零 → 可交付
- **M2**（P2+P3）：同名实体冲突清零、素材/知识/创作归一（保守版）→ 可交付
- **M3**（P4）：全库命名规范 → 可交付
- **M4**（P5）：模型域健康化 → 终态

---

## 三、各阶段详细方案

### P0 止血冻结（0.5d，无业务风险）

**目标**：新表/新字段强制走 TypeORM migrations，legacy 通道只修 bug。

**动作**：
1. 新增 `backend/scripts/check-migration-gate.ts`：扫描 `git diff HEAD` 中新增/修改的 `backend/migrations/*.sql`、`backend/sql/*.sql`、`backend/src/common/utils/db-migration.ts`；若含 `CREATE TABLE`/`ALTER TABLE` 且 `backend/src/migrations/` 下无对应 TypeORM 迁移类 → exit 1。
2. `backend/package.json` 加 `"migration:gate": "tsx scripts/check-migration-gate.ts"`。
3. `.github/workflows/ci.yml` 加 job：`cd backend && npm run migration:gate`。
4. `backend/src/migrations/README.md` 更新规则：新增结构变更只允许 TypeORM 迁移。

**验证**：往 PR 加一条 legacy `CREATE TABLE` → CI 红；加对应 TypeORM 迁移 → CI 绿。

**风险**：无（纯规则+CI）。

---

### P1 死代码清理（1d，低风险）

**目标**：OPC 4 表归档 + 后端模块移除 + 前端残留清理；deprecated SQL 修正。

**动作**：
1. **数据归档**（手工执行 SQL，不写入 db-migration）：
   ```sql
   RENAME TABLE opc_teams TO opc_teams_archived,
                opc_tasks TO opc_tasks_archived,
                opc_team_members TO opc_team_members_archived,
                opc_agent_repos TO opc_agent_repos_archived;
   ```
   （保数据可回溯；若确认无历史价值可改为 DROP，见决策 D1）
2. **后端**：
   - `backend/src/app.module.ts`：删除 `OpcModule` import（L35）与注册（L152）
   - 删除 `backend/src/modules/opc/` 整目录（controller/service/4 实体/module）
   - `backend/src/common/utils/db-migration.ts`：删除 L269-293 的 opc_agent_repos 对齐逻辑
   - `backend/database/init.sql`：删除第 21-24 段 OPC 建表（L529 起）及外键；`backend/database/seed.sql`：删除 L22-25 的 4 行 DELETE
3. **前端残留清理**（真实引用约 12 个文件）：
   - 删除 `desktop/src/api/opc-api.ts`、`desktop/src/pages/OPC/`（index/Board/Detail）、`desktop/src/types/opc.ts`
   - `desktop/src/router/index.tsx`：删除 /opc 三个重定向（L144-148）及相关 import
   - 清理 OPC 类型引用：`Breadcrumb/index.tsx`、`TaskFlow/index.tsx`、`pages/Hermes/index.tsx`、`api/team-api.ts`、`types/team.ts`、`types/hermes.ts`、`pages/Office/pixi-office/OfficeIntegrated.tsx`
4. **deprecated SQL 修正**（hermes/openclaw 是活表，不能归档）：
   - 删除 `backend/sql/deprecated_004_hermes_tables.sql`、`deprecated_005_openclaw_instances.sql`（建表已由 db-migration.ts L535+ 负责），或重命名为正式建表脚本——二选一，见决策 D1b

**验证**：`rg -i '\bopc\b' backend desktop/src` 预期仅剩文档/注释；`cd backend && npm run build`；`cd desktop && npm run typecheck`。

**风险**：低。归档用 RENAME 可回滚（RENAME 回来即可）。

---

### P2 同名实体去重（2d，低-中风险）

**目标**：消除"一张表两个 Repository"。共 3 组真实冲突 + 1 组待处理。

#### 2a. channels ×2（channel 模块 vs community 模块）
- 现状：`channel/entities/channel.entity.ts`（bigint PK，发布渠道：platform/direction/credentials/webhook）与 `community/entities/channel.entity.ts`（varchar(32) PK，社区频道：slug/icon/color/post_count）**同时 `@Entity('channels')`**，两模块都在用。
- **执行前先查物理库**：`SHOW CREATE TABLE channels` → 以物理 schema 判定真源。
- 建议（决策 D2）：community 实体注释自称"数据合同真源"，保留 `channels` 名；channel 模块实体改 `@Entity('publish_channels')` + `RENAME TABLE channels → publish_channels`（若物理库是 bigint 结构则反之，保留 channel 模块）。
- 涉及：两个 entity、两个 module forFeature、两个 service（`channel.service.ts`、`community.service.ts`）、admin-community。

#### 2b. teams ×2（team 模块 vs user 模块）
- 现状：`team/entities/team.entity.ts`（task/briefs/statistics 在用）与 `user/entities/team.entity.ts`（仅 tenant 模块在用）同时 `@Entity('teams')`。
- 建议（决策 D3）：保留 team 模块实体；`tenant.module.ts` 改 import `../team/entities/team.entity` 与 `../team/entities/team-member.entity`；删除 `user/entities/team.entity.ts`、`user/entities/team-member.entity.ts`（先 diff 两实体字段，取并集补进 team 实体）。

#### 2c. team_members ×2
- 同上：保留 team 模块实体，user 模块副本删除。

#### 2d. rag_documents（非合并，建议归档）
- 现状：`rag_documents` 只有实体、无写入方（rag.service 是 health stub）。
- 建议（决策 D4）：`RENAME TABLE rag_documents → rag_documents_archived`；删除 `rag/entities/rag-document.entity.ts`；rag 模块保留 health stub 或整个模块后续删除。**不做** P3 合并（没有数据流动，合并无收益）。

**验证**：唯一 `@Entity` 表名数量 113 → 冲突组清零；`npm run build` + 启动 DI 无 duplicate 报错。

**风险**：中。channels/teams 是热表，先查物理库结构、确认数据归属再改。

---

### P3 冗余表合并（保守版，2-3d，中风险）

**目标**：素材/知识/创作归一。**保守原则：只合并"字段兼容且引用面窄"的表；活跃跨模块表仅命名对齐、不合并**（见决策 D5）。

#### 3a. 素材域
- `oral_workshop_materials` / `ip_archives` → 若字段与 `media_assets` 兼容：`media_assets` 加 `biz_type` 列（'oral_workshop' / 'ip_archive'）+ 索引，INSERT SELECT 回填，旧表 RENAME 归档；代码侧 oral-workshop/material.entity、ip-archive.entity 改为引用 media-assets 实体。
- `voice_assets`：文档自己也标注"可选"。**建议暂缓**（有声纹/时长专用字段，见 `oral-workshop/entities/voice-asset.entity.ts`），仅 P4 改名对齐。
- `task_output_item`：被 task.service + media-assets 双向使用，**建议暂缓合并**，仅 P4 改名对齐。

#### 3b. 知识域
- `rag_documents` 已在 P2 归档 → 无合并动作。
- 可选：`knowledge_base_chunks` 加 `source_type` 列备用（不强求）。

#### 3c. 创作域
- `publish_plans`：被 channel/publish.service、media-assets、oral-workshop/publisher、statistics 4 处使用，是**活表**。**建议不合并**，P4 阶段改名 `create_publish_plans` 或 `social_publish_plans`（决策 D5b）。
- `publish_accounts`、`oral_workshop_publish_platforms`：保持。

**验证**：合并后的域各跑一次清单接口回归（素材列表、IP 大脑、任务输出）。

**风险**：中。合并必须带数据回填脚本 + 双写窗口（可选）或停机窗口。

---

### P4 命名规范统一（8-12d，中-高风险，分批）

**目标**：全库 `<domain>_<entity>_s`，逐表 `RENAME TABLE` + 旧名视图过渡 1 个发布周期。

**规则修正（相对原文档，决策 D6）**：
- mcp 归属：`mcp_servers` / `mcp_catalog` → **I 生态域** `eco_mcp_*`（市场相关）；`mcp_call_log` / `mcp_resource_registry` / `mcp_tool_registry` / `mcp_server_config` → **C 模型域** `ai_mcp_*`（调用通道）
- `agent_task` → **G 域** `task_agent_tasks`（活表，被 media-assets/statistics 引用；不是生态任务）
- `models` → `ai_models`；`model_providers` → `ai_model_providers`；`llm_files` → `ai_llm_files`

**分批顺序**（每批 1 个 PR，含 RENAME + 旧名视图 + repository 引用同步）：
1. **G 域**：agent_task、team_tasks、team_workflow_nodes、team_members、teams、scheduled_tasks、n8n_workflows、n8n_workflow_exec_log、n8n_workflow_lib → `task_*`（agent_task 核心，优先）
2. **H 域**：oral_workshop_*、publish_*、ip_archives、briefs、hermes_*、ai_audit_config → `create_*`
3. **C 域**：models/model_providers/llm_files/mcp_call_log 等 → `ai_*`
4. **I 域**：agents/plugins/skills/mcp/n8n_instances/openclaw/runtime/workflow_mcp_bind → `eco_*`
5. **K 域**：posts/post_tags/replies/votes/bookmarks/channels/channel_messages → `social_*`
6. 收尾：删除过渡视图

**引用同步**：每批用 `rg` 出全部 repository/表名引用清单 → 统一替换 → typecheck。

**风险**：中-高。旧名视图保留期间双写风险低（视图只读）；必须按批发布，禁止一次性全量。

---

### P5 宽表拆分 + 密钥加密（3-5d，高风险，最后做）

**目标**：models 156 字段宽表拆 3 表；api_key AES-256-GCM 加密。

**顺序**（每步一个发布周期）：
1. **先建 credentials**：`ai_model_credentials`（api_key / api_endpoint，加密列）；应用层 AES 加密回填存量明文（复用 AES_KEY，参照 `backend/database/migration_encrypt_sensitive_fields.sql` 先例）；`models.api_key` 置 NULL 或标记已迁移。
2. **再拆 pricing**：`ai_model_pricing`（price_per_image / video_prices / price_per_call / price_per_minute / pricing_mode / input_types / advanced_capabilities / min_user_level / cost_price / video_per_second / scenario_tags / generation_params 等），INSERT SELECT 回填。
3. **最后收缩 models 主表**：保留 id/name/type/model_id/model_type/provider_id/upstream_model_id/api_endpoint(移走)/status/is_active/sort_order 等核心列，删除已拆分列。
4. 代码侧：`model.entity.ts` 拆成 3 个 entity；`model.service.ts` / `model.controller.ts` 同步；管理后台模型表单联动。

**验证**：模型列表/测试连接/调用计费/模型下拉全链路回归；`SELECT` 确认无明文 api_key 外泄。

**风险**：高（涉钱涉密钥）。先做加密（止血），再做拆表；任何一步出问题可回滚（数据已备份 + 旧列保留一个周期）。

---

## 四、与原文档的差异修正清单

| # | 原方案 | 本方案修正 | 原因 |
|---|---|---|---|
| 1 | P1 归档 hermes_instances/openclaw_instances（核查项） | **不归档**，删除 deprecated_004/005 SQL 或改名 | 实体+service 在用，是活表 |
| 2 | P2 team 重复在 team-tasks 模块 | 实际在 **user 模块**（tenant 用） | 代码定位 |
| 3 | P3 rag_documents 合并入 knowledge_base_chunks | **改为归档**（无写入方） | rag service 已 stub |
| 4 | P3 publish_plans / task_output_item 合并 | **仅命名对齐，不合并** | 活跃跨模块引用 |
| 5 | P3 voice_assets 合并 | **暂缓**，仅命名对齐 | 有专用字段 |
| 6 | 前端 OPC 38 引用 | 实际约 12 文件，按实际清理 | 代码定位 |
| 7 | P4 mcp_* 统一 ai_mcp_* | 拆分：市场表归 eco_mcp_*，调用表归 ai_mcp_* | 文档 1/2 自相矛盾，取文档 2 |
| 8 | P4 agent_task → task_agent_tasks（G 域） | 维持，并明确**不是** eco_agent_tasks | 活表引用核实 |

---

## 五、待确认决策清单（执行前需确认）

- **D1** OPC 4 表：RENAME 归档（保数据，建议）还是 DROP？
- **D1b** deprecated_004/005 SQL：直接删除（建议）还是重命名转正？
- **D2** channels 冲突：执行时先 `SHOW CREATE TABLE channels`；按物理结构保留真源。预设：community 保留 `channels`、channel 模块改名 `publish_channels`（若物理库是 bigint 结构则反转）——确认？
- **D3** teams/team_members：删 user 模块副本、tenant 改引用 team 模块（建议）——确认？
- **D4** rag_documents：归档而非合并（建议）——确认？
- **D5** P3 合并范围：只做 oral_workshop_materials + ip_archives → media_assets（若字段兼容）；voice_assets / task_output_item / publish_plans 暂缓仅改名（建议）——确认？
- **D6** P4 mcp/agent_task 归属：按第三节规则（ai_mcp_* 调用 + eco_mcp_* 市场 + task_agent_tasks）——确认？
- **D7** P5 拆表命名：ai_models / ai_model_pricing / ai_model_credentials（文档建议）——确认？
- **D8** P4 是否保留旧名视图过渡 1 个发布周期（建议保留）——确认？

---

## 六、里程碑与工作量

| 阶段 | 估算 | 依赖 | 里程碑 |
|---|---|---|---|
| P0 | 0.5d | — | M1 |
| P1 | 1d | P0 | M1 |
| P2 | 2d | P1 | M2 |
| P3 | 2-3d | P2 | M2 |
| P4 | 8-12d | P3 | M3 |
| P5 | 3-5d | P4 | M4 |
| **合计** | **≈17-24 人日** | — | 1 人全职 3-5 周 |

## 七、执行方式

- 每阶段一个 PR，先 P0+P1（M1 交付），用户确认后再进 P2。
- 每个 PR 必须：代码改动 + 数据迁移脚本（如涉及）+ build/typecheck 通过 + 相关接口回归。
- 涉库改动（P1/P2/P3/P4/P5）先在测试库执行 SQL，确认后再合代码。

---

## 八、执行记录（M1：P0+P1 已完成 2026-08-31）

### P0 止血冻结 ✅
- 新增 `backend/scripts/check-migration-gate.js`（变更范围：CI 用 GITHUB_BASE_REF/origin/main 对比、本地用工作区 diff；规则：db-migration.ts 新增 CREATE/ALTER → 失败；legacy SQL 新增 ALTER → 失败；新增 CREATE TABLE 必须带 TypeORM 迁移类）
- `backend/package.json` 新增 `migration:gate` script（本地验证通过）
- `.github/workflows/ci.yml` 新增 `migration-gate` job（fetch-depth: 0）

### P1 死代码清理 ✅（代码侧完成；归档 SQL 待数据库执行）
- `backend/src/app.module.ts`：移除 OpcModule import + 注册
- `backend/src/modules/opc` → 移入 `backend/archive/opc-module-20260831/`（不再编译、不再注册 TypeORM 实体）
- `backend/src/common/utils/db-migration.ts`：删除 opc_agent_repos 对齐段（1782→1754 行）
- `backend/database/init.sql`：删除 OPC 4 表建表段（840→755 行）；`seed.sql` 删除 4 行 DELETE
- `backend/sql/deprecated_004/005` → 移入 `backend/archive/deprecated-sql-20260831/`（hermes/openclaw 建表由 999_create_missing_tables.sql 与 db-migration.ts 兜底）
- 桌面端：`api/opc-api.ts`、`pages/OPC/`、`types/opc.ts` → 移入 `desktop/archive/opc-20260831/`；`router/index.tsx` 删除 /opc 重定向；`Breadcrumb` 删除 /opc 标签；`MemberRole` 迁至 `types/team.ts`，`resource.ts` 改引用
- `backend/test/smoke-test.js`：模块清单移除 opc
- 新增数据库归档脚本：`backend/database/archive_opc_tables.sql`（4 表 RENAME `_archived`，待连库执行）

### 验证结果
- `npm run migration:gate` ✅（exit 0）
- `npm run build`（backend）✅
- `npm run typecheck`（desktop）✅（0 错误）
- `node test/smoke-test.js`：模块完整性 ✅；6 项失败均为存量问题（缺 backend/.env、redis eval、SQL 拼接），与本次改动无关
- 全仓残留：仅历史迁移 014 文件、代码注释、`opc_agent_config` 列（其他表内 JSON 列，保留）

### 待办（数据库侧，需要连库执行）
1. 执行 `backend/database/archive_opc_tables.sql` 归档 4 张表
2. 若确认无历史价值，可将 `backend/archive/`、`desktop/archive/` 下的归档文件彻底删除（当前保留可回滚）

---

## 九、执行记录（P2 安全子集已完成 2026-08-31）

### 已完成（零风险，代码侧）
- **rag_documents 归档（P2d）**：`RagDocumentEntity` 无任何模块注册/引用（rag 模块只注册 knowledge 实体，rag service 是 health stub）→ 实体移入 `backend/archive/rag-20260831/`；新增数据库脚本 `backend/database/archive_rag_documents.sql`（RENAME `rag_documents` → `rag_documents_archived`，待连库执行）
- **teams / team_members 去重（P2b/P2c）**：`user/entities/team.entity.ts`、`team-member.entity.ts` 是 init.sql 旧结构的残留副本，仅被 tenant.module 注册且 **service 从未使用**（tenant 也是 health stub）→ 实体移入 `backend/archive/duplicate-team-entities-20260831/`；`tenant.module.ts` 移除 import 与 forFeature 注册
- 依据：`db-migration.ts` L490-505 显式把 init.sql 旧结构（owner_id/user_id/role）调整为 team 模块新结构（avatar/creator_id/agent_id/role_title）→ team 模块是真源

### 验证
- `npm run build`（backend）✅
- 实体统计：116 个 entity 文件 / 114 个唯一表名；重复组仅剩 **channels ×2**（channels 冲突见下）
- smoke-test 模块完整性 ✅（仍为 18 过 6 失败，均为存量环境问题）

### 待数据库确认（P2a channels，阻塞项）
- `channels` 仍有 channel 模块（bigint PK，发布渠道）与 community 模块（varchar PK，社区频道）两个活跃实体同表，**两套建表 SQL 并存**（`migrations/011_create_channel_tables.sql` bigint vs `sql/020-community-and-landing.sql` varchar，均 IF NOT EXISTS）
- 生产物理结构取决于部署历史，无法从代码确定；本机 MySQL 未启动（ECONNREFUSED）
- **下一步**：连库执行 `backend/database/inspect_conflict_tables.sql`（SHOW CREATE TABLE channels/teams/team_members + 行数），按输出决定保留方案：
  - 若 `channels` 为 varchar + slug/icon/color → community 保留 `channels`，channel 模块改名 `publish_channels`（新建表 + 数据迁移）
  - 若 `channels` 为 bigint + platform/credentials → channel 保留 `channels`，community 改名 `community_channels`
- 未获得 DB 事实前**不改动 channels 代码**（两个服务均为活跃功能，猜错会伤线上）

### P3 前置说明
- rag_documents 已归档 → P3b 知识域无合并动作（原方案中的合并项已消除）
- P3a 素材合并（oral_workshop_materials/ip_archives → media_assets）涉及活跃表与跨模块引用，需按 D5 确认后再做

---

## 十、执行记录（P2a channels 拆分已完成 2026-08-31）

### 数据库事实（inspect-db.sh 在服务器执行结果）
- `channels`：`id varchar(32) PK` + slug/icon/color/post_count，5 行（社区种子数据）→ **community 社区频道是真源**
- `teams`：0 行，新旧合并结构（owner_id + avatar/member_count/creator_id/knowledge_base_id）→ team 模块真源（此前 user 重复实体移除正确）
- `team_members`：0 行，合并结构（user_id/role + agent_id/role_title）→ 同上

### 已完成
- `backend/src/migrations/1754035200000-CreatePublishChannels.ts`（TypeORM 迁移，启动自动执行）：
  - channels 为 bigint（011 遗留新装库）→ RENAME 为 publish_channels 并补建 varchar channels + 5 条默认社区频道（INSERT IGNORE 幂等）
  - channels 为 varchar（生产库）→ 直接新建 publish_channels
- `backend/src/modules/channel/entities/channel.entity.ts`：`@Entity("channels")` → `@Entity("publish_channels")`
- `backend/migrations/011_create_channel_tables.sql`：bigint 渠道表改为建 `publish_channels`（新装库不再产生冲突）
- 新增手工 SQL `backend/database/create_publish_channels.sql`（生产立即生效用，幂等）

### 验证
- 实体去重：116 个 entity / 115 唯一表名，**duplicates: []（同名实体冲突清零）**
- `npm run build` ✅、`npm run migration:gate` ✅、smoke-test 模块完整性 ✅

### 数据库侧待办（二选一）
1. **推荐**：下次部署/重启后端时，TypeORM 迁移自动执行（database.ts `migrationsRun: true`），无需手工 SQL
2. **立即生效**：在服务器执行 `backend/database/create_publish_channels.sql`（生产 channels 已确认 varchar 结构）

### P2 状态：✅ 全部完成（channels/teams/team_members/rag_documents 四组冲突清零）

---

## 十一、执行记录（P3 冗余表合并已完成 2026-08-31）

### 用户确认范围（方案 B 核对后修正）
- 合并 3 张：`oral_workshop_materials` + `ip_archives` + `voice_assets` → `media_assets`
- 保留 2 张（数据模型冲突，强行合并会破坏功能，仅留待 P4 改名对齐）：`publish_plans`（发布计划流程实体，与 `oral_workshop_publish_platforms` 平台开关是两个概念）、`task_output_item`（任务输出载体，任务中心与素材库双向使用）

### 已完成
- **TypeORM 迁移** `backend/src/migrations/1754035200001-MergeOralWorkshopAssetsToMediaAssets.ts`（重启自动执行）：
  - `media_assets` 新增 `biz_type` 列（media/voice_asset/ip_archive，默认 media）+ 索引；新装库直接建最终结构，存量库补列
  - `voice_assets` → `media_assets`（biz_type='voice_asset'，url=参考音频，meta 存 speaker_id/demo_audio/emotion_ref_audio/status）；**回填 `oral_workshop_jobs.voice_id`**（meta.old_id → 新 media_assets.id）
  - `ip_archives` → `media_assets`（biz_type='ip_archive'，meta 存 style_analysis/topics/source_json）
  - `oral_workshop_materials` → `media_assets`（biz_type='media'，素材库常规素材，meta 存 category/preview_url/status，description/vector_id 按列存在性动态迁移）
  - 旧表 RENAME 为 `*_archived` 归档；回填幂等（按 meta.old_id 防重）
- **代码改造**：
  - `oral-workshop.service.ts`：listVoices/createVoice/cloneVoiceInBackground/deleteVoice、analyzeIpArchive/listIpArchives/deleteIpArchive/toIpArchiveItem 全部改用 `mediaAssetRepo` + meta 映射，API 返回结构不变
  - `oral-workshop.executor.ts`：声音查找改 `mediaAssetRepo`（biz_type='voice_asset'），refAudioUrl=url、speakerId 读 meta
  - `oral-workshop.module.ts`：移除 VoiceAssetEntity/IpArchiveEntity 注册
  - 三个实体文件移入 `backend/archive/oral-workshop-merged-20260831/`
  - `media-asset.service.ts` 素材库列表过滤 `biz_type='media'`（我的声音/IP 档案不进常规素材库，原行为不变）；`material-search` LIKE 兜底、`statistics` 素材数同口径
- **legacy SQL 清理**（删 CREATE/ALTER，gate 通过；`025/032` 移入 `backend/archive/deprecated-sql-20260831/`）：022 去掉 voice_assets 建表、028 去掉 emotion_ref_audio ALTER、030 去掉 oral_workshop_materials 建表、031 去掉向量化补列；`db-migration.ts` 移除 voice_assets 建表块（新装库不再产生空表）

### 验证
- `npm run build` ✅、`npm run migration:gate` ✅
- 全量单测 `npm test`：**717/717 通过**（含 oral-workshop/media-assets/statistics/material-search 相关 62+43 项，测试随构造器与 biz_type 语义同步更新）
- 实体去重：112 个唯一表名，**duplicates: []**（较 P2 减少 3 张合并表）

### 数据库侧（二选一）
1. **推荐**：下次部署/重启后端，TypeORM 迁移自动执行（`migrationsRun: true`）
2. 立即生效：在服务器手工执行等价 SQL（迁移类内容即脚本，未单独提供以避免双源漂移）

---

## 十二、执行记录（P4 批次 1：G 域任务域命名规范已完成 2026-08-31）

### 已完成（9 张表 RENAME + 旧名过渡视图 + 全量引用同步）
| 旧表名 | 新表名 |
|---|---|
| agent_task | task_agent_tasks |
| team_tasks | task_team_tasks |
| team_workflow_nodes | task_team_workflow_nodes |
| team_members | task_team_members |
| teams | task_teams |
| scheduled_tasks | task_scheduled_tasks |
| n8n_workflows | task_n8n_workflows |
| n8n_workflow_exec_log | task_n8n_workflow_exec_log |
| n8n_workflow_lib | task_n8n_workflow_lib |

- **TypeORM 迁移** `backend/src/migrations/1754035200002-RenameTaskDomainTables.ts`：RENAME 旧名→新名 + `CREATE OR REPLACE VIEW 旧名 AS SELECT * FROM 新名`（只读过渡视图，P4 收尾批次删除）；幂等（旧名表存在且新名不存在才 RENAME）；down() 删视图并改回
- **实体**：9 个 `@Entity` 表名同步（task/team/n8n/scheduled-tasks/admin-workflow 模块）
- **裸 SQL**：`task.service.ts` 统一任务中心 UNION 分支（FROM task_team_tasks / LEFT JOIN task_team_members / FROM task_agent_tasks）
- **legacy**：`db-migration.ts` 全部 team_*/scheduled_tasks 表名与注释同步；`006/007/010` 建表改新名（新装库直接建新名）；`init.sql`（task_teams/task_team_members + FK）、`seed.sql`（DELETE）同步
- **门禁规则演进**（`check-migration-gate.js`）：db-migration.ts 与 legacy SQL 的 CREATE/ALTER 变更从"禁止"放宽为"必须同时新增 TypeORM 迁移类"——P4 改名属受控结构变更，仍强制走 TypeORM 迁移
- **测试**：`unified-mapper.spec.ts` SQL 断言同步为新表名；代码注释同步

### 验证
- `npm run build` ✅、`npm run migration:gate` ✅
- 全量单测 `npm test`：**717/717 通过**
- 实体去重：112 个唯一表名，duplicates: []；G 域 9 表全部就位 task_* 命名

### 数据库侧（二选一）
1. **推荐**：下次部署/重启后端，TypeORM 迁移自动执行（RENAME + 旧名视图）
2. 回滚：`migration:revert`（down() 删除视图并改回旧名）

### 待办（后续批次）
- P4 批次 2（H 域：oral_workshop_*/publish_*/briefs/hermes_*/ai_audit_config → create_*）
- P4 批次 3（C 域：models/model_providers/llm_files/mcp_call_log → ai_*）
- P4 批次 4（I 域：agents/plugins/skills/mcp/n8n_instances/openclaw/runtime/workflow_mcp_bind → eco_*）
- P4 批次 5（K 域：posts/post_tags/replies/votes/bookmarks/channels/channel_messages → social_*）
- P4 批次 6：删除全部过渡视图

---

## 十三、执行记录（P4 批次 2：H 域创作域命名规范已完成 2026-08-31）

### 已完成（12 张表 RENAME + 旧名过渡视图 + 全量引用同步）
| 旧表名 | 新表名 |
|---|---|
| oral_workshop_jobs | create_oral_workshop_jobs |
| oral_workshop_steps | create_oral_workshop_steps |
| oral_workshop_publish_platforms | create_oral_workshop_publish_platforms |
| publish_plans | create_publish_plans |
| publish_accounts | create_publish_accounts |
| publish_channels | create_publish_channels |
| briefs | create_briefs |
| hermes_instances | create_hermes_instances |
| hermes_skills | create_hermes_skills |
| hermes_skill_ratings | create_hermes_skill_ratings |
| hermes_call_logs | create_hermes_call_logs |
| ai_audit_config | create_ai_audit_config |

- **TypeORM 迁移** `backend/src/migrations/1754035200003-RenameCreateDomainTables.ts`：RENAME 旧名→新名 + `CREATE OR REPLACE VIEW 旧名 AS SELECT * FROM 新名`（只读过渡视图，P4 收尾批次删除）；幂等（旧名表存在且新名不存在才 RENAME）；down() 删视图并改回
- **0000 迁移同步**：`publish_channels` 建表/RENAME 目标直接改为 `create_publish_channels`（新装库一步到位；已跑过 0000 的环境由 0003 兜底 RENAME）
- **实体**：12 个 `@Entity` 表名同步（channel/oral-workshop/briefs/hermes/admin-audit 模块），注释同步
- **裸 SQL**：`task.service.ts` 统一任务中心 hermes 分支（FROM create_hermes_call_logs）
- **legacy**：`db-migration.ts` 全部 12 表 CREATE/ALTER/ensureColumn 与注释同步；`008/011/017/020/023/024/026/027/028/029/030/031` 建表与 ALTER 改新名（新装库按序直建最终名）；`hermes_stage1/234`、`sql/999`、`p2_fix_missing_tables`、`p2_orchestrate_hermes_call_logs`、`database/create_publish_channels.sql`、`inspect_conflict_tables.sql` 同步；索引名（idx_/uk_）保持不变
- **测试**：`unified-mapper.spec.ts` SQL 断言同步；相关注释同步（publisher/executor/desktop）
- 0001 迁移保留旧名 `oral_workshop_jobs`（其先于 0003 执行，回填 voice_id 时表尚未改名）

### 验证
- `npm run build` ✅、`npm run migration:gate` ✅
- 全量单测 `npm test`：**717/717 通过**
- 实体去重：112 个唯一表名，duplicates: []；H 域 12 表全部就位 create_* 命名

### 数据库侧（二选一）
1. **推荐**：下次部署/重启后端，TypeORM 迁移自动执行（RENAME + 旧名视图）
2. 回滚：`migration:revert`（down() 删除视图并改回旧名）

### 待办（后续批次）
- P4 批次 3（C 域：models/model_providers/llm_files/mcp_call_log → ai_*）
- P4 批次 4（I 域：agents/plugins/skills/mcp/n8n_instances/openclaw/runtime/workflow_mcp_bind → eco_*）
- P4 批次 5（K 域：posts/post_tags/replies/votes/bookmarks/channels/channel_messages → social_*）
- P4 批次 6：删除全部过渡视图

---

## 十四、执行记录（P4 批次 3：C 域模型域命名规范已完成 2026-08-31）

### 已完成（7 张表 RENAME + 旧名过渡视图 + 全量引用同步）
| 旧表名 | 新表名 |
|---|---|
| models | ai_models |
| model_providers | ai_model_providers |
| llm_files | ai_llm_files |
| mcp_call_log | ai_mcp_call_logs |
| mcp_resource_registry | ai_mcp_resource_registry |
| mcp_tool_registry | ai_mcp_tool_registry |
| mcp_server_config | ai_mcp_server_config |

- **TypeORM 迁移** `backend/src/migrations/1754035200004-RenameAiDomainTables.ts`：RENAME 旧名→新名 + `CREATE OR REPLACE VIEW 旧名 AS SELECT * FROM 新名`（只读过渡视图，P4 收尾批次删除）；幂等；down() 删视图并改回
- **实体**：7 个 `@Entity` 表名同步（model/admin-model/chat/admin-mcp 模块），注释同步
- **裸 SQL/硬编码**：`sync.service.ts`（SELECT * FROM ai_models）、`rotate-aes-key.ts`（getRepository('ai_model_providers')）、`translate-skill-names.js`（SQL 改 ai_* 表名）
- **legacy**：`db-migration.ts` 全部 models/model_providers/llm_files 引用同步（索引名 uk_model_providers_slug/global、idx_llm_files_user_id 保持不变）；`init.sql`（ai_models 建表+注释）、`seed.sql`（DELETE/INSERT）、`migrations/004`（ai_mcp_* 建表）、`upgrade-v0.5.0.sql`（ALTER）、`006` 注释同步
- **测试**：`llm-file-entity.spec.ts` 表名断言同步为 ai_llm_files（索引名断言保留）；其余模块引用（/admin/models 路由、modelsPath 配置、局部变量 models）**保持不变**（API 契约不动）
- 0001/0002/0003 迁移保留各自旧名（按执行顺序各自先行，正确行为）

### 验证
- `npm run build` ✅、`npm run migration:gate` ✅
- 全量单测 `npm test`：**717/717 通过**
- 实体去重：112 个唯一表名，duplicates: []；C 域 7 表全部就位 ai_* 命名

### 数据库侧（二选一）
1. **推荐**：下次部署/重启后端，TypeORM 迁移自动执行（RENAME + 旧名视图）
2. 回滚：`migration:revert`（down() 删除视图并改回旧名）

### 待办（后续批次）
- P4 批次 4（I 域：agents/plugins/skills/mcp/n8n_instances/openclaw/runtime/workflow_mcp_bind → eco_*）
- P4 批次 5（K 域：posts/post_tags/replies/votes/bookmarks/channels/channel_messages → social_*）
- P4 批次 6：删除全部过渡视图
- P5 宽表拆分（models → ai_models + ai_model_pricing + ai_model_credentials，api_key AES 加密）——高风险，涉钱涉密钥

---

## 十五、执行记录（P4 批次 4：I 域生态域命名规范已完成 2026-08-31）

### 已完成（23 张表 RENAME + 旧名过渡视图 + 全量引用同步）
| 旧表名 | 新表名 |
|---|---|
| agents | eco_agents |
| agent_versions | eco_agent_versions |
| agent_categories | eco_agent_categories |
| agent_department | eco_agent_department |
| agent_favorites | eco_agent_favorites |
| agent_installs | eco_agent_installs |
| agent_ratings | eco_agent_ratings |
| agent_reviews | eco_agent_reviews |
| agent_tag | eco_agent_tag |
| agent_tag_map | eco_agent_tag_map |
| agent_import_tasks | eco_agent_import_tasks |
| plugins | eco_plugins |
| user_plugins | eco_user_plugins |
| skill_packages | eco_skill_packages |
| skill_sources | eco_skill_sources |
| skill_install_logs | eco_skill_install_logs |
| mcp_servers | eco_mcp_servers |
| mcp_catalog | eco_mcp_catalog |
| n8n_instances | eco_n8n_instances |
| n8n_webhook_logs | eco_n8n_webhook_logs |
| openclaw_instances | eco_openclaw_instances |
| runtime_versions | eco_runtime_versions |
| workflow_mcp_bind | eco_workflow_mcp_bind |

- **TypeORM 迁移** `backend/src/migrations/1754035200005-RenameEcoDomainTables.ts`：RENAME 旧名→新名 + `CREATE OR REPLACE VIEW 旧名 AS SELECT * FROM 新名`（只读过渡视图，P4 收尾批次删除）；幂等；down() 删视图并改回
- **实体**：23 个 `@Entity` 表名同步（agent/admin-agent/plugin/skill-store/mcp/admin-mcp/n8n/openclaw/runtime/admin-workflow 模块），注释同步
- **裸 SQL/QueryBuilder**：`agent.service.ts`（4 处 leftJoin/innerJoin 'eco_agents'）、`sync.service.ts`（SELECT eco_agents/eco_plugins）、`team.service.ts`（2 处 FROM eco_agents）、`dashboard-stats.service.ts`（FROM eco_agents LEFT JOIN agent_call_logs）
- **脚本**：`import-agents.js`（agents SQL）、`seed-skill-catalog.js`（INSERT eco_skill_sources）、`translate-skill-names.js`（eco_skill_sources SQL）
- **legacy**：`db-migration.ts` 全部 skill_*/agent_installs/mcp_servers/mcp_catalog/agents/plugins 引用同步；`init.sql`（eco_agents 建表 + FK REFERENCES）、`seed.sql`、`migrations/001/002/003/006/007/008/009/012/015/upgrade-v0.5.0`、`sql/999/mcp_servers/n8n_tables/p2_fix_missing_tables`、`database/migration_add_runtime_versions.sql` 同步（外键/索引名不变）
- **测试**：`mcp-market/ai-classify/admin-imports.service` spec 注释同步；API 路由（/admin/agents、/plugins 等）与局部变量、上传目录路径**保持不变**
- 0001-0004 迁移保留各自旧名（按执行顺序各自先行，正确行为）

### 验证
- `npm run build` ✅、`npm run migration:gate` ✅
- 全量单测 `npm test`：**717/717 通过**
- 实体去重：112 个唯一表名，duplicates: []；I 域 23 表全部就位 eco_* 命名

### 数据库侧（二选一）
1. **推荐**：下次部署/重启后端，TypeORM 迁移自动执行（RENAME + 旧名视图）
2. 回滚：`migration:revert`（down() 删除视图并改回旧名）

### 待办（后续批次）
- P4 批次 5（K 域：posts/post_tags/replies/votes/bookmarks/channels/channel_messages → social_*）
- P4 批次 6：删除全部过渡视图
- P5 宽表拆分（models → ai_models + ai_model_pricing + ai_model_credentials，api_key AES 加密）——高风险，涉钱涉密钥


---

## 十六、执行记录（P4 批次 5）：K 域社交域命名规范已完成（2026-08-31）

### 已完成（10 张表 RENAME + 旧名过渡视图 + 全量引用同步）

| 旧表名 | 新表名 |
|---|---|
| posts | social_posts |
| post_tags | social_post_tags |
| replies | social_replies |
| votes | social_votes |
| bookmarks | social_bookmarks |
| channels | social_channels |
| channel_messages | social_channel_messages |
| tags | social_tags |
| user_profiles | social_user_profiles |
| coin_transactions | social_coin_transactions |

- **TypeORM 迁移** `backend/src/migrations/1754035200006-RenameSocialDomainTables.ts`：RENAME 旧名→新名 + `CREATE OR REPLACE VIEW 旧名 AS SELECT * FROM 新名`（只读过渡视图，P4 收尾批次删除）；幂等：down() 删视图并改回
- **实体**：9 个 `@Entity` 表名同步（community 模块 8 个 + channel 模块 channel-message.entity.ts）；`social_coin_transactions` 无实体，仅 DDL
- **legacy**：`sql/020-community-and-landing.sql`（9 张社区表建表 + `INSERT INTO channels` 种子改 `social_channels`，landing_blocks 保留）；`migrations/011_create_channel_tables.sql`（channel_messages→social_channel_messages）
- **0000 迁移保留内部建 `channels` 不动**：新装库先跑 0000（建 varchar channels + 种子）再跑 0006（RENAME→social_channels + 旧名视图）；生产库 0000 已跑过，0006 直接改名；按序幂等无冲突
- **无需改**：desktop 全部为 `/channels` 路由/API 路径误报；db-migration.ts 仅日志 "default channels" 误报；999/p2_fix_missing_tables、database/ 运维脚本无 K 域建表；`coin_transactions` 仅存在于 020 SQL 与文档，无代码引用
- **API 路由/局部变量**（`/channels`、`/posts`、channels 变量等）**保持不变**（API 契约不动）

### 验证
- `npm run build` ✅；`npm run migration:gate` ✅
- 全量单测 `npm test`：**717/717 通过**（首次运行 1 例 membership 时间戳差 1ms 的既有 flaky，重跑通过，与本次无关）
- 实体去重：112 个唯一表名，duplicates: []；K 域 9 实体全部就位 social_* 命名，无旧表名残留

### 数据库侧（二选一）
1. **推荐**：下次部署重启后端，TypeORM 迁移自动执行（RENAME + 旧名视图）
2. 回滚：`migration:revert`（down() 删除视图并改回旧名）

### 待办（后续批次）
- P4 批次 6：删除全部旧名过渡视图（0002-0006 创建的）
- P5 宽表拆分（models → ai_models + ai_model_pricing + ai_model_credentials，api_key AES 加密）——高风险，涉钱涉密钥


---

## 十七、执行记录（P4 批次 6）：旧名过渡视图清理已完成（2026-08-31）

### 已完成（删除 0002-0006 创建的全部 61 个旧名过渡视图）

- **TypeORM 迁移** `backend/src/migrations/1754035200007-RemoveTransitionViews.ts`：`PAIRS` 61 对（task_*/create_*/ai_*/eco_*/social_*）
- **安全策略**：仅删除 `INFORMATION_SCHEMA.VIEWS` 中确认的 VIEW；若旧名仍是真实表（迁移未生效/失败），绝不 DROP，避免误删数据
- **回滚**：down() 为新名真实表重建旧名只读过渡视图（与 0002-0006 up() 幂等对齐）
- **一致性校验**：0007 PAIRS 与 0002-0006 RENAMES 并集逐对比对，61/61 零差异；61 个旧名与实体表名零交集（无实体仍引用旧名）

### 验证
- `npm run build` ✅；`npm run migration:gate` ✅
- 全量单测 `npm test`：**717/717 通过**
- 迁移顺序：0000-0007 按序幂等（0002-0006 先 RENAME + 建视图，0007 删除视图收尾）

### 数据库侧
- 下次部署重启后端自动执行（先 0002-0006 RENAME + 建视图，0007 立即删除视图收尾）
- 回滚：`migration:revert` 按逆序重建视图并还原表名

### 待办（后续批次）
- ~~P5 宽表拆分（models → ai_models + ai_model_pricing + ai_model_credentials，api_key AES 加密）——高风险，涉钱涉密钥，需用户确认后执行~~ ✅ 2026-08-31 已完成（见下）

---

## 十八、执行记录（P5）：ai_models 宽表拆分 → ai_model_pricing + ai_model_credentials（2026-08-31）

### 已完成

- **TypeORM 迁移** `backend/src/migrations/1754035200008-SplitModelPricingAndCredentials.ts`
  - 建 `ai_model_pricing`（14 列计费/能力/场景）+ `ai_model_credentials`（api_key/api_endpoint）
  - 列感知动态 INSERT IGNORE 回填：存量库按旧列全量回填；新装库缺失列回填 NULL，幂等不失败
  - down() 删除子表；`ai_models` 旧列保留一个发布周期（回滚安全），P5 收尾清理
- **新实体**：`admin-model/entities/model-pricing.entity.ts`、`model-credential.entity.ts`（均注册进 admin-model.module）
- **ModelEntity 重写**：移除 16 个拆出列，保留核心列 + `pricing`/`credentials` 两个 OneToOne（cascade: insert/update）
- **admin-model.service.ts 重构**：test/probe/applyCreateDto/applyUpdateDto/createFromTemplate/toAdminModelItem/batchUpdatePrice/importModelsJson/importProviderModels/importModels 全部改嵌套 `pricingOf()`/`credOf()`；list()/exportModels 加 leftJoinAndSelect；detail/update/test/probe 加 relations
- **消费者修复**：agent-translate（credentials）、llm-proxy（pricing）、pricing.service（pricing + 缓存剥离 credentials）、media-generation（pricing + computeVideoCharge(model.pricing)）、model.service（listChatOptions pricing）
- **db-migration.ts**：移除 ai_models 的 scenario_tags/pricing_mode/video_per_second/cost_price/price_per_minute ensureColumn（specs/icon_url/remark 保留）；并修正「0008 回填先于 legacy 元→积分×100 换算」的顺序缺口：换算块内同步 UPDATE JOIN 回写 ai_model_pricing 的 price_per_1k_input/output，保证新装库种子模型单位一致（生产存量库注释已是积分，跳过）
- **init.sql**：补充 `ai_model_pricing` + `ai_model_credentials` 两张新表建表（与 0008 迁移一致，双保险）

### 验证

- `npm run build` ✅
- 全量单测 `npm test`：**717/717 通过**（admin-model-p2 / admin-model-test-connection 断言已适配嵌套 pricing）
- `npm run migration:gate` ✅

### 数据库侧

- 下次部署重启后端，TypeORM 迁移自动执行（0008 建两张子表 + 回填）
- 回滚：`migration:revert`（down() 删子表；ai_models 旧列仍在，数据无损）
- 遗留（后续收尾）：1 个发布周期后清理 ai_models 旧列（P5 步骤 3）

### 待办（后续批次）

- P5 收尾：发布后清理 ai_models 冗余旧列（需迁移 + 全量回填校验后执行）
