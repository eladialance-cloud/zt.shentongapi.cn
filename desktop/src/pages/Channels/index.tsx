// 渠道管理页
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, Card, Empty, Form, Input, Modal, Popconfirm,
  Select, Spin, Tag, message,
} from "antd";
import {
  PlusOutlined, DeleteOutlined, ApiOutlined,
  ArrowLeftOutlined, ReloadOutlined,
} from "@ant-design/icons";
import * as channelApi from "@/api/channel-api";
import type { Channel, ChannelPlatform, ChannelDirection } from "@/types/channel";
import { PLATFORM_LABELS } from "@/types/channel";
import styles from "../Team/styles.module.css";

function formatTime(v: unknown): string {
  if (!v) return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("zh-CN", { hour12: false });
}

const PLATFORM_OPTIONS: { value: ChannelPlatform; label: string }[] = Object.entries(PLATFORM_LABELS).map(
  ([k, v]) => ({ value: k as ChannelPlatform, label: `${v.emoji} ${v.label}` }),
);

export default function ChannelList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await channelApi.listChannels();
      setChannels(list || []);
    } catch (err) {
      message.error("加载渠道列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      await channelApi.createChannel(vals);
      message.success("渠道创建成功");
      setCreateOpen(false);
      form.resetFields();
      void loadData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error("创建失败: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ch: Channel) => {
    try {
      await channelApi.deleteChannel(ch.id);
      message.success(`渠道 "${ch.name}" 已删除`);
      void loadData();
    } catch (err) {
      message.error("删除失败: " + (err as Error).message);
    }
  };

  const statusTag = (s: string) => {
    switch (s) {
      case "active": return <Tag color="green">活跃</Tag>;
      case "disabled": return <Tag color="default">已禁用</Tag>;
      case "error": return <Tag color="red">异常</Tag>;
      default: return <Tag>{s}</Tag>;
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}><ApiOutlined /><span>渠道管理</span></div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" className={styles.primaryBtn} icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>添加渠道</Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {channels.length === 0 && !loading ? (
          <Empty description="暂无渠道，点击「添加渠道」接入外部平台" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.teamGrid}>
            {channels.map((ch) => {
              const info = PLATFORM_LABELS[ch.platform as ChannelPlatform];
              return (
                <Card key={ch.id} className={styles.teamCard} bordered={false} hoverable onClick={() => navigate(`/channels/${ch.id}`)}>
                  <div className={styles.teamCardTitle}>
                    {info?.emoji || "🔗"} {ch.name}
                  </div>
                  <div className={styles.teamCardDesc}>
                    {info?.label || ch.platform} · {ch.direction === "input" ? "入站" : ch.direction === "output" ? "出站" : "双向"}
                  </div>
                  <div className={styles.teamCardMeta}>
                    <span>{statusTag(ch.status)}</span>
                    <span>最后消息: {formatTime(ch.lastMessageAt)}</span>
                  </div>
                  <div
                    className={styles.teamCardActions}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Popconfirm title="确定删除此渠道？" onConfirm={() => handleDelete(ch)} okText="删除" cancelText="取消">
                      <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Spin>

      <Modal title="添加渠道" open={createOpen} onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={saving} okText="创建" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item label="渠道名称" name="name" rules={[{ required: true, message: "请输入渠道名称" }, { max: 64 }]}>
            <Input placeholder="如: 官方公众号客服" />
          </Form.Item>
          <Form.Item label="平台类型" name="platform" rules={[{ required: true }]}>
            <Select options={PLATFORM_OPTIONS} placeholder="选择外部平台" />
          </Form.Item>
          <Form.Item label="消息方向" name="direction" initialValue="input">
            <Select options={[
              { value: "input", label: "入站（接收消息）" },
              { value: "output", label: "出站（推送消息）" },
              { value: "both", label: "双向" },
            ]} />
          </Form.Item>
          <Form.Item label="Webhook Token" name="webhookToken" tooltip="平台验证用 Token（微信公众号/飞书等配置时填入）">
            <Input.Password placeholder="平台验证 Token" />
          </Form.Item>
          <Form.Item label="API 凭证 (AppID)" name={["credentials", "appId"]} tooltip="微信公众号 AppID 或飞书 App ID">
            <Input placeholder="如: wx1234567890abcdef" />
          </Form.Item>
          <Form.Item label="API 凭证 (AppSecret)" name={["credentials", "appSecret"]} tooltip="微信公众号 AppSecret 或飞书 App Secret">
            <Input.Password placeholder="平台密钥" />
          </Form.Item>
          <Form.Item label="API 凭证 (Token/AccessToken)" name={["credentials", "token"]} tooltip="飞书/钉钉机器人的 Webhook Token 或 Access Token">
            <Input.Password placeholder="机器人 Token" />
          </Form.Item>
          <Form.Item label="加密密钥 (EncodingAESKey)" name={["credentials", "encodingAesKey"]} tooltip="微信公众号消息加解密密钥（可选，明文模式可不填）">
            <Input.Password placeholder="43位随机字符串" />
          </Form.Item>
            <Input.Password placeholder="平台验证 Token" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
