// 定时任务面板 — 任务中心顶部：查看/暂停/删除定时任务（创建走对话，执行由调度器触发）
import { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Space, Spin, Switch, Tag, Tooltip, message } from "antd";
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
import type { CronServiceStatus } from "@shared/types";
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
  // 无人值守后台常驻引擎（主进程）：关窗口/最小化到托盘后仍按到期执行
  const [bgEnabled, setBgEnabled] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  // 守护服务（Windows 计划任务）：客户端完全退出也执行
  const [svc, setSvc] = useState<CronServiceStatus | null>(null);
  const [svcBusy, setSvcBusy] = useState(false);

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

  // 读取后台常驻引擎状态（旧版本无此 API 时静默跳过）
  useEffect(() => {
    const api = window.electronAPI?.cronEngine;
    if (!api) return;
    void api
      .getState()
      .then((s) => setBgEnabled(!!s?.enabled))
      .catch(() => undefined);
  }, []);

  // 读取守护服务状态（Windows 计划任务）
  useEffect(() => {
    const api = window.electronAPI?.cronService;
    if (!api) return;
    void api
      .status()
      .then((s) => setSvc(s))
      .catch(() => undefined);
  }, []);

  const toggleDaemon = async (next: boolean) => {
    const api = window.electronAPI?.cronService;
    if (!api) return;
    setSvcBusy(true);
    try {
      const r = next ? await api.install() : await api.uninstall();
      if (!r.ok) {
        message.error("操作失败：" + (r.error || "未知错误"));
        return;
      }
      setSvc(r.status ?? null);
      message.success(next ? "已开启守护服务：关闭客户端后定时任务仍继续执行" : "已关闭守护服务");
    } catch (err) {
      message.error("操作失败：" + ((err as Error).message || String(err)));
    } finally {
      setSvcBusy(false);
    }
  };

  const toggleBackground = async (next: boolean) => {
    const api = window.electronAPI?.cronEngine;
    if (!api) return;
    setBgBusy(true);
    try {
      const s = await api.setEnabled(next);
      setBgEnabled(!!s?.enabled);
      message.success(next ? "已开启后台常驻：关窗口后定时任务继续执行" : "已关闭后台常驻：仅在软件打开时执行");
    } catch (err) {
      message.error("操作失败：" + ((err as Error).message || String(err)));
    } finally {
      setBgBusy(false);
    }
  };

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
        <span>定时任务</span>
        <Tooltip title="开启后由主进程常驻执行，关闭客户端窗口（最小化到托盘）仍会到点触发；关闭则仅在软件打开时执行">
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ color: "var(--color-text-secondary)" }}>后台常驻</span>
            <Switch
              size="small"
              checked={bgEnabled}
              loading={bgBusy}
              onChange={(v) => void toggleBackground(v)}
            />
          </span>
        </Tooltip>
      </div>
      <Space direction="vertical" style={{ width: "100%" }} size={8}>
        {svc?.supported ? (
          <div className={styles.scheduledItem}>
            <div className={styles.scheduledItemMain}>
              <span className={styles.scheduledItemTitle}>守护服务（关闭客户端也执行）</span>
              <span className={styles.scheduledItemMeta}>
                <Tag color={svc.installed ? "green" : "default"}>
                  {svc.installed ? (svc.running ? "已安装·运行中" : "已安装") : "未安装"}
                </Tag>
                <span style={{ color: "var(--color-text-secondary)" }}>
                  注册 Windows 计划任务，登录后自动拉起独立定时进程；客户端完全退出也不中断
                </span>
              </span>
            </div>
            <div className={styles.scheduledItemOps}>
              <Switch size="small" checked={!!svc.installed} loading={svcBusy} onChange={(v) => void toggleDaemon(v)} />
            </div>
          </div>
        ) : null}
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
                  <Tag color={t.executeKind === "flow" ? "geekblue" : "purple"}>
                    {t.executeKind === "flow" ? `业务流：${t.flowId ?? "未指定"}` : "机器人编排"}
                  </Tag>
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
