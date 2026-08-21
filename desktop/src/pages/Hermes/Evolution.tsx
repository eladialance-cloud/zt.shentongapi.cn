// Hermes 进化可视化（P2.5）
// 展示本地 Hermes 的记忆卡片（MEMORY.md/USER.md）、学习时间线（journey --json）、策展/记忆状态

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Card, Collapse, Empty, List, Space, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, RiseOutlined } from "@ant-design/icons";
import type { HermesEvolutionResult } from "@shared/types";
import styles from "./styles.module.css";

const { Paragraph, Text } = Typography;

export default function HermesEvolution() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HermesEvolutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI?.hermesEvolution.get();
      if (!res) {
        setError("无法访问本地 Hermes（主进程桥不可用）");
        setData(null);
      } else {
        setData(res);
        if (res.error) setError(res.error);
      }
    } catch (err) {
      setError((err as Error).message || "加载失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const journeyNodes = (data?.journey?.nodes as Array<{ id?: string; label?: string; kind?: string; date?: string }> | undefined) ?? [];

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <RiseOutlined />
          </span>
          <span>Hermes 进化</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/hermes")}
          >
            返回
          </Button>
          <Button type="primary" className={styles.primaryBtn} onClick={() => void load()}>
            刷新
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {error && !loading && <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Card
            size="small"
            title={
              <Space>
                <span>记忆卡片（MEMORY.md / USER.md）</span>
                <Tag color="blue">{data?.memory?.length ?? 0}</Tag>
              </Space>
            }
          >
            {!data?.memory?.length ? (
              <Empty description="暂无记忆（Hermes 完成任务后会自动沉淀经验）" />
            ) : (
              <List
                size="small"
                dataSource={data.memory}
                renderItem={(card) => (
                  <List.Item>
                    <Space direction="vertical" style={{ width: "100%" }}>
                      <Tag color={card.source === "memory" ? "blue" : "purple"}>
                        {card.source === "memory" ? "记忆" : "用户画像"}
                      </Tag>
                      <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{card.text}</Paragraph>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>

          <Card size="small" title="学习时间线（journey）">
            {journeyNodes.length > 0 ? (
              <List
                size="small"
                dataSource={journeyNodes.slice(0, 50)}
                renderItem={(node) => (
                  <List.Item>
                    <Space>
                      {node.date && <Text type="secondary">{node.date}</Text>}
                      <Text>{node.label || node.id || "未知节点"}</Text>
                      {node.kind && <Tag>{node.kind}</Tag>}
                    </Space>
                  </List.Item>
                )}
              />
            ) : data?.journeyRaw ? (
              <Paragraph
                style={{ maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap" }}
                type="secondary"
              >
                {data.journeyRaw}
              </Paragraph>
            ) : (
              <Empty description="暂无学习图谱（完成几次编排任务后自动生成）" />
            )}
          </Card>

          <Collapse
            size="small"
            items={[
              {
                key: "curator",
                label: "技能策展（curator）与记忆 provider（memory status）",
                children: (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {data?.curator ? (
                      <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{data.curator}</Paragraph>
                    ) : (
                      <Empty description="curator 无输出" />
                    )}
                    {data?.memoryStatus ? (
                      <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{data.memoryStatus}</Paragraph>
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
        </Space>
      </Spin>
    </div>
  );
}
