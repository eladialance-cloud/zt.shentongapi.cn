/**
 * 技能管理（edict 原版 SkillsConfig 照搬 + 深瞳 IPC 适配）
 * 数据源：edict:agent-config（官署 profile 技能清单）+ edict:skill-content / edict:add-skill
 *        + edict:remote-skills-list / edict:add|update|remove-remote-skill（社区远程技能源）
 */
import { useEffect, useState } from "react";
import {
  isEdictAvailable,
  edictAgentConfig,
  edictSkillContent,
  edictAddSkill,
  edictRemoteSkillsList,
  edictAddRemoteSkill,
  edictUpdateRemoteSkill,
  edictRemoveRemoteSkill,
  edictSkillLibrary,
  edictCopySkill,
  edictRemoveSkill,
} from "@/api/edict-api";
import type { EdictAgentConfig, EdictLibrarySkill, EdictRemoteSkillItem } from "@shared/edict-types";
import { toast } from "./panels-data";

// 社区知名 Skills 源快选列表（照搬 edict 原版）
const COMMUNITY_SOURCES = [
  {
    label: "obra/superpowers",
    emoji: "⚡",
    stars: "66.9k",
    desc: "完整开发工作流技能集",
    skills: [
      { name: "brainstorming", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/brainstorming/SKILL.md" },
      { name: "test-driven-development", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/test-driven-development/SKILL.md" },
      { name: "systematic-debugging", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/systematic-debugging/SKILL.md" },
      { name: "subagent-driven-development", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/subagent-driven-development/SKILL.md" },
      { name: "writing-plans", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/writing-plans/SKILL.md" },
      { name: "executing-plans", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/executing-plans/SKILL.md" },
      { name: "requesting-code-review", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/requesting-code-review/SKILL.md" },
      { name: "root-cause-tracing", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/root-cause-tracing/SKILL.md" },
      { name: "verification-before-completion", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/verification-before-completion/SKILL.md" },
      { name: "dispatching-parallel-agents", url: "https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/dispatching-parallel-agents/SKILL.md" },
    ],
  },
  {
    label: "anthropics/skills",
    emoji: "🏛️",
    stars: "官方",
    desc: "Anthropic 官方技能库",
    skills: [
      { name: "docx", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md" },
      { name: "pdf", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md" },
      { name: "xlsx", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/xlsx/SKILL.md" },
      { name: "pptx", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/pptx/SKILL.md" },
      { name: "mcp-builder", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/SKILL.md" },
      { name: "frontend-design", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md" },
      { name: "web-artifacts-builder", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/web-artifacts-builder/SKILL.md" },
      { name: "webapp-testing", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/webapp-testing/SKILL.md" },
      { name: "algorithmic-art", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/algorithmic-art/SKILL.md" },
      { name: "canvas-design", url: "https://raw.githubusercontent.com/anthropics/skills/main/skills/canvas-design/SKILL.md" },
    ],
  },
  {
    label: "ComposioHQ/awesome-claude-skills",
    emoji: "🌐",
    stars: "39.2k",
    desc: "100+ 社区精选技能",
    skills: [
      { name: "github-integration", url: "https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/github-integration/SKILL.md" },
      { name: "data-analysis", url: "https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/data-analysis/SKILL.md" },
      { name: "code-review", url: "https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/code-review/SKILL.md" },
    ],
  },
];

/** 官署推荐技能（对齐 edict 原版 SKILL_AGENT_MAPPING + 官署职能）：添加技能弹窗左侧推荐方案 */
const AGENT_RECOMMEND: Record<string, string[]> = {
  taizi: ["clawhub", "taskflow", "github", "summarize"],
  zhongshu: ["taskflow", "diagram-maker", "summarize", "spike"],
  menxia: ["oracle", "github", "gh-issues", "summarize"],
  shangshu: ["taskflow", "github", "trello", "himalaya"],
  libu: ["n8n-run-workflow"],
  hubu: ["n8n-run-workflow"],
  libu_hr: ["n8n-run-workflow"],
  bingbu: ["n8n-run-workflow"],
  xingbu: ["n8n-run-workflow"],
  gongbu: ["n8n-run-workflow"],
  zaochao: ["summarize", "blogwatcher", "meme-maker", "sherpa-onnx-tts"],
  qintianjian: ["model-usage", "summarize", "taskflow", "diagram-maker"],
};

/** 技能库类别清单（筛选 chips） */
const LIB_CATEGORIES = ["开发", "文档知识", "沟通协作", "运维系统", "内容创作", "任务流程", "生活硬件", "其他"];

interface SkillModalState {
  agentId: string;
  name: string;
  content: string;
  path: string;
}

interface AddFormState {
  agentId: string;
  agentLabel: string;
}

export default function SkillsConfig() {
  const [agentConfig, setAgentConfig] = useState<EdictAgentConfig | null>(null);
  const [available] = useState<boolean>(() => isEdictAvailable());

  // 本地技能状态
  const [skillModal, setSkillModal] = useState<SkillModalState | null>(null);
  const [addForm, setAddForm] = useState<AddFormState | null>(null);
  const [formData, setFormData] = useState({ name: "", desc: "", trigger: "" });
  const [submitting, setSubmitting] = useState(false);

  // 主 Tab 切换
  const [activeTab, setActiveTab] = useState<"local" | "remote">("local");

  // 远程技能状态
  const [remoteSkills, setRemoteSkills] = useState<EdictRemoteSkillItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [addRemoteForm, setAddRemoteForm] = useState(false);
  const [remoteFormData, setRemoteFormData] = useState({ agentId: "", skillName: "", sourceUrl: "", description: "" });
  const [remoteSubmitting, setRemoteSubmitting] = useState(false);
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);
  const [removingSkill, setRemovingSkill] = useState<string | null>(null);
  const [quickPickSource, setQuickPickSource] = useState<(typeof COMMUNITY_SOURCES)[0] | null>(null);
  const [quickPickAgent, setQuickPickAgent] = useState("");

  // 技能库（技能市场《我的》）：OpenClaw 内置 / Hermes 已装 / 云端技能包
  const [library, setLibrary] = useState<EdictLibrarySkill[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [libSearch, setLibSearch] = useState("");
  const [removingLocalKey, setRemovingLocalKey] = useState<string | null>(null);

  const loadAgentConfig = async () => {
    if (!available) return;
    try {
      const cfg = await edictAgentConfig();
      setAgentConfig(cfg);
    } catch (err) {
      console.warn("[SkillsConfig] 加载 Agent 配置失败:", err);
      toast("官署配置加载失败", "err");
    }
  };

  useEffect(() => {
    void loadAgentConfig();
  }, [available]);

  useEffect(() => {
    if (activeTab === "remote") void loadRemoteSkills();
  }, [activeTab]);

  useEffect(() => {
    if (available) void loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  const loadRemoteSkills = async () => {
    setRemoteLoading(true);
    try {
      const r = await edictRemoteSkillsList();
      if (r.ok) setRemoteSkills(r.remoteSkills || []);
      else toast(r.error || "远程技能列表加载失败", "err");
    } catch {
      toast("远程技能列表加载失败", "err");
    }
    setRemoteLoading(false);
  };

  const loadLibrary = async () => {
    setLibLoading(true);
    try {
      const r = await edictSkillLibrary();
      if (r.ok) setLibrary(r.skills || []);
      else toast(r.error || "技能库加载失败", "err");
    } catch {
      toast("技能库加载失败", "err");
    }
    setLibLoading(false);
  };

  /** 从技能库添加技能到官署（整目录复制） */
  const handleAddFromLibrary = async (agentId: string, skill: EdictLibrarySkill) => {
    try {
      const r = await edictCopySkill(agentId, skill.source, skill.name);
      if (r.ok) {
        toast("✅ 技能 " + skill.name + " 已添加到该官署", "ok");
        void loadAgentConfig();
      } else {
        toast(r.error || "添加失败", "err");
      }
    } catch {
      toast("服务器连接失败", "err");
    }
  };

  /** 删除官署本地技能（可重新从技能库添加） */
  const handleRemoveLocal = async (agentId: string, skillName: string) => {
    const key = agentId + "/" + skillName;
    setRemovingLocalKey(key);
    try {
      const r = await edictRemoveSkill(agentId, skillName);
      if (r.ok) {
        toast("🗑️ 技能 " + skillName + " 已移除", "ok");
        void loadAgentConfig();
      } else {
        toast(r.error || "移除失败", "err");
      }
    } catch {
      toast("服务器连接失败", "err");
    }
    setRemovingLocalKey(null);
  };

  const openSkill = async (agentId: string, skillName: string) => {
    setSkillModal({ agentId, name: skillName, content: "⟳ 加载中…", path: "" });
    try {
      const r = await edictSkillContent(agentId, skillName);
      if (r.ok) {
        setSkillModal({ agentId, name: skillName, content: r.content || "", path: r.path || "" });
      } else {
        setSkillModal({ agentId, name: skillName, content: "❌ " + (r.error || "无法读取"), path: "" });
      }
    } catch {
      setSkillModal({ agentId, name: skillName, content: "❌ 服务器连接失败", path: "" });
    }
  };

  const openAddForm = (agentId: string, agentLabel: string) => {
    setAddForm({ agentId, agentLabel });
    setFormData({ name: "", desc: "", trigger: "" });
    void loadLibrary();
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm || !formData.name) return;
    setSubmitting(true);
    try {
      const r = await edictAddSkill(addForm.agentId, formData.name, formData.desc, formData.trigger);
      if (r.ok) {
        toast("✅ 技能 " + formData.name + " 已添加到 " + addForm.agentLabel, "ok");
        setAddForm(null);
        void loadAgentConfig();
      } else {
        toast(r.error || "添加失败", "err");
      }
    } catch {
      toast("服务器连接失败", "err");
    }
    setSubmitting(false);
  };

  const submitAddRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    const { agentId, skillName, sourceUrl, description } = remoteFormData;
    if (!agentId || !skillName || !sourceUrl) return;
    setRemoteSubmitting(true);
    try {
      const r = await edictAddRemoteSkill(agentId, skillName, sourceUrl, description);
      if (r.ok) {
        toast("✅ 远程技能 " + skillName + " 已添加到 " + agentId, "ok");
        setAddRemoteForm(false);
        setRemoteFormData({ agentId: "", skillName: "", sourceUrl: "", description: "" });
        void loadRemoteSkills();
        void loadAgentConfig();
      } else {
        toast(r.error || "添加失败", "err");
      }
    } catch {
      toast("服务器连接失败", "err");
    }
    setRemoteSubmitting(false);
  };

  const handleUpdate = async (skill: EdictRemoteSkillItem) => {
    const key = skill.agentId + "/" + skill.skillName;
    setUpdatingSkill(key);
    try {
      const r = await edictUpdateRemoteSkill(skill.agentId, skill.skillName);
      if (r.ok) {
        toast("✅ 技能 " + skill.skillName + " 已更新", "ok");
        void loadRemoteSkills();
      } else {
        toast(r.error || "更新失败", "err");
      }
    } catch {
      toast("服务器连接失败", "err");
    }
    setUpdatingSkill(null);
  };

  const handleRemove = async (skill: EdictRemoteSkillItem) => {
    const key = skill.agentId + "/" + skill.skillName;
    setRemovingSkill(key);
    try {
      const r = await edictRemoveRemoteSkill(skill.agentId, skill.skillName);
      if (r.ok) {
        toast("🗑️ 技能 " + skill.skillName + " 已移除", "ok");
        void loadRemoteSkills();
        void loadAgentConfig();
      } else {
        toast(r.error || "移除失败", "err");
      }
    } catch {
      toast("服务器连接失败", "err");
    }
    setRemovingSkill(null);
  };

  const handleQuickImport = async (skillUrl: string, skillName: string) => {
    if (!quickPickAgent) {
      toast("请先选择目标 Agent", "err");
      return;
    }
    try {
      const r = await edictAddRemoteSkill(quickPickAgent, skillName, skillUrl, "");
      if (r.ok) {
        toast("✅ " + skillName + " → " + quickPickAgent, "ok");
        void loadRemoteSkills();
        void loadAgentConfig();
      } else {
        toast(r.error || "导入失败", "err");
      }
    } catch {
      toast("服务器连接失败", "err");
    }
  };

  if (!agentConfig?.agents) {
    return (
      <div className="edictPanels">
        <div className="mb-empty">⟳ 加载中…（无法读取官署配置）</div>
      </div>
    );
  }

  // ── 本地技能面板 ──
  const localPanel = (
    <div>
      <div className="skills-grid">
        {agentConfig.agents.map((ag) => (
          <div className="sk-card" key={ag.id}>
            <div className="sk-hdr">
              <span className="sk-emoji">{ag.emoji || "🏛️"}</span>
              <span className="sk-name">{ag.label}</span>
              <span className="sk-cnt">{(ag.skills || []).length} 技能</span>
            </div>
            <div className="sk-list">
              {!(ag.skills || []).length ? (
                <div className="sk-empty">暂无 Skills</div>
              ) : (
                (ag.skills || []).map((sk) => (
                  <div className="sk-item" key={sk.name} onClick={() => openSkill(ag.id, sk.name)}>
                    <span className="si-name">📦 {sk.name}</span>
                    <span className="si-desc">{sk.description || "无描述"}</span>
                    <span className="si-arrow" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <button
                        title="删除技能（可重新从技能库添加）"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("确定删除技能「" + sk.name + "」吗？可重新从技能库添加。")) void handleRemoveLocal(ag.id, sk.name);
                        }}
                        style={{ background: "transparent", border: "none", color: "#ff5270", cursor: "pointer", fontSize: 13, padding: "2px 6px" }}
                      >
                        ✕
                      </button>
                      <span>›</span>
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="sk-add" onClick={() => openAddForm(ag.id, ag.label)}>
              ＋ 添加技能
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── 远程技能面板 ──
  const remotePanel = (
    <div>
      {/* 社区快速导入 */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🚀 社区技能源快速导入</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {COMMUNITY_SOURCES.map((src) => (
            <div
              key={src.label}
              onClick={() => setQuickPickSource(quickPickSource?.label === src.label ? null : src)}
              style={{
                padding: "8px 14px",
                background: quickPickSource?.label === src.label ? "#0d1f45" : "var(--panel)",
                border: "1px solid " + (quickPickSource?.label === src.label ? "var(--acc)" : "var(--line)"),
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 12,
                transition: "all .15s",
              }}
            >
              <span style={{ marginRight: 6 }}>{src.emoji}</span>
              <b style={{ color: "var(--text)" }}>{src.label}</b>
              <span style={{ marginLeft: 6, color: "#f0b429", fontSize: 11 }}>★ {src.stars}</span>
              <span style={{ marginLeft: 8, color: "var(--muted)" }}>{src.desc}</span>
            </div>
          ))}
        </div>

        {quickPickSource && (
          <div style={{ marginTop: 14, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>目标 Agent：</span>
              <select
                value={quickPickAgent}
                onChange={(e) => setQuickPickAgent(e.target.value)}
                style={{ padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text)", fontSize: 12 }}
              >
                <option value="">— 选择 Agent —</option>
                {agentConfig.agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>{ag.emoji} {ag.label} ({ag.id})</option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
              {quickPickSource.skills.map((sk) => {
                const alreadyAdded = remoteSkills.some((r) => r.skillName === sk.name && r.agentId === quickPickAgent);
                return (
                  <div
                    key={sk.name}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", background: "var(--panel2)", borderRadius: 8,
                      border: "1px solid var(--line)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>📦 {sk.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", wordBreak: "break-all", maxWidth: 180 }}>{sk.url.split("/").slice(-2).join("/")}</div>
                    </div>
                    {alreadyAdded ? (
                      <span style={{ fontSize: 10, color: "#4caf88", fontWeight: 600 }}>✓ 已导入</span>
                    ) : (
                      <button
                        onClick={() => handleQuickImport(sk.url, sk.name)}
                        style={{ padding: "4px 10px", background: "var(--acc)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}
                      >
                        导入
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 已添加的远程技能列表 */}
      {remoteLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>⟳ 加载中…</div>
      ) : remoteSkills.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", background: "var(--panel)", borderRadius: 12, border: "1px dashed var(--line)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🌐</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>尚无远程技能</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>从社区技能源快速导入，或手动添加 URL</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {remoteSkills.map((sk) => {
            const key = sk.agentId + "/" + sk.skillName;
            const isUpdating = updatingSkill === key;
            const isRemoving = removingSkill === key;
            const agInfo = agentConfig.agents.find((a) => a.id === sk.agentId);
            return (
              <div
                key={key}
                style={{
                  background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 18px",
                  display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>📦 {sk.skillName}</span>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 999,
                      background: sk.status === "valid" ? "#0d3322" : "#3d1111",
                      color: sk.status === "valid" ? "#4caf88" : "#ff5270",
                      fontWeight: 600,
                    }}>
                      {sk.status === "valid" ? "✓ 有效" : "✗ 文件丢失"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--panel2)", padding: "2px 8px", borderRadius: 6 }}>
                      {agInfo?.emoji} {agInfo?.label || sk.agentId}
                    </span>
                  </div>
                  {sk.description && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{sk.description}</div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>🔗 <a href={sk.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--acc)", textDecoration: "none" }}>{sk.sourceUrl.length > 60 ? sk.sourceUrl.slice(0, 60) + "…" : sk.sourceUrl}</a></span>
                    <span>📅 {sk.lastUpdated ? sk.lastUpdated.slice(0, 10) : sk.addedAt?.slice(0, 10)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openSkill(sk.agentId, sk.skillName)}
                    style={{ padding: "6px 12px", background: "transparent", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 6, cursor: "pointer", fontSize: 11 }}
                  >
                    查看
                  </button>
                  <button
                    onClick={() => handleUpdate(sk)}
                    disabled={isUpdating}
                    style={{ padding: "6px 12px", background: "transparent", color: "var(--acc)", border: "1px solid var(--acc)", borderRadius: 6, cursor: "pointer", fontSize: 11 }}
                  >
                    {isUpdating ? "⟳" : "更新"}
                  </button>
                  <button
                    onClick={() => handleRemove(sk)}
                    disabled={isRemoving}
                    style={{ padding: "6px 12px", background: "transparent", color: "#ff5270", border: "1px solid #ff5270", borderRadius: 6, cursor: "pointer", fontSize: 11 }}
                  >
                    {isRemoving ? "⟳" : "删除"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="edictPanels">
      {/* 主 Tab 切换 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--line)", paddingBottom: 0 }}>
        {[
          { key: "local" as const, label: "🏛️ 本地技能", count: agentConfig.agents.reduce((n, a) => n + (a.skills?.length || 0), 0) },
          { key: "remote" as const, label: "🌐 远程技能", count: remoteSkills.length },
        ].map((t) => (
          <div
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: "8px 18px", cursor: "pointer", fontSize: 13, borderRadius: "8px 8px 0 0",
              fontWeight: activeTab === t.key ? 700 : 400,
              background: activeTab === t.key ? "var(--panel)" : "transparent",
              color: activeTab === t.key ? "var(--text)" : "var(--muted)",
              border: activeTab === t.key ? "1px solid var(--line)" : "1px solid transparent",
              borderBottom: activeTab === t.key ? "1px solid var(--panel)" : "1px solid transparent",
              position: "relative", bottom: -1,
              transition: "all .15s",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "#1a2040", color: "var(--acc)" }}>
                {t.count}
              </span>
            )}
          </div>
        ))}
      </div>

      {activeTab === "local" ? localPanel : remotePanel}

      {/* Skill Content Modal */}
      {skillModal && (
        <div className="modal-bg open" onClick={() => setSkillModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSkillModal(null)}>✕</button>
            <div className="modal-body">
              <div style={{ fontSize: 11, color: "var(--acc)", fontWeight: 700, letterSpacing: ".04em", marginBottom: 4 }}>
                {skillModal.agentId.toUpperCase()}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>📦 {skillModal.name}</div>
              <div className="sk-modal-body">
                <div className="sk-md" style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.7 }}>
                  {skillModal.content}
                </div>
                {skillModal.path && (
                  <div className="sk-path" style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>
                    📂 {skillModal.path}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 本地 Add Skill Form Modal */}
      {addForm && (
        <div className="modal-bg open" onClick={() => setAddForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAddForm(null)}>✕</button>
            <div className="modal-body">
              <div style={{ fontSize: 11, color: "var(--acc)", fontWeight: 700, letterSpacing: ".04em", marginBottom: 4 }}>
                为 {addForm.agentLabel} 添加技能
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 18 }}>📦 从技能库添加（技能市场《我的》）</div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {/* 左：推荐方案 */}
                <div style={{ width: 210, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>💡 推荐给 {addForm.agentLabel}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                    {(AGENT_RECOMMEND[addForm.agentId] || []).map((n) => {
                      const libSkill = library.find((s) => s.name === n);
                      const added = agentConfig.agents.find((a) => a.id === addForm.agentId)?.skills?.some((s) => s.name === n);
                      if (!libSkill) return null;
                      return (
                        <div key={n} style={{ padding: "8px 10px", background: "var(--panel2)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>📦 {n}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)", margin: "2px 0 6px" }}>{libSkill.category} · {libSkill.deps}</div>
                          {added ? (
                            <span style={{ fontSize: 10, color: "#4caf88", fontWeight: 600 }}>✓ 已添加</span>
                          ) : (
                            <button onClick={() => void handleAddFromLibrary(addForm.agentId, libSkill)} style={{ padding: "3px 10px", background: "var(--acc)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>添加</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* 右：全量技能库 */}
                <div style={{ flex: 1, minWidth: 260 }}>
                  <input
                    value={libSearch}
                    onChange={(e) => setLibSearch(e.target.value)}
                    placeholder="搜索技能…"
                    style={{ width: "100%", padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", fontSize: 12, marginBottom: 10 }}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    <button onClick={() => setCategoryFilter("")} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, cursor: "pointer", border: "1px solid " + (categoryFilter === "" ? "var(--acc)" : "var(--line)"), background: categoryFilter === "" ? "#0d1f45" : "var(--panel)", color: categoryFilter === "" ? "var(--acc)" : "var(--muted)" }}>全部</button>
                    {LIB_CATEGORIES.map((c) => (
                      <button key={c} onClick={() => setCategoryFilter(categoryFilter === c ? "" : c)} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, cursor: "pointer", border: "1px solid " + (categoryFilter === c ? "var(--acc)" : "var(--line)"), background: categoryFilter === c ? "#0d1f45" : "var(--panel)", color: categoryFilter === c ? "var(--acc)" : "var(--muted)" }}>{c}</button>
                    ))}
                  </div>
                  <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                    {libLoading ? (
                      <div style={{ color: "var(--muted)", fontSize: 12, padding: "20px 0", textAlign: "center" }}>⟳ 加载技能库…</div>
                    ) : (
                      (() => {
                        const kw = libSearch.trim().toLowerCase();
                        const filtered = library.filter((s) =>
                          (!categoryFilter || s.category === categoryFilter) &&
                          (!kw || s.name.toLowerCase().includes(kw) || s.description.toLowerCase().includes(kw))
                        );
                        if (!filtered.length) return <div style={{ color: "var(--muted)", fontSize: 12, padding: "20px 0", textAlign: "center" }}>没有匹配的技能（可先到技能市场《我的》查看/安装）</div>;
                        return filtered.map((s) => {
                          const added = agentConfig.agents.find((a) => a.id === addForm.agentId)?.skills?.some((sk) => sk.name === s.name);
                          const srcLabel = s.source === "openclaw" ? "OpenClaw 内置" : s.source === "hermes" ? "Hermes 已装" : "云端技能包";
                          return (
                            <div key={s.name + "|" + s.source} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--panel2)", borderRadius: 8, border: "1px solid var(--line)" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  📦 {s.name}
                                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "#1a2040", color: "var(--acc)" }}>{srcLabel}</span>
                                </div>
                                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.category} · {s.deps} · {s.description.slice(0, 60)}</div>
                              </div>
                              {added ? (
                                <span style={{ fontSize: 10, color: "#4caf88", fontWeight: 600, whiteSpace: "nowrap" }}>✓ 已添加</span>
                              ) : (
                                <button onClick={() => void handleAddFromLibrary(addForm.agentId, s)} style={{ padding: "4px 10px", background: "var(--acc)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>添加</button>
                              )}
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <button type="button" className="btn btn-g" onClick={() => setAddForm(null)} style={{ padding: "8px 20px" }}>关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 远程 Add Remote Skill Modal */}
      {addRemoteForm && (
        <div className="modal-bg open" onClick={() => setAddRemoteForm(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAddRemoteForm(false)}>✕</button>
            <div className="modal-body">
              <div style={{ fontSize: 11, color: "#a07aff", fontWeight: 700, letterSpacing: ".04em", marginBottom: 4 }}>
                远程技能管理
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 18 }}>🌐 添加远程 Skill</div>

              <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 18, fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
                支持 GitHub Raw URL，如：<br />
                <code style={{ color: "var(--acc)", fontSize: 10 }}>https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/brainstorming/SKILL.md</code>
              </div>

              <form onSubmit={submitAddRemote} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>目标 Agent <span style={{ color: "#ff5270" }}>*</span></label>
                  <select
                    required
                    value={remoteFormData.agentId}
                    onChange={(e) => setRemoteFormData((p) => ({ ...p, agentId: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", fontSize: 13 }}
                  >
                    <option value="">— 选择 Agent —</option>
                    {agentConfig.agents.map((ag) => (
                      <option key={ag.id} value={ag.id}>{ag.emoji} {ag.label} ({ag.id})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>技能名称 <span style={{ color: "#ff5270" }}>*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="如 brainstorming, code-review"
                    value={remoteFormData.skillName}
                    onChange={(e) => setRemoteFormData((p) => ({ ...p, skillName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                    style={{ width: "100%", padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", fontSize: 13, outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>源 URL <span style={{ color: "#ff5270" }}>*</span></label>
                  <input
                    type="url"
                    required
                    placeholder="https://raw.githubusercontent.com/..."
                    value={remoteFormData.sourceUrl}
                    onChange={(e) => setRemoteFormData((p) => ({ ...p, sourceUrl: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", fontSize: 12, outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>描述（可选）</label>
                  <input
                    type="text"
                    placeholder="一句话说明用途"
                    value={remoteFormData.description}
                    onChange={(e) => setRemoteFormData((p) => ({ ...p, description: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", fontSize: 13, outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                  <button type="button" className="btn btn-g" onClick={() => setAddRemoteForm(false)} style={{ padding: "8px 20px" }}>取消</button>
                  <button
                    type="submit"
                    disabled={remoteSubmitting}
                    style={{ padding: "8px 20px", fontSize: 13, background: "#a07aff", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
                  >
                    {remoteSubmitting ? "⟳ 下载中…" : "🌐 添加远程技能"}
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
