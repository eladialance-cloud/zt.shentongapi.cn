# 修复方案：AI 办公室名册 + 官署套餐（编制）一致性

> 日期：2026-09-13 ｜ 分支：`upgrade/electron-41` ｜ 线上桌面端：2.1.2
> 范围：两块一起修 —— ① AI 办公室（上一轮对话的「方案 A」）② 官署套餐与任务中心不一致（本轮「方案 A」）
> 依据：全部为代码实测，路径与行号可在仓库直接打开核对。
> 状态：**已确认并实施完毕**（2026-09-13）。三个拍板点按推荐执行；实际改动清单见第十节。

---

## 〇、一句话目标

修完之后：

1. **AI 办公室**：有 12 个工位，你建了几个官署就显示几个人；没建官署时不再出现「王明、李研」这类假员工。
2. **官署套餐**：你在「一键组队」选了轻量版，任务中心就**只显示这 5 个官署**；重启不会长回来；活也只会派给这 5 个。

---

## 一、现状与根因（先看清楚为什么会这样）

### 1.1 官署套餐问题：两个 Bug 叠在一起

**Bug 1 ｜界面写死 12 个官署，不读实际装了哪几个**

| 位置 | 现象 |
| --- | --- |
| `desktop/src/pages/TaskCenter/edict-data.ts:79` | `OFFICIAL_META` 写死 12 个官署 |
| `desktop/src/pages/TaskCenter/edict-data.ts:138` | `buildOfficialCards` 按这 12 个逐个画卡片，**从不隐藏** |
| `desktop/src/pages/TaskCenter/edict-data.ts:94` | `OFFICIALS_COUNT = 12` |
| `desktop/src/pages/TaskCenter/index.tsx:503` | 军机处标签角标直接用它 → 永远显示 12 |
| `desktop/src/pages/TaskCenter/panels-data.ts:17` | `DEPTS` 写死 11 个（不含钦天监） |
| `JunjiView.tsx:247`、`CourtDiscussion.tsx:278`、`MonitorPanel.tsx:223`、`SessionsPanel.tsx:34`、`CourtCeremony.tsx:117` | 全部遍历上面两份写死的列表 |
| `desktop/electron/main/edict-orchestrator.ts:232` | `edictOfficials` 返回全量 `OFFICIALS`，只用任务算忙/闲，不判断是否安装 |

被删掉的官署拿不到实时状态，于是永远显示「空闲 · 0 任务」——**不是没删，是界面假装它还在**。

**Bug 2 ｜删掉的官署，下次启动被重建**

| 位置 | 行为 |
| --- | --- |
| `desktop/electron/main/team-ipc.ts:229` | 选套餐时 `removeOfficial` 只删了 5 个/9 个以外的 profile 目录 + 定时任务（这步没问题） |
| `desktop/electron/main/index.ts:860` | 每次启动调用 `ensureEdictHermesProfiles()` —— **不传参数** |
| `desktop/electron/main/edict-bridge.ts:177` | 不传参数 ⇒ `targets = EDICT_PROFILE_IDS`（全集 11 个），缺哪个建哪个，还重写 SOUL |
| `desktop/electron/main/edict-bridge.ts:212` | `syncHermesProfileConfigs(hermesHome, EDICT_PROFILE_IDS)` 会 `mkdirSync` 出全部 11 个 profile 目录（`hermes-config.ts:249`）——**即使不建 profile，目录也会被建出来** |

⇒ 结论：套餐切换的「删」只能活到下次重启。

**Bug 3 ｜套餐选择根本没被记住**

`desktop/electron/main/team-ipc.ts:308`：`lastResult` 只是个内存变量，App 一退出就没了。这台机器自己都不记得你选过什么套餐。
界面（`desktop/src/pages/Settings/TeamPreset.tsx`）也只列套餐编制，不显示「当前装了什么」。

**Bug 4 ｜派发会派给没装的官署**

| 位置 | 行为 |
| --- | --- |
| `edict-orchestrator.ts:250-258` | `resolveExecuteDept` 兜底**写死「户部」** |
| `edict-orchestrator.ts:297` | 给尚书省的提示词写死候选六部（含户部/礼部/刑部/吏部） |

轻量版编制是「太子·中书省·尚书省·兵部·工部」——**不含户部**。所以轻量版用户的旨意只要兜底，就会派给一个不存在的官署 ⇒ 执行失败。
这大概率就是当初加「启动时无脑补全 11 个 profile」的原因：为了不让派发崩。所以修 Bug 2 必须同时修 Bug 4，否则会把「显示不一致」换成「任务失败」。

### 1.2 AI 办公室问题

| 位置 | 现象 |
| --- | --- |
| `desktop/src/pages/Office/scene/layout/officeLayout.ts` | `DESK_COLS=2 / DESK_ROWS=3` ⇒ **只有 6 个工位**；`AGENT_ROSTER` 是 6 个写死的假员工（王明/李研/周理/陈书/刘市/赵审） |
| `desktop/src/pages/Office/scene/OfficeScene.ts` 的 `setRoster` | 遍历现有 6 个 agent，**第 7 个开始直接丢弃**；缺的显示「待命」 |
| `desktop/src/pages/Office/store/officeStore.ts` 的 `buildAgentsFromMembers` | `.slice(0, INITIAL_AGENTS.length)` ⇒ 一样卡在 6 |
| `OfficeIntegrated.tsx:104` | 拿不到团队数据时回退 `DEFAULT_ROSTER`（那 6 个假员工） |

⇒ 旗舰版 12 官署，办公室也只显示 6 个人；没建官署时显示 6 个假人，看着像 deman。

---

## 二、目标行为（修完之后应该是什么样）

1. 一台机器有一个**唯一的「编制」定义**：由你最近一次「一键组队」选的套餐决定，落盘保存，重启不变。
2. 任务中心所有官署列表、角标数字、三省六部面板，**只显示编制内的官署**；编制外的收进一个「未启用」折叠区（可展开查看，默认收起）。
3. 启动引导只**补齐编制内**官署的 profile/SOUL/config；**不再**为编制外官署创建目录。
4. 派发（中书 → 门下 → 尚书 → 六部）**只在编制内路由**；兜底部门改成「编制内的默认执行部门」，不再是写死的户部。
5. 一键组队页面显示「当前编制：5 个官署（轻量版）」+「已装：5 个」，选完能立刻看出效果。
6. AI 办公室工位扩到 12；没有成员时显示空态引导，不再出现假员工名册。
7. 名称统一：`zaochao` 统一叫「司礼监」，`qintianjian` 统一叫「钦天监」（现在 `panels-data.ts:17` 把 `zaochao` 叫成「钦天监」，和 `qintianjian` 撞名）。

---

## 三、改动清单

### 3.1 新增「编制」真相来源（主进程）

- **新增** `desktop/electron/main/edict-roster.ts`
  - `getRosterPath()` → `<userData>/edict-roster.json`
  - `readRoster(): { presetId, officials: string[], updatedAt } | null`
  - `writeRoster(presetId, officials)` （原子写：先写 `.tmp` 再 rename）
  - `resolveRoster(fallback = ALL_OFFICIALS)`：没有落盘记录时**回退为全集**（兼容老用户，不改变现状）
- **修改** `desktop/electron/main/team-ipc.ts`
  - `triggerTeamCreation` 成功后（第 318 行后）调用 `writeRoster(presetId, preset.officials)`；失败不写。
  - 新增 IPC：`team:current-roster` → `{ ok, presetId, officials, installed }`（`installed` 复用 `listInstalledOfficials`，见 `team-ipc.ts:93`）。
  - `team:list-presets` 返回值增加 `currentPresetId`、`installedOfficials`，供界面显示。
- **修改** IPC 白名单：`desktop/electron/shared/ipc-channels.ts:91` 附近加 `'team:current-roster'`；`desktop/electron/preload/index.ts` 加对应 `invoke`。

### 3.2 启动引导只补编制内（主进程）

- **修改** `desktop/electron/main/edict-bridge.ts`
  - `ensureEdictHermesProfiles(ids?)`：`targets` 的兜底从 `EDICT_PROFILE_IDS`（全集）改为 `resolveRoster()` 的编制；`taizi` 需要特殊处理（它不在 `EDICT_PROFILE_IDS` 里，但属于编制，编制里含 taizi 时也建）。
  - 第 212 行 `syncHermesProfileConfigs(hermesHome, EDICT_PROFILE_IDS)` → 只同步编制内的 id（**这一行会自动建目录，必须一起改**）。
  - 第 214 行 `applyAgentModels(hermesHome, EDICT_PROFILE_IDS)` → 同样收敛到编制内。
- **修改** `desktop/electron/main/index.ts:860`：明确传编制（或保持不传，由 `edict-bridge` 内部解析编制——推荐后者，调用点更少）。
- **保留**：编制外官署的 profile 目录**不主动删**（避免误删用户数据/飞书表引用）；只是不再创建、不再同步、界面不显示。

### 3.3 派发只在编制内（主进程）

- **修改** `desktop/electron/main/edict-orchestrator.ts`
  - `resolveExecuteDept` 兜底：不再是 `return { dept: "户部" }`，改为「编制内、且在 `ORG_AGENT_MAP` 里的第一个部门」，并优先工部（轻量版含工部）。若编制内没有任何六部，则回退当前行为并在返回值里标 `source: 'fallback'` + 提示文案。
  - 第 297 行尚书提示词的候选部门：按编制动态生成（`编制内六部 → 中文名`），编制外的不出现。
  - `edictOfficials()` 返回值增加 `inRoster: boolean` 字段（渲染层据此过滤，避免再写死）。
  - 建议同时给 `EdictOfficial` 类型加 `inRoster`（`desktop/electron/shared/edict-types.ts`）。

### 3.4 任务中心按编制显示（渲染层）

- **修改** `desktop/src/pages/TaskCenter/edict-data.ts`
  - 保留 `OFFICIAL_META` 作为「元数据字典」，但 `buildOfficialCards(officials, tasks, roster?)` 增加第三个参数：只产出编制内的卡片；编制外单独返回一组供折叠区使用。
  - `OFFICIALS_COUNT` 不再作为展示数字；改由实际卡片数决定（`index.tsx:503`）。
- **修改** `desktop/src/pages/TaskCenter/panels-data.ts`
  - `DEPTS` 保留为字典；新增 `deptsForRoster(roster)` 帮助函数，5 处消费点（`JunjiView.tsx:247`、`CourtDiscussion.tsx:278`、`MonitorPanel.tsx:223`、`SessionsPanel.tsx:34`、`CourtCeremony.tsx:117`）改为用它。
- **修改** `desktop/src/pages/TaskCenter/index.tsx`
  - 页面加载时拉 `team:current-roster`，存进 context/顶层 state，供各面板共享。
- **新增** 「未启用官署」折叠区（默认收起，展示原因「不在当前编制（轻量版）」+ 按钮「去一键组队调整」）。

### 3.5 一键组队页面显示当前编制（渲染层）

- **修改** `desktop/src/pages/Settings/TeamPreset.tsx`
  - 顶部显示：「当前编制：轻量版 · 5 个官署」「已装：5 个（与编制一致）」，不一致时用告警色提示「已装 11 个，多出 6 个不在编制内」+ 「按编制清理」按钮（可选，二次确认后调 `removeOfficial`）。

### 3.6 AI 办公室：12 工位 + 空态（渲染层）

- **修改** `desktop/src/pages/Office/scene/layout/officeLayout.ts`
  - 工位改 4 列 × 3 行（12 个），或按实际人数动态算 `rows = ceil(n / cols)`。推荐固定 4×3，保证 12 官署全放得下。
  - `AGENT_ROSTER` 保留但**降级为「空场景壳」**（不再带假名字/假任务）。
- **修改** `desktop/src/pages/Office/scene/OfficeScene.ts` 的 `setRoster`
  - 支持人数变化：多于现有工位时新增实体、少于时隐藏多余工位；不再丢弃第 7 个以后的成员。
  - 名字兜底改成「员工 N」而不是「待命」。
- **修改** `desktop/src/pages/Office/store/officeStore.ts`
  - `buildAgentsFromMembers` 去掉 `.slice(0, 6)`。
  - 名册来源优先「编制内官署对应的团队成员」，确保和任务中心口径一致。
- **修改** `desktop/src/pages/Office/pixi-office/OfficeIntegrated.tsx`
  - 空态（没有团队成员）：不渲染假员工，显示引导卡片「还没有官署，去创建 →」跳 `/settings`（一键组队页签）。
  - `DEFAULT_ROSTER` 回退逻辑改为「空名册」，只剩工位与空场景。

### 3.7 清理死代码（渲染层，31KB）

已确认全仓库无引用，可直接删：

- `desktop/src/pages/Office/pixi-office/OfficeScene.ts`（13.8KB，旧的第二套场景）
- `desktop/src/pages/Office/pixi-office/dataBridge.ts`（2.9KB）
- `desktop/src/pages/Office/pixi-office/ConfigPanel.tsx`（6.6KB）
- `desktop/src/pages/Office/pixi-office/types.ts`（2.5KB，仅被上面三个引用）
- `desktop/src/pages/Office/pixi-office/layout.ts`（1.7KB）
- `desktop/src/pages/Office/services/officeActionHttp.ts`（3.4KB，指向 `localhost:8765`，该端口全仓库不存在）
- `desktop/src/pages/Office/config/officeMode.ts`（0.6KB，仅被上面那个文件引用）

删除后跑 `npm run typecheck` 验证无缺失引用。

### 3.8 命名一致性

- `desktop/src/pages/TaskCenter/panels-data.ts:17` 的 `zaochao` label 从「钦天监」改为「司礼监」，与 `edict-orchestrator.ts:93`、`edict-data.ts:90` 对齐。

---

## 四、拍板的 3 个点（已确认：全部按推荐执行）

| # | 问题 | 推荐 | 理由 |
| --- | --- | --- | --- |
| 1 | 编制外的官署 profile，要不要**物理删掉**？ | **不删，只不显示** | 删了会破坏历史数据与飞书表引用；且你随时可能换回旗舰版 |
| 2 | 编制外的官署在任务中心怎么处理？ | **收进「未启用」折叠区**（默认收起） | 既不误导「它在干活」，也不让人以为数据丢了 |
| 3 | 轻量版兜底派发给谁？ | **编制内第一个六部**（轻量版 → 工部） | 户部不在轻量版编制里，写死户部必然失败 |

**结论（2026-09-13 确认，用户回复「照做」）**：三点全部按推荐执行 —— ① 编制外官署 profile 不物理删除，只是不显示；② 任务中心编制外收进「未启用」折叠区（默认收起）；③ 轻量版兜底派发给编制内第一个六部（轻量版 → 工部，因为户部不在轻量版编制内）。

---

## 五、兼容与风险

| 风险 | 说明 | 处理 |
| --- | --- | --- |
| 老用户升级 | 没有 `edict-roster.json` 的机器 | `resolveRoster` 回退全集 ⇒ 行为和现在完全一致，不会突然少东西 |
| 已有旨意/看板数据 | 编制收缩后，历史任务仍可能指向编制外官署 | 过滤器只影响「显示与新建派发」，不改历史数据；历史任务照常显示 |
| 飞书多维表格 | 编制外官署的表可能已创建 | 本方案不动飞书表 |
| 定时任务 | 编制外官署的定时任务已在选套餐时删除 | 保持现状；本次不新增删除逻辑 |
| 轻量版仍可能无六部 | 极端情况：编制内无任何六部 | 兜底回退当前行为 + 在任务抽屉里显式提示「当前编制无执行部门」 |

---

## 六、验证清单

**自动化（必须全绿）**
- [x] `npm run typecheck`（desktop）—— 通过
- [x] `npm run test`（jest）—— 99 套件 / 914 用例全过（基线 96 / 887）
- [x] `npm run build`（desktop）—— 通过

**新增单测**
- [x] `edict-roster.test.ts`：读写/丢失文件回退/原子写（7 例）
- [x] `edict-roster-dispatch.test.ts`：编制内兜底（轻量版 → 工部）、编制内无六部的回退
- [x] `edict-roster-ui.test.ts`：`buildOfficialCards(roster)` / `deptsForRoster` / 角标（16 例）
- [x] 一键组队落盘编目：创建成功后写入 `edict-roster.json`

**手工验收（关键）**
1. 选「轻量版」→ 一键组队跑完 → 任务中心只剩 5 个官署，角标显示 5，编制外收进折叠区。
2. **完全退出 App 再启动** → 仍然是 5 个（这是原来失效的那一步，必须验）。
3. AI 办公室显示 5 个工位有人、7 个空位；没有假员工名字。
4. 换「旗舰版」→ 显示 12 个、办公室 12 个工位有人。
5. 新建一道旨意走完全流程（收件 → 太子 → 中书 → 门下 → 尚书 → 六部 → 完成），确认派发落在编制内官署、不报错。
6. 未登录/无官署的机器：办公室显示空态引导，不显示「王明」。

---

## 七、发版步骤（做的时候按这个走）

1. **先对齐版本**：`desktop/package.json` 当前 2.1.1，线上是 2.1.2 ⇒ 必须先改成 **2.1.2**，CI 才会产出 2.1.3（CI 规则：patch ≥ 9 才进位，且不回写仓库）。
2. 提交（会触发 `Desktop Build`，因为路径命中 `desktop/**`）。
3. 等 CI 全绿 → 下载 artifact → 解压到 `E:\网页下载\desktop-windows-latest`。
4. 按 `deploy/DESKTOP-RELEASE-SOP.md` 发版：先传 exe + latest.yml → 服务器端生成 zip（必须带 `Setup` 前缀）→ 再跑发布 SQL（`--default-character-set=utf8mb4`，生产库 `shentong`，platform `win`）。
5. **顺序不可颠倒**：先传文件、后切数据库（历史上颠倒过一次，导致线上 404）。

---

## 八、执行顺序（建议分 4 批提交，每批可单独验证）

| 批次 | 内容 | 影响面 |
| --- | --- | --- |
| ① | 3.1 编制持久化 + IPC + 3.5 一键组队页显示 | 主进程 + 设置页，不改显示行为，风险最低 |
| ② | 3.2 启动引导 + 3.3 派发按编制 | 主进程核心链路，风险最高，必须连带手工验收第 5 条 |
| ③ | 3.4 任务中心按编制显示 + 3.8 命名 | 渲染层显示，影响「看起来对不对」 |
| ④ | 3.6 AI 办公室 12 工位 + 空态 + 3.7 死代码清理 | 渲染层，独立可验证 |

每批提交前跑一遍 typecheck + jest。

---

## 九、不做的事（本次范围外）

- 语音识别两处配置（你说先不操作）
- 个人设置「中文语音识别模型」死配置（同上）
- 抖音转写端点为空的默认值
- 仓库根目录脚手架残留（`_refs/`、`_sbx_*` 等）

---

## 十、实施记录（2026-09-13 完成）

### 批次① 编制持久化

| 文件 | 改动 |
| --- | --- |
| `desktop/electron/main/edict-roster.ts`（新增） | `ALL_EDICT_OFFICIALS`、`getRosterPath`、`readRoster`（缺失/损坏/空 ⇒ null）、`writeRoster`（原子写 tmp → rename）、`resolveRoster`（无记录 ⇒ 全集）、`isInRoster` |
| `desktop/electron/main/team-ipc.ts` | `TeamIpcDeps` 加 `userDataDir`；组队成功后落盘编制（失败仅 warn）；`team:list-presets` 增加 `currentPresetId` / `installedOfficials`；新增 IPC `team:current-roster` |
| `desktop/electron/shared/ipc-channels.ts`、`preload/index.ts`、`shared/types.ts` | 同步 `team:current-roster` 通道、`currentRoster()` 封装与类型 |
| `desktop/electron/main/index.ts` | 注册 Team IPC 时传入 `app.getPath('userData')` |

### 批次② 启动引导 + 派发按编制

| 文件 | 改动 |
| --- | --- |
| `desktop/electron/main/edict-bridge.ts` | `ensureEdictHermesProfiles(ids?, roster?)` 支持按编制建 profile；修掉原先硬传全集导致「mkdirSync 建出编制外目录」的问题；注入 `getRoster` |
| `desktop/electron/main/edict-orchestrator.ts` | 新增 `DEPT_FALLBACK_ORDER` / `DEPT_PROMPT_ORDER` / `rosterDepts`；`resolveExecuteDept` 只在编制内路由并兜底；`buildNodePrompt` 候选部门按编制动态生成；官署对象加 `inRoster` |
| `desktop/electron/shared/edict-types.ts` | `EdictOfficial` 加 `inRoster?` |

### 批次③ 任务中心按编制显示

| 文件 | 改动 |
| --- | --- |
| `desktop/src/pages/TaskCenter/roster.ts`（新增） | 编制缓存 + 订阅 + `useEdictRoster()`，无 electronAPI 时回退全集 |
| `TaskCenter/edict-data.ts`、`panels-data.ts` | `officialCount(roster?)`、`OfficialCard.inRoster`、`deptsForRoster()`；`zaochao` 由「钦天监」改名「司礼监」（原与 `qintianjian` 撞名） |
| `TaskCenter/CourtDiscussion.tsx`、`MonitorPanel.tsx`、`CourtCeremony.tsx`、`JunjiView.tsx`、`index.tsx` | 按编制渲染；编制外收进「未启用官署」折叠区（默认收起）；角标改按编制计数 |
| `src/pages/Settings/TeamPreset.tsx` | 编制摘要提示 + 「按编制清理」按钮；优先选中当前套餐 |

### 批次④ AI 办公室

| 文件 | 改动 |
| --- | --- |
| `Office/scene/layout/officeLayout.ts` | 工位 2 列 → 4 列（12 工位）；名册改为 12 个坐席模板，删除「王明/李研/周理/陈书/刘市/赵审」假员工 |
| `Office/scene/OfficeScene.ts` | `setRoster` 按人数增删坐席（上限 12），缺位不再伪造名字 |
| `Office/pixi-office/OfficeIntegrated.tsx` | 空编制显示「还没有 AI 员工 + 去一键组队」引导；人数以实际名册为准 |
| `Office/store/officeStore.ts` | 组建时不再截断到固定人数 |
| 删除 6 个死代码文件（31KB，全仓库无引用） | `pixi-office/OfficeScene.ts`、`dataBridge.ts`、`ConfigPanel.tsx`、`types.ts`、`layout.ts`、`services/officeActionHttp.ts` |

### 验证结果

- `npm run typecheck`：通过（0 错误）
- `npm run test`：99 套件 / 914 用例全过
- `npm run build`：通过（renderer + 主进程 + unified-toolbox 均打包成功）

### 手工验收（发版前请自行走一遍）

1. 选「轻量版」→ 一键组队 → 任务中心只剩 5 个官署，角标 5，其余收进折叠区。
2. **完全退出 App 再启动** → 仍是 5 个（这是原来失效的那一步，必须验）。
3. AI 办公室：5 个工位有人、7 个空位，没有假员工名字。
4. 换「旗舰版」→ 12 个官署、12 个工位有人。
5. 新建一道旨意走完全流程，确认派发落在编制内官署、不报错。
