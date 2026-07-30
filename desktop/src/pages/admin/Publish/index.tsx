// 管理后台 — 发布管理
import { useCallback, useEffect, useState } from "react";
import { Table, Tag, Button, message } from "antd";
import { SendOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import * as channelApi from "@/api/channel-api";
import type { PublishPlan } from "@/types/channel";

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  draft: { color: "default", label: "草稿" },
  pending_review: { color: "orange", label: "待审核" },
  approved: { color: "blue", label: "已批准" },
  rejected: { color: "red", label: "已拒绝" },
  published: { color: "green", label: "已发布" },
  failed: { color: "red", label: "失败" },
};

export default function AdminPublish() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PublishPlan[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await channelApi.listPublishPlans();
      setPlans(list || []);
    } catch { message.error("加载发布计划失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const columns = [
    { title: "ID", dataIndex: "id", width: 60 },
    { title: "标题", dataIndex: "title" },
    { title: "目标平台", dataIndex: "targetPlatforms", width: 160,
      render: (p: string[]) => (p || []).join(", ") },
    { title: "状态", dataIndex: "status", width: 80,
      render: (s: string) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label || s}</Tag> },
    { title: "审核", dataIndex: "reviewStatus", width: 80,
      render: (s: string) => s === "approved" ? <Tag color="green">已通过</Tag>
        : s === "rejected" ? <Tag color="red">已拒绝</Tag>
        : s === "pending" ? <Tag color="orange">待审核</Tag>
        : <Tag>{s}</Tag> },
    { title: "创建时间", dataIndex: "createdAt", width: 160,
      render: (v: string) => new Date(v).toLocaleString("zh-CN") },
    { title: "操作", width: 160,
      render: (_: unknown, record: PublishPlan) => (
        <div style={{ display: "flex", gap: 4 }}>
          {record.status === "pending_review" && (
            <>
              <Button size="small" type="primary" icon={<CheckOutlined />}
                onClick={async () => {
                  try { await channelApi.reviewPlan(record.id, { approved: true }); message.success("已通过"); void loadData(); }
                  catch { message.error("操作失败"); }
                }}>通过</Button>
              <Button size="small" danger icon={<CloseOutlined />}
                onClick={async () => {
                  try { await channelApi.reviewPlan(record.id, { approved: false }); message.success("已拒绝"); void loadData(); }
                  catch { message.error("操作失败"); }
                }}>拒绝</Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ color: "#e6edf3", marginBottom: 16 }}>
        <SendOutlined style={{ marginRight: 8 }} />发布管理
      </h2>
      <Table columns={columns} dataSource={plans} rowKey="id"
        loading={loading} size="small" />
    </div>
  );
}
