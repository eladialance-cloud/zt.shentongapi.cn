// 团队看板视图 — Kimi 风格（v2.0）
// 4 列: 待办 / 进行中 / 已完成 / 失败

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Spin, Tag, Tooltip, message } from "antd";
import { ArrowLeft, Clock, LayoutGrid, UserRound } from "lucide-react";
import * as teamApi from "@/api/team-api";
import type { Team, TeamTask, TeamTaskStatus, TeamTaskPriority } from "@/types/team";
import styles from "./styles.module.css";

function taskPriorityLabel(p: TeamTaskPriority): string {
  switch (p) {
    case "low": return "低";
    case "medium": return "中";
    case "high": return "高";
    case "urgent": return "紧急";
    default: return p;
  }
}

function taskPriorityClass(p: TeamTaskPriority): string {
  switch (p) {
    case "low": return styles.priorityLow;
    case "medium": return styles.priorityMedium;
    case "high": return styles.priorityHigh;
    case "urgent": return styles.priorityUrgent;
    default: return "";
  }
}

function dueDateInfo(dueDate?: string): { text: string; className: string } {
  if (!dueDate) return { text: "无截止", className: "" };
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return { text: String(dueDate), className: "" };
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (60 * 60 * 1000);
  const formatted = due.toLocaleDateString("zh-CN", { hour12: false });
  if (diffMs < 0) return { text: `已逾期 · ${formatted}`, className: styles.dueOverdue };
  if (diffHours <= 24) return { text: `即将到期 · ${formatted}`, className: styles.dueSoon };
  return { text: formatted, className: "" };
}

const COLUMN_DEFS: Array<{
  status: TeamTaskStatus;
  title: string;
  className: string;
  nextStatus?: TeamTaskStatus;
  prevStatus?: TeamTaskStatus;
}> = [
  { status: "pending", title: "待办", className: styles.columnTodo, nextStatus: "in_progress" },
  { status: "in_progress", title: "进行中", className: styles.columnInProgress, nextStatus: "completed", prevStatus: "pending" },
  { status: "completed", title: "已完成", className: styles.columnCompleted, prevStatus: "in_progress" },
  { status: "failed", title: "失败", className: styles.columnFailed, prevStatus: "in_progress" },
];

function statusLabel(s: TeamTaskStatus): string {
  switch (s) {
    case "pending": return "待办";
    case "in_progress": return "进行中";
    case "completed": return "已完成";
    case "failed": return "失败";
    default: return s;
  }
}

export default function TeamBoard() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const teamId = id ? Number(id) : NaN;

  const [team, setTeam] = useState<Team | null>(null);
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<Record<number, boolean>>({});

  const loadData = useCallback(async () => {
    if (!Number.isFinite(teamId)) return;
    setLoading(true);
    try {
      const [detail, taskResult] = await Promise.all([
        teamApi.getTeamDetail(teamId),
        teamApi.listTasks(teamId, { pageSize: 200 }),
      ]);
      setTeam(detail.team);
      setTasks(taskResult.list || []);
    } catch (err) {
      console.error("[TeamBoard] load failed:", err);
      message.error("加载看板数据失败");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TeamTaskStatus, TeamTask[]> = {
      pending: [], in_progress: [], completed: [], failed: [],
    };
    tasks.forEach((t) => {
      if (map[t.status]) map[t.status].push(t);
    });
    return map;
  }, [tasks]);

  const handleMoveTask = async (task: TeamTask, target: TeamTaskStatus) => {
    if (task.status === target) return;
    setUpdating((prev) => ({ ...prev, [task.id]: true }));
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: target } : t)));
    try {
      await teamApi.updateTask(teamId, task.id, { status: target });
      message.success(`任务 "${task.title}" 已移动到 ${statusLabel(target)}`);
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      console.error("[TeamBoard] move task failed:", err);
      message.error("移动任务失败: " + (err as Error).message);
    } finally {
      setUpdating((prev) => ({ ...prev, [task.id]: false }));
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <LayoutGrid size={18} />
          </span>
          <span>{team ? `${team.name} - 看板` : "团队看板"}</span>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.ghostBtn} icon={<ArrowLeft size={14} />}
            onClick={() => navigate(`/team/${teamId}`)}>
            返回详情
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        <div className={styles.boardContainer}>
          {COLUMN_DEFS.map((col) => {
            const columnTasks = tasksByStatus[col.status] || [];
            return (
              <div key={col.status} className={`${styles.boardColumn} ${col.className}`}>
                <div className={styles.columnHeader}>
                  <div className={styles.columnTitle}>{col.title}</div>
                  <span className={styles.columnCount}>{columnTasks.length}</span>
                </div>
                {columnTasks.length === 0 && (
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
                    暂无任务
                  </div>
                )}
                {columnTasks.map((task) => {
                  const due = dueDateInfo(task.dueDate);
                  return (
                    <div key={task.id} className={styles.taskCard}>
                      <div className={styles.taskTitle}>{task.title}</div>
                      <div className={styles.taskMeta}>
                        <span className={styles.taskAssignee}>
                          <UserRound size={12} />
                          {task.assigneeName || "未分配"}
                        </span>
                        {task.dueDate && (
                          <span className={due.className}>
                            <Clock size={11} style={{ marginRight: 2, verticalAlign: -1 }} />
                            {due.text}
                          </span>
                        )}
                      </div>
                      <div className={styles.taskFooter}>
                        <Tag className={taskPriorityClass(task.priority)}>
                          {taskPriorityLabel(task.priority)}
                        </Tag>
                      </div>
                      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                        {col.prevStatus && (
                          <Tooltip title={`移动到"${statusLabel(col.prevStatus)}"`}>
                            <Button size="small" className={styles.taskMoveBtn}
                              disabled={!!updating[task.id]}
                              onClick={() => handleMoveTask(task, col.prevStatus!)}>
                              ← {statusLabel(col.prevStatus)}
                            </Button>
                          </Tooltip>
                        )}
                        {col.nextStatus && (
                          <Tooltip title={`移动到"${statusLabel(col.nextStatus)}"`}>
                            <Button size="small" className={styles.taskMoveBtn}
                              disabled={!!updating[task.id]}
                              onClick={() => handleMoveTask(task, col.nextStatus!)}>
                              {statusLabel(col.nextStatus)} →
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Spin>
    </div>
  );
}
