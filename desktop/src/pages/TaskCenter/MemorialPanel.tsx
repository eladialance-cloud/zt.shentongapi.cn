/**
 * 奏折阁（edict 原版 MemorialPanel 照搬 + 深瞳 IPC 适配）
 * 数据源：edict:board（已完成/已取消任务 + flow_log 流转记录），onBoardUpdated 实时刷新
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MediaRenderer from "@/components/MediaRenderer";
import { isEdictAvailable, edictBoard, onEdictBoardUpdated } from "@/api/edict-api";
import type { EdictTask as Task, EdictFlowLogEntry as FlowEntry } from "@shared/edict-types";
import { STATE_LABEL, isEdictTask as isEdict, toast, fmtBoardTime } from "./panels-data";

export default function MemorialPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState("all");
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [available] = useState<boolean>(() => isEdictAvailable());

  const load = useCallback(async () => {
    try {
      const board = await edictBoard();
      setTasks(board.tasks || []);
    } catch (err) {
      console.warn("[MemorialPanel] 加载奏折失败:", err);
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    void load();
    const off = onEdictBoardUpdated(() => void load());
    return () => off();
  }, [available, load]);

  const mems = tasks
    .filter((t) => isEdict(t) && ["Done", "Cancelled"].includes(t.state))
    .filter((t) => (filter === "all" ? true : t.state === filter));

  const exportMemorial = (t: Task) => {
    const fl = t.flow_log || [];
    let md = `# 📜 奏折 · ${t.title}\n\n`;
    md += `- **任务编号**: ${t.id}\n`;
    md += `- **状态**: ${t.state}\n`;
    md += `- **负责部门**: ${t.org || "-"}\n`;
    if (fl.length) {
      md += `- **开始时间**: ${fmtBoardTime(fl[0].at)}\n`;
      md += `- **完成时间**: ${fmtBoardTime(fl[fl.length - 1].at)}\n`;
    }
    md += `\n## 流转记录\n\n`;
    for (const f of fl) {
      md += `- **${f.from}** → **${f.to}**  \n  ${f.remark}  \n  _${fmtBoardTime(f.at)}_\n\n`;
    }
    if (t.output && t.output !== "-") md += `## 产出物\n\n\`${t.output}\`\n`;
    navigator.clipboard.writeText(md).then(
      () => toast("✅ 奏折已复制为 Markdown", "ok"),
      () => toast("复制失败", "err")
    );
  };

  return (
    <div className="edictPanels">
      {/* 筛选 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>筛选：</span>
        {[
          { key: "all", label: "全部" },
          { key: "Done", label: "✅ 已完成" },
          { key: "Cancelled", label: "🚫 已取消" },
        ].map((f) => (
          <span
            key={f.key}
            className={`sess-filter${filter === f.key ? " active" : ""}`}
            onClick={() => setFilter(f.key)}
            style={{ cursor: "pointer", padding: "4px 10px", borderRadius: 6, fontSize: 12, border: "1px solid var(--line)", background: filter === f.key ? "var(--panel2)" : "transparent" }}
          >
            {f.label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
          共 {mems.length} 份奏折 · 旨意任务完成后自动归档
        </span>
      </div>

      {/* 列表 */}
      <div className="mem-list">
        {!mems.length ? (
          <div className="mem-empty">暂无奏折 — 任务完成后自动生成</div>
        ) : (
          mems.map((t) => {
            const fl = t.flow_log || [];
            const depts = [...new Set(fl.map((f) => f.from).concat(fl.map((f) => f.to)).filter((x) => x && x !== "皇上"))];
            const firstAt = fl.length ? fmtBoardTime(fl[0].at) : "";
            const lastAt = fl.length ? fmtBoardTime(fl[fl.length - 1].at) : "";
            const stIcon = t.state === "Done" ? "✅" : "🚫";
            return (
              <div className="mem-card" key={t.id} onClick={() => setDetailTask(t)} style={{ cursor: "pointer" }}>
                <div className="mem-icon">📜</div>
                <div className="mem-info">
                  <div className="mem-title">
                    {stIcon} {t.title || t.id}
                  </div>
                  <div className="mem-sub">
                    {t.id} · {t.org || ""} · 流转 {fl.length} 步
                  </div>
                  <div className="mem-tags">
                    {depts.slice(0, 5).map((d) => (
                      <span className="mem-tag" key={d}>{d}</span>
                    ))}
                  </div>
                </div>
                <div className="mem-right">
                  <span className="mem-date">{firstAt}</span>
                  {lastAt !== firstAt && <span className="mem-date">{lastAt}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 详情 */}
      {detailTask && (
        <MemorialDetailModal task={detailTask} onClose={() => setDetailTask(null)} onExport={exportMemorial} />
      )}
    </div>
  );
}

function MemorialDetailModal({
  task: t,
  onClose,
  onExport,
}: {
  task: Task;
  onClose: () => void;
  onExport: (t: Task) => void;
}) {
  const navigate = useNavigate();
  const fl = t.flow_log || [];
  const lastOfficial = t.official_outputs?.length ? t.official_outputs[t.official_outputs.length - 1] : undefined;
  const deliverText = (lastOfficial?.output || (t.output && t.output !== "-" ? t.output : "")).trim();
  const st = t.state || "Unknown";
  const stIcon = st === "Done" ? "✅" : st === "Cancelled" ? "🚫" : "🔄";
  const depts = [...new Set(fl.map((f) => f.from).concat(fl.map((f) => f.to)).filter((x) => x && x !== "皇上"))];

  const originLog: FlowEntry[] = [];
  const planLog: FlowEntry[] = [];
  const reviewLog: FlowEntry[] = [];
  const execLog: FlowEntry[] = [];
  const resultLog: FlowEntry[] = [];
  for (const f of fl) {
    if (f.from === "皇上") originLog.push(f);
    else if (f.to === "中书省" || f.from === "中书省") planLog.push(f);
    else if (f.to === "门下省" || f.from === "门下省") reviewLog.push(f);
    else if (f.remark && (f.remark.includes("完成") || f.remark.includes("回奏"))) resultLog.push(f);
    else execLog.push(f);
  }

  const renderPhase = (title: string, icon: string, items: FlowEntry[]) => {
    if (!items.length) return null;
    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          {icon} {title}
        </div>
        <div className="md-timeline">
          {items.map((f, i) => {
            const dotCls = f.remark?.includes("✅") ? "green" : f.remark?.includes("驳") ? "red" : "";
            return (
              <div className="md-tl-item" key={i}>
                <div className={`md-tl-dot ${dotCls}`} />
                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span className="md-tl-from">{f.from}</span>
                  <span className="md-tl-to">→ {f.to}</span>
                </div>
                <div className="md-tl-remark">{f.remark}</div>
                <div className="md-tl-time">{fmtBoardTime(f.at)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-body">
          <div style={{ fontSize: 11, color: "var(--acc)", fontWeight: 700, letterSpacing: ".04em", marginBottom: 4 }}>{t.id}</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{stIcon} {t.title || t.id}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            <span className={`tag st-${st}`}>{STATE_LABEL[st] || st}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{t.org}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>流转 {fl.length} 步</span>
            {depts.map((d) => (
              <span className="mem-tag" key={d}>{d}</span>
            ))}
          </div>

          {t.now && (
            <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "var(--muted)" }}>
              {t.now}
            </div>
          )}

          {renderPhase("圣旨原文", "👑", originLog)}
          {renderPhase("中书规划", "📋", planLog)}
          {renderPhase("门下审议", "🔍", reviewLog)}
          {renderPhase("六部执行", "⚔️", execLog)}
          {renderPhase("汇总回奏", "📨", resultLog)}

          {deliverText && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>📦 产出物（完整交付）</span>
                <button className="btn btn-g" onClick={() => navigate("/assets")} style={{ fontSize: 11, padding: "4px 10px" }}>
                  🗂 去素材库
                </button>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--muted)", wordBreak: "break-word" }}>
                <MediaRenderer content={deliverText} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn btn-g" onClick={() => onExport(t)} style={{ fontSize: 12, padding: "6px 16px" }}>
              📋 复制奏折
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
