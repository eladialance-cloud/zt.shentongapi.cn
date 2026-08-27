# 三省六部 × 深瞳AI 最终落地方案（v5 定稿）

**日期：** 2026-08-26
**状态：** 基于 v4 方案 + edict-main 源码 + 深瞳AI 代码实测，完成对账与修正
**参考源码：** `E:/网页下载/edict-main.zip`（cft0808/edict，已解压研读）
**v4 前置结论（保留）：** 不引入 Edict 代码，三层改造（Hermes profiles + Hermes kanban + 任务中心 UI）

---

## 一、edict 参考项目实况（源码级）

| 层 | edict 实现 | 我们对应/替代 |
|---|---|---|
| 角色 | `agents/*/SOUL.md` ×12（OpenClaw workspace 格式） | Hermes profiles（需翻译创建） |
| 权限矩阵 | `agents.json` 每角色 `subagents.allowAgents`（太子→中书；中书→门下/尚书；门下→尚书/中书；尚书→六部；六部→尚书） | 移植为 orchestrator 流转校验 + profile 提示词约束 |
| 看板 | 自研：`scripts/kanban_update.py`（JSON 模式）+ `edict/backend`（FastAPI+Postgres 模式，`tasks` 表） | **Hermes kanban（0.20.5 原生，SQLite）** |
| 状态机 | `edict/backend/app/models/task.py`：12 态 + `STATE_TRANSITIONS` + `STATE_AGENT_MAP/STATE_ORG_MAP/ORG_AGENT_MAP` | 移植 `STATE_TRANSITIONS` 为业务合法流转层 |
| 执行 | OpenClaw agents（12 独立 workspace/模型） | Hermes profiles + kanban dispatcher 派发 |
| 渠道 | `channels/`：feishu/qq/slack/telegram/discord/webhook/wecom | 已有 `backend/src/modules/channel`（含 feishu-bot adapter） |
| 前端 | React 看板（App.tsx/api.ts/store.ts） | 已做 v4 Mock（JunjiView/EdictView） |

**edict 12 态与合法流转（复刻蓝本）**
```
Pending → Taizi → Zhongshu → Menxia → Assigned →(Next)→ Doing → Review →(PendingConfirm)→ Done
门下一旦封驳：Menxia→Zhongshu（回拟）；Review 打回：→Menxia / →Doing / →PendingConfirm
Blocked → 任意中间态；Cancelled/Done 终态
```

---

## 二、深瞳AI 实测对账（v4 方案逐条核实）

### ✅ 属实（可直接复用）
1. **Hermes kanban CLI 真实存在**（0.20.5 打包件 `hermes_cli/kanban.py`）：约 50 个子命令 —— `create/list/show/assign/claim/complete/block/unblock/request-review/request-changes/reopen-review/promote/archive/comment/attach/specify/decompose/swarm/stats/watch/tail/boards` 等；原生任务状态 `triage|todo|ready|running|blocked|review|done|archived`；`request-review/request-changes` 即门下封驳/复核的基础。
2. `backend/src/modules/hermes/services/hermes.service.ts`：call_log、`reportLocalExecution`（桌面端回写计费）、credits 冻结/结算链路。
3. `backend/src/modules/hermes/services/ai-employee.service.ts`：5 内置 AI 员工 + `registerEmployee`（六部执行层雏形）。
4. `backend/src/modules/openclaw/services/openclaw-hermes-bridge.ts`：OpenClaw→Hermes 路由桥。
5. `backend/src/modules/sync/sync.gateway.ts`：WebSocket（7 类推送，Web 端用）。
6. `backend/src/modules/channel/adapters/feishu-bot.adapter.ts`：飞书发送。
7. `desktop/src/pages/TaskCenter/unified.ts`：`mergeUnifiedWithFallback` 三源合并（edict 作为第 4 源扩展）。
8. `desktop/electron/main/hermes-orchestrator.ts`：桌面主进程 spawn Hermes CLI 的现成模式（deps.spawnCli 注入）。

### ❌ 需修正（v4 方案的关键错误）
1. **【架构级】P3「后端 edict-orchestrator spawn hermes.exe.cmd kanban」不成立。**
   实测：后端从不 spawn Hermes CLI（全仓 `kanban` 0 命中；`skill-runner` 只跑技能 execConfig）。Hermes 运行时在**桌面端**（userData 下载，主进程 `service-manager` 解析入口并 spawn，端口 8642）。后端只接收桌面端回写（`reportLocalExecution`）。
   → **修正：kanban 执行层放桌面主进程**（新增 `edict-orchestrator.ts`，复用 hermes 入口解析 + spawn 模式）；后端仅做计费回写 + （可选 P6）REST 代理/飞书转发。
2. **【状态映射未实测】v4 §4.4 映射表未跑过真实 CLI。**
   Hermes kanban 原生无 `cancelled`（有 `archived`/`blocked`），`triage` 是独立状态；`request-changes` 打回后落哪个状态需实测。
   → **修正：P2 必须先 CLI 全流程实测，输出校准后的映射表**，再写 orchestrator。
3. **【WebSocket 通道】v4 P4「WebSocket 订阅 syncGateway」对桌面端不成立。**
   桌面渲染进程不直连后端 sync 网关；桌面端实时性应走**主进程轮询/`kanban watch`+IPC 推送**。后端 syncGateway 的 `edict:*` 事件仅服务于 Web 端（P6）。
4. **【UI 状态】v4 Mock 9 态 vs edict 12 态**：缺 `Next / Pending / PendingConfirm`。方案：`Next` 合并进 Assigned；`PendingConfirm`/`Pending` 作为前端展示态（回奏确认弹窗），不落 kanban。
5. **【开发运行时】桌面开发态 `desktop/runtime/hermes` 仍是 0.19.0（无 kanban）**：P2/P3 开发需先把开发运行时升级到 0.20.5（或 P2 直接用已打包的 0.20.5 产物目录 + `HERMES_HOME` 指向临时目录）。

---

## 三、最终架构（v5 定稿）

```
桌面端渲染（任务中心 5 tab：军机处|三省六部|定时|我的|日志）
   ⇄ IPC（edict:issue / board / transition / review / officials / stats / models）
   ⇄ 桌面主进程 edict-orchestrator.ts（状态机校验 + flow_log + 轮询/事件）
   ⇄ hermes kanban CLI（HERMES_HOME=userData/hermes-home，12 profiles）
   ⇅ 回写：hermes_call_logs（复用 reportLocalExecution 模式）+ credits freeze/settle
   ⇅（P6 可选）后端 /api/edict/* 镜像/代理 + 飞书 webhook（桌面在线时转发）
```

**分工定界**
- 桌面端 = 唯一执行层（下旨、流转、封驳、回奏、模型热切、看板数据）。
- 后端 = 计费/审计真源（call_log + credits）；P6 可选：Web/飞书入口的 REST 代理 + 事件广播。
- 不做：后端独立装 Hermes、双 kanban 源。

---

## 四、分阶段方案（修正版）

### P1：12 官署 Hermes profiles + 提示词翻译（0.5-1 天）
- 交付：`desktop/scripts/create-edict-profiles.ps1`（幂等）+ `profiles/<id>.md` ×12 + `profiles/README.md`。
- 角色清单沿用 v4 §4.6.2（taizi/zhongshu/menxia/shangshu/libu/hubu/libu_hr/bingbu/xingbu/gongbu/zaochao/neiwufu）。
- 提示词来源：edict `agents/*/SOUL.md`；翻译要点沿用 v4 §4.6.4（保留接旨礼仪/职责边界/输出格式/封驳规则/标题规则；删除 OpenClaw 专属命令 `sessions_send/subagent/kanban_update.py`；改调 kanban 工具/CLI）。
- **前置实测**：`hermes profile create/describe --help`（0.20.5 有 `profiles.py`/`profile_describer.py`），确认参数再写脚本；模型 ID 与平台网关别名核对（openclaw/deepseek-v4/qwen-max/gpt-4o）。
- 验证：`hermes profile list` 12 个 + describe 非空。

### P2：CLI 全链路实测（1-2 天，硬前置）
- 环境：打包产物 0.20.5 的 `node_modules/hermes-agent` 或升级开发运行时；`HERMES_HOME` 用临时目录。
- 验证链（每步记录真实命令与输出）：
  1. `kanban init` / `kanban boards list`（默认 default board）
  2. `kanban create "旨意" --assignee taizi --priority high` → 状态落点（triage?）
  3. `kanban specify / decompose / swarm --verifier / swarm --synthesizer` 真实输出与退出码
  4. `kanban request-review` → `request-changes`（封驳）→ 打回落点；`unblock`/`block`
  5. `kanban complete` 终态；`kanban archive` vs cancelled 语义
  6. **dispatcher 自动执行验证**：`kanban.dispatch_in_gateway` 是否生效——创建任务后是否需要 hermes gateway 常驻才会自动 spawn profile 执行；若需常驻，桌面端 `service-manager` 启动 Hermes 时是否含 gateway（影响 P3 设计：自动流转 vs orchestrator 手动驱动）
  7. `kanban list --json` / `kanban show --json` 输出字段（前端板数据源）
- 产出：校准后的**状态映射表**（edict 9 态 ↔ hermes kanban 原生态 ↔ CLI 命令）+ 封驳/打回/阻塞/叫停的操作序列 + 一个验证结论文档。

### P3：桌面端 edict-orchestrator + IPC + 后端计费回写（2-3 天）
- 新增 `desktop/electron/main/edict-orchestrator.ts`：
  - 复用 hermes 入口解析（`runtime-resolver`/`service-manager` 的 entry + HERMES_HOME env）
  - `issue/transition/review`：移植 edict `STATE_TRANSITIONS`（12 态收敛为 UI 9 态）+ 权限矩阵（agent 间可流转关系）+ flow_log（谁→谁/时间/note/封驳 reason 必填）
  - 数据源：`kanban list/show --json` 轮询（默认 5s，P4 可换 watch）；不直接读 kanban.db（走 CLI，避免版本耦合）
  - 回写：复用/扩展 `reportLocalExecution`（call_type=orchestrate）→ credits freeze/settle 沿用 hermes.service 现有链路；`edict:task-updated` 事件经 IPC 推渲染
- `desktop/electron/shared/types.ts`：`EdictTask/EdictBoard/Official/EdictStats` + `EdictApi`
- `preload/index.ts` + `main/index.ts`：注册 IPC（`edict:issue/board/task/transition/review/officials/stats/models`）
- 后端：`hermes.service.ts` 扩展 `reportEdictExecution`（或 DTO 复用），写 call_log（call_type=orchestrate）+ credits；**不做** kanban REST（除非 P6）
- 测试：`desktop/tests/unit/edict-state-machine.spec.ts`（STATE_TRANSITIONS 全路径）+ orchestrator 单测（spawn 注入 mock）

### P4：前端接真实数据（1-2 天）
- `EdictView/JunjiView`：`edict-data.ts` mock → `window.electronAPI.edict.*` IPC
- 拖拽流转：onDrop → `transition`（非法流转 400/提示）
- 实时：主进程 5s 轮询 → IPC `edict:board-updated` 推送（或 `kanban watch` 事件）；下旨后卡片 太子 列出现
- 军机处统计：`stats`（各状态数量/封驳率/平均时长）+ `officials`（profile 状态）

### P5：任务中心收尾（1 天）
- 下旨弹窗完整版：标题/正文/分级（自动|轻|重）/指定六部（轻任务直回、重任务进 kanban）
- 定时/我的/日志 3 tab 独立渲染（当前为跳经典视图）
- 轻任务分流验证：taizi profile 对闲聊/单一技能请求不建任务

### P6：可选增强（1-2 天）
- 上朝动画：复用 pixi-office/OfficeIntegrated
- 飞书：backend channel webhook 收旨 → 桌面在线时转发（长连接）→ kanban 下旨；桌面不在线时暂不支持（明确告知）
- 后端 `/api/edict/*` 镜像只读（看板数据给 Web 管理端）+ syncGateway `edict:*` 广播

**工作量重估：约 6-9 天（P1+P2 是硬前置，P3-P5 为主路径）**

---

## 五、关键风险（更新）

| 风险 | 对策 |
|---|---|
| Hermes kanban dispatcher 是否随 gateway 常驻自动执行 | P2 第 6 项硬验证；若不自动 → orchestrator 手动驱动（按映射表顺序调 CLI） |
| 12 profiles token/成本 | 分级：90% 轻任务走 taizi 直回；六部共享模型（profile 仅换 persona 描述） |
| profile 模型 ID 与平台网关不一致 | P1 前置核对；用 `kanban set-model`/`profile` 热切 |
| kanban.db 在桌面本地，跨设备不可见 | 后端 call_log 审计 + （P6）镜像只读表 |
| Hermes 0.20.5 刚升级，kanban 较新 | P2 全链路实测后再进 P3；出问题可回退 0.19.0（无 kanban，则 P3 整体受阻 → 升级是前置） |
| 前端 9 态 vs 原生 8 态 | 映射层收敛；展示层中文标签 |

---

## 六、验证指标（上线标准，桌面端口径）

1. 下旨 → 太子列出卡 → 自动/手动流转回奏，重任务全链路 < 5 分钟
2. 门下封驳：人为制造不合格产出 → 打回中书/六部重做，前端红卡 + 原因可见
3. 轻任务：闲聊/单一技能不建 kanban 任务，直接回复
4. 计费：每次 kanban 执行有 call_log（call_type=orchestrate），积分冻结/结算正确
5. UI：8 列渲染正确、拖拽只允许合法流转、看板刷新 < 1s（IPC 推送）
6. 双端：桌面端闭环可用；飞书入口仅 P6（桌面在线时）
