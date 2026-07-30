// 管理后台 — 团队管理
import { useCallback, useEffect, useState } from "react";
import { Table, Tag, Button, message, Popconfirm } from "antd";
import { TeamOutlined, DeleteOutlined } from "@ant-design/icons";
import * as teamApi from "@/api/team-api";
import type { Team } from "@/types/team";

export default function AdminTeams() {
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await teamApi.listTeams();
      setTeams(list || []);
    } catch { message.error("加载团队列表失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const columns = [
    { title: "ID", dataIndex: "id", width: 60 },
    { title: "名称", dataIndex: "name" },
    { title: "成员数", dataIndex: "memberCount", width: 80 },
    { title: "描述", dataIndex: "description", ellipsis: true,
      render: (v?: string) => v || "-" },
    { title: "创建时间", dataIndex: "createdAt", width: 160,
      render: (v: string) => new Date(v).toLocaleString("zh-CN") },
    { title: "操作", width: 100,
      render: (_: unknown, record: Team) => (
        <Popconfirm title="确定删除？" onConfirm={async () => {
          try { await teamApi.deleteTeam(record.id); message.success("已删除"); void loadData(); }
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
        <TeamOutlined style={{ marginRight: 8 }} />团队管理
      </h2>
      <Table columns={columns} dataSource={teams} rowKey="id"
        loading={loading} size="small" />
    </div>
  );
}
