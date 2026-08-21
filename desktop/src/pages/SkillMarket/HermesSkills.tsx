// 本地 Hermes 技能中心（方案 B / P2.5）
// 封装主进程 hermes-skills IPC（hermes skills list/search/install/update/uninstall/check）
// 与云端「技能包」区分：本 Tab 管理 $HERMES_HOME/skills 的本地技能

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Row,
  Space,
  Spin,
  Tag,
  Tooltip,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import type { HermesSkillItem } from "@shared/types";

interface OpState {
  [key: string]: boolean;
}

export default function HermesSkills({ embedded = false }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HermesSkillItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<HermesSkillItem[]>([]);
  const [opState, setOpState] = useState<OpState>({});

  const markOp = (key: string, on: boolean) =>
    setOpState((prev) => ({ ...prev, [key]: on }));

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI?.hermesSkills.list();
      if (!res?.ok) {
        setError(res?.error || "加载失败");
        setItems([]);
      } else {
        setItems(res.items || []);
      }
    } catch (err) {
      setError((err as Error).message || "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) {
      message.warning("请输入搜索词");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await window.electronAPI?.hermesSkills.search(q);
      if (!res?.ok) {
        setError(res?.error || "搜索失败");
        setResults([]);
      } else {
        setResults(res.items || []);
      }
    } catch (err) {
      setError((err as Error).message || "搜索失败");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const runOp = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => Promise<void>) => {
    markOp(key, true);
    try {
      const res = await fn();
      if (!res?.ok) {
        message.error(res?.error || "操作失败");
      } else {
        message.success("操作成功");
        await after?.();
      }
    } catch (err) {
      message.error((err as Error).message || "操作失败");
    } finally {
      markOp(key, false);
    }
  };

  const handleInstall = (id: string) => {
    void runOp("install:" + id,
      () => window.electronAPI?.hermesSkills.install(id),
      async () => {
        setResults((prev) => prev.filter((r) => r.name !== id));
        await loadList();
      },
    );
  };

  const handleUpdate = (name?: string) => {
    void runOp("update",
      () => window.electronAPI?.hermesSkills.update(name),
      loadList,
    );
  };

  const handleUninstall = (name: string) => {
    void runOp("uninstall:" + name,
      () => window.electronAPI?.hermesSkills.uninstall(name),
      loadList,
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} />}

      <Card size="small" title="搜索 Hermes 技能市场（skills.sh / GitHub / ClawHub 等）">
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder="如：skill-creator / openai/skills/skill-creator / SKILL.md URL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPressEnter={() => void handleSearch()}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} loading={searching} onClick={() => void handleSearch()}>
            搜索
          </Button>
        </Space.Compact>
        {results.length > 0 && (
          <List
            style={{ marginTop: 12 }}
            size="small"
            dataSource={results}
            renderItem={(r) => (
              <List.Item
                actions={[
                  <Tooltip key="tip" title="安装到 $HERMES_HOME/skills">
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<DownloadOutlined />}
                      loading={!!opState["install:" + r.name]}
                      onClick={() => handleInstall(r.name)}
                    >
                      安装
                    </Button>
                  </Tooltip>,
                ]}
              >
                <List.Item.Meta title={r.name} description={r.source || "未知来源"} />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <span>已安装（$HERMES_HOME/skills）</span>
            <Tag color="blue">{items.length}</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button size="small" icon={<SyncOutlined />} onClick={() => void handleUpdate()}>
              更新全部
            </Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadList()}>
              刷新
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading}>
          {items.length === 0 ? (
            <Empty description="暂无已安装技能（内置技能随桌面端自动同步）" />
          ) : (
            <Row gutter={[12, 12]}>
              {items.map((s) => (
                <Col key={s.name} xs={24} sm={12} lg={8}>
                  <Card size="small">
                    <Space direction="vertical" style={{ width: "100%" }}>
                      <Space wrap>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        {s.builtin && <Tag color="green">内置</Tag>}
                        {s.version && <Tag>{s.version}</Tag>}
                      </Space>
                      <Space>
                        {!s.builtin && (
                          <>
                            <Button
                              size="small"
                              icon={<SyncOutlined />}
                              loading={!!opState["update"]}
                              onClick={() => void handleUpdate(s.name)}
                            >
                              更新
                            </Button>
                            <Button
                              size="small"
                              danger
                              loading={!!opState["uninstall:" + s.name]}
                              onClick={() => void handleUninstall(s.name)}
                            >
                              卸载
                            </Button>
                          </>
                        )}
                        {s.builtin && <Tag icon={<CheckCircleOutlined />} color="success">随桌面端分发</Tag>}
                      </Space>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      </Card>
    </div>
  );
}
