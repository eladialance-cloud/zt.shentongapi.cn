// 统一任务中心 v2 —— 工作台式双栏：左侧任务卡片列表 + 右侧执行详情
// 团队任务：需求档案确认后自动开始（Hermes 逐步编排），进入页面轮询自动补新任务与节点进度
// 我的任务 / Hermes 源：统一接口合并展示，动作仍走旧路径
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Input, Select, Spin, Switch } from "antd";
import {
  ApartmentOutlined,
  ClockCircleOutlined,
  DownOutlined,
  ReloadOutlined,
  RightOutlined,
  RobotOutlined,
  SearchOutlined,
  ThunderboltFilled,
  UserOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import * as teamApi from "@/api/team-api";
import * as taskApi from "@/api/task-api";
import type { UnifiedTaskItem } from "@/api/task-api";
import type { TeamTask } from "@/types/team";
import {
  mapHermesStatus,
  mapTaskStatus,
  mapTeamStatus,
  groupTasksByBatch,
  sortByCreatedAtDesc,
  SOURCE_TAG_META,
  STATUS_TAG_META,
} from "./unified";
import type { TaskGroup, UnifiedTask, UnifiedTaskSource, UnifiedTaskStatus } from "./unified";
import { countRunning, nativeTaskId, shouldAutoStart, submitStepRunner } from "./task-runner";
import PipelineView from "./PipelineView";
import ScheduledPanel from "./ScheduledPanel";
import styles from "./styles.module.css";

/** 时间格式化（与 Channels 页一致） */
function formatTime(v: unknown): string {
  if (!v) return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 相对时间（列表卡片用）：刚刚 / x 分钟前 / x 小时前 / 日期 */
function formatRelative(v: unknown): string {
  if (!v) return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return min + " 分钟前";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + " 小时前";
  return d.toLocaleDateString("zh-CN");
}

const STATUS_FILTER_OPTIONS: { value: UnifiedTaskStatus | "all"; label: string }[] = [
  { value: "all", label: "全部状态" },
  { value: "todo", label: "待执行" },
  { value: "running", label: "执行中" },
  { value: "done", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "cancelled", label: "已取消" },
];

const SOURCE_FILTER_OPTIONS: { value: UnifiedTaskSource | "all"; label: string }[] = [
  { value: "all", label: "全部来源" },
  { value: "team", label: "团队" },
  { value: "task", label: "任务" },
  { value: "hermes", label: "Hermes" },
];

/** 后台静默刷新间隔：需求单确认后 AI 拆解为异步派发，进入页面后自动轮询补全新任务 */
const TASK_CENTER_REFRESH_MS = 10_000;

/** 卡片状态胶囊 class（styles 模块映射） */
const PILL_CLS: Record<UnifiedTaskStatus, string> = {
  todo: "pillTodo",
  running: "pillRunning",
  done: "pillDone",
  failed: "pillFailed",
  cancelled: "pillTodo",
};

interface TeamContext {
  teamIdByKey: Map<string, number>;
  /** key(team:id) → 完整团队任务（含 result.steps 供逐步执行渲染） */
  teamTaskByKey: Map<string, TeamTask>;
}

/** 拉取全部团队的完整任务（含 result），构建 teamId 与详情映射 */
async function loadTeamContext(): Promise<TeamContext> {
  const teamIdByKey = new Map<string, number>();
  const teamTaskByKey = new Map<string, TeamTask>();
  try {
    const teams = await teamApi.listTeams();
    await Promise.all(
      teams.map(async (team) => {
        try {
          const taskRes = await teamApi.listTasks(team.id, { pageSize: 50 });
          for (const t of taskRes.list) {
            const key = "team:" + t.id;
            teamIdByKey.set(key, team.id);
            teamTaskByKey.set(key, t);
          }
        } catch (err) {
          console.warn("[TaskCenter] 加载团队 " + team.id + " 任务失败:", err);
        }
      })
    );
  } catch (err) {
    console.warn("[TaskCenter] 加载团队列表失败:", err);
  }
  return { teamIdByKey, teamTaskByKey };
}

/** 我的任务源：task-api.listTasks(pageSize 50) */
async function loadMyTaskSource(): Promise<UnifiedTask[]> {
  try {
    const res = await taskApi.listTasks({ pageSize: 50 });
    return res.list.map((t) => ({
      key: "task:" + t.id,
      source: "task",
      title: t.title || t.taskType,
      status: mapTaskStatus(t.status),
      rawStatus: t.status,
      createdAt: t.createdAt,
      finishedAt: t.finishedAt ?? null,
    }));
  } catch (err) {
    console.warn("[TaskCenter] 加载我的任务失败:", err);
    return [];
  }
}

/** Hermes 源：hermes-api 实例列表 */
async function loadHermesSource(): Promise<UnifiedTask[]> {
  try {
    const instances = await (await import("@/api/hermes-api")).listInstances();
    return (instances ?? []).map((inst) => {
      const loose = inst as unknown as Record<string, unknown>;
      return {
        key: "hermes:" + String(inst.id ?? loose.instanceId ?? "?"),
        source: "hermes",
        title: String(loose.taskDesc ?? loose.task ?? inst.name ?? "Hermes 调用"),
        status: mapHermesStatus(String(inst.status ?? "pending")),
        rawStatus: String(inst.status ?? "pending"),
        createdAt: String(inst.createdAt ?? loose.startedAt ?? new Date().toISOString()),
      };
    });
  } catch (err) {
    console.warn("[TaskCenter] 加载 Hermes 实例列表失败:", err);
    return [];
  }
}

/** 三源并发拉取（统一接口不可用时的降级路径） */
async function loadAll(): Promise<{
  tasks: UnifiedTask[];
  teamIdByKey: Map<string, number>;
  teamTaskByKey: Map<string, TeamTask>;
}> {
  const [teamResult, myTasks, hermesTasks] = await Promise.all([
    loadTeamContext(),
    loadMyTaskSource(),
    loadHermesSource(),
  ]);
  const teamTasks: UnifiedTask[] = [];
  teamResult.teamTaskByKey.forEach((t, key) => {
    teamTasks.push({
      key,
      source: "team",
      title: t.title,
      status: mapTeamStatus(t.status),
      rawStatus: t.status,
      assignee: t.assigneeName,
      createdAt: t.createdAt,
      finishedAt: t.completedAt ?? null,
      briefId: t.briefId ?? undefined,
      executionRef: t.executionRef ?? undefined,
      result: t.result,
    });
  });
  return {
    tasks: sortByCreatedAtDesc([...teamTasks, ...myTasks, ...hermesTasks]),
    teamIdByKey: teamResult.teamIdByKey,
    teamTaskByKey: teamResult.teamTaskByKey,
  };
}

/** unified 源：优先走二期后端 GET /tasks/unified；团队任务用 loadTeamContext 补全 result/负责人 */
async function loadUnifiedSource(
  ctx: TeamContext,
  query: { status?: UnifiedTaskStatus; source?: UnifiedTaskSource } = {},
): Promise<UnifiedTask[]> {
  const res = await taskApi.getUnifiedTasks({ ...query, pageSize: 100 });
  return res.list.map((t: UnifiedTaskItem) => {
    const key = t.source + ":" + t.sourceId;
    const teamTask = t.source === "team" ? ctx.teamTaskByKey.get(key) : undefined;
    return {
      key,
      source: t.source,
      title: t.title,
      status: t.status,
      rawStatus: t.rawStatus,
      assignee: teamTask?.assigneeName ?? t.assignee,
      createdAt: t.createdAt,
      finishedAt: t.finishedAt ?? null,
      briefId: t.briefId ?? teamTask?.briefId ?? undefined,
      executionRef: teamTask?.executionRef ?? t.executionRef ?? undefined,
      result: teamTask?.result,
    };
  });
}

export default function TaskCenter() {
  const token = useAuthStore((s) => s.accessToken);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [teamIdByKey, setTeamIdByKey] = useState<Map<string, number>>(new Map());
  const [teamTaskByKey, setTeamTaskByKey] = useState<Map<string, TeamTask>>(new Map());
  const [selected, setSelected] = useState<UnifiedTask | null>(null);
  const [statusFilter, setStatusFilter] = useState<UnifiedTaskStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<UnifiedTaskSource | "all">("all");
  const [keyword, setKeyword] = useState("");
  // 需求确认后自动开始（Hermes 逐步编排）：默认开启，本地记忆
  const [autoStartOn, setAutoStartOn] = useState<boolean>(() => {
    try { return localStorage.getItem("tc-auto-start") !== "0"; } catch { return true; }
  });
  /** 已派发自动开始的 key（防轮询重复提交；任务离开待执行状态后自动清出） */
  const dispatchedRef = useRef<Set<string>>(new Set());
  /** 需求标题缓存（按批次分组组头展示） */
  const [briefTitles, setBriefTitles] = useState<Record<number, string>>({});
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => {
    setCollapsedKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await (await import("@/api/brief-api")).listBriefs({ pageSize: 100 });
        if (!alive) return;
        const m: Record<number, string> = {};
        for (const b of res.list) m[b.id] = b.title;
        setBriefTitles(m);
      } catch { /* 忽略，分组回退“需求单 #id” */ }
    })();
    return () => { alive = false; };
  }, []);

  const loadData = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      const query = {
        status: statusFilter === "all" ? undefined : statusFilter,
        source: sourceFilter === "all" ? undefined : sourceFilter,
      } satisfies { status?: UnifiedTaskStatus; source?: UnifiedTaskSource };
      try {
        const ctx = await loadTeamContext();
        setTeamIdByKey(ctx.teamIdByKey);
        setTeamTaskByKey(ctx.teamTaskByKey);
        let unifiedTasks: UnifiedTask[];
        try {
          unifiedTasks = await loadUnifiedSource(ctx, query);
        } catch (err) {
          console.warn("[TaskCenter] 统一任务接口不可用，降级到一期三源合并:", err);
          const result = await loadAll();
          setTeamIdByKey(result.teamIdByKey);
          setTeamTaskByKey(result.teamTaskByKey);
          unifiedTasks = result.tasks;
        }
        setTasks(unifiedTasks);
      } catch (err) {
        console.warn("[TaskCenter] 加载任务失败:", err);
        setTasks([]);
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [statusFilter, sourceFilter]
  );

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(true), TASK_CENTER_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadData]);

  // 重载后：任务不存在则清除选中；存在则重绑到新任务对象（刷新 result.steps）
  useEffect(() => {
    if (!selected) return;
    const fresh = tasks.find((t) => t.key === selected.key) ?? null;
    if (fresh !== selected) setSelected(fresh);
  }, [tasks, selected]);

  // 需求确认后自动开始：团队待办任务 → 提交 Hermes 逐步编排（并发 ≤2，每任务幂等）
  useEffect(() => {
    if (!token || !autoStartOn) return;
    const runningCount = countRunning(tasks);
    const candidate = tasks.find(
      (t) =>
        shouldAutoStart(t, { autoStartOn: true, runningCount }) &&
        !dispatchedRef.current.has(t.key) &&
        teamIdByKey.get(t.key) != null,
    );
    if (!candidate) return;
    const teamId = teamIdByKey.get(candidate.key);
    const taskId = nativeTaskId(candidate.key);
    if (teamId == null || taskId == null) return;
    dispatchedRef.current.add(candidate.key);
    void submitStepRunner({ token, teamId, taskId, task: candidate, autoConfirm: true }).then((res) => {
      if (!res.ok) {
        console.warn("[TaskCenter] 自动开始失败:", res.error);
        dispatchedRef.current.delete(candidate.key);
      } else {
        void loadData(true);
      }
    });
  }, [tasks, token, autoStartOn, teamIdByKey, loadData]);

  // 清理：离开待执行的任务从派发集合中移除（允许重试重新派发）
  useEffect(() => {
    for (const key of dispatchedRef.current) {
      const t = tasks.find((x) => x.key === key);
      if (!t || t.status !== "todo") dispatchedRef.current.delete(key);
    }
  }, [tasks]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (statusFilter === "all" || t.status === statusFilter) &&
        (sourceFilter === "all" || t.source === sourceFilter) &&
        (!kw || t.title.toLowerCase().includes(kw))
    );
  }, [tasks, statusFilter, sourceFilter, keyword]);

  /** 按发布批次分组（B 方案：同一次需求拆解的任务收进一组） */
  const groups = useMemo(
    () => groupTasksByBatch(filtered, (id) => briefTitles[id]),
    [filtered, briefTitles]
  );

  const pendingReviewCount = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.source !== "team") return false;
        const steps = (t.result as { steps?: Array<Record<string, unknown>> } | undefined)?.steps;
        return !!steps?.some((s) => s.rawStatus === "pending_review");
      }).length,
    [tasks]
  );

  const handleToggleAutoStart = (v: boolean) => {
    setAutoStartOn(v);
    try { localStorage.setItem("tc-auto-start", v ? "1" : "0"); } catch { /* ignore */ }
  };
  return (
    <div className={styles.pageContainer}>
      {/* ===== 页头 ===== */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <ApartmentOutlined />
          </span>
          <div className={styles.pageTitleText}>
            <span className={styles.pageTitleMain}>任务中心</span>
            <span className={styles.pageTitleSub}>Hermes 编排 · 子代理逐步执行 · 产出逐项确认</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.autoStartSwitch}>
            <ThunderboltFilled className={styles.autoStartIcon} />
            <span>需求确认后自动执行</span>
            <Switch size="small" checked={autoStartOn} onChange={handleToggleAutoStart} />
          </div>
          <Button
            className={styles.ghostBtn}
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void loadData(false)}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* ===== 筛选栏 ===== */}
      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>状态</span>
          <Select<UnifiedTaskStatus | "all">
            value={statusFilter}
            options={STATUS_FILTER_OPTIONS}
            onChange={setStatusFilter}
            style={{ width: 120 }}
          />
        </div>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>来源</span>
          <Select<UnifiedTaskSource | "all">
            value={sourceFilter}
            options={SOURCE_FILTER_OPTIONS}
            onChange={setSourceFilter}
            style={{ width: 120 }}
          />
        </div>
        <Input
          className={styles.searchInput}
          prefix={<SearchOutlined />}
          placeholder="搜索任务标题…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          style={{ width: 220 }}
        />
        {pendingReviewCount > 0 && (
          <span className={styles.pendingReviewBanner}>
            <RobotOutlined /> {pendingReviewCount} 个任务有待确认节点
          </span>
        )}
        <span className={styles.filterCount}>共 {filtered.length} 条</span>
      </div>


      <ScheduledPanel />

      {/* ===== 双栏主体 ===== */}
      <div className={styles.workspace}>
        {/* 左：任务卡片列表 */}
        <div className={styles.taskListPanel}>
          <Spin spinning={loading}>
            {filtered.length === 0 ? (
              <Empty description="暂无任务" />
            ) : (
              <div className={styles.taskList}>
                {groups.map((g) => {
                  const gCollapsed = collapsedKeys.has(g.key);
                  return (
                    <div key={g.key} className={styles.taskGroup}>
                      <div className={styles.taskGroupHeader} onClick={() => toggleGroup(g.key)}>
                        <span className={styles.taskGroupArrow}>{gCollapsed ? <RightOutlined /> : <DownOutlined />}</span>
                        <span className={styles.taskGroupTitle}>{g.title}</span>
                        {g.tasks.length > 1 && (
                          <span className={styles.taskGroupMeta}>
                            {g.tasks.filter((x) => x.status === "done").length}/{g.tasks.length} 完成
                          </span>
                        )}
                        <span className={styles.taskGroupTime}>{formatRelative(g.createdAt)}</span>
                      </div>
                      {!gCollapsed && (
                        <div className={styles.taskGroupTasks}>
                          {filtered.map((t) => {
                            const meta = STATUS_TAG_META[t.status];
                            const srcMeta = SOURCE_TAG_META[t.source];
                            const isSelected = selected?.key === t.key;
                            const isRunning = t.status === "running";
                            const hasReview =
                              t.source === "team" &&
                              (t.result as { steps?: Array<Record<string, unknown>> } | undefined)?.steps?.some(
                                (s) => s.rawStatus === "pending_review"
                              );
                            const srcColor =
                              srcMeta.color === "blue" ? "var(--color-brand)" : srcMeta.color === "purple" ? "var(--color-purple)" : "var(--color-accent)";
                            return (
                              <div
                                key={t.key}
                                className={[
                                  styles.taskCard,
                                  isSelected ? styles.taskCardSelected : "",
                                  isRunning ? styles.taskCardRunning : "",
                                  hasReview ? styles.taskCardReview : "",
                                ].filter(Boolean).join(" ")}
                                onClick={() => setSelected(t)}
                              >
                                <div className={styles.taskCardTop}>
                                  <span className={styles.taskCardTitle}>{t.title}</span>
                                  {hasReview && (
                                    <span className={styles.reviewDot} title="有待确认节点">
                                      <RobotOutlined />
                                    </span>
                                  )}
                                </div>
                                <div className={styles.taskCardMeta}>
                                  <span className={styles[PILL_CLS[t.status]]}>{meta.label}</span>
                                  <span className={styles.srcTag} style={{ color: srcColor }}>{srcMeta.label}</span>
                                  {t.assignee && (
                                    <span className={styles.cardAssignee}>
                                      <UserOutlined /> {t.assignee}
                                    </span>
                                  )}
                                </div>
                                <div className={styles.taskCardTime}>
                                  <ClockCircleOutlined /> {formatRelative(t.createdAt)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Spin>
        </div>

        {/* 右：任务执行详情 */}
        <div className={styles.detailPanel}>
          {!selected ? (
            <div className={styles.detailEmpty}>
              <ApartmentOutlined className={styles.detailEmptyIcon} />
              <div className={styles.detailEmptyText}>从左侧选择任务，查看 Hermes 逐步执行与产出确认</div>
            </div>
          ) : (
            <PipelineView
              task={selected}
              teamId={teamIdByKey.get(selected.key)}
              onUpdated={() => void loadData(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
