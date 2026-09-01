/**
 * 旨库（edict 原版 TemplatePanel 照搬 + 深瞳 IPC 适配）
 * 数据源：TEMPLATES 常量（照搬 edict）+ edict:create-task 下旨（复用 edictIssue 建任务）
 */
import { useState } from "react";
import { isEdictAvailable, edictCreateTask, edictAgentsStatus } from "@/api/edict-api";
import { TEMPLATES, TPL_CATS, toast, type Template } from "./panels-data";

export default function TemplatePanel() {
  const [tplCatFilter, setTplCatFilter] = useState("全部");
  const [formTpl, setFormTpl] = useState<Template | null>(null);
  const [formVals, setFormVals] = useState<Record<string, string>>({});
  const [previewCmd, setPreviewCmd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const tpls = tplCatFilter === "全部" ? TEMPLATES : TEMPLATES.filter((t) => t.cat === tplCatFilter);

  const openForm = (tpl: Template) => {
    const vals: Record<string, string> = {};
    tpl.params.forEach((p) => {
      vals[p.key] = p.default || "";
    });
    setFormVals(vals);
    setFormTpl(tpl);
    setPreviewCmd("");
  };

  const buildCmd = (tpl: Template) => {
    let cmd = tpl.command;
    for (const p of tpl.params) {
      cmd = cmd.replace(new RegExp("\\{" + p.key + "\\}", "g"), formVals[p.key] || p.default || "");
    }
    return cmd;
  };

  const preview = () => {
    if (!formTpl) return;
    setPreviewCmd(buildCmd(formTpl));
  };

  const execute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTpl || submitting) return;
    const cmd = buildCmd(formTpl);
    if (!cmd.trim()) {
      toast("请填写必填参数", "err");
      return;
    }
    if (!window.confirm(`确认下旨？\n\n${cmd.substring(0, 200)}${cmd.length > 200 ? "…" : ""}`)) return;

    setSubmitting(true);
    try {
      const params: Record<string, string> = {};
      for (const p of formTpl.params) {
        params[p.key] = formVals[p.key] || p.default || "";
      }
      const r = await edictCreateTask({
        title: cmd.substring(0, 120),
        body: cmd,
        dept: formTpl.depts[0] || "中书省",
        priority: "normal",
      });
      if (r.ok) {
        toast(`📜 ${(r as { data?: { taskId?: string } }).data?.taskId || ""} 旨意已下达`, "ok");
        setFormTpl(null);
      } else {
        toast(r.error || "下旨失败", "err");
      }
    } catch {
      toast("⚠️ 服务器连接失败", "err");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="edictPanels">
      {/* 分类筛选 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {TPL_CATS.map((c) => (
          <span
            key={c.name}
            className={`tpl-cat${tplCatFilter === c.name ? " active" : ""}`}
            onClick={() => setTplCatFilter(c.name)}
            style={{ cursor: "pointer" }}
          >
            {c.icon} {c.name}
          </span>
        ))}
      </div>

      {/* 模板网格 */}
      <div className="tpl-grid">
        {tpls.map((t) => (
          <div className="tpl-card" key={t.id}>
            <div className="tpl-top">
              <span className="tpl-icon">{t.icon}</span>
              <span className="tpl-name">{t.name}</span>
            </div>
            <div className="tpl-desc">{t.desc}</div>
            <div className="tpl-footer">
              {t.depts.map((d) => (
                <span className="tpl-dept" key={d}>{d}</span>
              ))}
              <span className="tpl-est">
                {t.est} · {t.cost}
              </span>
              <button className="tpl-go" onClick={() => openForm(t)}>
                下旨
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 模板表单弹窗 */}
      {formTpl && (
        <div className="modal-bg open" onClick={() => setFormTpl(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setFormTpl(null)}>✕</button>
            <div className="modal-body">
              <div style={{ fontSize: 11, color: "var(--acc)", fontWeight: 700, letterSpacing: ".04em", marginBottom: 4 }}>
                圣旨模板
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
                {formTpl.icon} {formTpl.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>{formTpl.desc}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
                {formTpl.depts.map((d) => (
                  <span className="tpl-dept" key={d}>{d}</span>
                ))}
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                  {formTpl.est} · {formTpl.cost}
                </span>
              </div>

              <form className="tpl-form" onSubmit={execute}>
                {formTpl.params.map((p) => (
                  <div className="tpl-field" key={p.key}>
                    <label className="tpl-label">
                      {p.label}
                      {p.required && <span style={{ color: "#ff5270" }}> *</span>}
                    </label>
                    {p.type === "textarea" ? (
                      <textarea
                        className="tpl-input"
                        style={{ minHeight: 80, resize: "vertical" }}
                        required={p.required}
                        value={formVals[p.key] || ""}
                        onChange={(e) => setFormVals((v) => ({ ...v, [p.key]: e.target.value }))}
                      />
                    ) : p.type === "select" ? (
                      <select
                        className="tpl-input"
                        value={formVals[p.key] || p.default || ""}
                        onChange={(e) => setFormVals((v) => ({ ...v, [p.key]: e.target.value }))}
                      >
                        {(p.options || []).map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="tpl-input"
                        type="text"
                        required={p.required}
                        value={formVals[p.key] || ""}
                        onChange={(e) => setFormVals((v) => ({ ...v, [p.key]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}

                {previewCmd && (
                  <div
                    style={{
                      background: "var(--panel2)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 14,
                      fontSize: 12,
                      color: "var(--muted)",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                      📜 将发送给中书省的旨意：
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{previewCmd}</div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-g" onClick={preview} style={{ padding: "8px 16px", fontSize: 12 }}>
                    👁 预览旨意
                  </button>
                  <button type="submit" className="tpl-go" style={{ padding: "8px 20px", fontSize: 13 }} disabled={submitting}>
                    {submitting ? "下达中…" : "📜 下旨"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
