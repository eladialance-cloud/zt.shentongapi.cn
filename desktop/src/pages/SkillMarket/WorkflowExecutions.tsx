// 我的-工作流：执行历史列表
// 调用 GET /workflows/executions

import { useCallback, useEffect, useState } from "react";
import { Spin, Table, Tag, message } from "antd";
import type { TableColumnsType } from "antd";
import * as workflowApi from "@/api/workflow-api";
import type {
  WorkflowExecution,
  WorkflowExecutionStatus,
} from "@/types/workflow";
import styles from "./styles.module.css";

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  running: { text: "执行中", color: "blue" },
  success: { text: "成功", color: "green" },
  failed: { text: "失败", color: "red" },
  canceled: { text: "已取消", color: "orange" },
};

export default function WorkflowExecutions() {
  const [list, setList] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workflowApi.listExecutions({ page: 1, pageSize: 50 });
      setList(res.list || []);
    } catch (err) {
      console.error("[WorkflowExecutions] load failed:", err);
      message.error("加载执行历史失败");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const columns: TableColumnsType<WorkflowExecution> = [
    {
      title: "工作流 ID",
      dataIndex: "workflowId",
      key: "workflowId",
      width: 120,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (s: WorkflowExecutionStatus) => {
        const m = STATUS_MAP[s] || { text: s, color: "default" };
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: "消耗积分",
      dataIndex: "creditsCost",
      key: "creditsCost",
      width: 100,
      render: (v: number) => v ?? 0,
    },
    {
      title: "耗时",
      dataIndex: "durationMs",
      key: "durationMs",
      width: 100,
      render: (v?: number) =>
        v != null ? `${(v / 1000).toFixed(1)}s` : "-",
    },
    {
      title: "错误信息",
      dataIndex: "errorMessage",
      key: "errorMessage",
      ellipsis: true,
      render: (v?: string) => v || "-",
    },
    {
      title: "执行时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (v: Date | string) =>
        new Date(v).toLocaleString("zh-CN", { hour12: false }),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Table<WorkflowExecution>
        columns={columns}
        dataSource={list}
        rowKey="id"
        size="small"
        pagination={false}
        locale={{ emptyText: "暂无执行记录，去官方市场用一次工作流试试" }}
      />
    </Spin>
  );
}
