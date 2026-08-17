// 发布管理页
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, Card, Empty, Form, Input, Modal, Select,
  Spin, Tag, message, DatePicker,
} from "antd";
import {
  PlusOutlined, SendOutlined, CheckOutlined,
  CloseOutlined, ReloadOutlined,
} from "@ant-design/icons";
import * as channelApi from "@/api/channel-api";
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

function formatTime(v: unknown): string {
  if (!v) return "-";
  return new Date(v as string).toLocaleString("zh-CN", { hour12: false });
}

export default function PublishList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PublishPlan[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await channelApi.listPublishPlans();
      setPlans(list || []);
    } catch (err) {
      message.error("加载发布计划失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      await channelApi.createPublishPlan({
        title: vals.title,
        content: vals.content,
        targetPlatforms: vals.targetPlatforms,
        mode: vals.mode || "manual",
        scheduledAt: vals.scheduledAt?.toISOString(),
      });
      message.success("发布计划创建成功");
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

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}><span className={styles.pageTitleIcon}><SendOutlined /></span><span>发布管理</span></div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" className={styles.primaryBtn} icon={<PlusOutlined />}
            onClick={() => { form.resetFields(); setCreateOpen(true); }}>
            创建发布计划
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {plans.length === 0 && !loading ? (
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
                    <span>目标: {plan.targetPlatforms.join(", ")}</span>
                    {plan.scheduledAt && <span>定时: {formatTime(plan.scheduledAt)}</span>}
                  </div>
                  <div
                    className={styles.teamCardActions}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flexWrap: "wrap", gap: 4 }}
                  >
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
                          拒绝
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
        )}
      </Spin>

      <Modal title="创建发布计划" open={createOpen} onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={saving} okText="创建" cancelText="取消" destroyOnClose width={560}>
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
