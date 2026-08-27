# 三省六部 × 深瞳AI 实施计划（P0.5–P6）

> **For agentic workers:** REQUIRED SUB-SKILL: 每阶段先查 edict-main.zip 仓库（C:/Users/Administrator/AppData/Local/Temp/edict-main/edict-main/）有无现成代码，有则直接照搬复用，没有再分析写入。

**Goal:** 在深瞳AI 桌面端实现三省六部：OpenClaw 太子 + Hermes 官署执行 + edict JSON 看板，任务中心 UI 接真实数据。
**Architecture:** 用户⇄OpenClaw太子(对话分拣/建任务)→kanban_update.py→主进程编排器逐节点调Hermes CLI(11官署profile)→写回tasks_source.json→IPC推送任务中心。
**Tech Stack:** Electron IPC / Hermes CLI profiles / Python(kanban_update.py) / React(Zustand) / llm-proxy 计费。

---

## P0.5 运行时就绪（0.5 天）
- [x] T0.1 确认 Hermes 运行时 Python 存在（desktop/runtime/hermes/python/python.exe）
- [x] T0.2 建 desktop/runtime/edict/ 目录，照搬 edict scripts（kanban_update/utils/file_lock/refresh_live_data/refresh_watcher/sync_officials_stats/skill_manager/sync_agent_config/apply_model_changes）
- [x] T0.3 照搬 data/schema.json + docker/demo_data/tasks_source.json 示例
- [x] T0.4 照搬 edict/backend/app/models/task.py（状态机单一事实源）
- [x] T0.5 冒烟：EDICT_HOME 指向 edict 目录，python kanban_update.py create/state/flow/done 跑通

## P1 照搬落地 + 11 官署 profiles + 太子人设（1–1.5 天）
- [x] T1.1 照搬 agents/*.md ×12 + agents.json（翻译蓝本）
- [x] T1.2 翻译 11 份 Hermes profile 提示词（zhongshu/menxia/shangshu/libu/hubu/libu_hr/bingbu/xingbu/gongbu/zaochao/qintianjian），保留接旨礼仪/职责边界/输出格式/封驳/标题规则，删 OpenClaw 专属命令，改看板命令
- [x] T1.3 create-edict-profiles.ps1 幂等创建脚本 + hermes profile list 验证 11 个
- [x] T1.4 taizi SOUL.md → OpenClaw 太子人设（分级/标题/传旨识别规则）

## P2 看板 + Hermes 执行全链路实测（1–2 天，硬前置）
- [x] T2.1 kanban_update.py 全命令实测（create/state/flow/done/todo/progress + 越权 + 非法流转 + 文件锁并发）
- [x] T2.2 Hermes CLI profile 人设逐节点执行实测（中书→门下→尚书→六部→复核→回奏）✅ 2026-08-27 真机通过（详见 plans/edict-p2-verify-2026-08-27.md）
- [x] T2.3 编排驱动方式定案（顺序驱动 vs Hermes 自动 agent）
- [x] T2.4 产出实测结论文档 plans/edict-p2-verify-2026-08-27.md

## P3 主进程编排器 + IPC + 传旨桥（1–2 天）
- [x] T3.1 edict-orchestrator.ts（轮询 tasks_source.json + 状态机校验 + Hermes CLI 编排 + 看板回写）
- [x] T3.2 IPC 契约（edict:issue/board/task/transition/review/officials/stats/models + board-updated 事件）+ preload
- [x] T3.3 OpenClaw 传旨桥（工具卡或主进程桥）→ create；轻任务直回
- [x] T3.4 计费回写（reportLocalExecution call_type=orchestrate → credits）
- [x] T3.5 单测：状态机全路径 + orchestrator spawn mock（19/19 通过，typecheck node+web 通过）

## P4 任务中心 UI 接真实数据（1–2 天）
- [x] T4.1 edict-data.ts mock → IPC board（军机处 JunjiView + 三省六部 EdictView）
- [x] T4.2 拖拽流转 + 非法流转提示 + 详情抽屉 flow_log
- [x] T4.3 军机处统计/官员总览接真实数据（typecheck node+web 通过，jest 442/442 通过）

## P5 任务中心收尾（1 天）
- [x] T5.1 下旨弹窗完整版（标题/正文/分级/指定六部）✅ EdictView 完整传旨弹窗（⚜ 详细下旨）+ 快捷下旨栏
- [x] T5.2 定时/我的/日志 3 tab 独立渲染✅ 任务中心 tab 拆分：定时(ScheduledPanel)/我的(经典双栏)/执行日志(拍平列表)，badge 接真实计数
- [x] T5.3 轻任务分流验证（守卫层）✅ edict-create-skill.test.ts 4 项通过（空标题拒绝/缺运行时拒绝/太子人设规则存在）；LLM 决策层需真机对话验收

## P6 上朝动画（1–2 天）
- [x] T6.1 对比 edict CourtCeremony.tsx 与深瞳AI pixi-office，选优 → 照搬 edict CourtCeremony（52 行纯 React+CSS 上朝开场，主题完全匹配；pixi-office 是常驻"AI 办公室"全景，非上朝动画且工程量大，不采用）
- [x] T6.2 军机处挂"上朝"入口 + 官署按 board 状态动画 → CourtCeremony.tsx（照搬原版：每日 localStorage 首次自动 + 🎎上朝按钮手动触发 + 3.5s 自动退朝 + 点击跳过；新增百官就位：12 官署牌位按真实 board 状态点亮 办差中/审议中/待复核/受阻/待命）
- [x] 验证：tsc node+web 通过；edict 4 套件 30/30 通过；全量 jest 446 通过（唯一失败 oral-workshop.test.ts 为既有 import.meta 问题）

---
每任务验收标准见 plans/edict-final-plan-v7-design.md 对应阶段。