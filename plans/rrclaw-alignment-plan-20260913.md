# 对齐方案：按 RRClaw（开界 / ClawX）对齐深瞳 AI 的飞书绑定与战略文档链路

> 日期：2026-09-13 ｜ 分支：`upgrade/electron-41` ｜ 线上桌面端：2.1.2
> 来源：RRClaw 打包产物实测（`E:\开界\RRClaw`：`resources/app.asar` 反编译 + `resources/resources/feishu/V2.0/*` + `创建多维表格/*`）+ 深瞳仓库代码实测。
> 状态：**已按本方案逐步实施（批次 ①～⑥ 全部落地，含批次⑤的定时任务节拍对齐）；批次④按 4A 变体落地=编排器直连 FeishuClient，不打开 flows 服务**。执行记录见第十一节。
> 原则：① 能抄的接口/数据模型直接抄，每条注明 RRClaw 出处；② 深瞳已有的能力不重复造；③ 两边架构冲突处以深瞳架构为准，并写明原因。

---

## 〇、一句话目标

让深瞳的 12 官署拥有 RRClaw 那样的**飞书数据闭环**：官署知道自己该读写哪张表 → 产出真的落到飞书表里 → 战略文档成为**运行时真实读取**的对齐基准（而不是一个没人打开的链接）。

---

## 一、结论先行：能抄什么，不能抄什么

| 结论 | 内容 |
|------|------|
| **直接抄（接口 / 数据模型）** | ① SOUL 表格 5 列结构（占位符 / env键 / 表路径 / 链接 / 用途）；② 每个角色 SOUL 末尾固定一句战略文档占位行；③ 战略文档**实时拉全文**的读取链路；④ 「1 中心 N 表 + 跨角色共享表矩阵」的表粒度；⑤ 表名别名表；⑥ 一键创建时的预填种子数据；⑦ 战略表版本记录；⑧ 定时器节拍 |
| **抄思路、改用深瞳通道** | 「官署产出写飞书」这件事要抄，但**不能让 Hermes 自己调工具**——深瞳 CLI 平台工具被显式关闭且原因成立（见 3.3）。改用深瞳已有的 `flows` 模块 `FeishuStore` / `unified-toolbox` MCP，由编排器或定时任务代写 |
| **不要抄** | ① 让 agent 自己调飞书工具（会撞深瞳的截断问题）；② RRClaw 的 `.env` 双真源（客户端只清不写，靠人工回填，见 2.5）；③ RRClaw 的 7 类「SOUL 声明键 ≠ 代码实际键」不一致 |
| **深瞳已有、无需抄** | 建表幂等复用（先查再建）、字段类型降级保表、编制持久化、套餐三档、官署定时任务骨架 |

---

## 二、RRClaw 机制还原（事实，带出处）

### 2.1 绑定链路是五层

| 层 | 做什么 | 出处 |
|----|--------|------|
| 1 蓝本 | 每个角色 SOUL 的「飞书表格」章节是一张 5 列表，第一列写 `{{FEISHU_DOC:<中心>-<表名>}}`，地址列写 `[待配置]` | `resources/resources/feishu/V2.0/CEO_SOUL.md:92` |
| 2 建表 | 一键创建团队时建 **1 个 Base**（默认名「AI自动化团队协作」）+ 每个中心一个文件夹 + 表；`FORMULA/LOOKUP/RELATE` 类型**跳过留人工**；支持 `existingAppToken` / `existingCenterIds` 增量跳过 | `app.asar` 建表函数；表定义 `创建多维表格/bitable_config.json` |
| 3 回填 | 结果存 electron-store `teamBitableResults`（`{centerId, appToken, tables:[{name,tableId}]}`）；渲染 SOUL 时 `wA()` 逐行替换占位符所在行的链接列为 `[打开](…/base/<app_token>?table=<table_id>)`；`yA()` 单独处理那句「飞书在线文档」追加 ` → [打开](url)` | `app.asar` 的 `wA()` / `yA()` / `Pa()` |
| 4 运行时 | Python 工具箱解析 SOUL 取 URL：`utils/soul_table_resolver.py` 定位 `~/.openclaw/workspace-<角色>/SOUL.md` → 解析表格 → 抽 `[打开](https://…)`；`utils/config.py` 另有一条 `forkEnv + .env` 通道 | `preinstalled-skills/agent-tool-box/utils/*.pyc` |
| 5 执行 | agent 调 `feishu_bitable_get/append/update`、`feishu_doc_get/update` 等 37 个原子能力 + 50 个 workflow，真正读写飞书 | `agent-tool-box/SKILL.md` |

### 2.2 表资产：1 Base + 8 中心文件夹 + 46 张表

中心与角色（`app.asar` 的 `pA` 与 `Pe`）：01 任务中心→CEO、02 归档中心→秘书助理、03 流量数据中心→流量操盘手（7 表）、04 渠道中心→渠道经理（4 表）、05 销售线索中心→销售经理+销售客服、06 客户成功中心→客户成功经理、07 社群运营中心→私域运营经理+客户成功、08 内容中心→新媒体运营，另加「任务管理」4 表与「公共表」1 表。

角色实际引用（从 15 份 SOUL 抽出，去重后）：

| 角色 | 绑定表（去重） |
|------|----------------|
| CEO | 战略方向文档、战略表、KPI表、CEO每日报告表、每日战报、关键词总表 |
| 秘书助理 | 内容收集表、今日内容分发表、每日汇总报告表、战略方向 |
| 流量操盘手 | 03 中心 7 张 + KPI + 关键词总表 + 战略方向 |
| 渠道经理 | 渠道 4 张 + KPI + 03/05 中心根 + 每日作战地图 + 战略方向 |
| 销售经理 | 潜在客户采集表、销售日报、关键词总表、渠道资源库、KPI、作战地图、战略方向 |
| 销售客服 | 今日沟通清单、客户档案库、客户跟进记录、朋友圈内容库、今日内容分发表、KPI、作战地图、战略方向 |
| 私域运营经理 | 社群沟通/成员/答疑日报/高频问题/运营报告、今日内容分发表、KPI、作战地图、战略方向 |
| 客户成功经理 | 社群 4 张 + 运营报告 + FAQ + 今日内容分发表 + KPI + 作战地图 + 战略方向 |
| 新媒体运营 | 选题库/公众号存档/GEO内容库/朋友圈内容库/内容收集表/KPI/作战地图/战略方向 |
| 其余（情报官/策略官/剪辑官/账号运营官/数据分析师/流量增长官） | 03 中心 7 张 + KPI + 关键词总表 + 战略方向 |

**跨角色共享表 12 张**（只建一次、多角色填同一链接）：KPI表（CEO 写，8 角色读）、每日作战地图（CEO 写，4 角色读）、内容收集表、今日内容分发表（4 角色读）、关键词总表（3 角色）、渠道资源库、客户档案库、朋友圈内容库、社群沟通表、社群答疑日报、社群成员表、高频问题库。

### 2.3 战略文档：谁写、谁读、怎么读

- **唯一作者**：CEO。SOUL 明写「战略源头：战略方向文档的唯一作者和迭代者」，铁律第一条「每天 06:00 制定 KPI 前必须先读战略方向文档」（`CEO_SOUL.md:105-128`）。
- **创建**：`createDocumentFromMarkdown("战略方向文档", 模板)` 把 `V2.0/战略方向文档_模板.md` 整篇导入成飞书 docx，URL 存 `settings.teamStrategicDocUrl`；随后往 CEO 战略表补一条 V1.0 初始记录。
- **读取链路**（`utils/soul_strategy_reader.pyc` 字符串可证）：`_get_strategy_doc_url()` 优先级 = ① `settings.json` 的 `teamStrategicDocUrl` → ② 兜底正则从 SOUL.md 抓 `feishu.cn|larksuite.com` 链接 → ③ `read_strategy_doc_full()` 调 `feishu_doc_get` 拉**最新全文**（API 失败降级 Playwright 公开 URL 直读，返回值 `method` 标明来源）。另有 `read_strategy_section()` / `read_channel_persona_text()` / `read_strategy_meta()`。
- **消费方 = 5 条工作流**（`agent-tool-box/功能说明表.md`）：
  1. CEO 战略文档读写（会话启动 + 周日 20:00）→ LLM 分析 → 写 KPI 表 + 战略表
  2. 渠道关键词分析（08:45）：近 3 天关键词 + 战略文档中渠道合作人群 → 出 5 个采集关键词
  3. 新媒体早间朋友圈（07:40）：内容收集表 + 战略文档的行业与客户人群 → LLM 话术 → wxauto 发布
  4. 私域 AI 自动答疑（15:00–16:00）：内容收集表 + **战略文档产品服务** + 高频问题库 → LLM 汇总话术
  5. 客户成功 AI 答疑售后（14:30–16:00）：同上
- **其余 9 个角色**：SOUL 内嵌一份 8 大板块静态摘要（「以下为战略方向文档摘要。完整内容请打开飞书在线文档查看」），不主动拉全文。
- **模板结构**：10 节 —— 愿景与价值观 / 我们是谁 / 产品详细描述及产品架构 / 服务客户人群及描述 / 人群需求分析 / 同行渠道类型 / 优势与特点 / 竞品优势分析 / 战略飞轮 / 总结。

### 2.4 规模与节拍

14 个角色、3 档套餐（流量操盘版 / 私域运营版 / 旗舰版）、40 条定时器，按 24 小时节拍编排（00:00 数据沉淀 → 06:00 开局 → 07:40 朋友圈 → 08:45 关键词 → 14:30–16:00 答疑 → 20:00 战报 → 周日 20:00 战略复盘）。

### 2.5 RRClaw 自身的坑（建议不要抄）

| # | 问题 | 证据 |
|---|------|------|
| 1 | `.env` 只清不写：全 asar 只有 1 处 `.env` 写入点，是清空旧键的 `kA()`；表链接要人工按《飞书占位符映射表.md》回填 | `app.asar`；`V2.0/落地配置模板/飞书占位符映射表.md` |
| 2 | SOUL 声明键 ≠ `config.py` 实际键，官方文档自列 9 条不一致；其中「每日作战地图」「关键词效果评估表」等压根未注册，对应定时器写表**静默失败** | `飞书占位符映射表.md` 第三节；`config.pyc` 中无 `CEO_BATTLE_MAP_TABLE` / `CHANNEL_KEYWORD_EVALUATION_TABLE` |
| 3 | 战略初始版本记录写不进：代码找表名 `战略迭代记录表`，但 `bitable_config.json` 的 CEO 中心那张表叫 `战略表`，`find` 无 `else` 分支、静默跳过 | `app.asar` 战略阶段代码 vs `bitable_config.json` |
| 4 | `FORMULA/LOOKUP/RELATE` 字段直接跳过，需人工补建 | `app.asar` 建表函数 |

---

## 三、深瞳现状盘点（事实，带出处）

### 3.1 已有、可直接复用（不用重造）

| 能力 | 位置 |
|------|------|
| 飞书客户端（建 App / 列表 / 建表 / 建字段 / 读写记录 / 建文件夹 / 建 docx / 追加 docx 文本） | `desktop/electron/main/feishu-client.ts:132-290` |
| 14 张表规范解析 + 建表（先查再建、`RELATE/FORMULA/LOOKUP` 降级为文本、整表被拒时逐字段兜底） | `desktop/electron/main/feishu-bitable.ts:19-41`、`:258`、`:388` |
| 表名 → envKey / envKey → 归属官署 两张映射表（等于 RRClaw 的别名表 + 拥有者表） | `feishu-bitable.ts:49`、`:75` |
| 每官署表清单 + 2 张共享表 + 占位符渲染 + 单点写入 SOUL | `official-detail.ts:33`、`:53`、`:87`、`:132`、`:163` |
| 战略方向文档创建/复用 + 6 条提纲 + 回填中书省表清单 | `strategic-doc.ts:24`、`:64`、`:94` |
| 一键组队 5 步流水线（cleanup → bitable → agent → soul → strategic → seed → cron） | `team-preset.ts:32`、`:205`；`index.ts:868` |
| 12 官署定时任务骨架（13 条，06:00 早朝 → 22:00 钦天监） | `team-ipc.ts:32` |
| 编制持久化（套餐落盘、重启不长回来） | `edict-roster.ts` |
| **RRClaw 12 业务流的 Python 移植 + 飞书多维表格数据层（`FeishuStore`：append/query/count，标准库直连）** | `resources/service-registry/modules/flows/capabilities/*.py`；`storage.py:97` |
| **MCP 工具箱，已含飞书表工具**：`feishu.create_table` / `feishu.list_tables` / `feishu.add_records` / `feishu.list_records` / `mysql.query` | `modules/unified-toolbox/registry.yaml`（服务默认开启，`http://127.0.0.1:9010/mcp`） |

### 3.2 缺口（要抄 RRClaw 的部分）

| # | 缺口 | 现状证据 |
|---|------|----------|
| G1 | **战略文档进不了 SOUL**：12 份官署蓝本每份都只有 3 行占位符，**没有一行是战略方向文档**；`renderSoulWithTables` 只替换已存在的占位符、不会新增行 | 各 `profiles/*.md` 均 3 行；`zhongshu.md:85-91` 为 方案表 / 任务主表 / 归档索引表 |
| G2 | **战略文档无读取能力**：`feishu-client.ts` 只有 `createDocx` / `appendDocxText`，**没有读 docx 全文的接口**；`strategic-doc.ts` 不导出任何读取函数 | `feishu-client.ts:258`、`:276` |
| G3 | **官署不知道表可以读写**：官署 SOUL 里没有任何 `feishu_*` / `tool_box` / 工具调用描述，只有一张「工作台链接」表 | `rg tool_box|feishu_bitable|feishu_doc profiles/` 无结果 |
| G4 | **表粒度太细、共享太少**：每官署 1 张专属表 + 2 张全员共享（共 14 张），官署之间没有真实数据交接；RRClaw 是「1 中心 N 表 + 12 张跨角色共享表」 | `official-detail.ts:33`、`:53` |
| G5 | **写入通道全断**：`batchAddRecords` / `listRecords` 已实现但全仓库零调用；`flows` 模块 `disabled: true` 且 `storage_backend: local`；`storage_feishu` 为空 | `feishu-client.ts:200`、`:216`；`flows/patch.yaml`；`flows/config.py` DEFAULTS |
| G6 | **collection 与飞书表没有映射**：flows 用英文 snake_case（`content_assets` / `ceo_strategy_docs` / `traffic_hot_videos` …共 14 个），飞书表是中文名，两者无对应表 | `flows/capabilities/*.py` 的 `*_COLLECTION` 常量 |
| G7 | **战略表版本记录缺失**：深瞳没有「战略迭代记录」这类版本表，也没有初始版本落库 | `strategic-doc.ts` 仅建 docx + 提纲 |
| G8 | **预填种子没接线**：`team-preset` 有 `seed` 步骤，`team-ipc` 有 `seedTemplates` 依赖（`:92`、`:302`），但 `index.ts:868` 注册时**没传**，与当初 `createStrategicDoc` 同类问题 | `index.ts:868-878` |

### 3.3 一个决定性前提：官署当前没有任何工具

```ts
// desktop/electron/main/hermes-config.ts:46
export const HERMES_PLATFORM_TOOLSETS: Record<string, string[]> = { cli: ['no_mcp'] }
```

配套注释写明原因：规划/步骤/评审是纯 JSON 结构化调用，Hermes 作为完整 agent 尝试工具调用时，工具参数 JSON 会在输出上限处被截断（`Response truncated due to output length limit`），因此这些调用不允许启用任何工具。

而官署执行走的正是 CLI（`edict-bridge.ts:305`）：

```
node <hermes>/node_modules/hermes-agent/bin/hermes.js -p <官署id> chat -q <prompt> -Q --source tool
```

⇒ **结论：直接把 RRClaw 那套「SOUL 里写工具调用契约、agent 自己调飞书」搬过来会让编排链路报错或产出截断。** 本方案因此把「写飞书」从 agent 侧移到编排器 / 定时任务侧（深瞳已有 `flows.FeishuStore` 与 `unified-toolbox` MCP 两条现成通道）。

---

## 四、逐项对标表

| # | 维度 | RRClaw | 深瞳现状 | 处置 |
|---|------|--------|----------|------|
| 1 | SOUL 表格列结构 | 5 列：占位符 / env键 / 表路径 / 链接 / 用途 | 4 列：表 / 用途 / 读写 / 地址 | **抄**：补 envKey 列 |
| 2 | 战略文档占位行 | 14 个角色 SOUL 末尾固定一句 `{{FEISHU_DOC:01-战略方向}}` | 无 | **抄**：12 份蓝本补一行 |
| 3 | 战略文档读取 | `settings → SOUL 兜底 → feishu_doc_get 全文 → Playwright 降级` | 无 | **抄**：新增 reader |
| 4 | 战略文档消费 | CEO 全文 + 5 条工作流 + 9 角色静态摘要 | 无人消费 | **抄**：注入中书省/尚书省节点 prompt |
| 5 | 表粒度 | 1 中心 N 表 + 12 共享 | 1 官署 1 表 + 2 共享 | **抄**：扩表 + 建共享矩阵 |
| 6 | 表名别名 | `hi = {KPI表:"KPI", 战略表:"战略迭代记录表"}` | 有 `TABLE_ENV_KEY` / `ENV_KEY_OWNER` | 已有，补别名场景 |
| 7 | 增量复用 | `existingAppToken` / `existingCenterIds` | 已有（先查再建 + `force`） | 无需抄 |
| 8 | 字段类型 | 跳过 `FORMULA/LOOKUP/RELATE` 留人工 | 降级为文本保表 | **不抄**，深瞳更优 |
| 9 | 预填种子 | `爆款提示词.csv` → 爆款结构模板库 | `seed` 步骤存在但没接线 | **抄**：接线 + 供种子数据 |
| 10 | 战略表版本 | 战略表 V1.0 初始记录 | 无 | **抄**：新增版本记录 |
| 11 | 定时器节拍 | 40 条 / 24 小时 | 13 条 | **抄**：按需扩充 |
| 12 | agent 自调工具 | 是（37 原子能力 + 50 workflow） | CLI 工具被关闭（有原因） | **不抄**，见 3.3 |
| 13 | 配置真源 | SOUL + `.env` 双源（易漂移） | 单一源 `official-tables.json` | **不抄** RRClaw 双源 |
| 14 | 数据落盘位置 | 先落飞书表，本地 MySQL 同步层 | 先落本地 `tasks_source.json`，飞书为空壳 | **抄**：补飞书写入 |

---

## 五、改造方案（分 6 批，每批可独立验证）

### 批次 ①：战略文档进 SOUL（最小改动、最高性价比）

| 文件 | 改动 |
|------|------|
| `desktop/resources/edict/profiles/zhongshu.md` | 「飞书表格（工作台）」章节补一行：`| 战略方向文档 | 战略方向维护与对齐基准 | 读写 | {{FEISHU_DOC:战略方向文档}} |` |
| `desktop/electron/main/official-detail.ts` | `DEFAULT_OFFICIAL_TABLES.zhongshu` 已含 `FEISHU_STRATEGY_DOC`（上一轮修复加的），确认名称与蓝本占位符逐字一致（`战略方向文档`） |
| 其余 11 份蓝本 | 可选：末尾补一句战略文档链接（RRClaw 做法），只读不写 |

风险：`EDICT_PROFILE_DESC`（`edict-bridge.ts:132`）只有 11 项、缺 `taizi`，与本批无关但可顺手修。

### 批次 ②：战略文档实时读取

| 文件 | 改动 |
|------|------|
| `desktop/electron/main/feishu-client.ts` | 新增 `getDocxRawContent(documentId)`（`GET /open-apis/docx/v1/documents/:id/raw_content`）；失败时降级为可读链接提示（深瞳没有 Playwright 直读通道，先不做降级） |
| `desktop/electron/main/strategic-doc.ts`（新增函数） | `readStrategicDoc(dataRoot, client, { ttl })`：读 `strategic-doc.json` 拿 `documentId` → 拉全文 → 内存 TTL 缓存（抄 RRClaw `_strategy_cache`）→ 返回 `{ text, source, version }` |
| `desktop/electron/main/edict-orchestrator.ts:316` | `buildNodePrompt()` 对 `Zhongshu` / `Assigned` 两个节点注入「战略方向（节选 N 字）」段落；读取失败不阻塞，只在 prompt 里注明「战略文档未接入」 |
| `desktop/electron/main/edict-bridge.ts` | `createEdictDeps()` 注入 `readStrategy` 依赖，供编排器调用 |

**拍板点 1**：注入全文还是节选？建议按 RRClaw「全文给 CEO、摘要给其余」的口径，深瞳对应为：中书省节点给全文（截 4000 字），尚书省派发节点给摘要（截 800 字）。

### 批次 ③：表清单对齐 RRClaw 结构（扩表 + 共享矩阵）

| 文件 | 改动 |
|------|------|
| `desktop/resources/edict/data/多维表格字段设计规范.md` | 扩充表清单（见第六节待拍板），并为每张表补 `envKey` 列 |
| `desktop/electron/main/official-detail.ts` | `DEFAULT_OFFICIAL_TABLES` 扩为多表；`SHARED_OFFICIAL_TABLES` 从 2 张扩为共享矩阵（每张标注「主写官署 / 共享读官署」） |
| `desktop/electron/main/feishu-bitable.ts` | `TABLE_ENV_KEY` / `ENV_KEY_OWNER` 同步补齐新表 |
| `desktop/resources/edict/profiles/*.md` | 12 份蓝本的表格章节按新清单重写（保留 `{{FEISHU_DOC:}}` 占位符） |

**拍板点 2**：新增表清单与共享关系（第六节给出建议稿 + 冲突项）。

### 批次 ④：官署产出落飞书（写入通道）

**不采用**：给 Hermes 开工具（见 3.3）。

采用深瞳两条现成通道，二选一或并用：

| 方案 | 做法 | 优点 | 代价 |
|------|------|------|------|
| 4A（推荐） | 编排器在 `edictRunPipeline` 的「产出落盘」处，除写 `tasks_source.json` 外，调 `flows` 模块的 `FeishuStore.append()` 写对应飞书表 | 复用已移植的 `FeishuStore`（标准库直连，无新依赖）；落点与 RRClaw 一致 | 需要把 `flows` 服务从 `disabled: true` 打开，并把 `storage_backend` 切到 `feishu`、回填 `storage_feishu.tables` |
| 4B | 编排器调 `unified-toolbox` MCP 的 `feishu.add_records` | 工具箱默认已开启，无需改 flows | 需新增 MCP 客户端调用；MCP 面向 agent 设计，编排器直连略绕 |

两种都要补 G6 的映射层：

| 文件 | 改动 |
|------|------|
| `desktop/electron/main/feishu-bitable.ts`（或新文件） | 新增 `COLLECTION_TABLE` 常量：flows collection → 飞书表名/envKey |
| `desktop/electron/main/edict-bridge.ts` | `writeBoard` 落盘后追加 best-effort 飞书写入（失败只 warn，不影响编排，与 `reportExecution` 同款风格） |
| `flows` 配置 | `initBitable` 成功后把 `{app_token, tables:{collection: table_id}}` 回填到 `<userData>/service-registry/flows/config.json` 或经 service-manager 注入 `FLOWS_FEISHU_APP_TOKEN` / `FLOWS_FEISHU_TABLES` |

### 批次 ⑤：预填与定时任务对齐

| 文件 | 改动 |
|------|------|
| `desktop/electron/main/index.ts:868` | 补 `seedTemplates`（G8，与 `createStrategicDoc` 同类问题），实现种子数据写入（对标 RRClaw「爆款提示词.csv → 爆款结构模板库」） |
| `desktop/resources/edict/data/` | 增种子数据文件（对标 `创建多维表格/爆款提示词.csv`，254KB） |
| `desktop/electron/main/team-ipc.ts:32` | 按 RRClaw 节拍补定时任务条数（当前 13 条） |
| `desktop/electron/main/strategic-doc.ts` | 战略文档创建后，往「战略表」补一条 V1.0 初始记录（对标 RRClaw；注意 RRClaw 在这里有表名不一致 bug，深瞳要对齐自己的表名常量） |

### 批次 ⑥：文档同步

| 文件 | 改动 |
|------|------|
| `desktop/resources/edict/data/落地配置模板.env.example` | 补飞书表 envKey 段（当前只有 `FEISHU_APP_ID/SECRET/CHANNEL_ENABLED`） |
| 新增 | 《飞书占位符映射表》深瞳版（占位符 → envKey → 飞书表 → 用途），对标 RRClaw 同名文档 |
| `docs/desktop-运行逻辑与使用流程-20260913.md` | 更新飞书链路与战略文档章节 |

---

## 六、数据模型对齐：collection ↔ 飞书表（**待拍板**）

flows 已移植 RRClaw 的 14 个 collection，但深瞳只有 14 张表，语义对不齐——**这正是要扩表的理由**。建议稿：

| flows collection | 用途 | 建议映射 | 备注 |
|------------------|------|----------|------|
| `content_assets` | 内容收集（海报素材） | 工部·内容生产表 | |
| `daily_poster_records` | 每日海报记录 | 工部·内容生产表 | ⚠️ 与上一行同表，建议新增「工部·每日海报表」 |
| `daily_summary_records` | 每日汇总 | 尚书省·派发执行汇总表 | |
| `ceo_strategy_docs` | 战略草案归档 | 中书省·方案表 | ⚠️ 建议新增「中书省·战略表」 |
| `ceo_keyword_plans` | 关键词规划 | 礼部·数据情报表 | ⚠️ 建议新增「礼部·关键词表」 |
| `traffic_hot_videos` | 爆款采集 | 礼部·数据情报表 | ⚠️ 数据量大，建议独立「礼部·爆款采集表」 |
| `traffic_copy_records` | 文案产出 | 工部·内容生产表 | |
| `customer_records` | 客户档案 | 兵部·业务拓展表 | |
| `sales_followup_records` | 客户跟进 | 兵部·业务拓展表 | ⚠️ 建议拆分 |
| `sales_friend_records` | 加好友 | 兵部·业务拓展表 | ⚠️ 建议拆分 |
| `sales_push_records` | 内容推送 | 兵部·业务拓展表 | ⚠️ 建议拆分 |
| `private_domain_push_records` | 私域群发 | 兵部·业务拓展表 | ⚠️ 建议拆分为「兵部·社群运营表」 |
| `new_media_articles` | 公众号存档 | 工部·内容生产表 | |
| `channel_dm_records` | 渠道私信 | 兵部·业务拓展表 | ⚠️ 建议新增「兵部·渠道触达表」 |

**结论**：若照当前 14 张表硬映射，会有 8 条落进兵部/工部两张表，查询和权限都没法细分。⇒ 建议照 RRClaw「1 官署 N 表」扩表，重点是兵部（4 张）、工部（3 张）、礼部（3 张）。

**共享矩阵建议**（对标 RRClaw 12 张共享表）：军机处·任务主表（全员）、归档索引表（全员只读）、战略方向文档（中书省写、全员读）、吏部·人事绩效表（吏部写、全员读）、钦天监·度量报表（钦天监写、尚书省/中书省读）、户部·财务收支表（户部写、尚书省读）。

---

## 七、执行顺序（建议 6 批分提交）

| 批次 | 内容 | 影响面 | 建议 |
|------|------|--------|------|
| ① | 战略文档进 SOUL | 蓝本 + 1 个常量 | **先做**，一行改动见效 |
| ② | 战略文档实时读取 | 主进程 + 编排器 prompt | **先做**，价值最高 |
| ③ | 扩表 + 共享矩阵 | 规范文档 + 3 个映射 + 12 份蓝本 | 需拍板表清单 |
| ④ | 产出落飞书 | 编排器 + flows 配置 | 依赖 ③ 的映射 |
| ⑤ | 预填 + 定时任务 | 主进程 + 种子数据 | 独立可做 |
| ⑥ | 文档同步 | docs | 收尾 |

每批提交前跑 `npm run typecheck` + `npm run test`（基线 101 套件 / 927 用例）。

---

## 八、不做的事 / 待评估

1. **不给官署开 Hermes 工具**（不改 `HERMES_PLATFORM_TOOLSETS`）：与截断问题冲突。若将来要开，须单独评估——可能需要为官署节点单独定义平台/工具集，或提高 `max_tokens` 并约束 JSON 输出。
2. **不做 Playwright 直读降级**：深瞳没有该通道，战略文档读取失败时明示「未接入」即可，不引入新依赖。
3. **不做 `.env` 双真源**：保持 `official-tables.json` 单源（RRClaw 的 9 条键不一致就是双源代价）。
4. **不改字段类型降级策略**：深瞳「降级为文本保表建出来」优于 RRClaw「跳过留人工」。
5. **不动语识别配置与抖音转写端点**（历史遗留，与本方案无关）。

---

## 九、验收清单（手工，发版前走一遍）

1. 一键组队（旗舰版）后，打开中书省 SOUL：能看到「战略方向文档」一行且链接是真实飞书 URL（不是 `{{FEISHU_DOC:…}}` 占位符）。
2. 在飞书里把战略文档的「战略目标」改一句话 → 新建一道旨意 → 编排日志里中书省方案应体现新目标。
3. 飞书平台页「战略方向文档」卡片可点开；`official-tables.json` 与 SOUL 里链接一致。
4. 官署详情 → 飞书表 tab：每个官署显示自己 N 张 + 共享矩阵，链接可打开。
5. 完成一道旨意后，对应官署的飞书表出现一条新记录（批次④生效后）。
6. 重复点「一键创建」不再多建 Base/表（沿用既有幂等）。
7. `npm run typecheck` 0 错误；`npm run test` 全过。

---

## 十、风险与回滚

| 风险 | 影响 | 缓解 |
|------|------|------|
| 战略文档读取耗时/失败拖慢编排 | 每节点多一次网络调用 | TTL 缓存 + 失败不阻塞（prompt 里注明未接入） |
| 扩表后与既有 `official-tables.json` 存量数据冲突 | 老用户表清单被覆盖 | `getOfficialTables` 保持「用户配置优先、缺省回退规范」，不删用户已存条目 |
| 打开 flows 服务引入新风控/依赖问题 | 编排稳定性 | 批次④用 best-effort 写入（失败只 warn），并可先只切 `storage_backend` 不动其他 |
| 蓝本重写导致用户自定义 SOUL 丢失 | 用户资产 | 启动引导已是「每次从蓝本重渲染」，用户自定义走技能市场，维持现状 |

---

## 附录 A：RRClaw 关键证据路径

- 角色 SOUL 蓝本（15 份）：`E:\开界\RRClaw\resources\resources\feishu\V2.0\*_SOUL.md`
- 战略文档模板（10 节 / 624 行）：`V2.0\战略方向文档_模板.md`
- 占位符映射表（含 9 条不一致清单）：`V2.0\落地配置模板\飞书占位符映射表.md`
- 建表配置（11 中心 / 46 表）：`创建多维表格\bitable_config.json`
- 建表脚本：`创建多维表格\create_feishu_bitable.py`
- 工具箱说明与能力索引：`resources\preinstalled-skills\agent-tool-box\SKILL.md`
- 工作流与战略文档消费方：`agent-tool-box\功能说明表.md`
- 落地 5 步：`V2.0\造造天幕AI运营团队落地使用指南.md`（§四 数据资产全景 / §五 落地路径 / §六 配置模板 / §七 障碍规避）
- 绑定与建表逻辑：`resources\app.asar`（`wA()` / `yA()` / `Pa()` / `gd()` / `Pe` / `pA` / `hi` / `PA`）

## 附录 B：深瞳关键证据路径

- 表清单与占位符渲染：`desktop/electron/main/official-detail.ts`
- 建表与映射：`desktop/electron/main/feishu-bitable.ts`
- 飞书客户端：`desktop/electron/main/feishu-client.ts`
- 战略文档：`desktop/electron/main/strategic-doc.ts`
- 官署执行与 SOUL 注入：`desktop/electron/main/edict-bridge.ts`
- 编排与节点 prompt：`desktop/electron/main/edict-orchestrator.ts`
- Hermes 工具集（`no_mcp`）：`desktop/electron/main/hermes-config.ts:46`
- 一键组队与定时任务：`desktop/electron/main/team-preset.ts`、`team-ipc.ts`
- flows 模块与飞书数据层：`desktop/resources/service-registry/modules/flows/`
- MCP 工具箱：`desktop/resources/service-registry/modules/unified-toolbox/registry.yaml`
---

## 十一、执行记录（2026-09-13 实施，逐批可核）

### 11.1 批次落地状态

| 批次 | 内容 | 状态 | 主要落地文件 |
|------|------|------|--------------|
| ① | 战略文档进 SOUL | 已完成 | `profiles/zhongshu.md`（读写行 + 铁律）、`edict-bridge.ts`（`EDICT_PROFILE_DESC` 补 `taizi`） |
| ② | 战略文档实时读取 | 已完成 | `feishu-client.getDocxRawContent`、`strategic-doc.readStrategicDoc`（TTL 5 分钟）、`edict-orchestrator`（中书省 4000 字 / 尚书省 800 字）、`index.ts` 注入 `readStrategy` |
| ③ | 扩表 + 共享矩阵 | 已完成 | 规范 14 → 23 张表、`official-detail.ts`（1 官署 N 表 + 6 张共享表 + 权限归一）、`feishu-bitable.ts`（envKey/owner 映射 + `ensureFields` 补列）、12 份蓝本表格章节重写 |
| ④ | 官署产出落飞书 | 已完成（4A 变体） | 新增 `feishu-board-writer.ts`（只写 TEXT 列）、`edict-orchestrator.syncTaskToFeishu`（best-effort）、`index.ts` 注入 `syncTaskToFeishu` |
| ⑤ | 预填 + 定时任务 | 已完成 | 新增 `关键词种子.json` + `seedTemplates` 接线（修 G8）、`strategic-doc.recordInitialVersion`（战略表 V1.0）、`team-ipc.DEFAULT_CRONS` 13 → 44 条 |
| ⑥ | 文档同步 | 已完成 | `落地配置模板.env.example`（24 个 FEISHU_* 键）、新增《飞书占位符映射表.md》、`docs/desktop-运行逻辑与使用流程-20260913.md` 第十二节 |

**仍不采纳的两条**（与原方案一致）：不给官署开 Hermes 工具（`no_mcp` 不变，避免输出截断）；不打开 flows 服务（`patch.yaml: disabled: true` 保持）。但 flows 侧的落表映射与凭证注入已按批次⑦接线完成——将来只需把 `storage_backend` 切成 `feishu`，无需再补映射代码。

### 11.2 批次⑤剩余项：定时任务节拍 13 → 44 条

抽取方式：从 RRClaw 14 份 `*_SOUL.md` 抽出全部反引号包裹的 5 段 cron（共 38 条，去重后 31 个时刻），按职责映射到深瞳 12 官署，落到 `desktop/electron/main/team-ipc.ts` 的 `DEFAULT_CRONS`。

| RRClaw 节拍（角色 · 时刻 · 动作） | 深瞳落点 |
|-----------------------------------|----------|
| CEO · 06:00 · 读战略→KPI 表 | 钦天监·KPI 基线测算 06:00（+ 早朝·每日简报 06:00） |
| CEO · 06:15 · 读战略+关键词总表 | 中书省·战略要点同步 06:15 + 礼部·关键词规划 08:45 |
| CEO · 20:00 · 战报计算 | 尚书省·每日战报汇总 20:00 |
| CEO · 周日 20:00 · 战略迭代 | 中书省·战略复盘迭代 周日 20:00（+ 中书省·战略表版本留痕） |
| 秘书助理 · 06:30 / 19:30 · 内容收集 / 每日汇总 | 太子·每日任务分拣 06:30 / 太子·晚间旨意收口 19:30 / 尚书省·当日产出归档 19:30 |
| 爆款情报官 · 08:30 / 09:00 · Top50 采集 / 监控博主转写 | 礼部·爆款采集 09:00（flow `traffic-collect-hot-videos`）/ 礼部·监控账号采集 09:15 |
| 爆款内容策略官 · 09:30 · 策略拆解 | 深瞳无该岗 ⇒ 并入礼部·数据采集 08:30 + 爆款采集表结构字段 |
| 短视频剪辑官 · 09:45 · 短视频剪辑 | 深瞳无该岗 ⇒ 并入工部·文案二创 10:00 与工部·内容生产表 |
| 流量操盘手 · 07:00 / 08:30 / 09:00 / 09:45 / 10:30 / 12:15 / 18:00 / 21:00 / 22:00 | 中书省·每日方案规划 07:00 / 工部·每日海报 08:30（flow）/ 礼部·爆款采集 09:00 / 工部·文案二创 10:00（flow）/ 兵部·渠道采集与线索分级 10:00 / 工部·午间朋友圈 11:30 / 工部·晚间朋友圈 18:00 / 钦天监·趋势预测 21:00 / 钦天监·每日复盘 22:00 |
| 流量增长官 · 10:30 · 增长动作 | 礼部·数据采集 08:30（合并） |
| 渠道经理 · 03:00（每 3 天）· 低效话术淘汰 | 刑部·低效话术淘汰 03:00（日域不支持 `*/3`，落地每日，语义写进描述） |
| 渠道经理 · 08:45 · 关键词分析 | 礼部·关键词规划 08:45 |
| 渠道经理 · 10:00 · 渠道采集 | 兵部·渠道采集与线索分级 10:00 |
| 渠道经理 · 14:00 / 15:45 · 两轮私信 | **不建自动 cron**：flow `channel-multi-round-dm` 需 `contact` 参数，定时器无参可跑；改由下旨时按 flow 触发（风控闸门保留） |
| 数据分析师 · 21:00 / 22:00 · 复盘 / 预测 | 钦天监·趋势预测 21:00 / 钦天监·每日复盘 22:00 |
| 销售经理 · 10:30 / 11:10 / 15:30 / 18:30 | 兵部·渠道采集与线索分级 10:00 / **11:10 私信不建 cron（同渠道经理理由）** / 兵部·晚间客户复盘 18:15 / 兵部·每日销售日报 18:30 |
| 新媒体运营 · 07:40 / 11:30 / 18:00 / 19:00 | 工部·早间朋友圈 07:40 / 午间 11:30 / 晚间 18:00 / 工部·公众号定时发布 19:00（+ 工部·公众号文章 11:00 flow） |
| 账号运营官 · 07:00 / 12:15 / 18:00 | 与新媒体运营同刻合并为工部三条朋友圈节拍 |
| 客户成功经理 · 09:15 / 周一 10:15 / 14:30 / 17:30 | 兵部·社群服务推送 09:15 / 兵部·客户健康度巡检 周一 10:15 / 兵部·社群与私域答疑 14:30 / 兵部·答疑日报 17:00 |
| （对标 24 小时节拍起点 00:00 数据沉淀） | 钦天监·数据沉淀 00:00 |

**深瞳自有补充节拍**（对标无对应角色，但深瞳三省六部需要）：门下省·驳回件复检 16:00、尚书省·午间进度巡检 13:30、中书省·当日方案交账 19:00、吏部·官署产出考核 22:30、户部·算力消耗对账 21:45、兵部·晨间客户清单 06:45、兵部·早间私域推送 08:00（flow）、刑部·合规抽检 15:00（原有）。

**三条不照抄的原因**（写清楚，避免下次误以为漏抄）：
1. 私信类定时器（渠道/销售共 3 条）：高风险动作且 flow 需业务参数，无参定时会直接失败 ⇒ 保留为「下旨触发」。
2. `*/3` 日域表达式（1 条）：深瞳定时后端只支持 `daily + runTime(+weekday)` ⇒ 落地每日 03:00，语义写入任务描述。
3. 同刻重复绑定（18:00 出现 3 次、07:00 出现 2 次等）：深瞳按官署去重合并，避免同一官署多张任务卡重复跑。

### 11.3 验证结果

- `npm run typecheck`：**0 错误**。
- `npm run test`：**103 套件 / 960 用例全过**（基线 101 套件 / 927 用例）；批次⑦追加后为 **104 套件 / 968 用例全过**（见 11.4）。
- 新增护栏测试：`tests/unit/team-crons.test.ts`（12 官署覆盖、≥40 条、cron 表达式合法、flow 类必须指向 flows 模块已注册的业务流以防悬空 flowId、关键节拍齐备、周期任务星期域）、`tests/unit/feishu-board-writer.test.ts`（10 例）。

### 11.4 批次⑦（追加）：flows 落点接线 + 前端可见性

原方案里「4A 变体不走 flows」只覆盖了编排器直写，flows 侧的映射留成了文档。本轮把这块补齐并修掉一个会静默失效的缺陷：

| # | 问题（改前） | 处置（改后） | 落地 |
|---|--------------|--------------|------|
| 1 | `service-manager.syncFlowsConfigFile()` 把 `storage_feishu.tables` 写成 **envKey → table_id**（如 `FEISHU_CONTENT_TABLE`），而 flows 的 `FeishuStore` 按 **collection**（`content_assets`）查表 ⇒ 开关一打开就「有映射却找不到表」，storage 报不可用 | 新增映射层 `flows-feishu-map.ts`（14 个 collection ↔ envKey，多对一），config 与 env 都按 collection 建键 | `desktop/electron/main/flows-feishu-map.ts`、`service-manager.ts` |
| 2 | 只写 config、不注入 env ⇒ 走 `FLOWS_FEISHU_*` 的路径拿不到 app token | 启动 flows 时注入 `FLOWS_FEISHU_APP_TOKEN` / `FLOWS_FEISHU_TABLES`（`buildFlowsFeishuEnv`），与 config 合并时 config 优先、互不覆盖 | 同上 |
| 3 | `saveOfficialTables()` 保存时丢弃 `owner` / `shared` ⇒ 用户在「飞书表」tab 点一次「保存链接」，共享关系与主写官署就被抹掉 | 持久化 `owner`（经 `isSafeAgentId` 校验）与 `shared` | `desktop/electron/main/official-detail.ts` |
| 4 | 主写官署自己的页面看不到「这张表是全员共享的」（共享矩阵是叠加信息，之前只在「本官署没有该 envKey」时才补） | `getOfficialTables()` 用共享矩阵做叠加：所有官署都能看到共享标记与规范 owner，权限仍按 owner 归一 | 同上 |
| 5 | 前端类型缺 `owner` / `shared`，官署详情页无法展示共享关系 | 补 `EdictOfficialTable.owner/shared`；「飞书表」tab 新增「归属」列（共享/专属 + 主写官署），专属表排前、共享表排后 | `electron/shared/edict-types.ts`、`src/pages/TaskCenter/OfficialTablesTab.tsx`、`edict-data.orderOfficialTables` |

**验收**：`npm run typecheck` 0 错误；`npm run test` **104 套件 / 968 用例全过**（新增 `flows-feishu-map.test.ts` 5 例、`orderOfficialTables` 1 例、official-detail 保存保真 2 例）。