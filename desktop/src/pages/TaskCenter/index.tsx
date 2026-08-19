// 统一任务中心 —— 三源合并（团队 / 我的任务 / Hermes 调用日志）+ 动态流水线
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Select, Spin, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { ApartmentOutlined, ReloadOutlined } from "@ant-design/icons";
import * as teamApi from "@/api/team-api";
import * as taskApi from "@/api/task-api";
import type { UnifiedTaskItem } from "@/api/task-api";
import * as hermesApi from "@/api/hermes-api";
import {
  mapHermesStatus,
  mapTaskStatus,
  mapTeamStatus,
  sortByCreatedAtDesc,
  SOURCE_TAG_META,
  STATUS_TAG_META,
} from "./unified";
import type { UnifiedTask, UnifiedTaskSource, UnifiedTaskStatus } from "./unified";
import PipelineView from "./PipelineView";
import styles from "./styles.module.css";

/** 时间格式化（与 Channels 页一致） */
function formatTime(v: unknown): string {
  if (!v) return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("zh-CN", { hour12: false });
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

const COLUMNS: TableColumnsType<UnifiedTask> = [
  { title: "标题", dataIndex: "title", ellipsis: true },
  {
    title: "来源",
    dataIndex: "source",
    width: 110,
    render: (source: UnifiedTaskSource) => {
      const meta = SOURCE_TAG_META[source];
      return <Tag color={meta.color}>{meta.label}</Tag>;
    },
  },
  {
    title: "状态",
    dataIndex: "status",
    width: 100,
    render: (status: UnifiedTaskStatus) => {
      const meta = STATUS_TAG_META[status];
      return <Tag color={meta.color}>{meta.label}</Tag>;
    },
  },
  {
    title: "负责人",
    dataIndex: "assignee",
    width: 130,
    render: (v: string | undefined) => v || "-",
  },
  {
    title: "时间",
    dataIndex: "createdAt",
    width: 180,
    render: (v: string) => formatTime(v),
  },
];

interface TeamSourceResult {
  tasks: UnifiedTask[];
  teamIdByKey: Map<string, number>;
}

/** team 源：listTeams() → 每个团队 listTasks(pageSize 50)；返回任务 + taskId→teamId 映射（老板动作 PATCH 用） */
async function loadTeamSource(): Promise<TeamSourceResult> {
  const tasks: UnifiedTask[] = [];
  const teamIdByKey = new Map<string, number>();
  try {
    const teams = await teamApi.listTeams();
    await Promise.all(
      teams.map(async (team) => {
        try {
          const taskRes = await teamApi.listTasks(team.id, { pageSize: 50 });
          for (const t of taskRes.list) {
            const key = `team:${t.id}`;
            tasks.push({
              key,
              source: "team",
              title: t.title,
              status: mapTeamStatus(t.status),
              rawStatus: t.status,
              assignee: t.assigneeName,
              createdAt: t.createdAt,
              finishedAt: t.completedAt ?? null,
            });
            teamIdByKey.set(key, team.id);
          }
        } catch (err) {
          console.warn(`[TaskCenter] 加载团队 ${team.id} 数据失败:`, err);
        }
      })
    );
  } catch (err) {
    console.warn("[TaskCenter] 加载团队列表失败:", err);
  }
  return { tasks, teamIdByKey };
}

/** 仅取团队任务 taskId→teamId 映射（统一接口主路径补充 teamId，供老板动作 PATCH /teams/:teamId/tasks/:taskId） */
async function loadTeamIdMap(): Promise<Map<string, number>> {
  const teamIdByKey = new Map<string, number>();
  try {
    const teams = await teamApi.listTeams();
    await Promise.all(
      teams.map(async (team) => {
        try {
          const taskRes = await teamApi.listTasks(team.id, { pageSize: 50 });
          for (const t of taskRes.list) {
            teamIdByKey.set(`team:${t.id}`, team.id);
          }
        } catch (err) {
          console.warn(`[TaskCenter] 加载团队 ${team.id} 任务映射失败:`, err);
        }
      })
    );
  } catch (err) {
    console.warn("[TaskCenter] 加载团队列表失败:", err);
  }
  return teamIdByKey;
}

/** task 源：task-api.listTasks(pageSize 50)（模块级导出，命名空间调用避免与 team-api 冲突） */
async function loadMyTaskSource(): Promise<UnifiedTask[]> {
  try {
    const res = await taskApi.listTasks({ pageSize: 50 });
    return res.list.map((t) => ({
      key: `task:${t.id}`,
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

/** hermes 源：listInstances() → 每个实例 getCallLogs(pageSize 50) */
async function loadHermesSource(): Promise<UnifiedTask[]> {
  const tasks: UnifiedTask[] = [];
  try {
    const instances = await hermesApi.listInstances();
    await Promise.all(
      instances.map(async (inst) => {
        try {
          const res = await hermesApi.getCallLogs(inst.id, { pageSize: 50 });
          for (const log of res.list) {
            tasks.push({
              key: `hermes:${log.id}`,
              source: "hermes",
              title: log.target || log.callType,
              status: mapHermesStatus(log.status),
              rawStatus: log.status,
              createdAt: log.createdAt,
            });
          }
        } catch (err) {
          console.warn(`[TaskCenter] 加载 Hermes 实例 ${inst.id} 日志失败:`, err);
        }
      })
    );
  } catch (err) {
    console.warn("[TaskCenter] 加载 Hermes 实例列表失败:", err);
  }
  return tasks;
}

/** 三源并发拉取：任一源失败只降级为空数组，不阻断整体 */
async function loadAll(): Promise<{
  tasks: UnifiedTask[];
  teamIdByKey: Map<string, number>;
}> {
  const [teamResult, myTasks, hermesTasks] = await Promise.all([
    loadTeamSource(),
    loadMyTaskSource(),
    loadHermesSource(),
  ]);
  return {
    tasks: sortByCreatedAtDesc([...teamResult.tasks, ...myTasks, ...hermesTasks]),
    teamIdByKey: teamResult.teamIdByKey,
  };
}

/** unified 源：优先走二期后端 GET /tasks/unified（status/source 筛选透传后端）；失败时抛错由调用方降级到一期三源合并 */
async function loadUnifiedSource(
  query: { status?: UnifiedTaskStatus; source?: UnifiedTaskSource } = {}
): Promise<UnifiedTask[]> {
  const res = await taskApi.getUnifiedTasks({ ...query, pageSize: 100 });
  return res.list.map((t: UnifiedTaskItem) => ({
    key: `${t.source}:${t.sourceId}`,
    source: t.source,
    title: t.title,
    status: t.status,
    rawStatus: t.rawStatus,
    assignee: t.assignee,
    createdAt: t.createdAt,
    finishedAt: t.finishedAt ?? null,
    briefId: t.briefId ?? undefined,
  }));
}

export default function TaskCenter() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [teamIdByKey, setTeamIdByKey] = useState<Map<string, number>>(new Map());
  const [selected, setSelected] = useState<UnifiedTask | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);
  const [statusFilter, setStatusFilter] = useState<UnifiedTaskStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<UnifiedTaskSource | "all">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    const query = {
      status: statusFilter === "all" ? undefined : statusFilter,
      source: sourceFilter === "all" ? undefined : sourceFilter,
    } satisfies { status?: UnifiedTaskStatus; source?: UnifiedTaskSource };
    try {
      // 二期：优先走后端统一任务接口（后端已完成统一 status 映射与合并，筛选透传后端）
      const [unifiedTasks, teamIdMap] = await Promise.all([
        loadUnifiedSource(query),
        loadTeamIdMap(),
      ]);
      setTasks(unifiedTasks);
      setTeamIdByKey(teamIdMap);
    } catch (err) {
      // 一期降级：unified 接口不可用时回退到前端三源并发合并（原有代码路径保留）
      console.warn("[TaskCenter] 统一任务接口不可用，降级到一期三源合并:", err);
      try {
        const result = await loadAll();
        setTasks(result.tasks);
        setTeamIdByKey(result.teamIdByKey);
      } catch (err2) {
        console.warn("[TaskCenter] 加载任务失败:", err2);
        setTasks([]);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 重载后：任务不存在则清除选中；存在则重绑到新任务对象并递增刷新版本号，
  // 使 PipelineView 重挂载（key 变化）重取 outputs，避免面板展示陈旧步骤/状态
  useEffect(() => {
    if (!selected) return;
    const fresh = tasks.find((t) => t.key === selected.key) ?? null;
    if (fresh !== selected) {
      setSelected(fresh);
      if (fresh) {
        setRefreshSeq((s) => s + 1);
      }
    }
  }, [tasks, selected]);

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (statusFilter === "all" || t.status === statusFilter) &&
          (sourceFilter === "all" || t.source === sourceFilter)
      ),
    [tasks, statusFilter, sourceFilter]
  );

  const selectedMeta = selected ? STATUS_TAG_META[selected.status] : null;

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <ApartmentOutlined />
          </span>
          <span>统一任务中心</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.ghostBtn}
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={loadData}
          >
            刷新
          </Button>
        </div>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>状态</span>
          <Select<UnifiedTaskStatus | "all">
            value={statusFilter}
            options={STATUS_FILTER_OPTIONS}
            onChange={setStatusFilter}
            style={{ width: 130 }}
          />
        </div>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>来源</span>
          <Select<UnifiedTaskSource | "all">
            value={sourceFilter}
            options={SOURCE_FILTER_OPTIONS}
            onChange={setSourceFilter}
            style={{ width: 140 }}
          />
        </div>
        <span className={styles.filterCount}>共 {filtered.length} 条</span>
      </div>

      <Spin spinning={loading}>
        <div className={styles.tableCard}>
          <Table<UnifiedTask>
            rowKey="key"
            size="middle"
            columns={COLUMNS}
            dataSource={filtered}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{ emptyText: <Empty description="暂无任务" /> }}
            onRow={(record) => ({ onClick: () => setSelected(record) })}
            rowClassName={(record) =>
              selected && selected.key === record.key ? styles.selectedRow : ""
            }
          />
        </div>
      </Spin>

      <div className={styles.flowCard}>
        <div className={styles.flowHeader}>
          <span className={styles.flowTitle}>任务流水线</span>
          {selected && selectedMeta && (
            <div className={styles.flowSelected}>
              <Tag color={selectedMeta.color}>{selectedMeta.label}</Tag>
              <span className={styles.flowSelectedTitle}>{selected.title}</span>
              <span className={styles.flowSelectedMeta}>
                {selected.key} · {formatTime(selected.createdAt)}
              </span>
            </div>
          )}
        </div>
        {!selected ? (
          <Empty className={styles.flowEmpty} description="点击表格行查看该任务的流水线" />
        ) : (
          <PipelineView
            key={`${selected.key}-${refreshSeq}`}
            task={selected}
            teamId={teamIdByKey.get(selected.key)}
            onUpdated={loadData}
          />
        )}
      </div>
    </div>
  );
}