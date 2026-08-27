/**
 * 模型配置（edict 原版 ModelConfig 照搬 + 深瞳 IPC 适配）
 * 数据源：edict:agent-config（模型/技能/knownModels）+ edict:set-model（写 Hermes config.yaml）+ edict:model-change-log
 */
import { useCallback, useEffect, useState } from "react";
import { isEdictAvailable, edictAgentConfig, edictSetModel, edictModelChangeLog } from "@/api/edict-api";
import type { EdictAgentConfig, EdictModelChangeEntry } from "@shared/edict-types";
import { toast } from "./panels-data";

export default function ModelConfig() {
  const [agentConfig, setAgentConfig] = useState<EdictAgentConfig | null>(null);
  const [changeLog, setChangeLog] = useState<EdictModelChangeEntry[]>([]);
  const [selMap, setSelMap] = useState<Record<string, string>>({});
  const [statusMap, setStatusMap] = useState<Record<string, { cls: string; text: string }>>({});
  const [loading, setLoading] = useState(true);
  const [available] = useState<boolean>(() => isEdictAvailable());

  const load = useCallback(async () => {
    try {
      const cfg = await edictAgentConfig();
      setAgentConfig(cfg);
      const m: Record<string, string> = {};
      cfg.agents.forEach((ag) => { m[ag.id] = ag.model; });
      setSelMap(m);
      const log = await edictModelChangeLog();
      setChangeLog(log || []);
    } catch (err) {
      console.warn("[ModelConfig] 加载失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!available) { setLoading(false); return; }
    void load();
  }, [available, load]);

  if (loading) return <div className="edictPanels empty" style={{ padding: 32, color: "var(--muted)" }}>⟳ 加载模型配置…</div>;
  if (!agentConfig?.agents) {
    return <div className="edictPanels empty" style={{ padding: 32, color: "var(--muted)" }}>⚠️ 请先启动 Hermes 运行时并登录</div>;
  }

  const models = agentConfig.knownModels?.length
    ? agentConfig.knownModels
    : [];

  const handleSelect = (agentId: string, val: string) => {
    setSelMap((p) => ({ ...p, [agentId]: val }));
  };

  const resetMC = (agentId: string) => {
    const ag = agentConfig.agents.find((a) => a.id === agentId);
    if (ag) setSelMap((p) => ({ ...p, [agentId]: ag.model }));
  };

  const applyModel = async (agentId: string) => {
    const model = selMap[agentId];
    if (!model) return;
    setStatusMap((p) => ({ ...p, [agentId]: { cls: "pending", text: "⟳ 提交中…" } }));
    try {
      const r = await edictSetModel(agentId, model);
      if (r.ok) {
        setStatusMap((p) => ({ ...p, [agentId]: { cls: "ok", text: "✅ 已应用（官署 config 已同步）" } }));
        toast(agentId + " 模型已更改", "ok");
        setTimeout(() => void load(), 1500);
      } else {
        setStatusMap((p) => ({ ...p, [agentId]: { cls: "err", text: "❌ " + (r.error || "错误") } }));
      }
    } catch {
      setStatusMap((p) => ({ ...p, [agentId]: { cls: "err", text: "❌ 无法连接" } }));
    }
  };

  return (
    <div className="edictPanels">
      <div className="model-grid">
        {agentConfig.agents.map((ag) => {
          const sel = selMap[ag.id] || ag.model;
          const changed = sel !== ag.model;
          const st = statusMap[ag.id];
          return (
            <div className="mc-card" key={ag.id}>
              <div className="mc-top">
                <span className="mc-emoji">{ag.emoji || "🏛️"}</span>
                <div>
                  <div className="mc-name">
                    {ag.label}{" "}
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{ag.id}</span>
                  </div>
                  <div className="mc-role">{ag.role}</div>
                </div>
              </div>
              <div className="mc-cur">
                当前: <b>{ag.model === "未配置" ? "未配置" : ag.model}</b>
              </div>
              <select className="msel" value={sel} onChange={(e) => handleSelect(ag.id, e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.provider})
                  </option>
                ))}
              </select>
              <div className="mc-btns">
                <button className="btn btn-p" disabled={!changed} onClick={() => void applyModel(ag.id)}>
                  应用
                </button>
                <button className="btn btn-g" onClick={() => resetMC(ag.id)}>
                  重置
                </button>
              </div>
              {st && <div className={`mc-st ${st.cls}`}>{st.text}</div>}
            </div>
          );
        })}
      </div>

      {/* 变更日志 */}
      <div style={{ marginTop: 24 }}>
        <div className="sec-title">变更日志</div>
        <div className="cl-list">
          {!changeLog?.length ? (
            <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>暂无变更</div>
          ) : (
            [...changeLog].reverse().slice(0, 15).map((e, i) => (
              <div className="cl-row" key={i}>
                <span className="cl-t">{(e.at || "").substring(0, 16).replace("T", " ")}</span>
                <span className="cl-a">{e.agentId}</span>
                <span className="cl-c">
                  <b>{e.oldModel}</b> → <b>{e.newModel}</b>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted)" }}>
        💡 模型走平台 llm-proxy 网关，切换后自动同步到对应官署 Hermes profile；太子（OpenClaw）模型请在对话页选择。
      </div>
    </div>
  );
}
