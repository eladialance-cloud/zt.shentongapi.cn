# 修复方案：飞书多维表格（复用 / 建表失败 / 状态丢失 / 链接打不开 / 战略文档）

> 日期：2026-09-13 ｜ 分支：`upgrade/electron-41`
> 来源：用户实测反馈 4 个问题 + 1 个提问，全部已在代码中定位到根因。
> 状态：**已确认并实施完毕**（2026-09-13）。拍板：战略文档选 **A（交中书省牵头）**；实际改动见第七节。

---

## 一、问题与根因（先看清楚）

### 问题 1：每点一次「一键创建多维表格」就多建一个工作台

- `desktop/electron/main/feishu-bitable.ts:199` `initBitable()` **无条件**调用 `client.createBitableApp()`，没有先查是否已建过。
- 同文件 `BITABLE_STATE_FILE = "feishu-bitable.json"`：`writeState()` 有写，**全仓库没有任何地方读它**。
- 结论：反复点 → 飞书里堆多个空壳工作台；官署表链接被最后一次覆盖。

### 问题 2：「军机处·任务主表」建不出来

- 规范文件 `desktop/resources/edict/data/多维表格字段设计规范.md` 里，**只有这一张表**用了 `RELATE`（关联）字段，共 4 个：`flow_log` / `progress_log` / `todos` / `official_outputs`。
- `feishu-bitable.ts:25` 把 `RELATE` 映射为飞书字段 type `18`，建表时只传 `{ field_name, type }`。
- 飞书开放平台规定：**关联字段必须带 `property.table_id`（关联到哪张表）**，规范里没写 → 该字段非法 → 建表请求整体被拒 → **整张表没建出来**。
- 同类风险：`户部 · 财务收支表` 有 1 个 `FORMULA`（公式，type 20），公式字段必须带 `property.formula_expression`，同样会整表失败。
- 其余 12 张表只用 TEXT/SELECT/NUM/DATE/CHECK/USER/FILE/MULTI/LINK，不需要额外参数，所以能建出来。

### 问题 3：创建完多维表格，关掉页面再回来就"没有了"

- `src/pages/Settings/FeishuPlatform.tsx:98-112`：`appUrl` / `rows` / `failed` 全是**组件内存 state**，没持久化、也没在进入页面时读取。
- `feishu-settings.ts` 的 `feishu:get-settings` 只返回 `{configured, appId, hasSecret}`，**不含工作台地址**。
- 结论：页面一卸载，刚建的工作台链接就看不见了（飞书上其实还在）。

### 问题 4：任务中心 → 官署详情 → 飞书表，链接能显示但点不开

- `src/pages/TaskCenter/OfficialTablesTab.tsx`「飞书链接」那一列渲染的是 **`<Input>`（可编辑输入框）**，不是可点击链接。
- 也就是说：那格是给人「手填/粘贴」用的，本来就没有"打开"能力。

### 问题 5（提问）：战略文档归谁管？在哪创建？

**如实回答，这是个"写了没接线"的坑：**

1. 老系统里「战略文档」是 **CEO 角色的一条业务流程**（`ceo-strategy-doc`，见 `desktop/resources/service-registry/modules/flows/capabilities/ceo.py`），**不属于三省六部任何一个官署**。
2. 新版「一键组队」界面上写着第 4 步「生成战略文档」（`src/pages/Settings/TeamPreset.tsx:57`、`team-preset.ts:205`），但 `createStrategicDoc` 这个依赖**在 `index.ts:841` 注册 Team IPC 时压根没传**。
3. 代码逻辑是 `if (deps.strategicDoc) { 执行 }` —— 没传 ⇒ **这一步从来没执行过**，属于"界面写了、实现没接"。

---

## 二、改法

### 修复 1：已建过就复用（核心诉求）

- `initBitable()` 开头新增「先查再建」：
  1. 读 `feishu-bitable.json` 里的 `appToken`；
  2. 有 → 调 `client.listTables(appToken)` 拿现有表清单；
     - 规范里的表**已存在** → 复用（取 `table_id`、拼 URL，不重建）
     - **不存在** → 新建
     - 全部齐全 → 直接返回 `reused: true`，不调任何写接口
  3. 没记录 / `appToken` 失效（工作台被删或没权限）→ 走新建。
- 返回值 `BitableInitResult` 增加 `reused`、`appToken`、`appUrl`、`createdCount`、`reusedCount`，UI 上能区分"新建了 N 张 / 复用 M 张"。
- 新增可选参数 `force?: boolean`：只有用户明确点「重建工作台」时才无条件新建。
- 规避"孤儿工作台"：默认路径下**不会**再产生新的多维表格应用。

### 修复 2：让 14 张表都能建出来

- 在 `feishu-bitable.ts` 增加「需要飞书额外参数、但规范没给」的类型降级表：
  - `RELATE`（18）→ 文本（1），字段保留、值当文本存，不再让整表失败
  - `FORMULA`（20）→ 文本（1）
  - `LOOKUP`（19）→ 文本（1）（规范当前没用，先兜住）
- `ParsedField` 增加 `requestedType`（规范原本要的类型）与 `degraded`（是否降级）两个字段，方便界面/日志看到"这列本来想要关联，被降级成文本了"。
- 同时在 `多维表格字段设计规范.md` 的「字段类型说明」章节补一句备注：关联/公式字段需人工在飞书里改成对应类型。
- 建表**逐字段重试兜底**：若整表因某个字段被拒，退化为"先用最小字段集建表，再逐个补字段"，把失败范围从"整张表"缩小到"单个字段"。

### 修复 3：工作台状态持久可见

- 新增 IPC `feishu:get-bitable`：读 `feishu-bitable.json` 返回 `{ok, appToken, appUrl, createdAt, tables, failed}`（没有记录时 `ok:true` + 空值，不是报错）。
- `FeishuPlatform.tsx` 进入页面时调用它；有记录就渲染「已有工作台」卡片（打开按钮 + 表清单 + 创建时间）。
- 按钮文案随状态变化：没有 → 「一键创建多维表格」；已有 → 「补齐缺失的表」+ 次要按钮「重建工作台」（走 `force`，带二次确认）。
- 全部"打开"动作统一走 `window.electronAPI.app.openExternal(url)`（系统浏览器），不再用 `window.open`。

### 修复 4：飞书表链接可点击

- `OfficialTablesTab.tsx` 的「飞书链接」列改为：输入框（仍可编辑）+ 「打开」按钮 + 「复制」按钮。
- 无链接时「打开」禁用，并显示提示「未回填」。
- 打开同样走 `electronAPI.app.openExternal`，`window.open` 兜底。

### 修复 5：战略文档 —— **需要你拍板（见第三节）**

---

## 三、拍板的 1 个点（已确认：选 A）

| 选项 | 做法 | 说明 |
| --- | --- | --- |
| **A（我推荐）** | 把「生成战略文档」这一步**接上**，交给**中书省**牵头 | 中书省的定位就是「方案起草人」（`profiles/zhongshu.md:11`），战略/规划类产物最贴它的职责；产物落飞书云文档 + 在任务主表登记一条 |
| B | **删掉**这一步 | 界面不再显示"生成战略文档"，等以后真要做再加；改动最小、不糊弄用户 |
| C | 交给**太子** | 太子负责分拣与汇总，偏"入口"而非"规划"，我认为不太贴 |

**结论（2026-09-13 确认：选 A）**：接上「生成战略文档」这一步，交给**中书省**牵头 —— 中书省牵头创建/维护飞书云文档《深瞳AI · 战略方向文档》，链接回填到中书省的飞书表清单（envKey `FEISHU_STRATEGY_DOC`），SOUL 里用 `{{FEISHU_DOC:战略方向文档}}` 占位，并在 `profiles/zhongshu.md` 的职责表里写明。

---

## 四、影响面与风险

| 风险 | 说明 | 处理 |
| --- | --- | --- |
| 已有工作台的机器 | 升级后第一次建表会走"复用"分支 | 默认就是复用，符合预期 |
| 旧记录表名对不上 | 规范改过名（如「早朝简报·每日简报素材表」）时会被判定为"不存在"从而新建 | 复用判断同时按**规范化表名**匹配，降低误建概率 |
| 降级成文本的字段 | 军机处的 4 个关联列、户部的 1 个公式列失去原生能力 | 表结构和数据都在；用户可在飞书里手动改类型；规范 md 会写明 |
| `appToken` 失效 | 工作台被删/换账号 | 走新建，并提示"原工作台不可访问"；不静默 |

---

## 五、验证清单

**自动化（必须全绿）**
- [x] `npm run typecheck`（desktop）—— 通过
- [x] `npm run test`（jest）—— 101 套件 / 927 用例全过（基线 99 / 914）
- [x] `npm run build`（desktop）—— 通过

**新增单测**
- [x] `initBitable` 复用：已有 appToken + 表齐全 ⇒ 不调 `createBitableApp`（`feishu-bitable-reuse.test.ts`）
- [x] `initBitable` 补齐：已有工作台但缺 1 张表 ⇒ 只建那 1 张
- [x] `force=true` ⇒ 忽略记录新建；已保存工作台不可访问 ⇒ 自动回退新建
- [x] `RELATE` / `FORMULA` / `LOOKUP` 降级：`degraded=true` 且 `type=1`
- [x] 字段级兜底：整表被拒时仍能建出表，坏字段只丢自己
- [x] `readBitableState` 无记录 / 损坏 ⇒ `null`，不抛错
- [x] `strategic-doc`：首建 / 复用 / 取根目录失败仍可建 / 建失败不写记录（`strategic-doc.test.ts`）

**手工验收**
1. 已有工作台时再点一次 ⇒ 飞书里**不再多出**新工作台，提示"复用 N 张"。
2. 军机处·任务主表 / 户部·财务收支表都能出现在飞书表清单里。
3. 建完关掉页面再进入 ⇒ 「已有工作台」卡片和链接还在。
4. 官署详情 → 飞书表 ⇒ 点「打开」能用系统浏览器打开表。

---

## 六、不做的事（本次范围外）

- 语音识别相关配置（你说先不操作）
- 飞书表字段的自动纠错（比如把文本列改回关联列）——飞书 API 对已有字段改类型限制多，交给你手动

---

## 七、实施记录（2026-09-13）

### 修复 1：已建过就复用

| 文件 | 改动 |
| --- | --- |
| `desktop/electron/main/feishu-bitable.ts` | 新增 `readBitableState`；`initBitable` 改为「先查再建」：读 `feishu-bitable.json` → `listTables` → 表齐全直接复用、缺哪张建哪张；新增 `force` 参数；返回值加 `reused` / `createdCount` / `reusedCount` / `droppedFields` |
| `desktop/electron/main/feishu-client.ts` | 新增 `createField`（字段级兜底用） |
| `desktop/electron/main/feishu-settings.ts` | `feishu:init-tables` 支持 `{force}`；新增 `feishu:get-bitable` 通道 |
| `desktop/electron/shared/ipc-channels.ts`、`preload/index.ts`、`shared/types.ts` | 同步通道、`getBitable()`、`initTables(options)` 与类型 |
| `desktop/electron/main/index.ts` | `initFeishuBitable` 透传 `force`；注册 `getBitable` |

### 修复 2：14 张表都能建出来

| 文件 | 改动 |
| --- | --- |
| `desktop/electron/main/feishu-bitable.ts` | 新增 `NEEDS_PROPERTY_FIELD_TYPES`（18/19/20）与 `degradeFieldType`：RELATE / LOOKUP / FORMULA 统一降级为文本；`ParsedField` 增加 `requestedType` / `degraded`；新增 `createTableWithFallback`：整表被拒 ⇒ 先建主字段拿到 table_id，再逐字段补，坏字段只记进 `droppedFields` |

### 修复 3：工作台状态持久可见

| 文件 | 改动 |
| --- | --- |
| `desktop/src/pages/Settings/FeishuPlatform.tsx` | 进页面读 `getBitable()` 渲染「已有工作台」卡片（打开 / 复制 / 创建时间 / 被拒字段）；按钮文案按状态切换（`一键创建多维表格` ↔ `补齐缺失的表`）；新增「重建工作台」（二次确认后走 `force`）；所有外链改走 `electronAPI.app.openExternal` |

### 修复 4：飞书表链接可点击

| 文件 | 改动 |
| --- | --- |
| `desktop/src/pages/TaskCenter/OfficialTablesTab.tsx` | 「飞书链接」列改为「输入框 + 打开 + 复制」；无链接时按钮禁用并提示「尚未回填链接」；打开走系统浏览器 |

### 修复 5：战略文档交给中书省（选 A）

| 文件 | 改动 |
| --- | --- |
| `desktop/electron/main/strategic-doc.ts`（新增） | `createOrReuseStrategicDoc`：已有记录复用；否则建 docx（标题《深瞳AI · 战略方向文档》）+ 写 6 条初始提纲 + 落盘 `strategic-doc.json` + 回填中书省表清单 |
| `desktop/electron/main/feishu-client.ts` | 新增 `appendDocxText`（给云文档写初始提纲） |
| `desktop/electron/main/official-detail.ts` | `DEFAULT_OFFICIAL_TABLES.zhongshu` 增加 `FEISHU_STRATEGY_DOC` 条目 |
| `desktop/electron/main/index.ts` | 接上 `createStrategicDoc`（一键组队第 5 步不再空转），创建后重写中书省 SOUL 让占位符变成真实链接 |
| `desktop/resources/edict/profiles/zhongshu.md` | 工作职责新增「战略方向维护」一行 |

### 手工验收（发版后请走一遍）

1. 已建过工作台时再点一次 ⇒ 飞书里**不再多出**新工作台，提示「复用 N 张」。
2. 军机处·任务主表 / 户部·财务收支表都能出现在飞书表清单里。
3. 建完关掉页面再进入 ⇒ 「已有工作台」卡片与链接还在。
4. 官署详情 → 飞书表 ⇒ 点「打开」能用系统浏览器打开表。
5. 一键组队后，飞书平台页出现「战略方向文档（由中书省牵头维护）」卡片，点开是云文档而不是空链接。
