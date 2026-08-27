/**
 * 省部调度（edict 原版 MonitorPanel 照搬 + 深瞳 IPC 适配）
 * 数据源：edict:agents-status（官署 profile 在线状态 + 看板活跃聚合）+ edict:agent-wake 唤醒
 */
import { useCallback, useEffect, useState } from "react";
import { isEdictAvailable, edictAgentsStatus, edictAgentWake, edictBoard } from "@/api/edict-api";
import type { EdictAgentsStatusData, EdictTask } from "@shared/edict-types";
import { DEPTS, STATE_LABEL, toast, timeAgo } from "./panels-data";

export default function MonitorPanel() {
  const [status, setStatus] = useState<EdictAgentsStatusData | null>(null);
  const [tasks, setTasks] = useState<EdictTask[]>([]);
  const [waking, setWaking] = useState<Record<string, boolean>>({});
  const [available] = useState<boolean>(() => isEdictAvailable());

  const loadAll = useCallback(async () => {
    try {
      const [st, board] = await Promise.all([edictAgentsStatus(), edictBoard()]);
      setStatus(st);
      setTasks(board.tasks || []);
    } catch (err) {
      console.warn("[MonitorPanel] 加载失败:", err);
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    void loadAll();
    const timer = setInterval(() => void loadAll(), 30000);
    return () => clearInterval(timer);
  }, [available, loadAll]);

  const handleWake = async (agentId: string) => {
    setWaking((p) => ({ ...p, [agentId]: true }));
    try {
      const r = await edictAgentWake(agentId);
      toast(r.ok ? String(r.data || "唤醒指令已发出") : r.error || "唤醒失败", r.ok ? "ok" : "err");
      if (r.ok) setTimeout(() => void loadAll(), 2000);
    } catch {
      toast("唤醒失败", "err");
    } finally {
      setWaking((p) => ({ ...p, [agentId]: false }));
    }
  };

  const handleWakeAll = async () => {
    if (!status) return;
    const toWake = status.agents.filter((a) => a.id !== "main" && a.status === "unconfigured");
    if (!toWake.length) {
      toast("所有官署均已就绪");
      return;
    }
    toast(`正在配置 ${toWake.length} 个官署...`);
    for (const a of toWake) {
      await handleWake(a.id);
    }
    setTimeout(() => void loadAll(), 3000);
  };

  const activeTasks = tasks.filter((t) => !["Done", "Cancelled"].includes(t.state));

  const agents = (status?.agents || []).filter((a) => a.id !== "main");
  const running = agents.filter((a) => a.status === "running").length;
  const idle = agents.filter((a) => a.status === "idle").length;
  const unconf = agents.filter((a) => a.status === "unconfigured").length;
  const gw = status?.gateway;

  return (
    <div className="edictPanels">
      {/* Agent 在线状态 */}
      {status && status.ok && (
        <div className="as-panel">
          <div className="as-header">
            <span className="as-title">🔌 官署在线状态</span>
            <span className={`as-gw ${gw?.probe ? "ok" : gw?.alive ? "warn" : "err"}`}>
              Hermes: {gw?.status || "未知"}
            </span>
            <button className="btn-refresh" onClick={() => void loadAll()} style={{ marginLeft: 8 }}>
              🔄 刷新
            </button>
            {unconf > 0 && (
              <button className="btn-refresh" onClick={handleWakeAll} style={{ marginLeft: 4, borderColor: "var(--warn)", color: "var(--warn)" }}>
                ⚡ 全部配置
              </button>
            )}
          </div>
          <div className="as-grid">
            {agents.map((a) => {
              const canWake = a.status === "unconfigured";
              return (
                <div key={a.id} className="as-card" title={`${a.role} · ${a.statusLabel}`}>
                  <div className={`as-dot ${a.status}`} />
                  <div style={{ fontSize: 22 }}>{a.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{a.label}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{a.role}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{a.statusLabel}</div>
                  {a.tasksActive > 0 && (
                    <div style={{ fontSize: 10, color: "var(--acc)" }}>在办 {a.tasksActive} 项</div>
                  )}
                  {a.lastActive ? (
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>⏰ {timeAgo(a.lastActive)}</div>
                  ) : (
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>无活动记录</div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>🤖 {a.model || "待配置"}</div>
                  {canWake && (
                    <button className="as-wake-btn" onClick={(e) => { e.stopPropagation(); void handleWake(a.id); }} disabled={waking[a.id]}>
                      {waking[a.id] ? "配置中…" : "⚡ 配置"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="as-summary">
            <span><span className="as-dot running" style={{ position: "static", width: 8, height: 8 }} /> {running} 执行中</span>
            <span><span className="as-dot idle" style={{ position: "static", width: 8, height: 8 }} /> {idle} 待命</span>
            {unconf > 0 && <span><span className="as-dot unconfigured" style={{ position: "static", width: 8, height: 8 }} /> {unconf} 未配置</span>}
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>
              检测于 {(status.checkedAt || "").substring(11, 19)} · 30 秒自动刷新
            </span>
          </div>
        </div>
      )}

      {/* 值班网格 */}
      <div className="duty-grid">
        {DEPTS.map((d) => {
          const myTasks = activeTasks.filter((t) => t.org === d.label || t.assigneeOrg === d.label);
          const isActive = myTasks.some((t) => t.state === "Doing" || t.state === "Review");
          const isBlocked = myTasks.some((t) => t.state === "Blocked");
          const off = agents.find((a) => a.id === d.id);
          const dotCls = isBlocked ? "blocked" : isActive ? "busy" : off?.status === "running" ? "active" : "idle";
          const statusText = isBlocked ? "⚠️ 阻塞" : isActive ? "⚙️ 执行中" : off?.status === "running" ? "🟢 活跃" : "⚪ 候命";
          const cardCls = isBlocked ? "blocked-card" : isActive ? "active-card" : "";

          return (
            <div key={d.id} className={`duty-card ${cardCls}`}>
              <div className="dc-hdr">
                <span className="dc-emoji">{d.emoji}</span>
                <div className="dc-info">
                  <div className="dc-name">{d.label}</div>
                  <div className="dc-role">{d.role} · {d.rank}</div>
                </div>
                <div className="dc-status">
                  <span className={`dc-dot ${dotCls}`} />
                  <span>{statusText}</span>
                </div>
              </div>
              <div className="dc-body">
                {myTasks.length > 0 ? (
                  myTasks.slice(0, 3).map((t) => (
                    <div key={t.id} className="dc-task">
                      <div className="dc-task-id">{t.id}</div>
                      <div className="dc-task-title">{t.title || "(无标题)"}</div>
                      {t.now && t.now !== "-" && <div className="dc-task-now">{t.now.substring(0, 70)}</div>}
                      <div className="dc-task-meta">
                        <span className={`tag st-${t.state}`}>{STATE_LABEL[t.state] || t.state}</span>
                        {t.block && t.block !== "无" && (
                          <span className="tag" style={{ borderColor: "#ff527044", color: "var(--danger)" }}>🚫{t.block}</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="dc-idle">
                    <span style={{ fontSize: 20 }}>🪭</span>
                    <span>候命中</span>
                  </div>
                )}
              </div>
              <div className="dc-footer">
                <span className="dc-model">🤖 {off?.model || "待配置"}</span>
                {off?.lastActive && <span className="dc-la">⏰ {timeAgo(off.lastActive)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
