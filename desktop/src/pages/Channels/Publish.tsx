// 发布管理页（三期 3.2/3.4：列表 + 日历视图；审核 通过/打回/直接修改；创建可关联素材）
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Button, Calendar, Card, DatePicker, Empty, Form, Input, Modal, Select,
  Spin, Tabs, Tag, Typography, message,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  PlusOutlined, SendOutlined, CheckOutlined,
  CloseOutlined, ReloadOutlined, EditOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import * as channelApi from "@/api/channel-api";
import { listMediaAssets } from "@/api/media-asset-api";
import type { MediaAsset } from "@/api/media-asset-api";
import type { PublishPlan, PublishStatus } from "@/types/channel";
import styles from "../Team/styles.module.css";

const STATUS_MAP: Record<PublishStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  pending_review: { label: "待审核", color: "orange" },
  approved: { label: "已批准", color: "blue" },
  rejected: { label: "已拒绝", color: "red" },
  published: { label: "已发布", color: "green" },
  failed: { label: "失败", color: "red" },
};

const PLATFORM_OPTIONS = [
  { value: "douyin", label: "🎵 抖音" },
  { value: "xiaohongshu", label: "📕 小红书" },
  { value: "weibo", label: "📢 微博" },
  { value: "zhihu", label: "💡 知乎" },
  { value: "bilibili", label: "📺 B站" },
  { value: "wechat_mp", label: "💬 公众号" },
];

/** 平台展示元信息：列表 Tag 与日历展示统一使用的标签与颜色映射 */
export const PLATFORM_META: Record<string, { label: string; short: string; color: string }> = {
  douyin: { label: "抖音", short: "抖音", color: "#161823" },
  xiaohongshu: { label: "小红书", short: "小红书", color: "#ff2442" },
  weibo: { label: "微博", short: "微博", color: "#ff5722" },
  zhihu: { label: "知乎", short: "知乎", color: "#0084ff" },
  bilibili: { label: "B站", short: "B站", color: "#fb7299" },
  wechat_mp: { label: "公众号", short: "公众号", color: "#07c160" },
};

/** 平台 → 颜色（douyin 黑 / xiaohongshu 红 / weibo 橙红 / zhihu 蓝 / bilibili 粉 / wechat_mp 绿） */
export const PLATFORM_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORM_META).map(([platform, meta]) => [platform, meta.color]),
);

function formatTime(v: unknown): string {
  if (!v) return "-";
  return new Date(v as string).toLocaleString("zh-CN", { hour12: false });
}

interface PlanFormValues {
  title: string;
  content?: string;
  targetPlatforms: string[];
  mode?: "manual" | "scheduled" | "auto";
  scheduledAt?: Dayjs | null;
  assetIds?: number[];
}

export default function PublishList() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PublishPlan[]>([]);
  const [activeTab, setActiveTab] = useState("list");
  const [modalOpen, setModalOpen] = useState(false);
  /** null=创建；对象=直接修改该计划 */
  const [editing, setEditing] = useState<PublishPlan | null>(null);
  const [assetOptions, setAssetOptions] = useState<MediaAsset[]>([]);
  const [form] = Form.useForm<PlanFormValues>();
  const [saving, setSaving] = useState(false);
  /** 渠道授权状态：加载成功才展示提示条；listChannels 失败静默不展示 */
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [authorizedPlatforms, setAuthorizedPlatforms] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const channels = await channelApi.listChannels();
        if (cancelled) return;
        setAuthorizedPlatforms(new Set((channels ?? []).filter((c) => c.status === "active").map((c) => c.platform)));
        setChannelsLoaded(true);
      } catch {
        // 拉取渠道失败：静默不展示授权提示条
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** 未授权平台：公众号=无 active 的 wechat_mp 渠道；小红书=渠道枚举不含，视为未授权 */
  const unAuthedPlatforms = useMemo(() => {
    if (!channelsLoaded) return [] as string[];
    const list: string[] = [];
    if (!authorizedPlatforms.has("wechat_mp")) list.push("wechat_mp");
    if (!authorizedPlatforms.has("xiaohongshu")) list.push("xiaohongshu");
    return list;
  }, [channelsLoaded, authorizedPlatforms]);

  /** 仅当当前发布计划列表命中未授权平台时才展示提示条 */
  const showAuthAlert = useMemo(() => {
    if (unAuthedPlatforms.length === 0) return false;
    return plans.some((p) => (p.targetPlatforms ?? []).some((t) => unAuthedPlatforms.includes(t)));
  }, [plans, unAuthedPlatforms]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await channelApi.listPublishPlans();
      setPlans(list || []);
    } catch {
      message.error("加载发布计划失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 素材选项（供创建/编辑计划关联，最多取 200 条）
  const loadAssets = useCallback(async () => {
    try {
      const res = await listMediaAssets({ archived: false, page: 1, pageSize: 200 });
      setAssetOptions(res.list || []);
    } catch {
      setAssetOptions([]);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { void loadAssets(); }, [loadAssets]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ mode: "manual" });
    setModalOpen(true);
  };

  const openEdit = (plan: PublishPlan) => {
    setEditing(plan);
    form.resetFields();
    form.setFieldsValue({
      title: plan.title,
      content: plan.content,
      targetPlatforms: plan.targetPlatforms,
      mode: plan.mode,
      scheduledAt: plan.scheduledAt ? dayjs(plan.scheduledAt) : null,
      assetIds: plan.assetIds ?? undefined,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      const dto = {
        title: vals.title,
        content: vals.content,
        targetPlatforms: vals.targetPlatforms,
        mode: vals.mode || "manual",
        scheduledAt: vals.scheduledAt?.toISOString(),
        assetIds: vals.assetIds,
      };
      if (editing) {
        await channelApi.updatePublishPlan(editing.id, dto);
        message.success("发布计划已更新");
      } else {
        await channelApi.createPublishPlan(dto);
        message.success("发布计划创建成功");
      }
      setModalOpen(false);
      form.resetFields();
      void loadData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error((editing ? "保存失败: " : "创建失败: ") + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (plan: PublishPlan, action: string) => {
    try {
      switch (action) {
        case "submit":
          await channelApi.submitForReview(plan.id);
          message.success("已提交审核");
          break;
        case "approve":
          await channelApi.reviewPlan(plan.id, { approved: true });
          message.success("审核通过");
          break;
        case "reject":
          await channelApi.reviewPlan(plan.id, { approved: false, comment: "审核不通过" });
          message.success("已拒绝");
          break;
        case "execute":
          await channelApi.executePublish(plan.id);
          message.success("发布成功");
          break;
        case "cancel":
          await channelApi.cancelPublish(plan.id);
          message.success("已退回草稿");
          break;
      }
      void loadData();
    } catch (err) {
      message.error("操作失败: " + (err as Error).message);
    }
  };

  // ===== 日历视图数据：按日期分组（定时/发布时间） =====
  const plansByDate = useMemo(() => {
    const map = new Map<string, PublishPlan[]>();
    for (const plan of plans) {
      const key = plan.status === "published" ? plan.publishedAt : plan.scheduledAt;
      if (!key) continue;
      const date = dayjs(key).format("YYYY-MM-DD");
      const list = map.get(date) ?? [];
      list.push(plan);
      map.set(date, list);
    }
    return map;
  }, [plans]);

  const cellRender = (date: Dayjs, info: { type: string }) => {
    if (info.type !== "date") return null;
    const dayPlans = plansByDate.get(date.format("YYYY-MM-DD"));
    if (!dayPlans?.length) return null;
    return (
      <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12 }}>
        {dayPlans.slice(0, 3).map((plan) => {
          const st = STATUS_MAP[plan.status] || { label: plan.status, color: "default" };
          return (
            <li key={plan.id} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
              <Tag color={st.color} style={{ marginRight: 4 }}>{st.label}</Tag>
              {plan.targetPlatforms.slice(0, 2).map((p) => (
                <span key={p} style={{ color: PLATFORM_COLORS[p] ?? "inherit", fontWeight: 500, marginRight: 3 }}>
                  {PLATFORM_META[p]?.short ?? p}
                </span>
              ))}
              {plan.targetPlatforms.length > 2 && (
                <span style={{ color: "var(--color-text-secondary)", marginRight: 3 }}>+{plan.targetPlatforms.length - 2}</span>
              )}
              {plan.title}
            </li>
          );
        })}
        {dayPlans.length > 3 && <li style={{ color: "var(--color-text-secondary)" }}>+{dayPlans.length - 3} 更多</li>}
      </ul>
    );
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}><span className={styles.pageTitleIcon}><SendOutlined /></span><span>发布管理</span></div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" className={styles.primaryBtn} icon={<PlusOutlined />} onClick={openCreate}>
            创建发布计划
          </Button>
        </div>
      </div>

      {showAuthAlert && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, borderRadius: 10 }}
          message={
            <span>
              部分平台尚未授权：{unAuthedPlatforms.map((p) => PLATFORM_META[p]?.label ?? p).join("、")}
              <Typography.Link style={{ marginLeft: 8 }} onClick={() => navigate("/channels")}>去渠道管理</Typography.Link>
            </span>
          }
        />
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "list", label: "列表" },
          { key: "calendar", label: "日历" },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Spin spinning={loading}>
        {activeTab === "list" ? (
          plans.length === 0 && !loading ? (
            <Empty description="暂无发布计划" style={{ marginTop: 80 }} />
          ) : (
            <div className={styles.teamGrid}>
              {plans.map((plan) => {
                const st = STATUS_MAP[plan.status] || { label: plan.status, color: "default" };
                return (
                  <Card key={plan.id} className={styles.teamCard} bordered={false}>
                    <div className={styles.teamCardTitle}>
                      <SendOutlined style={{ marginRight: 6, color: "var(--color-brand)" }} />
                      {plan.title}
                    </div>
                    <div className={styles.teamCardDesc}>
                      {plan.content?.substring(0, 80) || "暂无内容"}
                    </div>
                    <div className={styles.teamCardMeta}>
                      <Tag color={st.color}>{st.label}</Tag>
                      <span>目标: </span>
                      {plan.targetPlatforms.map((p) => (
                        <Tag key={p} color={PLATFORM_COLORS[p] ?? "default"}>{PLATFORM_META[p]?.label ?? p}</Tag>
                      ))}
                      {plan.scheduledAt && <span>定时: {formatTime(plan.scheduledAt)}</span>}
                      {plan.taskId != null && <Tag color="purple">关联任务 #{plan.taskId}</Tag>}
                      {plan.assetIds && plan.assetIds.length > 0 && <Tag color="cyan">素材 {plan.assetIds.length} 个</Tag>}
                    </div>
                    <div
                      className={styles.teamCardActions}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flexWrap: "wrap", gap: 4 }}
                    >
                      {(plan.status === "draft" || plan.status === "pending_review") && (
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(plan)}>
                          直接修改
                        </Button>
                      )}
                      {plan.status === "draft" && (
                        <Button size="small" className={styles.taskMoveBtn}
                          onClick={() => handleAction(plan, "submit")}>
                          提交审核
                        </Button>
                      )}
                      {plan.status === "pending_review" && (
                        <>
                          <Button size="small" type="primary" className={styles.primaryBtn}
                            icon={<CheckOutlined />} onClick={() => handleAction(plan, "approve")}>
                            通过
                          </Button>
                          <Button size="small" danger icon={<CloseOutlined />}
                            onClick={() => handleAction(plan, "reject")}>
                            打回
                          </Button>
                        </>
                      )}
                      {plan.status === "approved" && (
                        <Button size="small" type="primary" className={styles.primaryBtn}
                          icon={<SendOutlined />} onClick={() => handleAction(plan, "execute")}>
                          执行发布
                        </Button>
                      )}
                      {plan.status === "published" && (
                        <Tag color="green">✅ 已发布 {plan.publishedAt ? formatTime(plan.publishedAt) : ""}</Tag>
                      )}
                      {plan.status !== "published" && plan.status !== "rejected" && (
                        <Button size="small" onClick={() => handleAction(plan, "cancel")}>
                          退回草稿
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          <Card bordered={false} style={{ borderRadius: 12, border: "1px solid var(--color-border)" }}>
            <Calendar fullscreen cellRender={cellRender} />
          </Card>
        )}
      </Spin>

      <Modal title={editing ? "直接修改发布计划" : "创建发布计划"} open={modalOpen} onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={saving} okText={editing ? "保存" : "创建"} cancelText="取消" destroyOnClose width={560}>
        <Form form={form} layout="vertical">
          <Form.Item label="标题" name="title" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="如: AI办公工具种草笔记" />
          </Form.Item>
          <Form.Item label="内容" name="content">
            <Input.TextArea rows={4} placeholder="发布内容正文" maxLength={2000} showCount />
          </Form.Item>
          <Form.Item label="目标平台" name="targetPlatforms" rules={[{ required: true, message: "请选择至少一个平台" }]}>
            <Select mode="multiple" options={PLATFORM_OPTIONS} placeholder="选择发布平台" />
          </Form.Item>
          <Form.Item label="关联素材" name="assetIds">
            <Select
              mode="multiple"
              allowClear
              placeholder="从素材库选择（图片/视频/音频/文件）"
              options={assetOptions.map((a) => ({ value: a.id, label: `${a.title}（${a.assetType}）` }))}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="发布模式" name="mode" initialValue="manual">
            <Select options={[
              { value: "manual", label: "手动发布" },
              { value: "scheduled", label: "定时发布" },
              { value: "auto", label: "自动发布" },
            ]} />
          </Form.Item>
          <Form.Item label="定时发布时间" name="scheduledAt">
            <DatePicker showTime style={{ width: "100%" }} placeholder="选择定时发布时间" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
