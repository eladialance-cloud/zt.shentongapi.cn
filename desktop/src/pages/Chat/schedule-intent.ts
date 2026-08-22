// 定时任务意图识别 — 纯函数，从对话消息解析定时意图（无 LLM 依赖，确定性规则）
import type { ScheduledRepeatType } from "@/api/scheduled-task-api";

export interface ScheduleIntent {
  repeatType: ScheduledRepeatType;
  runTime?: string;
  weekday?: number;
  dueAt?: string;
  title?: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
};

/** 解析用户消息里的定时意图；未命中返回 null */
export function detectScheduleIntent(content: string): ScheduleIntent | null {
  const text = (content || "").trim();
  if (!text) return null;

  const weekly = text.match(/每周\s*[一二三四五六日天]/);
  const daily = text.match(/(?:每天|每日)\s*(\d{1,2})\s*[点时](?:(\d{1,2})\s*分?)?/);
  const timeIn = text.match(/(\d{1,2})\s*[点时](?:(\d{1,2})\s*分?)?/);

  const buildTime = (h?: string, m?: string): string | undefined => {
    if (h == null) return undefined;
    const hh = String(Math.min(23, Math.max(0, Number(h)))).padStart(2, "0");
    const mm = String(Math.min(59, Math.max(0, Number(m ?? 0)))).padStart(2, "0");
    return hh + ":" + mm;
  };

  if (weekly) {
    const wd = WEEKDAY_MAP[weekly[0].replace("每周", "").trim()];
    return {
      repeatType: "weekly",
      runTime: buildTime(timeIn?.[1], timeIn?.[2]) ?? "09:00",
      weekday: wd,
      title: text.slice(0, 24),
    };
  }
  if (daily) {
    return {
      repeatType: "daily",
      runTime: buildTime(daily[1], daily[2]) ?? "09:00",
      title: text.slice(0, 24),
    };
  }
  if (/定时|闹钟|提醒我|到点/.test(text)) {
    const t = new Date(Date.now() + 24 * 3600 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      repeatType: "once",
      dueAt: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T09:00`,
      title: text.slice(0, 24),
    };
  }
  return null;
}
