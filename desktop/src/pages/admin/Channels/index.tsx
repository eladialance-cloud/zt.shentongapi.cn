// 管理后台 — 渠道管理
import { useCallback, useEffect, useState } from "react";
import { Table, Tag, Button, message, Popconfirm } from "antd";
import { ApiOutlined, DeleteOutlined } from "@ant-design/icons";
import * as channelApi from "@/api/channel-api";
import type { Channel } from "@/types/channel";
import { PLATFORM_LABELS } from "@/types/channel";

export default function AdminChannels() {
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await channelApi.listChannels();
      setChannels(list || []);
    } catch { message.error("加载渠道列表失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const columns = [
    { title: "ID", dataIndex: "id", width: 60 },
    { title: "名称", dataIndex: "name" },
    { title: "平台", dataIndex: "platform", width: 120,
      render: (p: string) => PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS]?.label || p },
    { title: "方向", dataIndex: "direction", width: 80,
      render: (d: string) => d === "input" ? "入站" : d === "output" ? "出站" : "双向" },
    { title: "状态", dataIndex: "status", width: 80,
      render: (s: string) => {
        const m: Record<string, { color: string; label: string }> = {
          active: { color: "green", label: "活跃" },
          disabled: { color: "default", label: "禁用" },
          error: { color: "red", label: "异常" },
        };
        return <Tag color={m[s]?.color}>{m[s]?.label || s}</Tag>;
      },
    },
    { title: "操作", width: 100,
      render: (_: unknown, record: Channel) => (
        <Popconfirm title="确定删除？" onConfirm={async () => {
          try { await channelApi.deleteChannel(record.id); message.success("已删除"); void loadData(); }
          catch { message.error("删除失败"); }
        }}>
          <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ color: "#e6edf3", marginBottom: 16 }}>
        <ApiOutlined style={{ marginRight: 8 }} />渠道管理
      </h2>
      <Table columns={columns} dataSource={channels} rowKey="id"
        loading={loading} size="small" />
    </div>
  );
}
