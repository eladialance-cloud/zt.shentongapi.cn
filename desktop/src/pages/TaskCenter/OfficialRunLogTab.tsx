/**
 * 官署详情 · 执行日志 Tab
 *
 * 展示该官署定时任务的执行流水（本地库 local_scheduled_runs）：
 *  - 每次触发一条：执行方式、业务流 id、状态、耗时、错误、关联团队任务
 *  - 数据源：window.electronAPI.db.scheduledRuns.list(scheduledId?, limit?)
 *    先按 agentId 取到定时任务 id 列表，再逐个拉日志并合并。
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Spin, Table, Tag } from "antd";
import { listScheduledTasks } from "@/api/scheduled-task-api";
import type { LocalScheduledRun } from "@shared/types";

const RUN_STATUS: Record<string, { color: string; label: string }> = {
  running: { color: "processing", label: "执行中" },
  success: { color: "green", label: "成功" },
  error: { color: "red", label: "失败" },
};

export default function OfficialRunLogTab({ agentId }: { agentId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LocalScheduledRun[]>([]);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    if (!agentId) {
      setLoading(false);
      return;
    }
    const api = window.electronAPI?.db?.scheduledRuns;
    if (!api) {
      setAvailable(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const tasks = await listScheduledTasks(agentId).catch(() => []);
      const ids = (tasks ?? []).map((t) => t.id);
      if (ids.length === 0) {
        setRows([]);
        return;
      }
      const groups = await Promise.all(
        ids.map((id) => api.list(id, 50).catch(() => [] as LocalScheduledRun[])),
      );
      const merged = (groups.flat() as LocalScheduledRun[]).sort(
        (a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""),
      );
      setRows(merged);
    } catch (err) {
      console.warn("[OfficialRunLogTab] 加载失败:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!available) {
    return <Empty description="执行日志需要桌面端主进程（本地库不可用）" />;
  }

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Alert
          type="info"
          showIcon
          message={`该官署定时任务执行流水（${rows.length}）`}
          description="每次定时触发记录一条（含 AI 编排与业务流直跑），成功/失败均回填；本地加密存储。"
        />

        {rows.length === 0 && !loading ? (
          <Empty description="暂无执行记录" />
        ) : (
          <Table<LocalScheduledRun>
            size="small"
            rowKey={(r) => r.runId || String(r.id)}
            pagination={{ pageSize: 20, size: "small" }}
            dataSource={rows}
            columns={[
              {
                title: "时间",
                dataIndex: "startedAt",
                width: 150,
                render: (v: string) => (v ? new Date(v).toLocaleString() : "-"),
              },
              {
                title: "任务",
                dataIndex: "title",
                render: (title: string | undefined, r) => title || `#${r.scheduledId}`,
              },
              {
                title: "执行方式",
                dataIndex: "executeKind",
                width: 100,
                render: (k: string, r) =>
                  k === "flow" ? <Tag color="purple">业务流{r.flowId ? `·${r.flowId}` : ""}</Tag> : <Tag color="geekblue">AI 编排</Tag>,
              },
              {
                title: "状态",
                dataIndex: "status",
                width: 84,
                render: (s: string) => {
                  const m = RUN_STATUS[s] ?? { color: "default", label: s };
                  return <Tag color={m.color}>{m.label}</Tag>;
                },
              },
              {
                title: "耗时",
                dataIndex: "durationMs",
                width: 90,
                render: (v: number | null | undefined) => (v != null ? `${(v / 1000).toFixed(1)}s` : "-"),
              },
              {
                title: "结果 / 错误",
                dataIndex: "resultSummary",
                render: (v: string | null | undefined, r) => (
                  <span style={{ fontSize: 12, color: r.errorMessage ? "var(--color-error)" : "var(--color-text-secondary)" }}>
                    {r.errorMessage || v || "-"}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
    </Spin>
  );
}
