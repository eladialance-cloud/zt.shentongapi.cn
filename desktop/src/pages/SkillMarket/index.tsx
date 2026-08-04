// 技能市场 — 合并插件/工作流/Agent/技能包市场
// 一级 Tab：官方 / 我的；二级 Tab：插件 / 工作流 / Agent / 技能包
// 官方 = 管理后台发布；我的 = 用户安装/使用过的内容

import { useState } from "react";
import { Tabs } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import PluginMarket from "@/pages/Plugin";
import InstalledPlugins from "@/pages/Plugin/Installed";
import WorkflowList from "@/pages/Workflow";
import AgentMarket from "@/pages/AgentMarket";
import HermesSkillMarket from "@/pages/Hermes/SkillMarket";
import WorkflowExecutions from "./WorkflowExecutions";
import InstalledAgents from "./InstalledAgents";
import InstalledSkills from "./InstalledSkills";
import styles from "./styles.module.css";

type Scope = "official" | "mine";
type Category = "plugin" | "workflow" | "agent" | "skill";

const SCOPE_TABS: Array<{ key: Scope; label: string }> = [
  { key: "official", label: "官方" },
  { key: "mine", label: "我的" },
];

const CATEGORY_TABS: Array<{ key: Category; label: string }> = [
  { key: "plugin", label: "插件" },
  { key: "workflow", label: "工作流" },
  { key: "agent", label: "Agent" },
  { key: "skill", label: "技能包" },
];

export default function SkillMarket() {
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
      }
    }
    switch (category) {
      case "plugin":
        return <InstalledPlugins embedded />;
      case "workflow":
        return <WorkflowExecutions />;
      case "agent":
        return <InstalledAgents />;
      case "skill":
        return <InstalledSkills />;
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <ShopOutlined />
          <span>技能市场</span>
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
