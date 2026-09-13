/**
 * 官署详情 · 定时任务 Tab
 *
 * 展示/管理归属该官署（agentId）的定时任务：
 *  - 支持「执行方式」：AI 编排（llm）/ 业务流直跑（flow）
 *  - 暂停/恢复、手动触发一次、删除
 *  - 数据源：src/api/scheduled-task-api（后端 /scheduled-tasks）
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Empty, message, Popconfirm, Space, Spin, Table, Tag, Tooltip } from "antd";
import {
  deleteScheduledTask,
  listScheduledTasks,
  updateScheduledTask,
  type ScheduledTask,
} from "@/api/scheduled-task-api";
import { runScheduledTaskNow } from "@/scheduler/scheduled-runner";
import { useAuthStore } from "@/store/auth";

const REPEAT_LABEL: Record<string, string> = { once: "一次性", daily: "每天", weekly: "每周" };
const STATUS_META: Record<string, { color: string; label: string }> = {
  active: { color: "green", label: "启用中" },
  paused: { color: "default", label: "已暂停" },
  done: { color: "blue", label: "已完成" },
  failed: { color: "red", label: "失败" },
};
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function repeatText(t: ScheduledTask): string {
  const base = REPEAT_LABEL[t.repeatType] ?? t.repeatType;
  if (t.repeatType === "once") return `${base} ${t.dueAt ? new Date(t.dueAt).toLocaleString() : ""}`;
  if (t.repeatType === "weekly") return `${base} ${WEEKDAYS[(t.weekday ?? 1) - 1] ?? ""} ${t.runTime ?? ""}`;
  return `${base} ${t.runTime ?? ""}`;
}

export default function OfficialScheduledTab({ agentId }: { agentId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ScheduledTask[]>([]);
  const [firingId, setFiringId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!agentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await listScheduledTasks(agentId);
      setRows(items ?? []);
    } catch (err) {
      // 未登录/网络异常时静默降级为空列表
      console.warn("[OfficialScheduledTab] 加载失败:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = useCallback(
    async (t: ScheduledTask) => {
      try {
        await updateScheduledTask(t.id, { status: t.status === "active" ? "paused" : "active" });
        message.success(t.status === "active" ? "已暂停" : "已恢复");
        await load();
      } catch (err) {
        message.error(err instanceof Error ? err.message : String(err));
      }
    },
    [load],
  );

  const onFire = useCallback(
    async (t: ScheduledTask) => {
      const token = useAuthStore.getState().accessToken;
      if (!token) {
        message.warning("请先登录后再手动触发");
        return;
      }
      setFiringId(t.id);
      try {
        const r = await runScheduledTaskNow(token, t);
        if (r.error) message.error("执行失败：" + r.error);
        else if (r.executed) message.success("已触发执行，结果可在执行日志查看");
        else message.warning(r.error || "未能触发（可能正在触发中）");
        await load();
      } catch (err) {
        message.error(err instanceof Error ? err.message : String(err));
      } finally {
        setFiringId(null);
      }
    },
    [load],
  );

  const onRemove = useCallback(
    async (t: ScheduledTask) => {
      try {
        await deleteScheduledTask(t.id);
        message.success("已删除");
        await load();
      } catch (err) {
        message.error(err instanceof Error ? err.message : String(err));
      }
    },
    [load],
  );

  if (!agentId) {
    return <Empty description="请指定官署" />;
  }

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Alert
          type="info"
          showIcon
          message={`该官署的定时任务（${rows.length}）`}
          description="执行方式为「业务流」时到点直跑业务流引擎（确定、快），为「AI 编排」时交给深瞳机器人逐步编排。新建定时任务走对话入口。"
        />

        {rows.length === 0 && !loading ? (
          <Empty description="该官署暂无定时任务（可在对话中说「每天 9 点…」自动创建）" />
        ) : (
          <Table<ScheduledTask>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={rows}
            columns={[
              {
                title: "任务",
                dataIndex: "title",
                render: (title: string, r) => (
                  <div>
                    <div style={{ fontWeight: 600 }}>{title}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      {repeatText(r)}
                      {r.lastRunAt ? ` · 上次 ${new Date(r.lastRunAt).toLocaleString()}` : ""}
                    </div>
                    {r.lastError && (
                      <div style={{ fontSize: 11, color: "var(--color-error)" }}>错误：{r.lastError}</div>
                    )}
                  </div>
                ),
              },
              {
                title: "执行方式",
                dataIndex: "executeKind",
                width: 110,
                render: (k: string | null | undefined, r) =>
                  (k ?? "llm") === "flow" ? (
                    <Tooltip title={r.flowId ? `业务流：${r.flowId}` : "未指定业务流"}>
                      <Tag color="purple">业务流</Tag>
                    </Tooltip>
                  ) : (
                    <Tag color="geekblue">AI 编排</Tag>
                  ),
              },
              {
                title: "状态",
                dataIndex: "status",
                width: 84,
                render: (s: string) => {
                  const m = STATUS_META[s] ?? { color: "default", label: s };
                  return <Tag color={m.color}>{m.label}</Tag>;
                },
              },
              {
                title: "操作",
                width: 190,
                render: (_v, r) => (
                  <Space size={4}>
                    <Button size="small" type="link" onClick={() => void onToggle(r)}>
                      {r.status === "active" ? "暂停" : "恢复"}
                    </Button>
                    <Button
                      size="small"
                      type="link"
                      loading={firingId === r.id}
                      onClick={() => void onFire(r)}
                    >
                      立即执行
                    </Button>
                    <Popconfirm title="确认删除该定时任务？" onConfirm={() => void onRemove(r)}>
                      <Button size="small" type="link" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </div>
    </Spin>
  );
}
