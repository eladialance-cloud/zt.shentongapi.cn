// 渠道管理页 — 统一管理消息渠道、账号与 Agent 绑定
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert, Badge, Button, Card, Empty, Form, Input, Modal, Popconfirm,
  Segmented, Select, Spin, Statistic, Tag, Tooltip, message,
} from "antd";
import {
  PlusOutlined, DeleteOutlined, ApiOutlined,
  ReloadOutlined, LinkOutlined, InfoCircleOutlined, QrcodeOutlined, LoginOutlined,
} from "@ant-design/icons";
import * as channelApi from "@/api/channel-api";
import type { Channel, ChannelPlatform, ChannelDirection, ChannelPlatformMeta, ChannelCategory } from "@/types/channel";
import {
  PLATFORM_LABELS, CHANNEL_PLATFORMS, CHANNEL_IM_PLATFORMS, CHANNEL_PUBLISH_PLATFORMS,
  getChannelPlatformMeta, normalizeAccountId, describeAgentBinding,
} from "@/types/channel";
import { OFFICIAL_META } from "@/pages/TaskCenter/edict-data";
import ScanLoginModal from "./ScanLoginModal";
import styles from "../Team/styles.module.css";

function formatTime(v: unknown): string {
  if (!v) return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("zh-CN", { hour12: false });
}

const OFFICIAL_OPTIONS = [
  { value: "", label: "不绑定（默认由团队处理）" },
  ...OFFICIAL_META.map((o) => ({ value: o.id, label: `${o.emoji} ${o.name}（${o.role}）` })),
];

export default function ChannelList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [platforms, setPlatforms] = useState<ChannelPlatformMeta[]>(CHANNEL_PLATFORMS);
  const [createOpen, setCreateOpen] = useState(false);
  const [pickPlatform, setPickPlatform] = useState<ChannelPlatformMeta | null>(null);
  const [category, setCategory] = useState<ChannelCategory>("im");
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [scanTarget, setScanTarget] = useState<ChannelPlatformMeta | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [list, plats] = await Promise.all([
        channelApi.listChannels(),
        channelApi.listChannelPlatforms(),
      ]);
      setChannels(list || []);
      if (plats?.length) setPlatforms(plats);
    } catch {
      message.error("加载渠道列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // 统计：总数 / 已连接（active） / 未连接
  const stats = useMemo(() => {
    const total = channels.length;
    const connected = channels.filter((c) => c.status === "active").length;
    return { total, connected, disconnected: total - connected };
  }, [channels]);

  // 按分类分组展示（IM 入站消息 / 内容发布平台）
  const categoryPlatforms = useMemo(
    () => platforms.filter((p) => p.category === category),
    [platforms, category],
  );
  const categoryChannels = useMemo(() => {
    const ids = new Set(categoryPlatforms.map((p) => p.platform));
    return channels.filter((c) => ids.has(c.platform as ChannelPlatform));
  }, [channels, categoryPlatforms]);

  /** 发布平台扫码登录（弹窗 + 事件流：waiting→scanned→success/expired） */
  const handleScanLogin = (p: ChannelPlatformMeta) => {
    const api = window.electronAPI?.platformAccount;
    if (!api?.startScan) {
      message.warning("当前环境不支持扫码登录，请在桌面端使用");
      return;
    }
    setScanTarget(p);
  };

  /** 测试渠道连接（服务端适配器 healthCheck） */
  const handleTestConnection = async (ch: Channel) => {
    setTestingId(ch.id);
    try {
      const r = await channelApi.testChannelConnection(ch.id);
      if (r.online) {
        message.success(`${ch.name}：${r.message || "连接正常"}`);
      } else {
        message.warning(`${ch.name}：${r.message || "连接异常"}`);
      }
    } catch (err) {
      message.error("测试失败: " + ((err as Error).message || String(err)));
    } finally {
      setTestingId(null);
    }
  };

  const openCreate = (meta?: ChannelPlatformMeta) => {
    form.resetFields();
    if (meta) {
      setPickPlatform(meta);
      form.setFieldsValue({ platform: meta.platform, direction: "both", accountId: "default" });
    } else {
      setPickPlatform(null);
    }
    setCreateOpen(true);
  };

  const handleSelectPlatform = (platform: string) => {
    const meta = getChannelPlatformMeta(platform) ?? null;
    setPickPlatform(meta);
    form.setFieldsValue({ credentials: undefined });
  };

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      const meta = getChannelPlatformMeta(vals.platform);
      // 只保留该平台声明的凭证字段（空值不提交）
      const credentials: Record<string, string> = {};
      for (const f of meta?.credentialFields ?? []) {
        const v = vals?.["cred_" + f.key];
        if (v) credentials[f.key] = v;
      }
      await channelApi.createChannel({
        name: vals.name,
        platform: vals.platform,
        direction: vals.direction,
        credentials: Object.keys(credentials).length ? credentials : undefined,
        webhookToken: vals.webhookToken || undefined,
        accountId: normalizeAccountId(vals.accountId),
        agentRef: vals.agentRef || undefined,
      });
      message.success("渠道创建成功");
      setCreateOpen(false);
      form.resetFields();
      setPickPlatform(null);
      void loadData();
    } catch (err: unknown) {
      if ((err as { errorFields?: unknown })?.errorFields) return;
      message.error("创建失败: " + ((err as Error).message || String(err)));
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
      case "active": return <Tag color="green">已连接</Tag>;
      case "disabled": return <Tag color="default">已禁用</Tag>;
      case "error": return <Tag color="red">异常</Tag>;
      default: return <Tag>{s}</Tag>;
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}><span className={styles.pageTitleIcon}><ApiOutlined /></span><span>消息渠道</span></div>
        <div className={styles.headerActions}>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" className={styles.primaryBtn} icon={<PlusOutlined />} onClick={() => openCreate()}>添加渠道</Button>
        </div>
      </div>

      <p style={{ margin: "0 0 16px", color: "var(--color-text-secondary)", fontSize: 13 }}>
        统一管理消息频道与账号，可为一个渠道挂多个账号，每个账号绑定不同官署（AI 员工）处理。
      </p>

      <Segmented
        style={{ marginBottom: 16 }}
        value={category}
        onChange={(v) => setCategory(v as ChannelCategory)}
        options={[
          { label: `入站消息（${CHANNEL_IM_PLATFORMS.length}）`, value: "im" },
          { label: `内容发布（${CHANNEL_PUBLISH_PLATFORMS.length}）`, value: "publish" },
        ]}
      />

      {/* 统计卡 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20, maxWidth: 720 }}>
        <Card size="small" bordered={false}>
          <Statistic title="渠道总数" value={stats.total} />
        </Card>
        <Card size="small" bordered={false}>
          <Statistic title="已连接" value={stats.connected} valueStyle={{ color: "#16a34a" }} />
        </Card>
        <Card size="small" bordered={false}>
          <Statistic title="未连接" value={stats.disconnected} valueStyle={{ color: stats.disconnected > 0 ? "#dc2626" : undefined }} />
        </Card>
      </div>

      <Spin spinning={loading}>
        {categoryChannels.length === 0 && !loading ? (
          <Empty description={`暂无${category === "im" ? "消息" : "发布"}渠道`} style={{ marginTop: 60 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 12 }}>
              {categoryPlatforms.map((p) => (
                <Button key={p.platform} size="small" onClick={() => openCreate(p)}>
                  {p.emoji} {p.label}
                </Button>
              ))}
            </div>
          </Empty>
        ) : (
          <div className={styles.teamGrid}>
            {categoryChannels.map((ch) => {
              const info = PLATFORM_LABELS[ch.platform as ChannelPlatform];
              const meta = getChannelPlatformMeta(ch.platform);
              return (
                <Card key={ch.id} className={styles.teamCard} bordered={false} hoverable onClick={() => navigate(`/channels/${ch.id}`)}>
                  <div className={styles.teamCardTitle}>
                    {info?.emoji || "🔗"} {ch.name}
                    {meta && !meta.inbound ? (
                      <Tooltip title={meta.category === "publish" ? "发布动作在桌面端扫码会话中完成" : "该平台暂只支持出站推送"}>
                        <Tag style={{ marginLeft: 6 }} color={meta.category === "publish" ? "purple" : "default"}>
                          {meta.category === "publish" ? "扫码发布" : "仅出站"}
                        </Tag>
                      </Tooltip>
                    ) : null}
                  </div>
                  <div className={styles.teamCardDesc}>
                    {info?.label || ch.platform} · {ch.direction === "input" ? "入站" : ch.direction === "output" ? "出站" : "双向"}
                    {ch.accountId ? ` · 账号 ${ch.accountId}` : ""}
                  </div>
                  <div className={styles.teamCardMeta}>
                    <span>{statusTag(ch.status)}</span>
                    <Tooltip title={describeAgentBinding(ch.agentRef, ch.agentId)}>
                      <span><LinkOutlined /> {ch.agentRef ? OFFICIAL_META.find((o) => o.id === ch.agentRef)?.name ?? ch.agentRef : "未绑定"}</span>
                    </Tooltip>
                    <span>最后消息: {formatTime(ch.lastMessageAt)}</span>
                  </div>
                  <div className={styles.teamCardActions} onClick={(e) => e.stopPropagation()}>
                    {meta?.category === "publish" ? (
                      <Button size="small" icon={<QrcodeOutlined />}
                        onClick={() => handleScanLogin(meta)}>扫码登录</Button>
                    ) : (
                      <Button size="small" icon={<ApiOutlined />} loading={testingId === ch.id}
                        onClick={() => void handleTestConnection(ch)}>测试连接</Button>
                    )}
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
        onCancel={() => { setCreateOpen(false); form.resetFields(); setPickPlatform(null); }}
        confirmLoading={saving} okText="创建" cancelText="取消" destroyOnClose width={560}>
        <Form form={form} layout="vertical">
          <Form.Item label="平台类型" name="platform" rules={[{ required: true, message: "请选择平台" }]}>
            <Select
              onChange={handleSelectPlatform}
              placeholder="选择外部平台"
              options={[...CHANNEL_IM_PLATFORMS, ...CHANNEL_PUBLISH_PLATFORMS].map((p) => ({
                value: p.platform,
                label: `${p.emoji} ${p.label}${p.category === "publish" ? "（发布）" : p.inbound ? "" : "（仅出站）"}`,
              }))}
            />
          </Form.Item>

          {pickPlatform ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`${pickPlatform.emoji} ${pickPlatform.label} · ${pickPlatform.connectionType === "webhook" ? "回调接入" : pickPlatform.connectionType === "qr" ? "扫码登录" : "凭证接入"}`}
              description={
                <div style={{ fontSize: 12 }}>
                  <div>{pickPlatform.description}</div>
                  <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                    {pickPlatform.instructions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              }
            />
          ) : null}

          {pickPlatform?.category === "publish" && pickPlatform.connectionType === "qr" ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="发布平台需要扫码登录"
              description="创建渠道后，在渠道卡片点击「扫码登录」，桌面端会弹出该平台创作中心，登录态加密存本地，发布时复用。"
            />
          ) : null}

          <Form.Item label="渠道名称" name="name" rules={[{ required: true, message: "请输入渠道名称" }, { max: 64 }]}>
            <Input placeholder="如: 官方公众号客服" />
          </Form.Item>

          <Form.Item
            label="账号 ID"
            name="accountId"
            initialValue="default"
            tooltip="同一平台可挂多个账号，各自绑定不同官署；小写字母/数字/连字符/下划线"
            rules={[{ pattern: /^[a-z0-9_-]{1,64}$/, message: "仅小写字母、数字、连字符、下划线" }]}
          >
            <Input placeholder="default" />
          </Form.Item>

          <Form.Item label="消息方向" name="direction" initialValue="both">
            <Select options={[
              { value: "input", label: "入站（接收消息）" },
              { value: "output", label: "出站（推送消息）" },
              { value: "both", label: "双向" },
            ]} />
          </Form.Item>

          <Form.Item
            label="绑定官署（AI 员工）"
            name="agentRef"
            tooltip="该渠道收到的消息交由哪个官署（AI 员工）处理"
          >
            <Select allowClear options={OFFICIAL_OPTIONS} placeholder="不绑定（默认由团队处理）" />
          </Form.Item>

          {pickPlatform?.credentialFields.length ? (
            <>
              <div style={{ margin: "8px 0", color: "var(--color-text-secondary)", fontSize: 12 }}>
                <InfoCircleOutlined /> API 凭证（加密存储，仅需填写本平台所用字段）
              </div>
              {pickPlatform.credentialFields.map((f) => (
                <Form.Item key={f.key} label={f.label} name={"cred_" + f.key}>
                  {f.secret ? <Input.Password placeholder={f.placeholder} /> : <Input placeholder={f.placeholder} />}
                </Form.Item>
              ))}
            </>
          ) : null}

          <Form.Item label="Webhook Token" name="webhookToken" tooltip="平台 URL 验证用 Token（微信/飞书等回调平台）">
            <Input.Password placeholder="平台验证 Token" />
          </Form.Item>
        </Form>
      </Modal>

      <ScanLoginModal
        open={!!scanTarget}
        platform={scanTarget}
        onClose={() => setScanTarget(null)}
        onSuccess={(platform, displayName) => {
          message.success(`${platform} 登录成功${displayName ? `（${displayName}）` : ""}`);
          void loadData();
        }}
      />
    </div>
  );
}
