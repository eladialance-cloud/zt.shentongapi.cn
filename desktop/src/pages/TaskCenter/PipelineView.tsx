// 任务流水线视图：Hermes 拆解动态步骤条 + 老板动作（选题 / 终审）
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Button, Empty, Input, message, Modal, Select, Spin, Tag, Tooltip } from "antd";
import * as teamApi from "@/api/team-api";
import { httpClient } from "@/api/http-client";
import type { UpdateTeamTaskDto } from "@/types/team";
import type { UnifiedTask } from "./unified";
import {
  parsePipeline,
  parseTeamSteps,
  pipelineActions,
  taskQuickAction,
  topicCandidates,
  type PipelineStep,
  type TaskOutputItem,
} from "./pipeline";
import styles from "./styles.module.css";

interface PipelineViewProps {
  task: UnifiedTask;
  /** 团队 ID：老板动作（选题/终审）PATCH /teams/:teamId/tasks/:taskId 需要；无则动作禁用 */
  teamId?: number;
  /** 老板动作成功后回调（刷新任务列表） */
  onUpdated?: () => void;
}

/** 步骤状态 Tag 文案与颜色 */
const STEP_STATUS_TAG: Record<PipelineStep["status"], { label: string; color: string }> = {
  done: { label: "完成", color: "success" },
  active: { label: "进行中", color: "processing" },
  waiting: { label: "排队", color: "default" },
};

/** 步骤序号圆点样式（done/active 着色，waiting 灰底） */
function stepCircleStyle(status: PipelineStep["status"]): CSSProperties {
  const base: CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  };
  if (status === "done") {
    return { ...base, background: "var(--color-success)", color: "#fff" };
  }
  if (status === "active") {
    return { ...base, background: "var(--color-primary)", color: "#fff" };
  }
  return {
    ...base,
    background: "var(--color-bg-hover)",
    color: "var(--color-text-tertiary)",
    border: "1px solid var(--color-border)",
  };
}

/** 从统一任务 key（如 "task:12"）解析原生任务 ID */
function nativeTaskId(key: string): number | null {
  const idx = key.indexOf(":");
  if (idx < 0) return null;
  const id = Number(key.slice(idx + 1));
  return Number.isFinite(id) ? id : null;
}

export default function PipelineView({ task, teamId, onUpdated }: PipelineViewProps) {
  const [outputs, setOutputs] = useState<TaskOutputItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicValue, setTopicValue] = useState<string | undefined>(undefined);
  const [manualTopic, setManualTopic] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  const taskId = useMemo(() => nativeTaskId(task.key), [task.key]);
  const canAct = teamId != null && taskId != null && !updating;

  /** 读取 Hermes 拆解输出：仅「我的任务」源有 GET /tasks/:id/outputs；其余源回退按状态推导单步（不白屏） */
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
      console.warn("[PipelineView] 读取任务 " + taskId + " 输出失败，按状态推导单步:", err);
      setOutputs([]);
    } finally {
      setLoading(false);
    }
  }, [task.source, taskId]);

  useEffect(() => {
    void loadOutputs();
  }, [loadOutputs]);

  /** team 源：优先展示 Hermes 编排步骤（result.steps，含执行成员）；无则按状态推导单步 */
  const steps = useMemo(() => {
    if (task.source === "team") {
      const teamSteps = parseTeamSteps(task.result);
      if (teamSteps.length > 0) return teamSteps;
    }
    return parsePipeline(task, outputs);
  }, [task, outputs]);
  const candidates = useMemo(() => topicCandidates(outputs), [outputs]);
  const quickAction = useMemo(() => taskQuickAction(task), [task]);

  /** 老板动作统一入口：PATCH /teams/:teamId/tasks/:taskId 更新状态 + 写备注，成功后刷新列表 */
  const patchTask = useCallback(
    async (payload: UpdateTeamTaskDto, successText: string) => {
      if (teamId == null || taskId == null) return;
      setUpdating(true);
      try {
        await teamApi.updateTask(teamId, taskId, payload);
        message.success(successText);
        onUpdated?.();
      } catch (err) {
        console.error("[PipelineView] 更新任务失败:", err);
        message.error("操作失败：" + ((err as Error).message || "未知错误"));
      } finally {
        setUpdating(false);
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
      {
        status: "in_progress",
        description: "[老板] 已选选题：" + topic + "\nselected_topic: " + topic,
      },
      "选题已确认，任务已推进"
    );
    setTopicOpen(false);
    setManualTopic("");
    setTopicValue(undefined);
  };

  const handleApprove = () => {
    Modal.confirm({
      title: "终审通过",
      content: "确认通过「" + task.title + "」并完成任务？",
      okText: "通过",
      cancelText: "取消",
      onOk: () =>
        patchTask(
          { status: "completed", description: "[老板] 终审通过\napproved: true" },
          "终审已通过"
        ),
    });
  };

  const handleRejectOk = async () => {
    const comment = rejectComment.trim();
    if (!comment) {
      message.warning("请输入打回评语");
      return;
    }
    await patchTask(
      {
        status: "pending",
        description: "[老板] 终审打回：" + comment + "\nrejected: " + comment,
      },
      "已打回，任务退回待办"
    );
    setRejectOpen(false);
    setRejectComment("");
  };

  /** 任务级快速操作：待办 → 开始执行；失败 → 重试（PATCH 状态流转 + 刷新列表） */
  const handleQuickAction = useCallback(async () => {
    if (!quickAction) return;
    await patchTask(
      { status: quickAction.status, description: quickAction.description },
      quickAction.successText
    );
  }, [quickAction, patchTask]);

  return (
    <Spin spinning={loading}>
      {steps.length === 0 ? (
        <Empty className={styles.flowEmpty} description="暂无流水线数据" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {steps.map((step, index) => {
            const action = pipelineActions(task, step);
            const terminal = step.step === "执行失败" || step.step === "已取消";
            const tag = terminal
              ? { label: "已结束", color: "default" }
              : STEP_STATUS_TAG[step.status];
            const isLast = index === steps.length - 1;
            return (
              <div
                key={step.step + "-" + index}
                style={{ display: "flex", alignItems: "stretch", gap: 12 }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={stepCircleStyle(step.status)}>{index + 1}</div>
                  {!isLast && (
                    <div
                      style={{
                        width: 2,
                        flex: 1,
                        minHeight: 16,
                        background: "var(--color-border)",
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {step.step}
                    </span>
                    {(step.agentName || step.assigneeName) && (
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                        负责：{step.agentName || step.assigneeName}
                      </span>
                    )}
                    {!step.agentName && !step.assigneeName && task.source === "team" && (
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                        负责：子代理
                      </span>
                    )}
                    <Tag color={tag.color}>{tag.label}</Tag>
                  </div>
                  {action && (
                    <Tooltip
                      title={!canAct && !updating ? "该任务未关联团队任务，无法执行老板操作" : undefined}
                    >
                      <div style={{ display: "inline-flex", gap: 8, marginTop: 8 }}>
                        {action.kind === "select-topic" && (
                          <Button
                            size="small"
                            type="primary"
                            disabled={!canAct}
                            onClick={() => setTopicOpen(true)}
                          >
                            {action.label || "去选择"}
                          </Button>
                        )}
                        {action.kind === "approve" && (
                          <>
                            <Button
                              size="small"
                              type="primary"
                              disabled={!canAct}
                              onClick={handleApprove}
                            >
                              通过
                            </Button>
                            <Button
                              size="small"
                              danger
                              disabled={!canAct}
                              onClick={() => setRejectOpen(true)}
                            >
                              打回
                            </Button>
                          </>
                        )}
                      </div>
                    </Tooltip>
                  )}
                  {!action && quickAction && (
                    <Tooltip
                      title={!canAct && !updating ? "该任务未关联团队任务，无法执行操作" : undefined}
                    >
                      <div style={{ display: "inline-flex", gap: 8, marginTop: 8 }}>
                        <Button
                          size="small"
                          type="primary"
                          disabled={!canAct}
                          onClick={() => void handleQuickAction()}
                        >
                          {quickAction.label}
                        </Button>
                      </div>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
        confirmLoading={updating}
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
        onOk={() => void handleRejectOk()}
        onCancel={() => {
          setRejectOpen(false);
          setRejectComment("");
        }}
        okText="确认打回"
        okButtonProps={{ danger: true }}
        confirmLoading={updating}
      >
        <Input.TextArea
          rows={3}
          placeholder="请输入打回评语（必填）"
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </Spin>
  );
}
