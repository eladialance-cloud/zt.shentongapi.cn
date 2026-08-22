// 任务流水线视图 v2 —— 逐步执行轨道
// 团队任务：Hermes 编排 result.steps（子代理节点）逐个展示：执行中/待确认/通过/打回重做/超限
// 产出内容（文字/图片/视频）内联预览；通过/打回走逐步编排 IPC；自动确认（自评）开关可中途切换
// 我的任务源：保留旧版 outputs 拆解 JSON 流水线与老板动作（选题/终审），不回归
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Input, message, Modal, Select, Spin, Switch, Tooltip } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  PlayCircleFilled,
  RedoOutlined,
  RobotOutlined,
  ThunderboltFilled,
} from "@ant-design/icons";
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
  nativeTaskId,
  rejectStep,
  setAutoConfirm,
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
  const [actingIndex, setActingIndex] = useState<number | null>(null);
  const [rejectIndex, setRejectIndex] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // 自动确认（自评）：按任务记忆，默认开启
  const [autoConfirm, setAutoConfirmState] = useState<boolean>(() => {
    try { return localStorage.getItem("tc-auto:" + task.key) !== "0"; } catch { return true; }
  });
  // 旧版老板动作弹窗（我的任务源 选题/终审）
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicValue, setTopicValue] = useState<string | undefined>(undefined);
  const [manualTopic, setManualTopic] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  const taskId = useMemo(() => nativeTaskId(task.key), [task.key]);
  const isTeam = task.source === "team";
  const canRunner = isTeam && teamId != null && taskId != null;
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

  /** 步骤：团队任务优先 result.steps（runner 逐步执行）；否则旧版推导/拆解 */
  const steps = useMemo(() => {
    if (isTeam) {
      const teamSteps = parseTeamSteps(task.result);
      if (teamSteps.length > 0) return teamSteps;
    }
    return parsePipeline(task, outputs);
  }, [isTeam, task, outputs]);
  const candidates = useMemo(() => topicCandidates(outputs), [outputs]);

  /** 切换自动确认（自评）：运行中任务实时通知主进程 */
  const handleToggleAuto = (v: boolean) => {
    setAutoConfirmState(v);
    try { localStorage.setItem("tc-auto:" + task.key, v ? "1" : "0"); } catch { /* ignore */ }
    if (canRunner && task.status === "running") {
      void setAutoConfirm(token ?? "", taskId as number, v);
    }
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
              <span>{task.source === "team" ? "团队任务" : task.source === "task" ? "我的任务" : "Hermes 调用"}</span>
              {task.assignee && <span>负责人：{task.assignee}</span>}
              <span>创建于 {formatTime(task.createdAt)}</span>
              {task.finishedAt && <span>完成于 {formatTime(task.finishedAt)}</span>}
            </div>
          </div>
          <div className={styles.taskHeadActions}>
            {canRunner && task.status === "running" && (
              <div className={styles.autoSwitch}>
                <ThunderboltFilled className={styles.autoSwitchIcon} />
                <span>自动确认（Hermes 自评）</span>
                <Switch size="small" checked={autoConfirm} onChange={handleToggleAuto} />
              </div>
            )}
            {canRunner && (task.status === "todo" || task.status === "failed") && (
              <Tooltip title={!token ? "未登录" : undefined}>
                <Button
                  type="primary"
                  icon={task.status === "failed" ? <RedoOutlined /> : <PlayCircleFilled />}
                  loading={submitting}
                  disabled={!token}
                  onClick={() => void handleStart()}
                >
                  {task.status === "failed" ? "重试" : "开始任务"}
                </Button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ===== 步骤轨道 ===== */}
        {steps.length === 0 ? (
          <Empty className={styles.flowEmpty} description="暂无任务步骤" />
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
                        Hermes 正在派子代理执行该节点，完成后会自动展示产出
                      </div>
                    )}

                    {/* 产出预览 */}
                    <StepOutputs outputs={step.outputs} />

                    {/* 自评/确认记录 */}
                    {step.review && (step.status === "done" || step.status === "rejected") && (
                      <div className={styles.reviewNote}>
                        {step.review.verdict === "pass" ? "自评通过" : "自评未达标"}
                        {step.review.by === "user" ? "（人工确认）" : step.review.by === "hermes" ? "（Hermes 自评）" : ""}
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
