/**
 * 上朝动画 — 照搬 edict 原版 CourtCeremony.tsx（早朝开场 + 有事启奏无事退朝 + 每日一次）
 * 差异：
 * 1. 数据源从原版 liveStatus 改为桌面端 IPC（edictBoard + edict:board-updated 推送）
 * 2. 新增「百官就位」：12 官署牌位按真实看板任务状态点亮（办差中/审议中/待复核/受阻/待命）
 * 3. 由父组件受控 open/onClose（军机处「🎎 上朝」按钮 + 每日首次进入自动播放）
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { edictBoard, onEdictBoardUpdated } from "@/api/edict-api";
import type { EdictTask } from "@shared/edict-types";
import { OFFICIAL_META, orgToId } from "./edict-data";
import styles from "./court-ceremony.module.css";

/** 自动退朝时长（照搬原版 3.5s） */
const AUTO_CLOSE_MS = 3500;
/** 退朝淡出时长 */
const FADE_OUT_MS = 500;

/** 官署牌位状态（按真实看板任务推导，优先级由高到低） */
type PlacardState = "blocked" | "duty" | "review" | "audit" | "idle";

const PLACARD_META: Record<PlacardState, { label: string }> = {
  blocked: { label: "受阻" },
  duty: { label: "办差中" },
  review: { label: "待复核" },
  audit: { label: "审议中" },
  idle: { label: "待命" },
};

/** 任务状态 → [优先级, 牌位状态]（越高越醒目） */
const STATE_PLACARD: Record<string, [number, PlacardState]> = {
  Blocked: [100, "blocked"],
  Doing: [80, "duty"],
  Assigned: [80, "duty"],
  Next: [70, "duty"],
  Review: [60, "review"],
  PendingConfirm: [60, "review"],
  Menxia: [50, "audit"],
  Zhongshu: [50, "audit"],
  Taizi: [40, "audit"],
};

/** 任务是否归属某官署（taizi 按 creator 匹配，其余按 org 映射） */
function matchesOffice(id: string, t: EdictTask): boolean {
  if (id === "taizi") {
    return t.state === "Taizi" || !!t.creator?.includes("太子");
  }
  return orgToId(t.org || "") === id;
}

/** 由看板任务推导官署牌位状态 */
function placardStateFor(id: string, tasks: EdictTask[]): PlacardState {
  let best: PlacardState = "idle";
  let bestScore = 0;
  for (const t of tasks) {
    if (!matchesOffice(id, t)) continue;
    const hit = STATE_PLACARD[t.state];
    if (hit && hit[0] > bestScore) {
      bestScore = hit[0];
      best = hit[1];
    }
  }
  return best;
}

export interface CourtCeremonyProps {
  open: boolean;
  onClose: () => void;
}

export default function CourtCeremony({ open, onClose }: CourtCeremonyProps) {
  const [out, setOut] = useState(false);
  const [tasks, setTasks] = useState<EdictTask[]>([]);

  const skip = useCallback(() => {
    setOut(true);
    window.setTimeout(onClose, FADE_OUT_MS);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setOut(false);
    let alive = true;
    edictBoard()
      .then((b) => { if (alive) setTasks(b.tasks); })
      .catch(() => { /* 上朝动画非关键路径，静默降级 */ });
    const off = onEdictBoardUpdated((b) => { if (alive) setTasks(b.tasks); });
    const timer = window.setTimeout(skip, AUTO_CLOSE_MS);
    return () => { alive = false; off(); window.clearTimeout(timer); };
  }, [open, skip]);

  const summary = useMemo(() => {
    const pending = tasks.filter((t) => !["Done", "Cancelled"].includes(t.state)).length;
    const done = tasks.filter((t) => t.state === "Done").length;
    const overdue = tasks.filter(
      (t) => t.state !== "Done" && t.state !== "Cancelled" && t.eta && new Date(t.eta.replace(" ", "T")) < new Date(),
    ).length;
    return { pending, done, overdue };
  }, [tasks]);

  if (!open) return null;

  const d = new Date();
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  const dateStr = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 · 星期" + days[d.getDay()];

  return (
    <div className={out ? styles.bg + " " + styles.out : styles.bg} onClick={skip}>
      <div className={styles.glow} />
      <div className={styles.l1 + " " + styles.in}>🏛 早朝开始</div>
      <div className={styles.l2 + " " + styles.in}>有事启奏，无事退朝</div>

      {/* 百官就位：按真实 board 状态点亮牌位 */}
      <div className={styles.court + " " + styles.in}>
        <div className={styles.courtTitle}>— 百官就位 —</div>
        <div className={styles.grid}>
          {OFFICIAL_META.map((m, i) => {
            const st = placardStateFor(m.id, tasks);
            return (
              <div
                key={m.id}
                className={styles.placard}
                style={{ animationDelay: (120 + i * 90) + "ms" }}
              >
                <span className={styles.placardEmoji}>{m.emoji}</span>
                <span className={styles.placardName}>{m.name}</span>
                <span className={styles.placardStatus + " " + styles[st]}>{PLACARD_META[st].label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.l3 + " " + styles.in}>
        待办 {summary.pending} 件 · 已完成 {summary.done} 件
        {summary.overdue > 0 && " · ⚠ 超期 " + summary.overdue + " 件"}
      </div>
      <div className={styles.date + " " + styles.in}>{dateStr}</div>
      <div className={styles.skip}>点击任意处跳过</div>
    </div>
  );
}
