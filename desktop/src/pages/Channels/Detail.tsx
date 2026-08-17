// 渠道详情页 — 编辑凭证、查看 Webhook、管理消息
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button, Card, Descriptions, Form, Input, Select, Spin,
  Tag, message, Divider, Table, Space, Tooltip,
} from "antd";
import {
  ArrowLeftOutlined, ReloadOutlined, CopyOutlined,
  LinkOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from "@ant-design/icons";
import * as channelApi from "@/api/channel-api";
import type { Channel, ChannelMessage } from "@/types/channel";
import { PLATFORM_LABELS } from "@/types/channel";
import type { ChannelPlatform } from "@/types/channel";
import styles from "../Team/styles.module.css";

function formatTime(v: unknown): string {
  if (!v) return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  const loadChannel = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const ch = await channelApi.getChannel(Number(id));
      setChannel(ch);
      form.setFieldsValue({
        name: ch.name,
        direction: ch.direction,
        webhookToken: ch.webhookToken || "",
        appId: "",
        appSecret: "",
        token: "",
        encodingAesKey: "",
      });
    } catch (err) {
      message.error("加载渠道详情失败");
      navigate("/channels");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadChannel(); }, [loadChannel]);

  const handleSave = async () => {
    if (!channel) return;
    try {
      const vals = await form.validateFields();
      setSaving(true);
      const credentials: Record<string, string> = {};
      if (vals.appId) credentials.appId = vals.appId;
      if (vals.appSecret) credentials.appSecret = vals.appSecret;
      if (vals.token) credentials.token = vals.token;
      if (vals.encodingAesKey) credentials.encodingAesKey = vals.encodingAesKey;

      await channelApi.updateChannel(channel.id, {
        name: vals.name,
        direction: vals.direction,
        webhookToken: vals.webhookToken || undefined,
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
      });
      message.success("渠道配置已保存");
      void loadChannel();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error("保存失败: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!channel) return null;

  const platformInfo = PLATFORM_LABELS[channel.platform as ChannelPlatform];
  const webhookFullUrl = channel.webhookUrl || `${window.location.origin.replace(/\/$/, "")}/api/channels/webhook/${channel.platform}`;

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <LinkOutlined />
          </span>
          <span>{channel.name}</span>
          <Tag color={channel.status === "active" ? "green" : "default"}>
            {channel.status === "active" ? "活跃" : "已禁用"}
          </Tag>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={() => navigate("/channels")}>
            返回列表
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 1100 }}>
        {/* 左侧：基本配置 */}
        <Card title="渠道配置" extra={<Button className={styles.backBtn} icon={<ReloadOutlined />} onClick={loadChannel} size="small">刷新</Button>}>
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item label="渠道名称" name="name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label="消息方向" name="direction">
              <Select options={[
                { value: "input", label: "入站（接收消息）" },
                { value: "output", label: "出站（推送消息）" },
                { value: "both", label: "双向" },
              ]} />
            </Form.Item>

            <Divider plain>🔑 API 凭证（加密存储）</Divider>

            <Form.Item label="AppID" name="appId" tooltip="微信公众号 AppID / 飞书 App ID">
              <Input placeholder="如: wx1234567890abcdef" />
            </Form.Item>
            <Form.Item label="AppSecret" name="appSecret" tooltip="微信公众号 AppSecret / 飞书 App Secret">
              <Input.Password placeholder="平台密钥" />
            </Form.Item>
            <Form.Item label="Token / AccessToken" name="token" tooltip="飞书/钉钉机器人的验证 Token">
              <Input.Password placeholder="机器人 Token" />
            </Form.Item>
            <Form.Item label="EncodingAESKey" name="encodingAesKey" tooltip="消息加解密密钥（可选）">
              <Input.Password placeholder="43位随机字符串" />
            </Form.Item>
            <Form.Item label="Webhook Token" name="webhookToken" tooltip="URL 验证用 Token">
              <Input.Password placeholder="平台 URL 验证 Token" />
            </Form.Item>

            <Button type="primary" htmlType="submit" loading={saving} block className={styles.primaryBtn}>
              保存配置
            </Button>
          </Form>
        </Card>

        {/* 右侧：Webhook 信息 + 消息记录 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card
            title="Webhook 回调地址"
            extra={
              <Tooltip title="复制">
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(webhookFullUrl);
                    message.success("已复制到剪贴板");
                  }}
                />
              </Tooltip>
            }
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="URL">
                <code style={{ wordBreak: "break-all", fontSize: 12 }}>{webhookFullUrl}</code>
              </Descriptions.Item>
              <Descriptions.Item label="请求方式">POST（消息推送）/ GET（URL验证）</Descriptions.Item>
              <Descriptions.Item label="平台">
                {platformInfo?.label || channel.platform}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatTime(channel.createdAt)}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--color-bg-layout)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12, color: "var(--color-text-tertiary)" }}>
              💡 将此 URL 填入 {platformInfo?.label || "平台"} 的服务器配置中的回调地址
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
