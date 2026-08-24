// 任务流水线视图 v2 —— 逐步执行轨道
// 团队任务：Hermes 编排 result.steps（子代理节点）逐个展示：执行中/待确认/通过/打回重做/超限
// 产出内容（文字/图片/视频）内联预览；通过/打回走逐步编排 IPC；自动确认（自评）开关可中途切换
// 我的任务源：保留旧版 outputs 拆解 JSON 流水线与老板动作（选题/终审），不回归
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Collapse, Empty, Input, message, Modal, Radio, Select, Space, Spin, Switch, Tooltip } from "antd";
import {
  ApartmentOutlined,
  CheckCircleFilled,
  DeleteOutlined,
  CloseCircleFilled,
  LoadingOutlined,
  PauseCircleOutlined,
  PlayCircleFilled,
  RedoOutlined,
  RobotOutlined,
  StopOutlined,
  ThunderboltFilled,
} from "@ant-design/icons";
import * as teamApi from "@/api/team-api";
import type { SelectableAgent, Team, TeamTaskExecuteMode } from "@/types/team";
import { useAuthStore } from "@/store/auth";
import { httpClient } from "@/api/http-client";
import { resolveMediaUrl } from "@/utils/media";
import type { UnifiedTask } from "./unified";
import {
  parsePipeline,
  parseTeamSteps,
  pipelineActions,
  taskQuickAction,
  topicCandidates,
  type PipelineStep,
  type StepOutputItem,
  type TaskOutputItem,
} from "./pipeline";
import {
  confirmStep,
  deleteTeamTask,
  nativeTaskId,
  pauseTask,
  rejectStep,
  resumeTask,
  setAutoConfirm,
  stopTask,
  submitStepRunner,
} from "./task-runner";
import styles from "./styles.module.css";

interface PipelineViewProps {
  task: UnifiedTask;
  /** 团队 ID：逐步编排（PATCH /teams/:teamId/tasks/:taskId）需要；无则动作禁用 */
  teamId?: number;
  /** 动作成功后回调（刷新任务列表） */
  onUpdated?: () => void;
}

/** 产出内容预览：图片网格 / 视频 / 音频 / 文本块 / 文件链接 */
function StepOutputs({ outputs }: { outputs?: StepOutputItem[] }) {
  if (!outputs || outputs.length === 0) return null;
  const media = outputs.filter((o) => o.url && ["image", "video", "audio"].includes(o.type));
  const files = outputs.filter((o) => o.url && o.type === "file");
  const texts = outputs.filter((o) => !o.url && o.content);
  return (
    <div className={styles.stepOutputs}>
      {media.length > 0 && (
        <div className={styles.mediaGrid}>
          {media.map((o, i) =>
            o.type === "video" ? (
              <video key={i} className={styles.mediaVideo} src={resolveMediaUrl(o.url as string)} controls preload="metadata" />
            ) : o.type === "audio" ? (
              <audio key={i} className={styles.mediaAudio} src={resolveMediaUrl(o.url as string)} controls />
            ) : (
              <img key={i} className={styles.mediaImg} src={resolveMediaUrl(o.url as string)} alt={o.content ?? "产出图片"} loading="lazy" />
            ),
          )}
        </div>
      )}
      {texts.map((o, i) => (
        <pre key={i} className={styles.stepText}>{o.content}</pre>
      ))}
      {files.map((o, i) => (
        <a key={i} className={styles.stepFile} href={resolveMediaUrl(o.url as string)} target="_blank" rel="noreferrer">
          文件：{o.url?.split("/").pop() || o.content}
        </a>
      ))}
    </div>
  );
}

/** 步骤状态元信息：徽标文案 / 颜色 class */
const STEP_META: Record<PipelineStep["status"], { label: string; cls: string }> = {
  done: { label: "已完成", cls: "stepDone" },
  active: { label: "执行中", cls: "stepActive" },
  waiting: { label: "排队中", cls: "stepWaiting" },
  review: { label: "待确认", cls: "stepReview" },
  rejected: { label: "打回超限", cls: "stepRejected" },
};

/** 执行方式徽标文案与样式类 */
const MODE_LABEL: Record<string, string> = {
  team: "指定团队",
  auto: "自动匹配",
  agent: "指定Agent",
};
const MODE_CLS: Record<string, string> = {
  team: "modeBadge",
  auto: "modeBadge modeBadgeAuto",
  agent: "modeBadge modeBadgeAgent",
};

/** 时间格式化 */
function formatTime(v: unknown): string {
  if (!v) return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function PipelineView({ task, teamId, onUpdated }: PipelineViewProps) {
  const token = useAuthStore((s) => s.accessToken);
  const [outputs, setOutputs] = useState<TaskOutputItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** 暂停态（本地记忆；runner 在 main 进程，暂停仅运行期有效） */
  const [paused, setPaused] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  /** 可选执行团队（换团队用） */
  const [teams, setTeams] = useState<Team[]>([]);
  const [actingIndex, setActingIndex] = useState<number | null>(null);
  const [rejectIndex, setRejectIndex] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // 自动确认（Hermes 评审）：按任务记忆，默认开启
  const [autoConfirm, setAutoConfirmState] = useState<boolean>(() => {
    try { return localStorage.getItem("tc-auto:" + task.key) !== "0"; } catch { return true; }
  });
  // 旧版老板动作弹窗（我的任务源 选题/终审）
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicValue, setTopicValue] = useState<string | undefined>(undefined);
  const [manualTopic, setManualTopic] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  // 执行方式切换（指定团队/自动匹配/指定Agent）
  const [agents, setAgents] = useState<SelectableAgent[]>([]);
  const [modeOpen, setModeOpen] = useState(false);
  const [modeDraft, setModeDraft] = useState<TeamTaskExecuteMode>("auto");
  const [modeTeamId, setModeTeamId] = useState<number | undefined>(undefined);
  const [modeAgentId, setModeAgentId] = useState<number | undefined>(undefined);

  const taskId = useMemo(() => nativeTaskId(task.key), [task.key]);
  const isTeam = task.source === "team";
  /** auto/agent 模式无团队归属也可执行（回写走 /team-tasks） */
  const canRunner = isTeam && taskId != null;
  const quickAction = useMemo(() => taskQuickAction(task), [task]);

  /** 读取 Hermes 拆解输出：仅「我的任务」源有 GET /tasks/:id/outputs */
  const loadOutputs = useCallback(async () => {
    if (task.source !== "task" || taskId == null) {
      setOutputs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await httpClient.get<TaskOutputItem[]>("/tasks/" + taskId + "/outputs");
      setOutputs(Array.isArray(res) ? res : []);
    } catch (err) {
      console.warn("[PipelineView] 读取任务 " + taskId + " 输出失败:", err);
      setOutputs([]);
    } finally {
      setLoading(false);
    }
  }, [task.source, taskId]);

  useEffect(() => {
    void loadOutputs();
  }, [loadOutputs]);

  /** 拉取可选团队与 Agent（执行方式切换面板用） */
  useEffect(() => {
    let alive = true;
    void teamApi
      .listTeams()
      .then((list) => { if (alive) setTeams(list); })
      .catch(() => undefined);
    void teamApi
      .listSelectableAgents()
      .then((list) => { if (alive) setAgents(Array.isArray(list) ? list : []); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  /** 步骤：团队任务优先 result.steps（runner 逐步执行）；否则旧版推导/拆解 */
  const steps = useMemo(() => {
    if (isTeam) {
      const teamSteps = parseTeamSteps(task.result);
      if (teamSteps.length > 0) return teamSteps;
    }
    return parsePipeline(task, outputs);
  }, [isTeam, task, outputs]);
  const candidates = useMemo(() => topicCandidates(outputs), [outputs]);
  /** 当前执行方式：auto/agent 任务无 teamId，按 executeMode 展示 */
  const executeMode = task.executeMode ?? (teamId != null ? "team" : "auto");
  /** 规划阶段思考过程（Hermes 拆解任务时 JSON 前的文本） */
  const planReasoning = useMemo(() => {
    if (!isTeam) return undefined;
    const result = task.result as Record<string, unknown> | null | undefined;
    const v = result?.planReasoning;
    return typeof v === "string" && v.trim() ? v : undefined;
  }, [isTeam, task.result]);
  /** 失败原因（result.error）：执行失败时展示给用户便于排查 */
  const failError = useMemo(() => {
    if (!isTeam || task.status !== "failed") return undefined
    const result = task.result as Record<string, unknown> | null | undefined
    const v = result?.error
    return typeof v === "string" && v.trim() ? v : undefined
  }, [isTeam, task.status, task.result]);
  /** 僵尸运行态：任务标 running 但无任何团队节点（App 中断/规划失败残留），允许重新开始 */
  const brokenRunning = isTeam && task.status === "running" && parseTeamSteps(task.result).length === 0;

  /** 切换自动确认（Hermes 评审）：运行中任务实时通知主进程 */
  const handleToggleAuto = (v: boolean) => {
    setAutoConfirmState(v);
    try { localStorage.setItem("tc-auto:" + task.key, v ? "1" : "0"); } catch { /* ignore */ }
    if (canRunner && task.status === "running") {
      void setAutoConfirm(token ?? "", taskId as number, v);
    }
  };

  /** 暂停：当前节点跑完后挂起（runner 在 main 进程） */
  const handlePause = async () => {
    if (!token || taskId == null) return;
    setTaskBusy(true);
    try {
      const res = await pauseTask(taskId);
      if (res.ok) { setPaused(true); message.success("已暂停，当前节点跑完后挂起"); }
      else message.error(res.error || "暂停失败");
    } finally { setTaskBusy(false); }
  };

  /** 继续执行 */
  const handleResume = async () => {
    if (!token || taskId == null) return;
    setTaskBusy(true);
    try {
      const res = await resumeTask(taskId);
      if (res.ok) { setPaused(false); message.success("已继续执行"); }
      else message.error(res.error || "继续失败");
    } finally { setTaskBusy(false); }
  };

  /** 立即中断：杀掉当前 Hermes CLI，任务标记失败 */
  const handleStop = () => {
    if (!token || taskId == null) return;
    Modal.confirm({
      title: "立即中断任务？",
      content: "正在执行的子代理会被强制终止，任务将标记为失败，可稍后重新开始。",
      okText: "中断",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        const res = await stopTask(taskId as number);
        if (res.ok) { message.success("已发送中断指令"); setPaused(false); onUpdated?.(); }
        else message.error(res.error || "中断失败");
      },
    });
  };

  /** 删除任务（先停止运行再调后端 DELETE；auto/agent 模式无团队归属走 /team-tasks） */
  const handleDelete = () => {
    if (!token || taskId == null) return;
    Modal.confirm({
      title: "删除任务？",
      content: "删除后不可恢复（含执行记录与产出）。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        const res = await deleteTeamTask({ token, teamId, teamTaskId: taskId as number });
        if (res.ok) { message.success("任务已删除"); setPaused(false); onUpdated?.(); }
        else message.error(res.error || "删除失败");
      },
    });
  };

  /** 打开执行方式切换面板（未开始/失败任务可用） */
  const openModePanel = () => {
    setModeDraft(executeMode);
    setModeTeamId(teamId ?? teams[0]?.id);
    setModeAgentId(task.agentId ?? (agents[0] ? Number(agents[0].id) : undefined));
    setModeOpen(true);
  };

  /** 保存执行方式：team=指定团队（联动选团队）；agent=指定Agent；auto=自动匹配（清空团队） */
  const handleModeSave = async () => {
    if (!token || taskId == null) return;
    if (modeDraft === "team" && modeTeamId == null) {
      message.warning("请选择执行团队");
      return;
    }
    if (modeDraft === "agent" && modeAgentId == null) {
      message.warning("请选择执行的 Agent");
      return;
    }
    setTaskBusy(true);
    try {
      if (modeDraft === "team") {
        await teamApi.updateMyTask(taskId, { executeMode: "team", teamId: modeTeamId as number });
      } else if (modeDraft === "agent") {
        await teamApi.updateMyTask(taskId, { executeMode: "agent", agentId: modeAgentId as number });
      } else {
        await teamApi.updateMyTask(taskId, { executeMode: "auto", teamId: null });
      }
      message.success("执行方式已更新");
      setModeOpen(false);
      onUpdated?.();
    } catch (err) {
      message.error("更新执行方式失败：" + ((err as Error).message || "未知错误"));
    } finally { setTaskBusy(false); }
  };

  /** 开始/重试：真正提交 Hermes 逐步编排（后台执行），不再只是改状态 */
  const handleStart = async () => {
    if (!canRunner || !token) {
      message.warning("无法启动：未登录或任务未关联团队");
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitStepRunner({
        token,
        teamId: teamId as number,
        taskId: taskId as number,
        task,
        autoConfirm,
      });
      if (res.ok) {
        message.success(res.started ? "任务已开始执行" : "任务已在执行中");
        onUpdated?.();
      } else {
        message.error(res.error || "启动失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** 通过某节点 */
  const handleConfirm = async (stepIndex: number) => {
    if (!canRunner || !token) return;
    setActingIndex(stepIndex);
    try {
      const res = await confirmStep(token, taskId as number, stepIndex);
      if (!res.ok) {
        message.error(res.error || "确认失败");
      } else {
        message.success("节点已通过");
        onUpdated?.();
      }
    } finally {
      setActingIndex(null);
    }
  };

  /** 打回节点：原因必填 → Hermes 消化原因自动重做 */
  const handleRejectOk = async (stepIndex: number) => {
    const reason = rejectReason.trim();
    if (!reason) {
      message.warning("请填写打回原因");
      return;
    }
    if (!canRunner || !token) return;
    setActingIndex(stepIndex);
    try {
      const res = await rejectStep(token, taskId as number, stepIndex, reason);
      if (!res.ok) {
        message.error(res.error || "打回失败");
      } else {
        message.success("已打回，Hermes 将按原因自动重做");
        setRejectIndex(null);
        setRejectReason("");
        onUpdated?.();
      }
    } finally {
      setActingIndex(null);
    }
  };

  /** 旧版老板动作 PATCH（我的任务源 选题/终审），保持不回归 */
  const patchTask = useCallback(
    async (payload: { status: string; description?: string }, successText: string) => {
      if (teamId == null || taskId == null) return;
      try {
        await httpClient.patch(`/teams/${teamId}/tasks/${taskId}`, payload);
        message.success(successText);
        onUpdated?.();
      } catch (err) {
        message.error("操作失败：" + ((err as Error).message || "未知错误"));
      }
    },
    [teamId, taskId, onUpdated]
  );

  const handleTopicOk = async () => {
    const topic = manualTopic.trim() || topicValue?.trim();
    if (!topic) {
      message.warning("请选择或输入候选选题");
      return;
    }
    await patchTask(
      { status: "in_progress", description: "[老板] 已选选题：" + topic + "\nselected_topic: " + topic },
      "选题已确认，任务已推进"
    );
    setTopicOpen(false);
    setManualTopic("");
  };
  const handleApprove = () => patchTask({ status: "completed" }, "任务已通过");
  const handleReject = () => {
    if (!rejectComment.trim()) {
      message.warning("请填写打回评语");
      return;
    }
    void patchTask(
      { status: "failed", description: "[老板] 打回：" + rejectComment.trim() },
      "任务已打回"
    );
    setRejectOpen(false);
    setRejectComment("");
  };

  const statusCls =
    task.status === "todo" ? "pillTodo" : task.status === "running" ? "pillRunning" : task.status === "done" ? "pillDone" : task.status === "failed" ? "pillFailed" : "pillTodo";
  const statusLabel = task.status === "todo" ? "待执行" : task.status === "running" ? "执行中" : task.status === "done" ? "已完成" : task.status === "failed" ? "失败" : "已取消";

  return (
    <Spin spinning={loading}>
      <div className={styles.pipelineWrap}>
        {/* ===== 任务头部 ===== */}
        <div className={styles.taskHead}>
          <div className={styles.taskHeadMain}>
            <div className={styles.taskTitleRow}>
              <span className={styles.taskTitle}>{task.title}</span>
              <span className={styles[statusCls]}>{statusLabel}</span>
            </div>
            <div className={styles.taskMetaRow}>
              <span>{task.source === "team" ? (task.executeMode === "auto" ? "Hermes 自动匹配任务" : task.executeMode === "agent" ? "指定 Agent 任务" : "团队任务") : task.source === "task" ? "我的任务" : "Hermes 调用"}</span>
              {isTeam && (
                <span className={styles[MODE_CLS[executeMode] || "modeBadge"]}>
                  {MODE_LABEL[executeMode] ?? "自动匹配"}
                </span>
              )}
              {task.assignee && <span>负责人：{task.assignee}</span>}
              <span>创建于 {formatTime(task.createdAt)}</span>
              {task.finishedAt && <span>完成于 {formatTime(task.finishedAt)}</span>}
            </div>
          </div>
          <div className={styles.taskHeadActions}>
            {canRunner && task.status === "running" && (
              <div className={styles.autoSwitch}>
                <ThunderboltFilled className={styles.autoSwitchIcon} />
                <span>自动确认（Hermes 评审）</span>
                <Switch size="small" checked={autoConfirm} onChange={handleToggleAuto} />
              </div>
            )}
            {canRunner && (task.status === "todo" || task.status === "failed" || brokenRunning) && (
              <>
              <Tooltip title="指定团队 / 自动匹配 / 指定Agent，执行前可随时切换">
                <Button
                  size="small"
                  icon={<ApartmentOutlined />}
                  disabled={!token || taskBusy}
                  onClick={openModePanel}
                >
                  执行方式：{MODE_LABEL[executeMode] ?? "自动匹配"}
                </Button>
              </Tooltip>
              <Tooltip title={!token ? "未登录" : undefined}>
                <Button
                  type="primary"
                  icon={task.status === "failed" || brokenRunning ? <RedoOutlined /> : <PlayCircleFilled />}
                  loading={submitting}
                  disabled={!token}
                  onClick={() => void handleStart()}
                >
                  {task.status === "failed" || brokenRunning ? "重新开始" : "开始任务"}
                </Button>
              </Tooltip>
              </>
            )}
            {canRunner && task.status === "running" && (
              <Space>
                {paused ? (
                  <Button icon={<PlayCircleFilled />} loading={taskBusy} disabled={!token} onClick={() => void handleResume()}>继续</Button>
                ) : (
                  <Button icon={<PauseCircleOutlined />} loading={taskBusy} disabled={!token} onClick={() => void handlePause()}>暂停</Button>
                )}
                <Button danger icon={<StopOutlined />} loading={taskBusy} disabled={!token} onClick={handleStop}>中断</Button>
              </Space>
            )}
            {canRunner && task.status !== "running" && (
              <Button danger ghost icon={<DeleteOutlined />} disabled={!token} onClick={handleDelete}>删除</Button>
            )}
            {paused && <span className={styles.pausedBadge}>已暂停</span>}
          </div>
        </div>

        {/* ===== 规划思考过程（Hermes 拆解任务时的思路） ===== */}
        {planReasoning && (
          <Collapse
            ghost
            size="small"
            style={{ margin: "4px 0" }}
            items={[
              {
                key: "plan",
                label: "Hermes 规划思路（思考过程）",
                children: <pre className={styles.reasonBlockPre}>{planReasoning}</pre>,
              },
            ]}
          />
        )}

        {failError && (
          <Alert
            type="error"
            showIcon
            message="执行失败原因"
            description={failError}
            style={{ margin: "12px 0" }}
          />
        )}
        {/* ===== 步骤轨道 ===== */}
        {steps.length === 0 ? (
          brokenRunning ? (
            <Alert
              type="warning"
              showIcon
              message="执行已中断"
              description="任务标记为“运行中”但未产出任何节点（可能是应用中断或规划失败残留），请点击右上角「重新开始」。"
              style={{ margin: "12px 0" }}
            />
          ) : (
            <Empty className={styles.flowEmpty} description="暂无任务步骤" />
          )
        ) : (
          <div className={styles.stepTrack}>
            {steps.map((step, i) => {
              const meta = STEP_META[step.status];
              const isReview = step.status === "review";
              const isRejected = step.status === "rejected";
              const isActive = step.status === "active";
              const legacyAction = pipelineActions(task, step);
              const last = i === steps.length - 1;
              const acting = actingIndex === step.index;
              const reviewOpen = rejectIndex === step.index;
              return (
                <div key={step.index + "-" + step.step} className={styles.stepRow}>
                  <div className={styles.stepRail}>
                    <div className={styles.stepNode + " " + styles[meta.cls]}>
                      {step.status === "done" ? <CheckCircleFilled /> : isRejected ? <CloseCircleFilled /> : isActive ? <LoadingOutlined /> : isReview ? <RobotOutlined /> : (step.index ?? 0) + 1}
                    </div>
                    {!last && <div className={styles.stepLine + (isActive ? " " + styles.stepLineActive : "")} />}
                  </div>
                  <div className={styles.stepCard + (isReview ? " " + styles.stepCardReview : "") + (isRejected ? " " + styles.stepCardRejected : "") + (isActive ? " " + styles.stepCardActive : "")}>
                    <div className={styles.stepCardHead}>
                      <span className={styles.stepName}>{step.step}</span>
                      {step.agentRole && <span className={styles.stepRole}>{step.agentRole}</span>}
                      {step.assigneeName && <span className={styles.stepAssignee}>负责：{step.assigneeName}</span>}
                      {!step.assigneeName && isTeam && <span className={styles.stepAssignee}>负责：子代理</span>}
                      <span className={styles.stepStatusTag + " " + styles[meta.cls]}>{meta.label}</span>
                      {step.retryCount != null && step.retryCount > 0 && (
                        <span className={styles.retryBadge}>已重做 {step.retryCount} 次</span>
                      )}
                    </div>

                    {/* 执行中动画提示 */}
                    {isActive && (
                      <div className={styles.runningHint}>
                        <span className={styles.runningDot} />
                        {paused ? "已暂停：当前节点完成后挂起，点击「继续」恢复执行" : "Hermes 正在派子代理执行该节点，完成后会自动展示产出"}
                      </div>
                    )}

                    {/* 产出预览 */}
                    <StepOutputs outputs={step.outputs} />

                    {/* 节点思考过程（Hermes 执行该节点时的思路） */}
                    {step.reasoning && (
                      <details className={styles.reasonBlock}>
                        <summary>节点思考过程（Hermes 执行该节点时的思路）</summary>
                        <pre>{step.reasoning}</pre>
                      </details>
                    )}

                    {/* 执行者自评（原始，仅展示） */}
                    {step.selfReview && (step.status === "done" || step.status === "rejected") && (
                      <div className={styles.reviewNote}>
                        执行者自评：{step.selfReview.verdict === "pass" ? "通过" : "未达标"}
                        {step.selfReview.reason ? "： " + step.selfReview.reason : ""}
                      </div>
                    )}
                    {/* Hermes 评审/人工确认记录 */}
                    {step.review && (step.status === "done" || step.status === "rejected") && (
                      <div className={styles.reviewNote}>
                        {step.review.by === "user"
                          ? step.review.verdict === "pass"
                            ? "人工确认通过"
                            : "人工打回"
                          : step.selfReview
                            ? step.review.verdict === "pass"
                              ? "Hermes 评审通过"
                              : "Hermes 评审打回"
                            : step.review.verdict === "pass"
                              ? "自评通过"
                              : "自评未达标"}
                        {step.review.by === "user" ? "" : "（Hermes）"}
                        {step.review.reason ? "： " + step.review.reason : ""}
                      </div>
                    )}
                    {step.lastFeedback && (step.status === "rejected" || isReview) && (
                      <div className={styles.feedbackNote}>最近打回原因：{step.lastFeedback}</div>
                    )}

                    {/* 待确认操作区 */}
                    {isReview && canRunner && (
                      <div className={styles.reviewArea}>
                        {!reviewOpen ? (
                          <div className={styles.reviewActions}>
                            <Button size="small" type="primary" icon={<CheckCircleFilled />} loading={acting} onClick={() => void handleConfirm(step.index ?? -1)}>
                              通过
                            </Button>
                            <Button size="small" danger icon={<CloseCircleFilled />} disabled={acting} onClick={() => setRejectIndex(step.index ?? -1)}>
                              打回
                            </Button>
                            <span className={styles.reviewHint}>打回需填写原因，Hermes 将按原因自动重做该节点</span>
                          </div>
                        ) : (
                          <div className={styles.rejectPanel}>
                            <Input.TextArea
                              rows={2}
                              placeholder="请输入打回原因（必填）…"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              autoFocus
                            />
                            <div className={styles.rejectPanelActions}>
                              <Button size="small" onClick={() => { setRejectIndex(null); setRejectReason(""); }}>
                                取消
                              </Button>
                              <Button size="small" type="primary" danger loading={acting} onClick={() => void handleRejectOk(step.index ?? -1)}>
                                确认打回
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {isReview && !canRunner && (
                      <div className={styles.reviewNote}>该任务未关联团队，无法执行通过/打回</div>
                    )}
                    {isRejected && (
                      <div className={styles.rejectedNote}>节点多次打回仍未达标，需人工介入处理</div>
                    )}

                    {/* 旧版老板动作（我的任务源拆解 JSON：选题/终审） */}
                    {legacyAction && !isReview && (
                      <div className={styles.reviewActions} style={{ marginTop: 8 }}>
                        {legacyAction.kind === "select-topic" && (
                          <Button size="small" type="primary" onClick={() => setTopicOpen(true)}>{legacyAction.label || "去选择"}</Button>
                        )}
                        {legacyAction.kind === "approve" && (
                          <>
                            <Button size="small" type="primary" onClick={() => void handleApprove()}>通过</Button>
                            <Button size="small" danger onClick={() => setRejectOpen(true)}>打回</Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 执行方式切换（指定团队/自动匹配/指定Agent） */}
        <Modal
          title="执行方式"
          open={modeOpen}
          onOk={() => void handleModeSave()}
          onCancel={() => setModeOpen(false)}
          okText="保存"
          cancelText="取消"
          width={460}
          confirmLoading={taskBusy}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            <Radio.Group value={modeDraft} onChange={(e) => setModeDraft(e.target.value)}>
              <Space direction="vertical">
                <Radio value="team">指定团队：由团队成员分工执行</Radio>
                <Radio value="auto">自动匹配：Hermes 自行选择团队或子代理</Radio>
                <Radio value="agent">指定单个 Agent：由该 Agent 独立执行</Radio>
              </Space>
            </Radio.Group>
            {modeDraft === "team" && (
              <Select
                placeholder="选择执行团队"
                style={{ width: "100%" }}
                value={modeTeamId}
                onChange={setModeTeamId}
                options={teams.map((t) => ({ value: t.id, label: t.name }))}
                showSearch
                optionFilterProp="label"
              />
            )}
            {modeDraft === "agent" && (
              <Select
                placeholder="选择执行的 Agent"
                style={{ width: "100%" }}
                value={modeAgentId}
                onChange={setModeAgentId}
                options={agents.map((a) => ({ value: Number(a.id), label: a.name }))}
                showSearch
                optionFilterProp="label"
              />
            )}
          </div>
        </Modal>

        {/* 旧版弹窗（我的任务源） */}
        <Modal
          title="选择选题"
          open={topicOpen}
          onOk={() => void handleTopicOk()}
          onCancel={() => {
            setTopicOpen(false);
            setManualTopic("");
            setTopicValue(undefined);
          }}
          okText="确认选题"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <Select
              placeholder="从候选选题中选择"
              value={topicValue}
              onChange={setTopicValue}
              options={candidates.map((c) => ({ value: c, label: c }))}
              style={{ width: "100%" }}
              allowClear
              showSearch
            />
            <Input
              placeholder="或手动输入选题"
              value={manualTopic}
              onChange={(e) => setManualTopic(e.target.value)}
            />
            {candidates.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                任务输出暂无候选选题，可直接手动输入。
              </div>
            )}
          </div>
        </Modal>
        <Modal
          title="终审打回"
          open={rejectOpen}
          onOk={() => void handleReject()}
          onCancel={() => {
            setRejectOpen(false);
            setRejectComment("");
          }}
          okText="确认打回"
          okButtonProps={{ danger: true }}
        >
          <Input.TextArea
            rows={3}
            placeholder="请输入打回评语（必填）"
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            style={{ marginTop: 8 }}
          />
        </Modal>
      </div>
    </Spin>
  );
}
