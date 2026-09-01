// Hermes 进化可视化（P2.5）
// 展示本地 Hermes 的记忆卡片（MEMORY.md/USER.md）、学习时间线（journey --json）、策展/记忆状态

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Card, Empty, List, message, Space, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, RiseOutlined } from "@ant-design/icons";
import type { HermesCuratorState, HermesEvolutionResult } from "@shared/types";
import HermesRuntimeInstallAlert from "@/components/HermesRuntimeInstallAlert";
import styles from "./styles.module.css";

const { Paragraph, Text } = Typography;

export default function HermesEvolution() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HermesEvolutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [curator, setCurator] = useState<HermesCuratorState | null>(null);
  const [curatorError, setCuratorError] = useState<string | null>(null);
  const [curatorBusy, setCuratorBusy] = useState(false);

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
    }
    // P1：原生策展状态（独立于进化快照，未接入时降级展示 data.curator 原文）
    try {
      const cur = await window.electronAPI?.hermesCurator.get();
      if (cur?.ok) {
        setCurator(cur.state ?? null);
        setCuratorError(null);
      } else {
        setCurator(null);
        setCuratorError(cur?.error ?? "策展状态获取失败");
      }
    } catch {
      setCurator(null);
      setCuratorError("策展状态获取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const journeyNodes = (data?.journey?.nodes as Array<{ id?: string; label?: string; kind?: string; date?: string }> | undefined) ?? [];

  const fmtLastRun = (value?: string | null): string => {
    if (!value) return "从未";
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleString("zh-CN", { hour12: false });
  };

  const togglePaused = async () => {
    setCuratorBusy(true);
    try {
      const res = await window.electronAPI?.hermesCurator.setPaused(!(curator?.paused ?? false));
      if (res?.ok) {
        message.success(curator?.paused ? "策展已恢复" : "策展已暂停");
        const cur = await window.electronAPI?.hermesCurator.get();
        if (cur?.state) setCurator(cur.state);
      } else {
        message.warning(res?.error ?? "操作失败");
      }
    } finally {
      setCuratorBusy(false);
    }
  };

  const runCuratorNow = async () => {
    setCuratorBusy(true);
    try {
      const res = await window.electronAPI?.hermesCurator.run();
      if (res?.ok) message.success("策展已触发（后台执行）");
      else message.warning(res?.error ?? "触发失败");
    } finally {
      setCuratorBusy(false);
    }
  };

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
        {error && !loading && <HermesRuntimeInstallAlert error={error} onReady={() => void load()} />}
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

          <Card
            size="small"
            title={
              <Space>
                <span>技能策展（curator）</span>
                {curator ? (
                  <Tag color={curator.paused ? "orange" : curator.enabled ? "green" : "default"}>
                    {curator.paused ? "已暂停" : curator.enabled ? "运行中" : "未启用"}
                  </Tag>
                ) : null}
              </Space>
            }
            extra={
              <Space>
                <Button size="small" loading={curatorBusy} disabled={!curator} onClick={() => void togglePaused()}>
                  {curator?.paused ? "恢复策展" : "暂停策展"}
                </Button>
                <Button size="small" type="primary" loading={curatorBusy} disabled={!curator} onClick={() => void runCuratorNow()}>
                  立即运行
                </Button>
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              {curator ? (
                <Space wrap>
                  <Text type="secondary">检查间隔：{curator.interval_hours != null ? `${curator.interval_hours} 小时` : "-"}</Text>
                  <Text type="secondary">上次运行：{fmtLastRun(curator.last_run_at)}</Text>
                  {curatorError ? <Text type="danger">{curatorError}</Text> : null}
                </Space>
              ) : (
                <>
                  {data?.curator ? (
                    <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{data.curator}</Paragraph>
                  ) : (
                    <Empty description={curatorError ?? "curator 无输出（原生 API 未接入）"} />
                  )}
                </>
              )}
              {data?.memoryStatus ? (
                <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>记忆 provider：{data.memoryStatus}</Paragraph>
              ) : null}
            </Space>
          </Card>
        </Space>
      </Spin>
    </div>
  );
}
