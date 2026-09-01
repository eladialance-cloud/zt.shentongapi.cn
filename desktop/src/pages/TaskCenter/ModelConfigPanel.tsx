/**
 * 模型配置（edict 原版 ModelConfig 照搬 + 深瞳 IPC 适配）
 * 数据源：edict:agent-config（模型/技能/knownModels）+ edict:set-model（写 Hermes config.yaml）+ edict:model-change-log
 */
import { useCallback, useEffect, useState } from "react";
import { isEdictAvailable, edictAgentConfig, edictSetModel, edictModelChangeLog } from "@/api/edict-api";
import { listChatModels } from "@/api/chat-api";
import type { EdictAgentConfig, EdictKnownModel, EdictModelChangeEntry } from "@shared/edict-types";
import type { ModelOption } from "@/types/chat";
import { toast } from "./panels-data";

export default function ModelConfig() {
  const [agentConfig, setAgentConfig] = useState<EdictAgentConfig | null>(null);
  const [changeLog, setChangeLog] = useState<EdictModelChangeEntry[]>([]);
  const [selMap, setSelMap] = useState<Record<string, string>>({});
  const [statusMap, setStatusMap] = useState<Record<string, { cls: string; text: string }>>({});
  const [loading, setLoading] = useState(true);
  const [knownModels, setKnownModels] = useState<EdictKnownModel[]>([]);
  const [modelWarn, setModelWarn] = useState("");
  const [available] = useState<boolean>(() => isEdictAvailable());

  const load = useCallback(async () => {
    try {
      const cfg = await edictAgentConfig();
      setAgentConfig(cfg);
      // 主进程 knownModels（JWT 读取）为空时，用对话页模型列表兜底（同一登录态，管理后台已启用模型）
      let models: EdictKnownModel[] = cfg.knownModels || [];
      if (!models.length) {
        const chatModels: ModelOption[] = await listChatModels().catch(() => [] as ModelOption[]);
        models = chatModels.map((m) => ({ id: m.id, label: m.name, provider: m.provider || "平台" }));
        if (models.length) setModelWarn("模型列表来自对话页数据源（主进程读取失败已兜底）");
      } else {
        setModelWarn("");
      }
      setKnownModels(models);
      const m: Record<string, string> = {};
      cfg.agents.forEach((ag) => { m[ag.id] = !ag.model || ag.model === "未配置" ? "__default__" : ag.model; });
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

  const models = knownModels;

  const handleSelect = (agentId: string, val: string) => {
    setSelMap((p) => ({ ...p, [agentId]: val }));
  };

  const resetMC = (agentId: string) => {
    const ag = agentConfig.agents.find((a) => a.id === agentId);
    if (ag) setSelMap((p) => ({ ...p, [agentId]: !ag.model || ag.model === "未配置" ? "__default__" : ag.model }));
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
          const applied = !ag.model || ag.model === "未配置" ? "__default__" : ag.model;
          const sel = selMap[ag.id] || applied;
          const changed = sel !== applied;
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
                当前: <b>{ag.model === "未配置" || !ag.model ? "未配置（跟随全局默认）" : ag.model}</b>
              </div>
              <select className="msel" value={sel} onChange={(e) => handleSelect(ag.id, e.target.value)}>
                <option value="__default__">跟随全局默认</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.provider})
                  </option>
                ))}
              </select>
              {!models.length && (
                <div style={{ fontSize: 11, color: "#f0b429", marginTop: 6 }}>
                  模型列表为空：请确认已登录，且管理后台已启用大模型；或点击「重置」后再试
                </div>
              )}
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
        💡 模型选项 = 管理后台已启用的大模型；选「跟随全局默认」则沿用全局配置。切换后自动同步到对应官署 Hermes profile；太子（OpenClaw）模型请在对话页选择。
        {modelWarn && <div style={{ color: "#f0b429", marginTop: 4 }}>⚠️ {modelWarn}</div>}
      </div>
    </div>
  );
}
