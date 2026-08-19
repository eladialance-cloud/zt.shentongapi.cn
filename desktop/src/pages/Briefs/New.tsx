// 新建需求单页 —— 支持从对话（/briefs/new?from=chat&session=...&summary=...）带入内容预填
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button, Card, DatePicker, Form, Input, Select, Space, message,
} from "antd";
import type { Dayjs } from "dayjs";
import { ArrowLeftOutlined, FileTextOutlined, SaveOutlined } from "@ant-design/icons";
import { createBriefWithOfflineFallback } from "@/api/brief-offline";
import { useAuthStore } from "@/store/auth";
import styles from "./styles.module.css";

const { TextArea } = Input;

// 平台选项（label/value 与云端 briefs 对齐）
const PLATFORM_OPTIONS = [
  { label: "抖音", value: "douyin" },
  { label: "小红书", value: "xiaohongshu" },
  { label: "公众号", value: "wechat_mp" },
  { label: "微博", value: "weibo" },
  { label: "B站", value: "bilibili" },
  { label: "知乎", value: "zhihu" },
];

// 目标受众常用预设（Select 可输入自定义，tags 模式）
const AUDIENCE_OPTIONS = [
  { label: "大学生", value: "大学生" },
  { label: "职场新人", value: "职场新人" },
  { label: "职场白领", value: "职场白领" },
  { label: "宝妈群体", value: "宝妈群体" },
  { label: "中小企业主", value: "中小企业主" },
  { label: "自由职业者", value: "自由职业者" },
  { label: "科技爱好者", value: "科技爱好者" },
  { label: "内容创作者", value: "内容创作者" },
];

interface BriefFormValues {
  title: string;
  goal?: string;
  targetAudience?: string[] | string;
  platforms?: string[];
  style?: string;
  deadline?: Dayjs | null;
}

export default function BriefsNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useAuthStore((s) => s.user?.id);
  const [saving, setSaving] = useState(false);

  // 从对话页跳转时携带的上下文（summary 可能为空，需安全处理）
  const from = searchParams.get("from");
  const session = searchParams.get("session");
  const summary = searchParams.get("summary") || "";
  const prefillFromChat = from === "chat" && summary.length > 0;

  const initialValues: Partial<BriefFormValues> = {
    // 标题截取 summary 前 30 字，目标填 summary 全文
    title: prefillFromChat ? summary.slice(0, 30) : "",
    goal: prefillFromChat ? summary : "",
  };

  const handleFinish = async (vals: BriefFormValues) => {
    if (!userId) {
      message.warning("请先登录后再创建需求单");
      return;
    }
    setSaving(true);
    try {
      // 目标受众为可输入 Select（tags 模式），多选时以逗号拼接为字符串
      const audience = Array.isArray(vals.targetAudience)
        ? vals.targetAudience.join(", ")
        : vals.targetAudience;
      // 在线走云端；断网/服务不可用自动落本地并排队，联网后补传
      const created = await createBriefWithOfflineFallback({
        userId,
        payload: {
          title: vals.title,
          goal: vals.goal || undefined,
          targetAudience: audience || undefined,
          platforms: vals.platforms,
          style: vals.style || undefined,
          deadline: vals.deadline ? vals.deadline.format("YYYY-MM-DD") : undefined,
          sourceChatSessionId: session ? (Number.isNaN(Number(session)) ? null : Number(session)) : null,
          sourceChatSummary: summary || null,
        },
      });
      if (created.source === "local") {
        message.success("网络不可用，已保存到本地，联网后自动同步");
      } else {
        message.success("已创建需求单");
      }
      navigate("/briefs");
    } catch (err) {
      message.error("创建失败: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><FileTextOutlined /></span>
          <span>新建需求单</span>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
        </div>
      </div>

      {prefillFromChat && (
        <div className={styles.hintText} style={{ marginBottom: 12 }}>
          已从对话带入标题与目标，可修改后提交
        </div>
      )}

      <Card className={styles.formCard} bordered={false}>
        <Form<BriefFormValues> layout="vertical" initialValues={initialValues} onFinish={handleFinish}>
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: "请输入需求标题" }, { max: 64, message: "标题最长 64 字" }]}
          >
            <Input placeholder="一句话概括需求，如：为新品写 3 条种草文案" showCount maxLength={64} />
          </Form.Item>
          <Form.Item label="目标 (Goal)" name="goal">
            <TextArea rows={4} placeholder="描述想要达成的目标，可粘贴对话总结" showCount maxLength={2000} />
          </Form.Item>
          <Form.Item label="目标受众" name="targetAudience" tooltip="可选择预设或输入自定义受众，多个以逗号分隔">
            <Select
              mode="tags"
              options={AUDIENCE_OPTIONS}
              placeholder="如：大学生、职场新人"
              tokenSeparators={[",", "，"]}
              allowClear
            />
          </Form.Item>
          <Form.Item label="平台" name="platforms" tooltip="可选多个目标平台">
            <Select
              mode="multiple"
              options={PLATFORM_OPTIONS}
              placeholder="选择发布平台"
              allowClear
            />
          </Form.Item>
          <Form.Item label="风格" name="style">
            <TextArea rows={3} placeholder="内容风格偏好，如：轻松口语化、专业严谨、活泼种草" />
          </Form.Item>
          <Form.Item label="期限" name="deadline">
            <DatePicker style={{ width: "100%" }} placeholder="选择交付截止日期" />
          </Form.Item>

          <Space wrap>
            <Button
              type="primary"
              htmlType="submit"
              className={styles.primaryBtn}
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!userId}
            >
              创建需求单
            </Button>
            <Button className={styles.backBtn} onClick={() => navigate("/briefs")}>取消</Button>
          </Space>
        </Form>
        {!userId && <div className={styles.hintText}>当前未登录，无法创建需求单</div>}
      </Card>
    </div>
  );
}