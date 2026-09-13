// 素材库（2026-09-13 起合并原「素材管理」页，素材共用一个入口）
// 原「素材管理」的「融合素材」面板与素材库本体重复，已删除；其余 4 个面板并入本页 Tab。
import type { ReactNode } from "react";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { FolderOutlined } from "@ant-design/icons";
import AssetLibraryTab from "./AssetLibrary";
import { AudioTab } from "./panels/AudioTab";
import { ComposeTab } from "./panels/ComposeTab";
import { DigitalTab } from "./panels/DigitalTab";
import { KnowledgeTab } from "./panels/KnowledgeTab";
import { ASSET_LIBRARY_TABS, type AssetLibraryTabKey } from "./tabs";
import styles from "./styles.module.css";

export default function AssetsPage() {
  const panels: Record<AssetLibraryTabKey, ReactNode> = {
    library: <AssetLibraryTab />,
    compose: <ComposeTab />,
    digital: <DigitalTab />,
    audio: <AudioTab />,
    knowledge: <KnowledgeTab />,
  };
  const items: TabsProps["items"] = ASSET_LIBRARY_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    children: panels[t.key],
  }));
  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><FolderOutlined /></span>
          <span>素材库</span>
        </div>
      </div>
      <Tabs defaultActiveKey="library" items={items} />
    </div>
  );
}