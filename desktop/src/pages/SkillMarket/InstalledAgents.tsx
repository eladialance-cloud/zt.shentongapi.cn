// 我的-Agent：已安装 Agent 列表
// 调用 GET /agents/installed、DELETE /agents/installed/:id

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Popconfirm, Spin, message } from "antd";
import { DeleteOutlined, RobotOutlined } from "@ant-design/icons";
import { listInstalledAgents, uninstallAgent } from "@/api/agent-api";
import * as marketApi from "@/api/market-api";
import type { Agent } from "@/types/agent";
import type { InstalledRecord } from "@/types/market";
import styles from "./styles.module.css";

export default function InstalledAgents() {
  const [agents, setAgents] = useState<Array<Agent & { installDir?: string }>>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cloudList, localList] = await Promise.all([
        listInstalledAgents().catch(() => [] as Agent[]),
        marketApi.listInstalled().catch(() => [] as InstalledRecord[]),
      ]);
      // 本地下载的 Agent 优先展示
      const localAgents = localList
        .filter((r) => r.type === "agent")
        .map((r) => ({
          id: Number(r.id) || 0,
          name: r.name,
          displayName: r.name,
          description: "",
          avatar: "",
          category: "other",
          tags: [],
          rating: 0,
          ratingCount: 0,
          callCount: 0,
          pricePerCall: 0,
          pricePerToken: { input: 0, output: 0 },
          creatorType: "official" as const,
          isOfficial: true,
          installDir: r.dir,
        }));
      const merged: Array<Agent & { installDir?: string }> = [...localAgents];
      for (const a of cloudList || []) {
        if (!merged.some((m) => m.id === a.id)) {
          merged.push({ ...a, installDir: undefined });
        }
      }
      setAgents(merged);
    } catch (err) {
      console.error("[InstalledAgents] load failed:", err);
      message.error("加载已安装 Agent 失败");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUninstall = async (agent: Agent & { installDir?: string }) => {
    try {
      // 本地安装的 Agent 走本地卸载；云端旧记录走云端卸载
      if (agent.installDir) {
        const res = await marketApi.uninstall("agent", agent.id);
        if (!res.ok) {
          throw new Error(res.error || "本地卸载失败");
        }
      } else {
        await uninstallAgent(agent.id);
      }
      message.success(`Agent ${agent.name} 已卸载`);
      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
    } catch (err) {
      console.error("[InstalledAgents] uninstall failed:", err);
      message.error("卸载失败: " + (err as Error).message);
    }
  };

  return (
    <Spin spinning={loading}>
      {agents.length === 0 && !loading ? (
        <Empty
          description="暂无已安装 Agent，去官方市场安装一个吧"
          style={{ marginTop: 48 }}
        />
      ) : (
        <div className={styles.agentGrid}>
          {agents.map((agent) => (
            <Card key={agent.id} className={styles.agentCard} bordered={false}>
              <div className={styles.agentBody}>
                <div className={styles.agentHeader}>
                  <div className={styles.agentAvatar}>
                    {agent.avatar ? (
                      <img
                        src={agent.avatar}
                        alt={agent.name}
                        className={styles.agentAvatarImg}
                      />
                    ) : (
                      <RobotOutlined />
                    )}
                  </div>
                  <div className={styles.agentName}>{agent.name}</div>
                  {agent.isOfficial && (
                    <span className={styles.officialBadge}>官方</span>
                  )}
                </div>
                <div className={styles.agentDesc}>
                  {agent.description || "暂无描述"}
                </div>
                {(agent as Agent & { installDir?: string }).installDir && (
                  <div style={{ fontSize: 12, color: "#8b98a5", wordBreak: "break-all" }}>
                    安装位置：{(agent as Agent & { installDir?: string }).installDir}
                  </div>
                )}
                <div className={styles.agentActions}>
                  <Popconfirm
                    title={`确定卸载 ${agent.name} 吗？`}
                    onConfirm={() => handleUninstall(agent)}
                    okText="卸载"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      卸载
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Spin>
  );
}
