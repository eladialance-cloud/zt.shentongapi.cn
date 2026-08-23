// 需求单详情页 —— 查看全部字段 / 确认 / 取消 / AI 拆解进度与结果展示
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert, Button, Card, Descriptions, Empty, Spin, Table, Tag, message,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  ArrowLeftOutlined, CheckOutlined, CloseOutlined, FileTextOutlined, ReloadOutlined,
} from "@ant-design/icons";
import { cancelBrief, confirmBrief, getBrief, redispatchBrief } from "@/api/brief-api";
import type {
  BriefItem, BriefStatus, DispatchPriority, DispatchStatus, DispatchTaskItem,
} from "@/api/brief-api";
import styles from "./styles.module.css";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 6;

// 平台 label 映射（与云端 briefs 对齐）
const PLATFORM_LABELS: Record<string, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechat_mp: "公众号",
  weibo: "微博",
  bilibili: "B站",
  zhihu: "知乎",
};

// 状态 → 文案 / Tag 颜色
const STATUS_MAP: Record<BriefStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  confirmed: { label: "已确认", color: "processing" },
  executing: { label: "执行中", color: "blue" },
  completed: { label: "已完成", color: "success" },
  cancelled: { label: "已取消", color: "default" },
};

// 拆解状态 → 文案 / Tag 颜色
const DISPATCH_STATUS_MAP: Record<DispatchStatus, { label: string; color: string }> = {
  none: { label: "未拆解", color: "default" },
  pending: { label: "拆解中", color: "processing" },
  done: { label: "已拆解", color: "success" },
  failed: { label: "待人工派活", color: "error" },
};

// 拆解失败原因码 → 用户可读文案
const DISPATCH_ERROR_MAP: Record<string, string> = {
  NO_MODEL_OR_RELAY: "没有可用的模型或中转配置，请在管理后台检查",
  LLM_REQUEST_FAILED: "大模型服务调用失败（网络或超时），请重试",
  PARSE_JSON_FAILED: "AI 返回的内容无法解析，请重试",
  NO_VALID_TASKS: "AI 拆解出的任务不合法，请重试",
  NO_TEAM_FOR_DISPATCH: "没有找到匹配的团队成员，请检查团队配置",
  DISPATCH_EXCEPTION: "拆解过程出现异常，请重试",
  DISPATCH_FAILED: "拆解失败，请重试",
};

// 优先级 → 文案 / Tag 颜色
const PRIORITY_MAP: Record<DispatchPriority, { label: string; color: string }> = {
  low: { label: "低", color: "default" },
  medium: { label: "中", color: "blue" },
  high: { label: "高", color: "orange" },
  urgent: { label: "紧急", color: "red" },
};

function formatTime(v?: string | null): string {
  if (!v) return "-";
  // 纯日期（YYYY-MM-DD）直接展示，避免时区偏移
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("zh-CN", { hour12: false });
}

const dispatchColumns: TableColumnsType<DispatchTaskItem> = [
  {
    title: "角色",
    dataIndex: "roleTitle",
    key: "roleTitle",
    width: 140,
  },
  {
    title: "任务",
    dataIndex: "taskTitle",
    key: "taskTitle",
    render: (taskTitle: string, record) => (
      <div>
        <div>{taskTitle}</div>
        {record.description ? (
          <div className={styles.dispatchDesc}>{record.description}</div>
        ) : null}
      </div>
    ),
  },
  {
    title: "优先级",
    dataIndex: "priority",
    key: "priority",
    width: 90,
    render: (priority: DispatchPriority) => {
      const m = PRIORITY_MAP[priority] || { label: priority, color: "default" };
      return <Tag color={m.color}>{m.label}</Tag>;
    },
  },
  {
    title: "截止日期",
    dataIndex: "dueDate",
    key: "dueDate",
    width: 130,
    render: (v?: string) => formatTime(v),
  },
];

export default function BriefsDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<BriefItem | null>(null);
  const [acting, setActing] = useState<"confirm" | "cancel" | "redispatch" | null>(null);
  const [polling, setPolling] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    clearPolling();
    setLoading(true);
    try {
      setBrief(await getBrief(Number(id)));
    } catch {
      // 接口失败降级：按不存在展示，不抛异常
      setBrief(null);
    } finally {
      setLoading(false);
    }
  }, [id, clearPolling]);

  useEffect(() => { void load(); }, [load]);

  // 卸载时清理轮询定时器
  useEffect(() => () => clearPolling(), [clearPolling]);

  // 确认后轮询拆解状态：3s 一次，最多 6 次，直到非 pending
  const startPolling = useCallback((briefId: number) => {
    setPolling(true);
    let attempts = 0;
    pollTimerRef.current = window.setInterval(async () => {
      attempts += 1;
      try {
        const latest = await getBrief(briefId);
        setBrief(latest);
        if (latest.dispatchStatus !== "pending" || attempts >= POLL_MAX_ATTEMPTS) {
          clearPolling();
          if (latest.dispatchStatus === "pending" && attempts >= POLL_MAX_ATTEMPTS) {
            message.info("AI 拆解仍在进行中，可稍后点击刷新查看结果");
          }
        }
      } catch {
        // 单次轮询失败不抛异常，继续下一轮；到次数后停止
        if (attempts >= POLL_MAX_ATTEMPTS) {
          clearPolling();
        }
      }
    }, POLL_INTERVAL_MS);
  }, [clearPolling]);

  const handleConfirm = async (b: BriefItem) => {
    setActing("confirm");
    try {
      const confirmed = await confirmBrief(b.id);
      setBrief(confirmed);
      message.success("需求单已确认，开始 AI 拆解");
      if (confirmed.dispatchStatus === "pending") {
        startPolling(b.id);
      }
    } catch (err) {
      message.error("确认失败: " + (err as Error).message);
    } finally {
      setActing(null);
    }
  };

  const handleRedispatch = async (b: BriefItem) => {
    setActing("redispatch");
    try {
      const redone = await redispatchBrief(b.id);
      setBrief(redone);
      message.success("已重新拆解，请稍候查看结果");
      if (redone.dispatchStatus === "pending") {
        startPolling(b.id);
      }
    } catch (err) {
      message.error("重新拆解失败: " + (err as Error).message);
    } finally {
      setActing(null);
    }
  };

  const handleCancel = async (b: BriefItem) => {
    setActing("cancel");
    try {
      const cancelled = await cancelBrief(b.id);
      setBrief(cancelled);
      message.success("需求单已取消");
      clearPolling();
    } catch (err) {
      message.error("取消失败: " + (err as Error).message);
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer} style={{ textAlign: "center", paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!brief) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <div className={styles.pageTitle}>
            <span className={styles.pageTitleIcon}><FileTextOutlined /></span>
            <span>需求单详情</span>
          </div>
          <div className={styles.headerActions}>
            <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          </div>
        </div>
        <Empty description="需求单不存在" style={{ marginTop: 80 }}>
          <Button type="primary" className={styles.primaryBtn} onClick={() => navigate("/briefs")}>
            返回需求单列表
          </Button>
        </Empty>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[brief.status] || { label: brief.status, color: "default" };
  const dispatchStatus = brief.dispatchStatus || "none";
  const dispatchInfo = DISPATCH_STATUS_MAP[dispatchStatus] || { label: dispatchStatus, color: "default" };
  // 仅草稿可确认；已完成/已取消不可再取消
  const canConfirm = brief.status === "draft";
  const canCancel = brief.status !== "completed" && brief.status !== "cancelled";

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><FileTextOutlined /></span>
          <span className={styles.pageTitleText}>{brief.title}</span>
          <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
        </div>
      </div>

      <Card className={styles.detailCard} bordered={false}>
        <Descriptions bordered size="middle" column={1} labelStyle={{ width: 120 }}>
          <Descriptions.Item label="标题">{brief.title}</Descriptions.Item>
          <Descriptions.Item label="目标">{brief.goal || "-"}</Descriptions.Item>
          <Descriptions.Item label="目标受众">{brief.targetAudience || "-"}</Descriptions.Item>
          <Descriptions.Item label="平台">
            {brief.platforms && brief.platforms.length > 0 ? (
              <span>
                {brief.platforms.map((p) => (
                  <Tag key={p} color="blue">{PLATFORM_LABELS[p] || p}</Tag>
                ))}
              </span>
            ) : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="风格">{brief.style || "-"}</Descriptions.Item>
          <Descriptions.Item label="期限">{formatTime(brief.deadline)}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={statusInfo.color}>{statusInfo.label}</Tag></Descriptions.Item>
          <Descriptions.Item label="拆解状态"><Tag color={dispatchInfo.color}>{dispatchInfo.label}</Tag></Descriptions.Item>
          <Descriptions.Item label="来源会话">
            {brief.sourceChatSessionId ? `会话 #${brief.sourceChatSessionId}` : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="来源摘要">{brief.sourceChatSummary || "-"}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatTime(brief.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatTime(brief.updatedAt)}</Descriptions.Item>
        </Descriptions>

        {dispatchStatus === "pending" && (
          <div className={styles.dispatchPending}>
            <Spin size="large" />
            <span className={styles.dispatchPendingText}>
              {polling ? "AI 拆解中…" : "AI 拆解中…（可点击刷新查看最新状态）"}
            </span>
          </div>
        )}

        {dispatchStatus === "failed" && (
          <Alert
            style={{ marginTop: 16 }}
            type="error"
            showIcon
            message="AI 拆解失败"
            description={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span>
                  {DISPATCH_ERROR_MAP[brief.dispatchError || ""] || "拆解失败，可点击下方按钮重新尝试"}
                  {brief.dispatchError ? `（${brief.dispatchError}）` : ""}
                </span>
                <Button
                  type="primary"
                  danger
                  icon={<ReloadOutlined />}
                  loading={acting === "redispatch"}
                  onClick={() => handleRedispatch(brief)}
                >
                  重新拆解
                </Button>
              </div>
            }
          />
        )}

        {dispatchStatus === "done" && (
          <div className={styles.dispatchSection}>
            <div className={styles.dispatchTitle}>AI 拆解结果</div>
            {brief.dispatchResult && brief.dispatchResult.length > 0 ? (
              <Table<DispatchTaskItem>
                rowKey={(row, index) => `${row.roleTitle}-${row.taskTitle}-${index ?? 0}`}
                columns={dispatchColumns}
                dataSource={brief.dispatchResult}
                size="small"
                bordered
                pagination={false}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无拆解任务" />
            )}
          </div>
        )}

        <div className={styles.actionsRow}>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<CheckOutlined />}
            loading={acting === "confirm"}
            disabled={!canConfirm}
            onClick={() => handleConfirm(brief)}
          >
            确认需求单
          </Button>
          <Button
            icon={<CloseOutlined />}
            loading={acting === "cancel"}
            disabled={!canCancel}
            onClick={() => handleCancel(brief)}
          >
            取消
          </Button>
        </div>
      </Card>
    </div>
  );
}