/**
 * 小任务/会话（edict 原版 SessionsPanel 照搬 + 深瞳 IPC 适配）
 * 数据源：edict:sessions —— 非旨意任务（OpenClaw 会话）优先；否则聚合官署最近活动
 */
import { useCallback, useEffect, useState } from "react";
import { isEdictAvailable, edictSessions, onEdictBoardUpdated } from "@/api/edict-api";
import type { EdictSessionItem } from "@shared/edict-types";
import { DEPTS, STATE_LABEL, timeAgo, isEdictTask } from "./panels-data";

export default function SessionsPanel() {
  const [sessions, setSessions] = useState<EdictSessionItem[]>([]);
  const [sessFilter, setSessFilter] = useState("all");
  const [detail, setDetail] = useState<EdictSessionItem | null>(null);
  const [available] = useState<boolean>(() => isEdictAvailable());

  const load = useCallback(async () => {
    try {
      const items = await edictSessions();
      setSessions(items || []);
    } catch (err) {
      console.warn("[SessionsPanel] 加载小任务失败:", err);
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    void load();
    const off = onEdictBoardUpdated(() => void load());
    return () => off();
  }, [available, load]);

  const emojiOf = (agent: string): string => {
    const d = DEPTS.find((x) => x.id === agent);
    return d ? d.emoji : "🏛️";
  };
  const labelOf = (agent: string, fallback?: string): string => {
    const d = DEPTS.find((x) => x.id === agent);
    return d ? d.label : fallback || agent;
  };

  let filtered = sessions;
  if (sessFilter === "active") filtered = sessions.filter((t) => !["Done", "Cancelled"].includes(t.state));
  else if (sessFilter !== "all") filtered = sessions.filter((t) => t.agent === sessFilter);

  const agentIds = [...new Set(sessions.map((t) => t.agent))];

  return (
    <div className="edictPanels">
      {/* 筛选 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { key: "all", label: `全部 (${sessions.length})` },
          { key: "active", label: "活跃" },
          ...agentIds.slice(0, 10).map((id) => ({ key: id, label: labelOf(id) })),
        ].map((f) => (
          <span
            key={f.key}
            className={`sess-filter${sessFilter === f.key ? " active" : ""}`}
            onClick={() => setSessFilter(f.key)}
            style={{ cursor: "pointer" }}
          >
            {f.label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
          {sessions.length ? (sessions[0].isEdict ? "官署活动聚合（来自看板流转记录）" : "OpenClaw 会话") : ""}
        </span>
      </div>

      {/* 网格 */}
      <div className="sess-grid">
        {!filtered.length ? (
          <div style={{ fontSize: 13, color: "var(--muted)", padding: 24, textAlign: "center", gridColumn: "1/-1" }}>
            暂无小任务/会话数据 — 下旨后各官署的执行活动会在此聚合展示
          </div>
        ) : (
          filtered.map((t) => {
            const emoji = emojiOf(t.agent);
            const agLabel = t.agentLabel || labelOf(t.agent) || t.org || t.agent;
            const hb = t.heartbeat || "⚪";
            const st = t.state || "Unknown";
            return (
              <div className="sess-card" key={t.id} onClick={() => setDetail(t)} style={{ cursor: "pointer" }}>
                <div className="sc-top">
                  <span className="sc-emoji">{emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="sc-agent">{agLabel}</span>
                      {t.channel && (
                        <span style={{ fontSize: 10, color: "var(--muted)", background: "var(--panel2)", padding: "2px 6px", borderRadius: 4 }}>
                          {t.channel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{hb}</span>
                    <span className={`tag st-${st}`} style={{ fontSize: 10 }}>{STATE_LABEL[st] || st}</span>
                  </div>
                </div>
                <div className="sc-title">{t.title || t.id}</div>
                {t.lastMessage && (
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8, borderLeft: "2px solid var(--line)", paddingLeft: 8, maxHeight: 40, overflow: "hidden" }}>
                    {t.lastMessage}
                  </div>
                )}
                <div className="sc-meta">
                  {t.totalTokens ? <span style={{ fontSize: 10, color: "var(--muted)" }}>🪙 {t.totalTokens.toLocaleString()} tokens</span> : null}
                  {t.updatedAt ? <span className="sc-time">{timeAgo(t.updatedAt)}</span> : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 详情弹窗 */}
      {detail && <SessionDetailModal item={detail} emojiOf={emojiOf} onClose={() => setDetail(null)} />}
    </div>
  );
}

function SessionDetailModal({
  item: t,
  emojiOf,
  onClose,
}: {
  item: EdictSessionItem;
  emojiOf: (agent: string) => string;
  onClose: () => void;
}) {
  const st = t.state || "Unknown";
  const acts = t.activity || [];
  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-body">
          <div style={{ fontSize: 11, color: "var(--acc)", fontWeight: 700, letterSpacing: ".04em", marginBottom: 4 }}>{t.id}</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{emojiOf(t.agent)} {t.title || t.id}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            <span className={`tag st-${st}`}>{STATE_LABEL[st] || st}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{t.agentLabel || t.agent}</span>
            {t.org && <span style={{ fontSize: 11, color: "var(--muted)" }}>{t.org}</span>}
            {t.channel && <span style={{ fontSize: 11, color: "var(--muted)" }}>{t.channel}</span>}
          </div>

          {t.lastMessage && (
            <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "var(--muted)" }}>
              {t.lastMessage}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            📋 最近活动 <span style={{ fontWeight: 400, color: "var(--muted)" }}>({acts.length} 条)</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel2)" }}>
            {!acts.length ? (
              <div style={{ padding: 16, color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
                暂无活动明细（可到三省六部查看完整流转记录）
              </div>
            ) : (
              acts.slice(-15).reverse().map((a, i) => (
                <div key={i} style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", fontSize: 12, lineHeight: 1.5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span>{a.type === "emperor" ? "👑" : a.type === "decree" ? "⚡" : a.type === "system" ? "📝" : "🤖"}</span>
                    <span style={{ fontWeight: 600, fontSize: 11 }}>{a.official_name || (a.type === "emperor" ? "皇帝" : "官署")}</span>
                    <span style={{ color: "var(--muted)", fontSize: 10, marginLeft: "auto" }}>
                      {a.timestamp ? new Date(a.timestamp * 1000).toLocaleString("zh-CN", { hour12: false }) : ""}
                    </span>
                  </div>
                  <div style={{ color: "var(--muted)" }}>{a.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
