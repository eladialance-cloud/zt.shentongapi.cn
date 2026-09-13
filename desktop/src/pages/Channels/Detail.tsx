// 渠道详情页 — 编辑凭证、账号与官署绑定、查看 Webhook、管理消息
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert, Button, Card, Descriptions, Form, Input, Select, Spin, Switch,
  Tag, message, Divider, Space, Tooltip,
} from "antd";
import {
  ArrowLeftOutlined, ReloadOutlined, CopyOutlined,
  LinkOutlined, InfoCircleOutlined, ApiOutlined, QrcodeOutlined, SafetyCertificateOutlined,
} from "@ant-design/icons";
import * as channelApi from "@/api/channel-api";
import type { Channel, ChannelPlatform } from "@/types/channel";
import { PLATFORM_LABELS, channelWebhookMethod, getChannelPlatformMeta } from "@/types/channel";
import { OFFICIAL_META } from "@/pages/TaskCenter/edict-data";
import { resolveChannelWebhookUrl } from "@/utils/channel-webhook";
import ScanLoginModal from "./ScanLoginModal";
import styles from "../Team/styles.module.css";

function formatTime(v: unknown): string {
  if (!v) return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("zh-CN", { hour12: false });
}

const OFFICIAL_OPTIONS = [
  ...OFFICIAL_META.map((o) => ({ value: o.id, label: `${o.emoji} ${o.name}（${o.role}）` })),
];

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ online: boolean; message: string; at: number } | null>(null);
  const [sessionState, setSessionState] = useState<{ ok: boolean; online?: boolean; message?: string; at: number } | null>(null);
  const [sessionChecking, setSessionChecking] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const loadChannel = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const ch = await channelApi.getChannel(Number(id));
      setChannel(ch);
      // 凭证字段一律留空（后端加密存储不回传），留空即不修改
      form.setFieldsValue({
        name: ch.name,
        direction: ch.direction,
        accountId: ch.accountId || "default",
        agentRef: ch.agentRef || undefined,
        webhookToken: ch.webhookToken || "",
        status: ch.status === "active",
      });
    } catch {
      message.error("加载渠道详情失败");
      navigate("/channels");
    } finally {
      setLoading(false);
    }
  }, [id, form, navigate]);

  useEffect(() => { void loadChannel(); }, [loadChannel]);

  /** 服务端适配器连接测试（凭证完整性 + healthCheck） */
  const handleTestConnection = async () => {
    if (!channel) return;
    setTesting(true);
    try {
      const r = await channelApi.testChannelConnection(channel.id);
      setTestResult({ online: r.online, message: r.message || (r.online ? "连接正常" : "连接异常"), at: Date.now() });
      if (r.online) message.success(r.message || "连接正常");
      else message.warning(r.message || "连接异常");
    } catch (err) {
      const msg = (err as Error).message || String(err);
      setTestResult({ online: false, message: msg, at: Date.now() });
      message.error("测试失败: " + msg);
    } finally {
      setTesting(false);
    }
  };

  /** 桌面端会话有效性检测（扫码发布平台） */
  const handleVerifySession = async () => {
    if (!channel) return;
    const api = window.electronAPI?.platformAccount;
    if (!api?.verifySession) {
      message.warning("当前环境不支持会话检测，请在桌面端使用");
      return;
    }
    setSessionChecking(true);
    try {
      const r = await api.verifySession(channel.platform);
      if (r.ok) {
        setSessionState({ ok: true, online: r.online, message: r.message, at: Date.now() });
        if (r.online) message.success("登录态有效");
        else message.warning(r.message || "登录态已失效，请重新扫码");
      } else {
        setSessionState({ ok: false, message: r.error, at: Date.now() });
        message.warning(r.error || "未找到本地登录会话");
      }
    } catch (err) {
      const msg = (err as Error).message || String(err);
      setSessionState({ ok: false, message: msg, at: Date.now() });
      message.error("检测失败: " + msg);
    } finally {
      setSessionChecking(false);
    }
  };

  const handleSave = async () => {
    if (!channel) return;
    try {
      const vals = await form.validateFields();
      setSaving(true);
      const meta = getChannelPlatformMeta(channel.platform);
      const credentials: Record<string, string> = {};
      for (const f of meta?.credentialFields ?? []) {
        const v = vals?.["cred_" + f.key];
        if (v) credentials[f.key] = v;
      }
      if (vals.encryptKey) credentials.encryptKey = vals.encryptKey;

      await channelApi.updateChannel(channel.id, {
        name: vals.name,
        direction: vals.direction,
        accountId: vals.accountId,
        agentRef: vals.agentRef || "",
        status: vals.status ? "active" : "disabled",
        webhookToken: vals.webhookToken || undefined,
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
      });
      message.success("渠道配置已保存");
      void loadChannel();
    } catch (err: unknown) {
      if ((err as { errorFields?: unknown })?.errorFields) return;
      message.error("保存失败: " + ((err as Error).message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!channel) return null;

  const platformInfo = PLATFORM_LABELS[channel.platform as ChannelPlatform];
  const meta = getChannelPlatformMeta(channel.platform);
  const webhookFullUrl = channel.webhookUrl || resolveChannelWebhookUrl(channel.platform);
  const webhookSupported = Boolean(webhookFullUrl);
  const boundOfficial = OFFICIAL_META.find((o) => o.id === channel.agentRef);

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><LinkOutlined /></span>
          <span>{channel.name}</span>
          <Tag color={channel.status === "active" ? "green" : "default"}>
            {channel.status === "active" ? "已连接" : "已禁用"}
          </Tag>
          {channel.accountId ? <Tag color="blue">账号 {channel.accountId}</Tag> : null}
        </div>
        <div className={styles.headerActions}>
          {meta?.category === "publish" ? (
            <Button type="primary" icon={<QrcodeOutlined />} onClick={() => setScanOpen(true)}>扫码登录</Button>
          ) : (
            <Button type="primary" icon={<ApiOutlined />} loading={testing} onClick={() => void handleTestConnection()}>测试连接</Button>
          )}
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/channels")}>
            返回列表
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 1100 }}>
        {/* 左侧：基本配置 */}
        <Card title="渠道配置" extra={<Button icon={<ReloadOutlined />} onClick={loadChannel} size="small">刷新</Button>}>
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item label="渠道名称" name="name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label="启用渠道" name="status" valuePropName="checked" tooltip="关闭后保存但渠道禁用，仍保留配置">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
            <Form.Item
              label="账号 ID"
              name="accountId"
              tooltip="同一平台可挂多个账号，各自绑定不同官署；小写字母/数字/连字符/下划线"
              rules={[{ pattern: /^[a-z0-9_-]{1,64}$/, message: "仅小写字母、数字、连字符、下划线" }]}
            >
              <Input placeholder="default" />
            </Form.Item>
            <Form.Item label="消息方向" name="direction">
              <Select options={[
                { value: "input", label: "入站（接收消息）" },
                { value: "output", label: "出站（推送消息）" },
                { value: "both", label: "双向" },
              ]} />
            </Form.Item>
            <Form.Item label="绑定官署（AI 员工）" name="agentRef" tooltip="该渠道收到的消息交由哪个官署处理">
              <Select allowClear options={OFFICIAL_OPTIONS} placeholder="不绑定（默认由团队处理）" />
            </Form.Item>

            <Divider plain><InfoCircleOutlined /> API 凭证（加密存储，留空表示不修改）</Divider>

            {((meta?.credentialFields ?? [
              { key: "appId", label: "AppID", placeholder: undefined, secret: false },
              { key: "appSecret", label: "AppSecret", placeholder: undefined, secret: true },
              { key: "token", label: "Token", placeholder: undefined, secret: true },
            ]) as Array<{ key: string; label: string; placeholder?: string; secret?: boolean }>).map((f) => (
              <Form.Item key={f.key} label={f.label} name={"cred_" + f.key} tooltip={f.placeholder}>
                {f.secret ? <Input.Password placeholder={f.placeholder} /> : <Input placeholder={f.placeholder} />}
              </Form.Item>
            ))}
            <Form.Item label="Webhook Token" name="webhookToken" tooltip="URL 验证用 Token">
              <Input.Password placeholder="平台 URL 验证 Token" />
            </Form.Item>

            <Button type="primary" htmlType="submit" loading={saving} block className={styles.primaryBtn}>
              保存配置
            </Button>
          </Form>
        </Card>

        {/* 右侧：概览 + Webhook */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card title="渠道概览">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="平台">{platformInfo?.emoji} {platformInfo?.label || channel.platform}</Descriptions.Item>
              <Descriptions.Item label="连接方式">
                {meta?.connectionType === "webhook" ? "回调接入" : meta?.connectionType === "qr" ? "扫码接入" : "凭证接入"}
              </Descriptions.Item>
              <Descriptions.Item label="入站回调">
                {meta?.inbound ? <Tag color="green">已支持</Tag> : <Tag color="default">未接入</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="账号 ID">{channel.accountId || "default"}</Descriptions.Item>
              <Descriptions.Item label="绑定官署">
                {boundOfficial ? `${boundOfficial.emoji} ${boundOfficial.name}` : "未绑定（默认由团队处理）"}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatTime(channel.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="最后消息">{formatTime(channel.lastMessageAt)}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            title="Webhook 回调地址"
            extra={
              webhookSupported ? (
                <Tooltip title="复制">
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      void navigator.clipboard.writeText(webhookFullUrl);
                      message.success("已复制到剪贴板");
                    }}
                  />
                </Tooltip>
              ) : null
            }
          >
            {webhookSupported ? (
              <>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="URL">
                    <code style={{ wordBreak: "break-all", fontSize: 12 }}>{webhookFullUrl}</code>
                  </Descriptions.Item>
                  <Descriptions.Item label="请求方式">{channelWebhookMethod(channel.platform)}</Descriptions.Item>
                </Descriptions>
                <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--color-bg-layout)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  💡 将此 URL 填入 {platformInfo?.label || "平台"} 的服务器配置中的回调地址
                </div>
              </>
            ) : (
              <Alert
                type="info"
                showIcon
                message="该平台暂未提供回调入口"
                description={`${platformInfo?.label || channel.platform} 目前仅支持在「发布中心」出站推送，暂不支持接收平台回调。`}
              />
            )}
          </Card>

          <Card
            title={<span><SafetyCertificateOutlined /> 连接诊断</span>}
            extra={
              meta?.category === "publish" ? (
                <Button size="small" loading={sessionChecking} onClick={() => void handleVerifySession()}>检测登录态</Button>
              ) : (
                <Button size="small" loading={testing} onClick={() => void handleTestConnection()}>重新测试</Button>
              )
            }
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="连接方式">
                {meta?.connectionType === "webhook" ? "回调接入（被动收消息）" : meta?.connectionType === "qr" ? "扫码登录（本地会话）" : "凭证接入"}
              </Descriptions.Item>
              <Descriptions.Item label="入站能力">
                {meta?.inbound ? <Tag color="green">支持接收消息</Tag> : <Tag color="default">仅出站推送</Tag>}
              </Descriptions.Item>
              {meta?.category === "publish" ? (
                <Descriptions.Item label="登录态">
                  {sessionState ? (
                    sessionState.online ? <Tag color="green">有效</Tag> : <Tag color="red">{sessionState.message || "已失效"}</Tag>
                  ) : (
                    <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>未检测（登录态在桌面端本地会话中维护）</span>
                  )}
                </Descriptions.Item>
              ) : (
                <Descriptions.Item label="凭证校验">
                  {testResult ? (
                    testResult.online ? <Tag color="green">{testResult.message}</Tag> : <Tag color="orange">{testResult.message}</Tag>
                  ) : (
                    <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>未测试</span>
                  )}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="提示">
                <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  {meta?.category === "publish"
                    ? "发布平台无需服务端凭证，登录态由桌面端扫码会话维护；右上角「扫码登录」可重新登录。"
                    : "凭证校验会调用平台接口（Telegram getMe / 微信 access_token 等），仅在编辑保存后测试。"}
                </span>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {meta?.instructions?.length ? (
            <Card title="接入指引" size="small">
              <Space direction="vertical" size={4}>
                {meta.instructions.map((s, i) => (
                  <span key={i} style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{i + 1}. {s}</span>
                ))}
              </Space>
            </Card>
          ) : null}
        </div>
      </div>

      <ScanLoginModal
        open={scanOpen}
        platform={meta ?? null}
        onClose={() => setScanOpen(false)}
        onSuccess={(platform, displayName) => {
          message.success(`${platform} 登录成功${displayName ? `（${displayName}）` : ""}`);
          setSessionState({ ok: true, online: true, message: "登录成功", at: Date.now() });
          void loadChannel();
        }}
      />
    </div>
  );
}
