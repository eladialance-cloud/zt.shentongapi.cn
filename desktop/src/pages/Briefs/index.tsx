// 需求单列表页（二期：云端数据源；三期：合并本地待同步需求单）
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, Card, Descriptions, Empty, Modal, Space, Spin, Table, Tag, Typography, message,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  CheckOutlined, CloseOutlined, EyeOutlined, FileTextOutlined, PlusOutlined, ReloadOutlined,
} from "@ant-design/icons";
import { cancelBrief, confirmBrief, listBriefs } from "@/api/brief-api";
import type { BriefItem, BriefStatus, DispatchStatus } from "@/api/brief-api";
import { listLocalBriefs } from "@/api/local-brief-api";
import type { LocalBrief } from "@shared/types";
import styles from "./styles.module.css";

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

const PAGE_SIZE = 10;

/** 列表行：云端需求单 + 本地待同步需求单（localPending=true） */
interface BriefRow extends BriefItem {
  rowKey: string;
  localPending?: boolean;
  local?: LocalBrief;
}

function formatTime(v?: string | null): string {
  if (!v) return "-";
  // 纯日期（YYYY-MM-DD）直接展示，避免时区偏移
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function BriefsList() {
  const navigate = useNavigate();
  const [briefs, setBriefs] = useState<BriefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [acting, setActing] = useState<{ id: number; kind: "confirm" | "cancel" } | null>(null);
  const [viewLocal, setViewLocal] = useState<LocalBrief | null>(null);

  const load = useCallback(async (targetPage = 1) => {
    setLoading(true);
    try {
      const [res, localRows] = await Promise.all([
        listBriefs({ page: targetPage, pageSize: PAGE_SIZE }),
        listLocalBriefs(),
      ]);
      // 仅合并「本地待同步」（cloud_synced=0）的本地需求单，已同步的由云端列表承载，避免重复
      const pendingLocal = (localRows || []).filter((b) => !b.cloudSynced);
      const merged: BriefRow[] = [
        ...pendingLocal.map((b) => ({
          rowKey: `local-${b.clientBriefId}`,
          localPending: true,
          local: b,
          id: -Math.abs(b.id),
          userId: b.userId,
          title: b.title,
          goal: b.goal ?? null,
          targetAudience: b.targetAudience ?? null,
          platforms: b.platforms ?? null,
          style: b.style ?? null,
          deadline: b.deadline ?? null,
          status: b.status,
          dispatchStatus: "none" as DispatchStatus,
          dispatchResult: null,
          sourceChatSessionId: b.sourceChatSessionId ?? null,
          sourceChatSummary: b.sourceChatSummary ?? null,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        })),
        ...res.list.map((b) => ({ ...b, rowKey: String(b.id) })),
      ];
      setBriefs(merged);
      setTotal(res.total);
      setPage(targetPage);
    } catch {
      // 接口失败降级：空列表 + 不抛异常
      setBriefs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(1); }, [load]);

  const onConfirm = async (record: BriefRow) => {
    if (record.localPending) return;
    setActing({ id: record.id, kind: "confirm" });
    try {
      await confirmBrief(record.id);
      message.success("需求单已确认");
      void load(page);
    } catch (err) {
      message.error("确认失败: " + (err as Error).message);
    } finally {
      setActing(null);
    }
  };

  const onCancel = async (record: BriefRow) => {
    if (record.localPending) return;
    setActing({ id: record.id, kind: "cancel" });
    try {
      await cancelBrief(record.id);
      message.success("需求单已取消");
      void load(page);
    } catch (err) {
      message.error("取消失败: " + (err as Error).message);
    } finally {
      setActing(null);
    }
  };

  const columns: TableColumnsType<BriefRow> = [
    {
      title: "标题",
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      render: (title: string, record) => (
        record.localPending ? (
          <Typography.Text strong style={{ color: "rgba(255,140,0,0.9)" }}>{title}</Typography.Text>
        ) : (
          <Typography.Link onClick={() => navigate(`/briefs/${record.id}`)}>
            {title}
          </Typography.Link>
        )
      ),
    },
    {
      title: "目标受众",
      dataIndex: "targetAudience",
      key: "targetAudience",
      width: 150,
      ellipsis: true,
      render: (v?: string) => v || "-",
    },
    {
      title: "平台",
      dataIndex: "platforms",
      key: "platforms",
      width: 190,
      render: (platforms?: string[]) => {
        if (!platforms || platforms.length === 0) return "-";
        return (
          <Space size={4} wrap>
            {platforms.map((p) => (
              <Tag key={p} color="blue">{PLATFORM_LABELS[p] || p}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (status: BriefStatus) => {
        const s = STATUS_MAP[status] || { label: status, color: "default" };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "拆解状态",
      dataIndex: "dispatchStatus",
      key: "dispatchStatus",
      width: 110,
      render: (dispatchStatus: DispatchStatus, record) =>
        record.localPending ? (
          <Tag color="orange">待同步</Tag>
        ) : (
          <Tag color={(DISPATCH_STATUS_MAP[dispatchStatus || "none"] || {}).color || "default"}>
            {(DISPATCH_STATUS_MAP[dispatchStatus || "none"] || { label: dispatchStatus }).label}
          </Tag>
        ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v: string) => formatTime(v),
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => (record.localPending ? setViewLocal(record.local ?? null) : navigate(`/briefs/${record.id}`))}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            disabled={record.localPending || record.status !== "draft"}
            loading={acting?.id === record.id && acting.kind === "confirm"}
            onClick={() => onConfirm(record)}
          >
            确认
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CloseOutlined />}
            disabled={record.localPending || record.status === "completed" || record.status === "cancelled"}
            loading={acting?.id === record.id && acting.kind === "cancel"}
            onClick={() => onCancel(record)}
          >
            取消
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><FileTextOutlined /></span>
          <span>需求单</span>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ReloadOutlined />} onClick={() => void load(page)}>刷新</Button>
          <Button type="primary" className={styles.primaryBtn} icon={<PlusOutlined />} onClick={() => navigate("/briefs/new")}>
            新建需求
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {briefs.length === 0 && !loading ? (
          <Card className={styles.tableCard} bordered={false}>
            <Empty
              style={{ margin: "48px 0" }}
              description="暂无需求单，去对话里聊出想法"
            >
              <Button type="primary" className={styles.primaryBtn} icon={<PlusOutlined />} onClick={() => navigate("/briefs/new")}>
                新建需求
              </Button>
            </Empty>
          </Card>
        ) : (
          <Card className={styles.tableCard} bordered={false}>
            <Table<BriefRow>
              rowKey="rowKey"
              columns={columns}
              dataSource={briefs}
              pagination={{
                current: page,
                total,
                pageSize: PAGE_SIZE,
                showSizeChanger: false,
                onChange: (nextPage) => void load(nextPage),
              }}
            />
          </Card>
        )}
      </Spin>

      <Modal
        open={!!viewLocal}
        title="本地需求单（待同步）"
        footer={<Button onClick={() => setViewLocal(null)}>关闭</Button>}
        onCancel={() => setViewLocal(null)}
      >
        {viewLocal && (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="标题">{viewLocal.title}</Descriptions.Item>
              <Descriptions.Item label="目标">{viewLocal.goal || "-"}</Descriptions.Item>
              <Descriptions.Item label="目标受众">{viewLocal.targetAudience || "-"}</Descriptions.Item>
              <Descriptions.Item label="平台">
                {viewLocal.platforms?.length
                  ? viewLocal.platforms.map((p) => PLATFORM_LABELS[p] || p).join("、")
                  : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="风格">{viewLocal.style || "-"}</Descriptions.Item>
              <Descriptions.Item label="期限">{viewLocal.deadline ? formatTime(viewLocal.deadline) : "-"}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatTime(viewLocal.createdAt)}</Descriptions.Item>
            </Descriptions>
            <div className={styles.hintText} style={{ marginTop: 12 }}>
              该需求单已保存在本地，联网后会自动同步到云端，届时可确认并触发 AI 拆解派活。
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
