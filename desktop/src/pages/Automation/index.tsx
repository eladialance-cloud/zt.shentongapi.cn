// 自动化工作台页（D6-lite）：我的场景 / 模板市场 / 执行历史
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Card, Empty, Form, Input, Modal, Popconfirm, Space, Spin, Switch, Table, Tabs, Tag, message,
} from "antd";
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, PlayCircleOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import * as automationApi from "@/api/automation-api";
import type { AutomationInstance, AutomationTemplate, AutomationAuditLog } from "@/types/automation";
import styles from "../Team/styles.module.css";

function formatTime(v: unknown): string {
  if (!v) return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("zh-CN", { hour12: false });
}

const DIRECTION_LABELS: Record<string, string> = {
  in: "入站",
  confirm: "确认",
  result: "结果",
};

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  received: { text: "已接收", color: "blue" },
  routed: { text: "已路由", color: "cyan" },
  offline: { text: "设备离线", color: "orange" },
  need_confirmation: { text: "待确认", color: "gold" },
  running: { text: "执行中", color: "processing" },
  success: { text: "成功", color: "green" },
  failed: { text: "失败", color: "red" },
};

export default function AutomationPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [instances, setInstances] = useState<AutomationInstance[]>([]);
  const [audits, setAudits] = useState<AutomationAuditLog[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTemplate, setCreateTemplate] = useState<AutomationTemplate | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tpls, insts, logs] = await Promise.all([
        automationApi.listTemplates(),
        automationApi.listInstances(),
        automationApi.listAuditLogs(100),
      ]);
      setTemplates(tpls || []);
      setInstances(insts || []);
      setAudits(logs || []);
    } catch (err) {
      message.error("加载自动化工作台数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const templateMap = useMemo(() => {
    const m = new Map<number, AutomationTemplate>();
    for (const t of templates) m.set(t.id, t);
    return m;
  }, [templates]);

  // ===== 创建实例 =====
  const openCreate = (tpl: AutomationTemplate) => {
    setCreateTemplate(tpl);
    form.resetFields();
    form.setFieldsValue({ name: tpl.name });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createTemplate) return;
    try {
      const vals = await form.validateFields();
      setSaving(true);
      const params: Record<string, unknown> = {};
      for (const field of createTemplate.paramsSchema ?? []) {
        if (vals[field.key] !== undefined) params[field.key] = vals[field.key];
      }
      await automationApi.createInstance({
        templateId: createTemplate.id,
        name: vals.name,
        params,
      });
      message.success(`场景「${vals.name}」创建成功，飞书发送「${vals.name}」即可触发`);
      setCreateOpen(false);
      void loadData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error("创建失败: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ===== 启停 / 删除 =====
  const handleToggle = async (inst: AutomationInstance, enabled: boolean) => {
    try {
      await automationApi.updateInstance(inst.id, { enabled });
      message.success(`场景「${inst.name}」已${enabled ? "启用" : "停用"}`);
      void loadData();
    } catch (err) {
      message.error("操作失败: " + (err as Error).message);
    }
  };

  const handleDelete = async (inst: AutomationInstance) => {
    try {
      await automationApi.deleteInstance(inst.id);
      message.success(`场景「${inst.name}」已删除`);
      void loadData();
    } catch (err) {
      message.error("删除失败: " + (err as Error).message);
    }
  };

  const instanceColumns = [
    { title: "场景名称", dataIndex: "name", key: "name", render: (v: string) => <b>{v}</b> },
    {
      title: "模板",
      dataIndex: "templateId",
      key: "templateId",
      render: (id: number) => templateMap.get(Number(id))?.name ?? `#${id}`,
    },
    { title: "最近执行", dataIndex: "lastRunAt", key: "lastRunAt", render: formatTime },
    {
      title: "启用",
      dataIndex: "enabled",
      key: "enabled",
      render: (_: unknown, inst: AutomationInstance) => (
        <Switch checked={inst.enabled === 1} onChange={(checked) => void handleToggle(inst, checked)} size="small" />
      ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, inst: AutomationInstance) => (
        <Space size={4}>
          <Popconfirm title={`删除场景「${inst.name}」？`} onConfirm={() => void handleDelete(inst)}>
            <Button size="small" icon={<DeleteOutlined />} danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const templateColumns = [
    {
      title: "模板",
      dataIndex: "name",
      key: "name",
      render: (v: string, t: AutomationTemplate) => (
        <Space>
          <b>{v}</b>
          {t.builtIn === 1 && <Tag color="blue">内置</Tag>}
        </Space>
      ),
    },
    { title: "说明", dataIndex: "description", key: "description" },
    { title: "触发关键词", dataIndex: "keywords", key: "keywords", render: (v?: string) => v || "-" },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, t: AutomationTemplate) => (
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openCreate(t)}>
          创建场景
        </Button>
      ),
    },
  ];

  const auditColumns = [
    { title: "时间", dataIndex: "createdAt", key: "createdAt", render: formatTime },
    {
      title: "方向",
      dataIndex: "direction",
      key: "direction",
      render: (v: string) => DIRECTION_LABELS[v] ?? v,
    },
    { title: "命令", dataIndex: "command", key: "command", ellipsis: true },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (v?: string) => {
        const s = STATUS_LABELS[v ?? ""] ?? { text: v ?? "-", color: "default" };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    { title: "结果", dataIndex: "message", key: "message", ellipsis: true },
  ];

  const items = [
    {
      key: "instances",
      label: "我的场景",
      children: (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={instances}
          columns={instanceColumns}
          locale={{ emptyText: <Empty description="还没有场景，去「模板市场」创建一个" /> }}
          pagination={false}
        />
      ),
    },
    {
      key: "templates",
      label: "模板市场",
      children: (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={templates}
          columns={templateColumns}
          locale={{ emptyText: <Empty description="暂无模板" /> }}
          pagination={false}
        />
      ),
    },
    {
      key: "audit",
      label: "执行历史",
      children: (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={audits}
          columns={auditColumns}
          locale={{ emptyText: <Empty description="暂无执行记录" /> }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      ),
    },
  ];

  return (
    <div className={styles.pageContainer}>
      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            自动化工作台
            <Tag color="purple">手机=遥控器 · 电脑=执行器</Tag>
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
            刷新
          </Button>
        }
      >
        <Tabs items={items} />
      </Card>

      <Modal
        title={`创建场景 - ${createTemplate?.name ?? ""}`}
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={saving}
        okText="创建"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="场景名称（飞书发送此名称即可触发）" rules={[{ required: true, message: "请输入场景名称" }]}>
            <Input placeholder="例如：打开我的Excel" />
          </Form.Item>
          {(createTemplate?.paramsSchema ?? []).map((field) => (
            <Form.Item
              key={field.key}
              name={field.key}
              label={`${field.label}${field.required ? " *" : ""}`}
              rules={field.required ? [{ required: true, message: `请输入${field.label}` }] : []}
            >
              <Input placeholder={field.label} />
            </Form.Item>
          ))}
        </Form>
        <div style={{ color: "#999", fontSize: 12 }}>
          提示：创建后保持电脑端深瞳AI运行并已登录，飞书发送场景名称即可远程触发。
        </div>
      </Modal>
    </div>
  );
}