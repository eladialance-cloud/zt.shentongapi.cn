# 三省六部 × 深瞳AI 最终设计文档（v6 定稿）

**日期：** 2026-08-27
**状态：** 设计定稿（已确认：桌面端执行器 · P1–P5 + 上朝动画 · 飞书本轮不做）
**参考源码：** E:/网页下载/edict-main.zip（cft0808/edict，解压于 C:/Users/Administrator/AppData/Local/Temp/edict-main/edict-main/）
**前置文档：** plans/edict-final-plan-v5.md（本稿在 v5 基础上按用户决策收敛）

---

## 一、已确认决策（用户拍板）

1. **架构：方案 A——桌面端为唯一执行层**。Hermes kanban + 12 官署 profiles 全部跑在桌面端（userData 运行时），服务器只做计费/审计回写（复用 reportLocalExecution 链路）。
2. **范围：P1–P5 + 上朝动画（P6 局部）**。飞书收旨转发本轮不做（用户明确"飞书可以先不做"）。
3. **复用优先**：仓库已有代码能用的全部复用（见第二节资产盘点），不引入 edict 代码。
4. **12 官署跟随 edict agents 目录**（含 qintianjian 钦天监，共 12 个），不另造 neiwufu。
5. **太子 = OpenClaw 对话入口（用户确认）**：不建 taizi profile；用户通过桌面端 Chat（本地 OpenClaw WS 网关 8080）下旨，OpenClaw 承担太子分拣（轻任务直回/重任务建 kanban 任务），经传旨桥进 edict-orchestrator。kanban 内运行其余 **11 个官署 profiles**。

---

## 二、复用资产盘点（已逐文件核实）

| 资产 | 位置 | 状态 | 复用方式 |
|---|---|---|---|
| Hermes 运行时管理 | desktop/electron/main/service-manager.ts | 可用 | 复用 spawn 模式：HERMES_HOME=userData/hermes-home、HERMES_ENTRY=…/bin/hermes.js、PORT 8642、CUSTOM_API_KEY |
| Hermes 配置同步 | desktop/electron/main/hermes-config.ts | 可用 | 复用 syncHermesConfig（模型注入 config.yaml） |
| CLI 编排模式 | desktop/electron/main/hermes-orchestrator.ts | 可用 | 复用 spawnCli 注入 + 结果解析 + 逐步执行器（review/打回已有雏形，作为 kanban 之外备选路径） |
| 运行时解析/版本 | desktop/electron/main/runtime-resolver.ts | 需升级 | 当前开发运行时 0.19.0 无 kanban，需切 0.20.5 |
| Hermes 0.20.5 打包件 | C:/Users/Administrator/AppData/Local/Temp/hermes-portable-build-0.20.5 | 可用 | bin/hermes.js 入口正确；打包脚本入口参数需改为 bin/hermes.js |
| 计费回写 | backend/src/modules/hermes/services/hermes.service.ts | 可用 | 扩展 reportLocalExecution（call_type=orchestrate） |
| 角色执行层 | backend/src/modules/hermes/services/ai-employee.service.ts | 参考 | 六部执行可参考 registerEmployee 模式（本轮执行在桌面端） |
| 飞书 adapter | backend/src/modules/channel/adapters/feishu-bot.adapter.ts | 不启用 | 本轮飞书不做 |
| SyncGateway | backend/src/modules/sync/sync.gateway.ts | 不启用 | 桌面端实时走 IPC，不依赖 sync 网关 |
| 上朝动画引擎 | desktop/src/pages/Office/pixi-office/* | 可用 | 复用场景体系（SpineCharacter/AnimationSystem/MovementSystem/Bubble/StatusLabel/OfficeSimulator），新增朝堂模式 |
| edict 状态机 | edict/backend/app/models/task.py | 移植 | STATE_TRANSITIONS 收敛为 UI 9 态 |
| edict 角色提示词 | edict/agents/*/SOUL.md ×12 | 翻译 | 转 Hermes profile（删 OpenClaw 专属命令，改 kanban 工具） |
| edict 看板语义 | edict/scripts/kanban_update.py + README | 参考 | 行为语义映射到 Hermes kanban 0.20.5 CLI |

---

## 三、目标架构（v6）

    桌面端渲染（任务中心 5 tab：军机处|三省六部|定时任务|我的任务|执行日志 + Chat 页面）
       ⇄ 用户 ↔ OpenClaw 太子（本地 WS 网关 8080，分级分流：轻任务直回 / 重任务传旨）
       ⇄ IPC（edict:issue / board / transition / review / officials / stats / models）
       ⇄ 桌面主进程 edict-orchestrator.ts（状态机校验 + flow_log + 轮询）
       ⇄ hermes kanban CLI 0.20.5（HERMES_HOME=userData/hermes-home，12 profiles）
       ⇅ 回写：hermes_call_logs（call_type=orchestrate）+ credits freeze/settle

**定界**
- 桌面端 = 唯一执行层：下旨、流转、封驳、回奏、模型热切、看板数据、上朝动画。
- 后端 = 计费/审计真源：每次 kanban 执行回写 call_log + 积分结算。
- 本轮不做：飞书/web/管理后台看板镜像/后端 kanban REST。

---

## 四、12 官署（太子=OpenClaw + 11 个 kanban profiles）

| # | profile id | 官署 | 职责 | 提示词来源 |
|---|---|---|---|---|
| 1 | taizi | 太子👑 | 分拣入口：小事自回/大事建任务 | **OpenClaw 承担**（taizi SOUL.md 翻译为 OpenClaw 人设注入，不建 profile） |
| 2 | zhongshu | 中书省📝 | 规划拆解 | agents/zhongshu/SOUL.md |
| 3 | menxia | 门下省🛡 | 审议封驳 | agents/menxia/SOUL.md |
| 4 | shangshu | 尚书省🏛 | 派发汇总 | agents/shangshu/SOUL.md |
| 5 | libu | 吏部🎓 | 人事·任务编排 | agents/libu/SOUL.md |
| 6 | hubu | 户部💰 | 财务·计费·合规 | agents/hubu/SOUL.md |
| 7 | libu_hr | 礼部🎎 | 内容·礼制 | agents/libu_hr/SOUL.md |
| 8 | bingbu | 兵部⚔ | 研发攻坚 | agents/bingbu/SOUL.md |
| 9 | xingbu | 刑部⚖ | 质检·审计 | agents/xingbu/SOUL.md |
| 10 | gongbu | 工部🔧 | 工程·运维 | agents/gongbu/SOUL.md |
| 11 | zaochao | 司礼监🎎 | 上朝仪式 | agents/zaochao/SOUL.md |
| 12 | qintianjian | 钦天监🔭 | 预测·择时·天象 | agents/qintianjian/SOUL.md |

模型分配：默认继承平台当前默认 chat 模型（hermes-config 注入），每官署可独立热切（kanban set-model / profile describe 实测为准）；P1 前置核对平台模型网关别名（管理后台模型清单为准）。

**kanban profiles 共 11 个**（taizi 由 OpenClaw 承担）。

---

## 五、状态机设计（edict 12 态 → UI 9 状态 / 8 列）

**edict 原版合法流转（移植蓝本）**

    Pending → Taizi → Zhongshu → Menxia → Assigned →(Next)→ Doing → Review →(PendingConfirm)→ Done
    门下一旦封驳：Menxia→Zhongshu（回拟）
    Review 打回：→Menxia / →Doing / →PendingConfirm
    Blocked → 任意中间态；Cancelled/Done 终态

**UI 9 状态 / 8 列（前端）**
    太子列 → 中书列 → 门下列 → 尚书列 → 六部执行列 → 复核列 → 回奏列 → 阻塞列
    完成（Done/归档）进入奏折阁；Next 合并进 Assigned；PendingConfirm/Pending 作为回奏确认弹窗展示态，不落 kanban

**Hermes kanban 原生状态（0.20.5）**
    triage|todo|ready|running|blocked|review|done|archived

**映射表（P2 CLI 实测后校准，以下为初始假设）**
| 业务态 | kanban 原生态 | 触发命令 |
|---|---|---|
| 下旨（太子接） | triage→todo | kanban create --assignee taizi |
| 中书拆解 | ready | kanban specify/decompose |
| 门下审议 | review | kanban request-review |
| 封驳 | running/todo | kanban request-changes（原因必填） |
| 六部执行 | running | kanban claim/start |
| 复核 | review | kanban request-review |
| 回奏 | review→done | kanban complete |
| 阻塞 | blocked | kanban block（原因必填） |
| 归档 | archived | kanban archive |
| 取消 | archived（附取消标记） | kanban archive + note=cancelled |

---

## 六、P1：11 官署 profiles + 太子人设 + 提示词翻译（0.5–1 天）

- 前置：hermes profile create/describe --help 实测参数（0.20.5 含 profiles.py/profile_describer.py）。
- 交付：
  - desktop/scripts/create-edict-profiles.ps1（幂等：不存在才 create，存在只 update describe）
  - desktop/runtime/edict-profiles/<id>.md ×11（翻译后提示词，不含 taizi）
  - desktop/runtime/edict-profiles/taizi-openclaw.md（太子人设：注入 OpenClaw 的 AGENTS/人设配置，含分级规则与"传旨"识别）
  - desktop/runtime/edict-profiles/README.md（清单+模型分配+维护说明）
- 翻译要点（edict SOUL.md → Hermes profile）：
  - 保留：接旨礼仪、职责边界、输出格式、封驳规则、标题规则（10–30 字中文）
  - 删除：OpenClaw 专属命令（sessions_send / subagent / kanban_update.py 路径）
  - 改写：建任务→kanban create --triage；协作→经尚书省转派，不跨部直连；回奏→完成后输出回奏文本
- 验收：hermes profile list 恰好 11 个且 describe 非空；OpenClaw 会话中以太子人设应答，识别"传旨"意图；任一 profile 可在指定模型下回答角色化提问。

---

## 七、P2：kanban 0.20.5 全链路实测（1–2 天，硬前置）

- 环境：修复 desktop/scripts/package-hermes-portable.ps1（入口 bin/hermes → bin/hermes.js），用打包产物 0.20.5 或升级开发运行时；HERMES_HOME 指向临时目录。
- 实测链（逐条记录真实命令/输出/退出码）：
  1. kanban init / boards list
  2. create "旨意" --assignee taizi → 状态落点
  3. specify / decompose / swarm --verifier / swarm --synthesizer
  4. request-review → request-changes（封驳）→ 打回落点；block/unblock
  5. complete 终态；archive 语义
  6. **dispatcher 验证**：创建任务后是否需要 hermes gateway 常驻才会自动 spawn profile 执行；若需常驻 → 确认 service-manager 启动 Hermes 时是否含 gateway（决定 P3：自动流转 vs orchestrator 手动驱动）
  7. list/show --json 字段（前端板数据源）
- 产出：校准后的状态映射表（覆盖第五节假设）+ 封驳/打回/阻塞/叫停操作序列 + 结论文档 plans/edict-p2-verify-2026-08-27.md。
- 出口标准：上述 7 项全部有可复现命令记录；若 kanban dispatcher 不可靠 → 退回 hermes-orchestrator 逐步执行器方案（已有 review/打回雏形），并在文档中记录决策。

---

## 八、P3：桌面端 edict-orchestrator + IPC + 后端计费回写（2–3 天）

**传旨桥（OpenClaw 太子 → kanban）**
- 复用/接通 openclaw-hermes-bridge 语义：OpenClaw 识别"传旨"后调用本地传旨工具（skill 工具卡或主进程监听 OpenClaw 事件，P2 实测定），载荷 { title, body, level, dept? } → edict-orchestrator.issue()。
- 轻任务（闲聊/单一技能）由 OpenClaw 直接回复，不建 kanban 任务。

**新增 desktop/electron/main/edict-orchestrator.ts**
- 复用 service-manager 的入口解析（HERMES_ENTRY）+ HERMES_HOME env + spawnCli 注入模式。
- 核心 API（纯函数、可单测）：
  - assertTransition(from, to, actor)：校验合法流转（移植 STATE_TRANSITIONS + 权限矩阵：中书→门下/尚书；门下→尚书/中书；尚书→六部；六部→尚书）
  - transition(taskId, to, { note, reason? })：封驳/打回必须带 reason，写 flow_log
  - issue(input)：kanban create → 太子列
  - getBoard() / getTask(id)：kanban list/show --json 解析
  - review(taskId, verdict, reason?)：request-review / request-changes
  - block/unblock(taskId, reason)
  - complete(taskId) → 回奏
  - getOfficials()：12 profile 状态（空闲/工作中/离线）
  - getStats()：各状态数量/封驳率/平均时长
- 数据源：CLI --json 轮询（默认 5s），不直接读 kanban.db（避免版本耦合）。
- 回写：扩展 reportLocalExecution（call_type=orchestrate）→ credits freeze/settle 沿用现有链路。
- 实时：主进程轮询 → IPC edict:board-updated 推渲染。

**IPC 契约（desktop/electron/shared/types.ts + preload）**
    edict:issue      (title, body, level, dept?) → { taskId }
    edict:board      () → EdictBoard
    edict:task       (id) → EdictTask
    edict:transition (id, to, { note, reason? })
    edict:review     (id, verdict, reason?)
    edict:officials  () → Official[]
    edict:stats      () → EdictStats
    edict:models     (profileId) → modelId
    事件：edict:board-updated / edict:task-updated

**后端**：hermes.service.ts 扩展 reportEdictExecution（或 DTO 复用）→ 写 call_log（call_type=orchestrate）+ credits。不做 kanban REST。

**测试**：desktop/tests/unit/edict-state-machine.spec.ts（STATE_TRANSITIONS 全路径含非法流转拒绝）+ orchestrator 单测（spawn 注入 mock）。

---

## 九、P4：前端接真实数据（1–2 天）

- EdictView/JunjiView：edict-data.ts mock → window.electronAPI.edict.* IPC。
- 拖拽流转：onDrop → transition，非法流转弹提示。
- 实时刷新：IPC edict:board-updated。
- 军机处统计：stats（各状态/封驳率/平均时长）+ officials（12 官署状态灯）。
- 下旨后卡片出现在太子列（<1s）。

---

## 十、P5：任务中心收尾（1 天）

- 下旨弹窗完整版：标题/正文/分级（自动|轻|重）/指定六部（可选）——作为"绕过太子直接下旨"的快捷入口，主入口仍是 OpenClaw 对话。
- 轻任务分流：taizi profile 对闲聊/单一技能请求不建 kanban 任务，直接回。
- 定时/我的/日志 3 tab 独立渲染（当前跳经典视图改为独立内容）。
- 无任务时状态：空看板引导文案（已有 UI 规范）。

---

## 十一、P6（局部）：上朝动画（1–2 天）

- 复用 desktop/src/pages/Office/pixi-office 场景体系。
- 新增朝堂模式：
  - 布局：龙椅（皇上位）+ 文武两班 12 官署站位
  - 角色：12 官署（扩展名册 1–6 → 1–12，或朝堂专用阵容）
  - 动作：上朝聚拢 → 奏报（气泡）→ 封驳（红标）→ 回奏（绿标）→ 散朝
  - 数据：绑定 kanban board 状态（有任务流转时触发对应官署角色动画）
- 入口：军机处"上朝"按钮 → 动画 overlay（复用 OfficeIntegrated 挂载方式）。
- 不做：3D/骨骼动画新资产开发，全部使用现有 SpineCharacter/贴纸体系。

---

## 十二、错误处理

| 场景 | 处理 |
|---|---|
| Hermes 未启动/运行时缺失 | 下旨前检查 service 状态，引导"启动 Hermes"（复用 service-manager 流程） |
| kanban CLI 失败 | 解析 stderr 归一到中文错误，flow_log 记 failure，任务回 running/todo 可重试 |
| 非法流转 | orchestrator 拒绝并返回原因（UI 提示"此流转不符合三省六部规制"） |
| 封驳/打回无 reason | 强制必填，否则拒绝 |
| 桌面离线执行 | 执行在本机无离线概念；计费回写失败 → 本地队列重试（复用现有 reportExecution 重试策略） |
| profile 模型不可用 | kanban set-model 热切；失败回退默认模型并提示 |

---

## 十三、测试计划与验收标准

- 单测：状态机全路径（合法/非法/封驳/打回/阻塞）；orchestrator（spawn mock）；flow_log 完整性。
- P2 实测：上节 7 项 CLI 验证。
- 集成：OpenClaw 对话下旨（"传旨：…"）→ kanban 建卡→流转→回奏全链路（重任务 <5 分钟）；轻任务 OpenClaw 直回不建卡；封驳制造不合格产出确认打回；计费 call_log+credits 正确。
- 验收指标（上线标准）：
  1. 下旨 → 太子列出卡 → 自动/手动流转回奏 < 5 分钟
  2. 封驳红卡 + 原因可见，打回中书/六部重做
  3. OpenClaw 对话下旨进 kanban；轻任务直接回、不建卡
  4. 每次执行有 call_log（orchestrate）+ 积分冻结/结算正确
  5. UI 8 列渲染正确、拖拽只允许合法流转、刷新 <1s
  6. 上朝动画可触发，12 官署按 board 状态动画

---

## 十四、明确不做（本轮）

- 飞书收旨转发/绑定（用户拍板不做）
- 后端 kanban REST / Web 管理端看板镜像
- 管理后台飞书配置
- 引入 edict 代码本体（只移植状态机语义与角色提示词）

---

## 十五、风险与对策

| 风险 | 对策 |
|---|---|
| kanban dispatcher 不自动执行 | P2 第 6 项硬验证；不自动则 orchestrator 手动驱动；再不行退回逐步执行器 |
| 0.20.5 打包/运行时升级影响现有桌面功能 | 独立 HERMES_HOME 目录验证；打包脚本先修入口参数；dev 模式先跑通再动发布版 |
| 12 profiles 成本 | 分级：轻任务 taizi 直回；六部共享默认模型（profile 仅换 persona） |
| profile 模型 ID 与网关不一致 | P1 前置核对；set-model 热切 + 失败回退 |
| 前端 9 状态 vs 原生 8 状态 | 映射层收敛；展示层中文标签 |
| 上朝动画拖累性能 | 动画 overlay 按需加载（懒挂载），不常驻 |
| OpenClaw 传旨桥接入方式未定 | P2 实测：优先 skill 工具卡（复用 n8n-run-workflow 模式），备选主进程事件监听 |

---

## 十六、工作量与顺序

| 阶段 | 内容 | 估计 | 依赖 |
|---|---|---|---|
| P0.5 | 修打包脚本 + 运行时 0.20.5 就绪 | 0.5 天 | 无 |
| P1 | 12 profiles + 提示词翻译 | 0.5–1 天 | P0.5 |
| P2 | kanban 全链路实测 + 映射校准 | 1–2 天 | P0.5 |
| P3 | 编排器 + IPC + 计费 | 2–3 天 | P1/P2 |
| P4 | 前端接真实数据 | 1–2 天 | P3 |
| P5 | 任务中心收尾 | 1 天 | P4 |
| P6 | 上朝动画 | 1–2 天 | P3（board 数据） |
| **合计** | | **约 7–12 天** | |
