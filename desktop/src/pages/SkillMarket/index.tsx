// 技能市场 — 合并插件/工作流/Agent/技能包市场
// 一级 Tab：官方 / 我的；二级 Tab：插件 / 工作流 / Agent / 技能包
// 官方 = 管理后台发布；我的 = 用户安装/使用过的内容

import { useState } from "react";
import { Button, Tabs } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import PluginMarket from "@/pages/Plugin";
import WorkflowList from "@/pages/Workflow";
import AgentMarket from "@/pages/AgentMarket";
import HermesSkillMarket from "@/pages/Hermes/SkillMarket";
import InstalledList from "./InstalledList";
import McpMarket from "@/pages/McpMarket";
import InstalledMcp from "@/pages/McpMarket/Installed";
import OpenSourceSkills from "./OpenSourceSkills";
import HermesSkills from "./HermesSkills";
import styles from "./styles.module.css";

type Scope = "official" | "mine";
type Category = "plugin" | "workflow" | "agent" | "skill" | "mcp" | "open-source" | "hermes-local";

const SCOPE_TABS: Array<{ key: Scope; label: string }> = [
  { key: "official", label: "官方" },
  { key: "mine", label: "我的" },
];

const CATEGORY_TABS: Array<{ key: Category; label: string }> = [
  { key: "plugin", label: "插件" },
  { key: "workflow", label: "工作流" },
  { key: "agent", label: "Agent" },
  { key: "skill", label: "技能包" },
  { key: "mcp", label: "MCP" },
  { key: "open-source", label: "开源技能库" },
  { key: "hermes-local", label: "本地 Hermes 技能" },
];

export default function SkillMarket() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>("official");
  const [category, setCategory] = useState<Category>("plugin");

  const renderContent = () => {
    if (scope === "official") {
      switch (category) {
        case "plugin":
          return <PluginMarket embedded />;
        case "workflow":
          return <WorkflowList embedded />;
        case "agent":
          return <AgentMarket embedded />;
        case "skill":
          return <HermesSkillMarket embedded />;
        case "mcp":
          return <McpMarket embedded />;
        case "open-source":
          return <OpenSourceSkills embedded />;
        case "hermes-local":
          return <HermesSkills embedded />;
      }
    }
    switch (category) {
      case "plugin":
        return <InstalledList type={"plugin"} />;
      case "workflow":
        return <InstalledList type={"workflow"} />;
      case "agent":
        return <InstalledList type={"agent"} />;
      case "skill":
        return <InstalledList type={"skill"} />;
      case "mcp":
        return <InstalledMcp />;
      case "open-source":
        return <OpenSourceSkills embedded mine />;
      case "hermes-local":
        return <HermesSkills embedded />;
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <div className={styles.pageTitleIcon}>
            <ShopOutlined />
          </div>
          <span>技能市场</span>
        
        </div>
        <div className={styles.marketLinks}>
          <Button type="link" onClick={() => navigate("/agent-market")}>Agent 市场</Button>
          <Button type="link" onClick={() => navigate("/mcp-market")}>MCP 市场</Button>
        </div>
      </div>

      <Tabs
        activeKey={scope}
        onChange={(key) => setScope(key as Scope)}
        items={SCOPE_TABS.map((t) => ({ key: t.key, label: t.label }))}
      />

      <Tabs
        activeKey={category}
        onChange={(key) => setCategory(key as Category)}
        items={CATEGORY_TABS.map((t) => ({ key: t.key, label: t.label }))}
        style={{ marginTop: -8 }}
      />

      <div className={styles.content}>{renderContent()}</div>
    </div>
  );
}
