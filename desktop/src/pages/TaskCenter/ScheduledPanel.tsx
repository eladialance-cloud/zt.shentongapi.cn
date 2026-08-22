// 定时任务面板 — 任务中心顶部：查看/暂停/删除定时任务（创建走对话，执行由调度器触发）
import { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Space, Spin, Tag, Tooltip, message } from "antd";
import {
  ClockCircleOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import {
  deleteScheduledTask,
  listScheduledTasks,
  updateScheduledTask,
  type ScheduledTask,
} from "@/api/scheduled-task-api";
import styles from "./styles.module.css";

const REPEAT_LABEL: Record<string, string> = {
  once: "一次性",
  daily: "每天",
  weekly: "每周",
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: "启用中", color: "green" },
  paused: { label: "已暂停", color: "default" },
  done: { label: "已完成", color: "blue" },
  failed: { label: "失败", color: "red" },
};

function fmt(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function ScheduledPanel() {
  const [items, setItems] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listScheduledTasks());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const toggle = async (t: ScheduledTask) => {
    try {
      await updateScheduledTask(t.id, { status: t.status === "active" ? "paused" : "active" });
      message.success(t.status === "active" ? "已暂停，到期不会触发" : "已恢复执行");
      void load();
    } catch (err) {
      message.error("操作失败：" + ((err as Error).message || String(err)));
    }
  };

  const remove = async (t: ScheduledTask) => {
    try {
      await deleteScheduledTask(t.id);
      message.success("定时任务已删除");
      void load();
    } catch (err) {
      message.error("删除失败：" + ((err as Error).message || String(err)));
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className={styles.scheduledPanel}>
        <Spin size="small" /> 加载定时任务…
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className={styles.scheduledPanel}>
      <div className={styles.scheduledPanelHeader}>
        <ScheduleOutlined style={{ color: "var(--color-brand)" }} />
        <span>定时任务（软件打开时执行，到点自动经 Hermes 编排）</span>
      </div>
      <Space direction="vertical" style={{ width: "100%" }} size={8}>
        {items.map((t) => {
          const meta = STATUS_META[t.status] ?? STATUS_META.active;
          return (
            <div key={t.id} className={styles.scheduledItem}>
              <div className={styles.scheduledItemMain}>
                <span className={styles.scheduledItemTitle}>{t.title}</span>
                <span className={styles.scheduledItemMeta}>
                  <Tag>{REPEAT_LABEL[t.repeatType] ?? t.repeatType}</Tag>
                  {t.repeatType !== "once" && t.runTime && <span>{t.runTime}</span>}
                  {t.repeatType === "weekly" && t.weekday != null && <span>周{t.weekday}</span>}
                  <Tag color={meta.color}>{meta.label}</Tag>
                </span>
              </div>
              <div className={styles.scheduledItemTime}>
                <Tooltip title={t.lastError ? "上次失败：" + t.lastError : undefined}>
                  <ClockCircleOutlined /> 下次：{fmt(t.nextRunAt)}
                  {t.lastRunAt ? <span className={styles.scheduledLastRun}>上次：{fmt(t.lastRunAt)}</span> : null}
                </Tooltip>
              </div>
              <div className={styles.scheduledItemOps}>
                <Tooltip title={t.status === "active" ? "暂停" : "恢复"}>
                  <Button
                    size="small"
                    type="text"
                    icon={t.status === "active" ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    onClick={() => void toggle(t)}
                  />
                </Tooltip>
                <Popconfirm
                  title="删除定时任务？"
                  description="删除后不再触发"
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => void remove(t)}
                >
                  <Tooltip title="删除">
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </div>
            </div>
          );
        })}
      </Space>
    </div>
  );
}
