// 我的-Agent：已安装 Agent 列表
// 调用 GET /agents/installed、DELETE /agents/installed/:id

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Popconfirm, Spin, message } from "antd";
import { DeleteOutlined, RobotOutlined } from "@ant-design/icons";
import { listInstalledAgents, uninstallAgent } from "@/api/agent-api";
import type { Agent } from "@/types/agent";
import styles from "./styles.module.css";

export default function InstalledAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listInstalledAgents();
      setAgents(list || []);
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

  const handleUninstall = async (agent: Agent) => {
    try {
      await uninstallAgent(agent.id);
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
