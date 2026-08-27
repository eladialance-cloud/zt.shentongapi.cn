# 三省六部 P2 实测结论（2026-08-27）

## T2.1 看板脚本全链路实测（✅ 全部通过，本机 Hermes Python 3.11 实测）

| 项目 | 结果 | 证据 |
|---|---|---|
| create | ✅ | taizi 创建 JJC 任务成功，落盘 tasks_source.json |
| state 合法流转 | ✅ | Zhongshu→Menxia→Assigned→Doing 全部通过 |
| state 非法流转 | ✅ | Zhongshu→Done 被拒（允许: Menxia/Cancelled/Blocked） |
| flow | ✅ | 流转记录 太子→中书省、门下省→尚书省 落 flow_log |
| todo | ✅ | 子任务状态+detail 落 todos |
| progress | ✅ | 进展落 progress_log（含计划清单） |
| done 收口 | ✅ | 合法状态收口；todos 未完成（1/3）时拒绝收口 |
| block | ✅ | 阻塞命令可用 |
| 越权检测 | ✅ | hubu create 被拒、zhongshu done 被拒（AGENT_POLICY） |
| 审计日志 | ✅ | audit_log.json 17 条（含 done_rejected 原因） |
| 并发写 | ✅ | 6 并发 progress 全部成功，JSON 完整（文件锁生效） |
| 状态机单一事实源 | ✅ | kanban_update.py 动态读取 kanban/task.py STATE_TRANSITIONS |

## T2.2 Hermes CLI / profile 执行（✅ 桌面端真机联调通过，2026-08-27）

**环境：** Hermes Agent v0.20.5（2026.8.19）便携运行时（node v20.18.1 + cpython-3.11.15 + venv/Scripts/hermes.exe），HERMES_HOME=desktop/runtime/e2e-real/hermes-home，看板=edict-data（EDICT_HOME），LLM=本地 mock OpenAI（127.0.0.1:18454，与 llm-proxy 同协议）。

| 验证项 | 结果 | 说明 |
|---|---|---|
| CLI 版本 | ✅ | hermes.exe --version → v0.20.5，Python 3.11.15 |
| profile list | ✅ | 11 官署 profile 全部列出（zhongshu…qintianjian） |
| profile 引导幂等 | ✅ | create 已存在跳过；默认 SOUL.md 被识别并覆盖为官署人设（见下方修复） |
| 单节点真机 | ✅ | hermes -p zhongshu chat -q 输出中书省执行方案 |
| 全链路编排 | ✅ | 中书→门下→尚书→六部(hubu)→复核→完成，逐节点真实 Hermes CLI 调用 |
| 看板回写 | ✅ | create/state/flow/done/confirm 全部落盘 tasks_source.json |
| 高风险收口 | ✅ | Review→Done 进 PendingConfirm → confirm approve → Done |
| 统计 | ✅ | byState.Done=1，avgDurationMs 正常 |

**实测中修复的问题：**
1. **resolveHermesPython 注释转义**：文档注释里 `cpython-*` 的 `*/` 提前终止块注释，导致 tsc TS1005/TS1161。已改为 `cpython-<version>`。
2. **SOUL.md 注入守卫失效**：`hermes profile create` 会先写默认模板 SOUL.md（"You are Hermes Agent…"），原 `!existsSync(soulDst)` 守卫永远跳过，官署人设未注入。edict-bridge.ts 与联调脚本均改为「默认模板才覆盖，用户自定义保留」。
3. **联调脚本未设 HERMES_HOME**：`hermes profile create` 落到 %LOCALAPPDATA%\hermes（沙箱拒绝 → 静默失败），已显式注入 $env:HERMES_HOME。
4. **PS 5.1 stderr 当致命错误**：Hermes 建 wrapper 警告写 stderr，EAP=Stop 直接抛 NativeCommandError；已用 EAP=Continue + 退出码/目录存在性判定。

**待 P5 注意（非 T2.2 阻塞）：** 六部执行节点当前固定 hubu profile，未按尚书省派发的「部门」动态切换对应官署 profile（可在 P5 完善）。

## T2.3 编排驱动方式（✅ 定案：orchestrator 顺序驱动）

- 看板是 edict JSON 模式（非 Hermes kanban），Hermes 不提供 edict 状态机自动流转。
- 驱动方式：桌面主进程 edict-orchestrator 按 STATE_TRANSITIONS 逐节点调 Hermes CLI（官署 profile 人设），每节点完成后调 kanban_update.py 写状态。
- 流转责任矩阵（orchestrator 驱动）：太子建任务 → 中书起草 → 门下审议（封驳回中书≤3轮）→ 尚书派发 → 六部执行 → done 收口 → 太子回奏。

## 对 v7 设计的影响
- 无架构变更；确认 edict 脚本照搬后行为与原版一致（越权/状态机/审计/文件锁全部真实生效）。
- refresh_live_data.py 已适配 EDICT_HOME（原版用脚本相对路径，已修正）；6 个脚本已加嵌入式 Python sys.path 引导。