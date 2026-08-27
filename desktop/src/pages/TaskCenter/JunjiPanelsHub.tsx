/**
 * 军机处 — 二级面板导航（10 面板补齐入口）
 * 总览（原 JunjiView）/ 朝堂议政 / 省部调度 / 模型 / 技能 / 小任务 / 奏折阁 / 旨库 / 天下要闻
 * 全部照搬 edict 原版组件 + 深瞳 IPC 适配；样式由 edict-panels.css（.edictPanels 作用域）提供
 */
import { useState } from "react";
import edictStyles from "./edict.module.css";
import "./edict-panels.css";
import JunjiView from "./JunjiView";
import CourtDiscussion from "./CourtDiscussion";
import MonitorPanel from "./MonitorPanel";
import ModelConfig from "./ModelConfigPanel";
import SkillsConfig from "./SkillsConfig";
import SessionsPanel from "./SessionsPanel";
import MemorialPanel from "./MemorialPanel";
import TemplatePanel from "./TemplatePanel";
import MorningPanel from "./MorningPanel";

type HubTab =
  | "overview"
  | "court"
  | "monitor"
  | "models"
  | "skills"
  | "sessions"
  | "memorials"
  | "templates"
  | "morning";

const HUB_TABS: { key: HubTab; label: string; cls?: string }[] = [
  { key: "overview", label: "🏛 总览" },
  { key: "court", label: "🗣 朝堂议政" },
  { key: "monitor", label: "🔌 省部调度" },
  { key: "models", label: "🤖 模型" },
  { key: "skills", label: "📦 技能" },
  { key: "sessions", label: "🧵 小任务" },
  { key: "memorials", label: "📜 奏折阁" },
  { key: "templates", label: "📋 旨库" },
  { key: "morning", label: "🌅 天下要闻" },
];

export default function JunjiPanelsHub() {
  const [active, setActive] = useState<HubTab>("overview");

  return (
    <div>
      {/* 二级面板导航 */}
      <div className={edictStyles.tabsBar} style={{ marginBottom: 14, flexWrap: "wrap" }}>
        {HUB_TABS.map((t) => (
          <button
            key={t.key}
            className={[
              edictStyles.tabItem,
              active === t.key ? edictStyles.tabItemActive : "",
              t.cls || "",
            ].filter(Boolean).join(" ")}
            style={{ flex: "0 1 auto", minWidth: 84 }}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 面板内容 */}
      {active === "overview" && <JunjiView onNavigateModels={() => setActive("models")} />}
      {active === "court" && <CourtDiscussion />}
      {active === "monitor" && <MonitorPanel />}
      {active === "models" && <ModelConfig />}
      {active === "skills" && <SkillsConfig />}
      {active === "sessions" && <SessionsPanel />}
      {active === "memorials" && <MemorialPanel />}
      {active === "templates" && <TemplatePanel />}
      {active === "morning" && <MorningPanel />}
    </div>
  );
}
