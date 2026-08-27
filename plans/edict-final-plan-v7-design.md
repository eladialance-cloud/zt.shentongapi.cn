# 三省六部 × 深瞳AI 最终落地方案（v7 定稿：OpenClaw 太子 + Hermes 执行 + edict JSON 看板）

**日期：** 2026-08-27
**用户拍板：** ① 看板照搬 edict 的 JSON 模式（kanban_update.py + tasks_source.json）；② UI 用深瞳AI 已做任务中心（D:\二次开发）；③ **OpenClaw 只是太子（入口分拣），军机处/三省六部执行用 Hermes**；④ 飞书本轮不做；⑤ 方案 A 桌面端执行。
**edict 源码：** E:/网页下载/edict-main.zip（解压于 C:/Users/Administrator/AppData/Local/Temp/edict-main/edict-main/）
**前置文档：** plans/edict-final-plan-v6-design.md（v7 按用户"照搬仓库"决策重写）

---

## 一、核心结论（用户纠正后的最终架构）

1. **OpenClaw = 太子（仅入口）**：深瞳AI 桌面端已内置本地 OpenClaw（8080 网关、工具卡、SSE 对话，desktop/electron/main/openclaw-chat.ts）。OpenClaw 承担太子职责：接收用户消息、分拣（轻任务直回/重任务建任务）、回奏后通知用户。
2. **Hermes = 军机处/三省六部执行引擎**：11 个官署用 Hermes profiles（人设翻译自 edict agents SOUL.md），编排执行复用 hermes-orchestrator 的 CLI/spawn 模式（中书拆解→门下审议封驳→尚书派发→六部执行→复核→回奏）。
3. **看板照搬 edict JSON 模式**：scripts/kanban_update.py + data/tasks_source.json + file_lock.py + refresh_live_data.py + audit_log.json 全部照搬，桌面端本地存放（Hermes 运行时自带 Python 执行）。Hermes 执行每一步通过看板命令写状态（state/flow/progress/done），OpenClaw 太子 create 建任务。
4. **状态机照搬**：edict/backend/app/models/task.py 的 12 态 + STATE_TRANSITIONS 原样保留（kanban_update.py 正则动态读取，单一事实源）。
5. **计费复用现状**：OpenClaw 太子对话经 llm-proxy 扣费（现状）；Hermes 官署执行走现有 reportLocalExecution/credits 链路（现状）。无新增计费。
6. **Hermes kanban 0.20.5 不再使用**（用户拍板改照搬 edict JSON 看板）；Hermes profile 能力仍用于官署人设。

---

## 二、照搬清单（edict → 深瞳AI desktop/runtime/edict/）

| edict 文件 | 目标位置 | 处理 |
|---|---|---|
| agents/*/SOUL.md ×12 | desktop/runtime/edict/agents/ | 照搬为翻译蓝本：taizi → OpenClaw 人设；其余 11 份 → Hermes profile 提示词 |
| agents.json（权限矩阵） | desktop/runtime/edict/agents.json | 原样照搬 |
| scripts/kanban_update.py | desktop/runtime/edict/scripts/ | 原样照搬（命令：create/state/flow/done/todo/progress + AGENT_POLICY 越权检测 + 审计） |
| scripts/utils.py / file_lock.py / refresh_live_data.py / refresh_watcher.py | desktop/runtime/edict/scripts/ | 原样照搬 |
| edict/backend/app/models/task.py | desktop/runtime/edict/kanban/task.py | 原样照搬（状态机单一事实源） |
| data/tasks_source.json（初始结构） | desktop/runtime/edict/data/ | 照搬初始数据/空看板 |
| edict/frontend 组件语义（EdictBoard/CourtCeremony/MorningPanel/MemorialPanel/TaskModal） | 参考 | 功能语义照搬进深瞳AI 任务中心 UI（用户已拍板 UI 用已做版本） |

**不照搬**：edict/backend（FastAPI+Postgres+Redis）——桌面端不需要服务器；channels/*（飞书等，本轮不做）；dashboard/*（Python 面板，深瞳AI 已有 UI）。

---

## 三、目标架构（v7）

    用户 ⇄ 桌面端 Chat 页面（OpenClaw 太子，本地 WS 8080，注入 taizi 人设）
              ⇅ 分拣：轻任务直回 / 重任务"传旨"建任务
    OpenClaw 太子 → kanban_update.py create（建 JJC 任务）
              ↓
    桌面主进程 edict-orchestrator.ts（状态机校验 + 编排驱动）
              ↓ 逐节点调 Hermes CLI（官署 profile 人设：中书→门下→尚书→六部）
    Hermes 执行 → kanban_update.py state/flow/progress/done（写回 tasks_source.json）
              ↓
    主进程轮询 tasks_source.json → IPC 推送 → 渲染进程任务中心（军机处|三省六部|定时|我的|日志）
    计费：OpenClaw 对话经 llm-proxy（现状）；Hermes 执行走 reportLocalExecution/credits（现状）

**定界**
- 桌面端 = 唯一执行与数据层（OpenClaw 太子 + Hermes 官署执行 + JSON 看板 + 状态机）。
- 后端 = 仅 llm-proxy 计费 + credits（现状已有）+ 登录；无新增后端接口。
- 本轮不做：飞书/web/管理后台看板/多设备同步。

---

## 四、12 官署（太子=OpenClaw + 11 个 Hermes profiles）

| # | agent id | 官署 | 说明 |
|---|---|---|---|
| 1 | taizi | 太子👑 | **OpenClaw 承担**（taizi SOUL.md 翻译为 OpenClaw 人设注入，不建 Hermes profile）；分拣+建任务+回奏 |
| 2 | zhongshu | 中书省📝 | Hermes profile（SOUL.md 翻译） |
| 3 | menxia | 门下省🛡 | Hermes profile（SOUL.md 翻译） |
| 4 | shangshu | 尚书省🏛 | Hermes profile（SOUL.md 翻译） |
| 5 | libu | 礼部📝 | Hermes profile（内容·礼制） |
| 6 | hubu | 户部💰 | Hermes profile（财务·计费·合规） |
| 7 | libu_hr | 吏部👔 | Hermes profile（人事·组织） |
| 8 | bingbu | 兵部⚔ | Hermes profile（研发攻坚） |
| 9 | xingbu | 刑部⚖ | Hermes profile（质检·审计） |
| 10 | gongbu | 工部🔧 | Hermes profile（工程·运维） |
| 11 | zaochao | 司礼监/朝报📰 | Hermes profile（上朝仪式/要闻；edict AGENT_LABELS 中 zaochao=钦天监，P1 对齐） |
| 12 | qintianjian | 钦天监🔭 | Hermes profile（预测·择时）；P1 以仓库 agents 目录为准对齐 |

> 模型分配：默认继承平台当前默认 chat 模型（hermes-config 注入），每官署可独立热切；P1 前置核对平台模型网关别名。

---

## 五、状态机（照搬 task.py，原样保留）

    12 态：Pending/Taizi/Zhongshu/Menxia/Assigned/Next/Doing/Review/Done/Blocked/Cancelled/PendingConfirm
    STATE_TRANSITIONS 权威流转（kanban_update.py 正则动态加载，双端一致）：
      Pending→Taizi；Taizi→Zhongshu；Zhongshu→Menxia；Menxia→Assigned|Zhongshu(封驳)；
      Assigned→Doing|Next；Doing→Review|Done；Review→Done|Menxia|Doing|PendingConfirm；
      PendingConfirm→Done|Review；Blocked→任意中间态；Done/Cancelled 终态。

**前端列映射（深瞳AI 任务中心，UI 已做）**：Inbox→Taizi→Zhongshu→Menxia→Assigned→Doing→Review→Done，Blocked/Cancelled 并入对应列。

---

## 六、P0.5：运行时与依赖就绪（0.5 天）

- 确认 Python 环境：Hermes 运行时自带 python（desktop/runtime/hermes/python/），kanban_update.py 无第三方依赖（纯标准库+本地 utils），可直接跑。
- 确认 OpenClaw 本地：service-manager SERVICE_DEFS.openclaw 启动链路正常（现状已有）；工具卡执行机制（n8n-run-workflow 模式）可扩展新工具卡。
- 交付：desktop/runtime/edict/ 目录骨架 + 冒烟脚本（python kanban_update.py create 一条命令）。

---

## 七、P1：照搬落地 + 11 个 Hermes profiles + 太子人设（1–1.5 天）

- 拷贝：agents ×12 + agents.json + scripts/*（kanban_update/utils/file_lock/refresh_*）+ task.py + data/（照搬蓝本与看板脚本）。
- 建 11 个 Hermes profiles（中书/门下/尚书/六部/司礼监/钦天监）：desktop/scripts/create-edict-profiles.ps1（幂等），提示词翻译自对应 SOUL.md（保留接旨礼仪/职责边界/输出格式/封驳规则/标题规则；删 OpenClaw 专属命令；改调看板命令与 Hermes 工具）。
- 太子人设：taizi SOUL.md 翻译为 OpenClaw 人设注入（分级规则/标题规则/传旨识别），P3 定注入点。
- 适配点：
  - 看板脚本 python3 scripts/kanban_update.py → 桌面端绝对路径（python <edict-dir>/scripts/kanban_update.py）；
  - EDICT_HOME 环境变量指向 desktop/runtime/edict/；
  - SOUL.md → profile 翻译（11 份）+ OpenClaw 人设（1 份）。
- 验收：kanban_update.py 全命令跑通 + 审计写入；hermes profile list 11 个且 describe 非空；OpenClaw 以太子人设应答并识别"传旨"。

---

## 八、P2：看板 + Hermes 执行全链路实测（1–2 天，硬前置）

- 实测链（逐条记录命令/输出）：
  1. create JJC-日期-序号 标题 状态 部门 官员 → 状态落点与 ID 规则
  2. state 流转 + 非法流转拒绝（越权/非法状态，AGENT_POLICY + STATE_TRANSITIONS 双校验）
  3. flow 流转日志 + 封驳（Menxia→Zhongshu）；done 终态；todo/progress 更新
  4. 并发写：文件锁 + atomic_json 读写（多 agent 同时写不损坏）
  5. refresh_live_data / watcher 数据流（前端数据源）
  6. OpenClaw 太子 create 建任务（工具卡或主进程桥）
  7. **Hermes 官署执行实测**：中书拆解→门下审议（封驳）→尚书派发→六部执行→回奏，每节点以对应 profile 人设跑 Hermes CLI，并调 kanban_update.py 写状态
  8. 编排驱动方式定案：orchestrator 顺序驱动（手动调 Hermes CLI）还是 Hermes 自动 agent 调用（以实测为准）
- 产出：实测结论文档 plans/edict-p2-verify-2026-08-27.md + 修正清单（含状态映射与编排驱动方式结论）。

---

## 九、P3：桌面主进程编排 + 传旨桥（1–2 天）

- desktop/electron/main/edict-orchestrator.ts：
  - 轮询 tasks_source.json（默认 3–5s）→ 解析为看板模型 → IPC edict:board-updated；
  - 编排执行：按状态机顺序调 Hermes CLI（复用 hermes-orchestrator spawnCli 注入模式 + 官署 profile 人设），每节点完成后调 kanban_update.py 写状态（state/flow/progress/done）；封驳/打回走 STATE_TRANSITIONS 合法路径；
  - issue/transition/review 封装：kanban_update.py spawn（保证审计/越权一致）；
  - 状态机校验复用 task.py 权威表（读入内存缓存）；flow_log/progress_log 透传前端；
  - 回奏完成 → 通知 OpenClaw 太子 → Chat 页面回复用户。
- 传旨桥：OpenClaw 太子识别"传旨"→ 工具卡（照搬 n8n-run-workflow 模式新建 edict-create 工具卡）或主进程桥 → kanban_update.py create；轻任务 OpenClaw 直回。
- 计费：Hermes 执行回写复用 reportLocalExecution（call_type=orchestrate）→ credits；OpenClaw 对话 llm-proxy 现状。
- IPC 契约（desktop/electron/shared/types.ts + preload）：
    edict:issue / edict:board / edict:task / edict:transition / edict:review / edict:officials / edict:stats / edict:models
    事件：edict:board-updated / edict:task-updated
- 单测：状态机全路径（照搬 STATE_TRANSITIONS）；orchestrator spawn mock。

---

## 十、P4：任务中心 UI 接真实数据（1–2 天）

- 深瞳AI 任务中心（desktop/src/pages/TaskCenter/ 已做 mock）数据源替换：edict-data.ts → IPC board。
- 军机处（JunjiView）：官员总览/统计/要闻接真实数据。
- 三省六部（EdictView）：看板列渲染、拖拽流转（非法流转提示）、详情抽屉（flow_log 时间线）。
- 下旨后卡片 3 秒内出现（IPC 推送）。

---

## 十一、P5：任务中心收尾（1 天）

- 下旨弹窗完整版：标题/正文/分级（自动|轻|重）/指定六部（快捷入口，主入口仍是 OpenClaw 对话）。
- 轻任务分流验证：OpenClaw 对闲聊/单技能不建任务。
- 定时/我的/日志 3 tab 独立渲染。

---

## 十二、P6：上朝动画（1–2 天）

- 复用深瞳AI 已有动画资产（pixi-office 引擎或 Office 场景），在军机处挂"上朝"入口；
- 或照搬 edict CourtCeremony.tsx 语义（52 行，简单仪式），P6 开工时对比两者选优；
- 数据：绑定 tasks_source.json 状态（官署角色按 board 状态动画）；
- 不做：新骨骼/3D 资产开发。

---

## 十三、错误处理

| 场景 | 处理 |
|---|---|
| OpenClaw 未启动 | 对话前 ensureOpenClaw（现状已有）；下旨引导启动 |
| kanban_update.py 失败 | 解析 stderr 归一中文；flow_log 记 failure；任务可重试 |
| 非法流转/越权 | 脚本拒绝 + 前端提示"不符合三省六部规制" |
| 并发写冲突 | 文件锁（照搬 file_lock.py）+ 原子读写；冲突重试 |
| 计费 | llm-proxy 现状扣费；工具卡按工作流定价（照搬 n8n 模式） |

---

## 十四、明确不做（本轮）

- 飞书/channels（用户拍板）
- edict FastAPI 后端 / Postgres / Redis（桌面端不需要）
- 后端新增接口 / 管理后台看板
- Hermes kanban（用户拍板改照搬 edict JSON 看板）

---

## 十五、风险与对策

| 风险 | 对策 |
|---|---|
| OpenClaw 工具卡调用脚本不可行 | P2 第 6 项硬验证；备选：主进程监听 OpenClaw 事件直接调脚本 |
| Hermes 编排驱动方式未定 | P2 第 8 项硬验证：顺序驱动 vs Hermes 自动 agent 调用 |
| SOUL.md→profile 翻译失真 | 保留核心规则（接旨礼仪/职责边界/封驳/标题），P2 逐节点验收 |
| 多 agent 并发写损坏 JSON | 文件锁照搬 + atomic 读写（edict 已解决） |
| SOUL.md 命令路径替换遗漏 | P2 第 7 项逐 agent 抽查 |
| qintianjian/zaochao 官署名冲突 | P1 以仓库为准对齐（AGENT_LABELS） |
| 计费缺口（工具卡执行无扣费） | 照搬 n8n-run-workflow 工具卡定价模式 |

---

## 十六、工作量

| 阶段 | 内容 | 估计 |
|---|---|---|
| P0.5 | 运行时就绪 + 冒烟 | 0.5 天 |
| P1 | 照搬 edict 代码落地 | 0.5–1 天 |
| P2 | 看板全链路实测 | 1 天 |
| P3 | 主进程编排 + 太子人设 + 传旨桥 | 1–2 天 |
| P4 | UI 接真实数据 | 1–2 天 |
| P5 | 任务中心收尾 | 1 天 |
| P6 | 上朝动画 | 1–2 天 |
| **合计** | | **约 6–10 天** | |
