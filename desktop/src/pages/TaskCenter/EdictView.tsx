/**
 * 三省六部 — 旨意看板视图（真实数据）
 * 数据源：主进程 edict-bridge IPC（edict:board / issue / transition / veto / approve / complete / block / run）
 * 推送：edict:board-updated / edict:task-updated（主进程 3s 轮询 tasks_source.json）
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer, Empty, Input, message, Modal, Select, Spin } from "antd";
import {
  isEdictAvailable,
  edictApprove,
  edictBlock,
  edictBoard,
  edictComplete,
  edictIssue,
  edictRun,
  edictTransition,
  edictVeto,
  onEdictBoardUpdated,
  onEdictTaskUpdated,
} from "@/api/edict-api";
import MediaRenderer from "@/components/MediaRenderer";
import {
  EDICT_COLUMNS,
  EDICT_STATE_LABEL,
  DEPT_AVATAR,
  formatRelativeTime,
  priorityLabel,
  toUiTask,
  type UiEdictTask,
} from "./edict-data";
import styles from "./edict.module.css";

const DEPT_COLORS: Record<string, string> = {
  户部: "#16a34a",
  兵部: "#1f6feb",
  工部: "#0ea5e9",
  礼部: "#8b5cf6",
  刑部: "#dc2626",
  吏部: "#1f6feb",
};

/** 详情抽屉动作弹窗类型 */
type PromptKind = "veto" | "block" | "complete" | null;

export default function EdictView({ orgFilter, onClearOrgFilter }: { orgFilter?: string | null; onClearOrgFilter?: () => void }) {
  const [available] = useState<boolean>(() => isEdictAvailable());
  const [issueText, setIssueText] = useState("");
  const [level, setLevel] = useState<"auto" | "light" | "heavy">("auto");
  const [tasks, setTasks] = useState<UiEdictTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UiEdictTask | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  /** 动作弹窗：kind + 输入 */
  const [prompt, setPrompt] = useState<{ kind: PromptKind; task: UiEdictTask; text: string; output: string } | null>(null);
  /** 完整下旨弹窗（标题/正文/分级/指定部门） */
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueBody, setIssueBody] = useState("");
  const [issueDept, setIssueDept] = useState<string>("");
  const [issuing, setIssuing] = useState(false);

  const loadBoard = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const board = await edictBoard();
      setTasks(board.tasks.map(toUiTask));
    } catch (err) {
      console.warn("[EdictView] 加载看板失败:", err);
      setTasks([]);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  /** P3：官署筛选（来自军机处总览抽屉「查看该官署任务」） */
  const filteredTasks = useMemo(
    () =>
      orgFilter
        ? tasks.filter((t) => t.assignee === orgFilter || t.org === orgFilter || t.dept === orgFilter)
        : tasks,
    [tasks, orgFilter]
  );

  /** 抽屉内任务实时跟随看板更新（运行中官署输出持续追加，无需重开抽屉） */
  useEffect(() => {
    setSelected((cur) => (cur ? tasks.find((t) => t.id === cur.id) ?? null : null));
  }, [tasks]);

  useEffect(() => {
    if (!available) {
      setLoading(false);
      return;
    }
    void loadBoard();
    const offBoard = onEdictBoardUpdated((b) => setTasks(b.tasks.map(toUiTask)));
    const offTask = onEdictTaskUpdated((t) => {
      setTasks((prev) => [toUiTask(t), ...prev.filter((x) => x.id !== t.id)]);
    });
    return () => {
      offBoard();
      offTask();
    };
  }, [available, loadBoard]);

  const handleIssue = async () => {
    const text = issueText.trim();
    if (!text) {
      void message.warning("请先输入旨意内容");
      return;
    }
    try {
      const priority = level === "heavy" ? "high" : level === "light" ? "low" : "medium";
      const r = await edictIssue({ title: text, priority });
      if (!r.ok) {
        void message.error("下旨失败：" + (r.error || "未知错误"));
        return;
      }
      setIssueText("");
      void message.success(`已传旨 ${r.data?.taskId}，太子已受理，中书省起草中`);
      void loadBoard(true);
    } catch (err) {
      void message.error("下旨失败：" + (err as Error).message);
    }
  };

  /** 完整下旨：标题 + 正文 + 分级 + 指定部门 */
  const handleIssueFull = async () => {
    const text = issueText.trim();
    if (text.length < 4) {
      void message.warning("旨意标题至少 4 字（建议 10-30 字中文概括）");
      return;
    }
    if (text.length > 80) {
      void message.warning("旨意标题请控制在 80 字以内");
      return;
    }
    setIssuing(true);
    try {
      const priority = level === "heavy" ? "high" : level === "light" ? "low" : "medium";
      const r = await edictIssue({
        title: text,
        body: issueBody.trim() || undefined,
        priority,
        dept: issueDept || undefined,
      });
      if (!r.ok) {
        void message.error("下旨失败：" + (r.error || "未知错误"));
        return;
      }
      setIssueText("");
      setIssueBody("");
      setIssueDept("");
      setIssueOpen(false);
      void message.success(`已传旨 ${r.data?.taskId}${issueDept ? "，指定" + issueDept + "领办" : ""}，中书省起草中`);
      void loadBoard(true);
    } catch (err) {
      void message.error("下旨失败：" + (err as Error).message);
    } finally {
      setIssuing(false);
    }
  };

  /* ===== 拖拽流转（非法流转由主进程状态机拦截并返回原因） ===== */
  const handleDrop = async (colKey: string, targetState: string) => {
    const id = draggingId;
    setDraggingId(null);
    setDragOverCol(null);
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.state === targetState) return;
    try {
      const r = await edictTransition(
        id,
        targetState,
        `拖拽流转：${EDICT_STATE_LABEL[task.state]} → ${EDICT_STATE_LABEL[targetState as keyof typeof EDICT_STATE_LABEL]}`,
      );
      if (!r.ok) {
        void message.error("⛔ 不符合三省六部规制：" + (r.error || "非法流转"));
        return;
      }
      void message.success(`${task.id} 已转至「${EDICT_STATE_LABEL[targetState as keyof typeof EDICT_STATE_LABEL]}」`);
      void loadBoard(true);
    } catch (err) {
      void message.error("流转失败：" + (err as Error).message);
    }
  };

  /* ===== 详情动作 ===== */
  const runAction = async (task: UiEdictTask) => {
    try {
      const r = await edictRun(task.id);
      if (!r.ok) {
        void message.error("编排执行失败：" + (r.error || "未知错误"));
        return;
      }
      void message.success(`${task.id} 已开始三省六部编排（Hermes 逐节点执行）`);
      void loadBoard(true);
    } catch (err) {
      void message.error("编排执行失败：" + (err as Error).message);
    }
  };

  const approveAction = async (task: UiEdictTask) => {
    try {
      const r = await edictApprove(task.id);
      if (!r.ok) {
        void message.error("准奏失败：" + (r.error || "未知错误"));
        return;
      }
      void message.success(`${task.id} 已准奏，转尚书省派发`);
      setSelected(null);
      void loadBoard(true);
    } catch (err) {
      void message.error("准奏失败：" + (err as Error).message);
    }
  };

  const submitPrompt = async () => {
    if (!prompt) return;
    const { kind, task, text, output } = prompt;
    setPrompt(null);
    try {
      let r;
      if (kind === "veto") {
        if (!text.trim()) {
          void message.warning("封驳必须填写原因");
          return;
        }
        r = await edictVeto(task.id, text.trim());
        r.ok && void message.success(`${task.id} 已封驳回中书省重拟`);
      } else if (kind === "block") {
        if (!text.trim()) {
          void message.warning("阻塞必须填写原因");
          return;
        }
        r = await edictBlock(task.id, text.trim());
        r.ok && void message.success(`${task.id} 已标记阻塞`);
      } else if (kind === "complete") {
        r = await edictComplete(task.id, output.trim(), text.trim());
        r.ok && void message.success(`${task.id} 已回奏完成`);
      } else {
        return;
      }
      if (r && !r.ok) void message.error("操作失败：" + (r.error || "未知错误"));
      else {
        setSelected(null);
        void loadBoard(true);
      }
    } catch (err) {
      void message.error("操作失败：" + (err as Error).message);
    }
  };

  /* ===== 奏折阁：最近完成任务的五阶段时间线 ===== */
  const doneTimelines = useMemo(() => {
    const done = tasks
      .filter((t) => t.state === "Done" || t.state === "Cancelled")
      .slice(0, 3);
    const stageOf = (task: UiEdictTask, keys: string[]): string | null => {
      for (const f of task.flowLog) {
        if (keys.some((k) => f.remark?.includes(k) || f.from?.includes(k))) return f.remark || f.from;
      }
      return null;
    };
    return done.map((t) => {
      const stages = [
        { name: "呈报", meta: stageOf(t, ["下旨", "太子", "中书"]) },
        { name: "审议", meta: stageOf(t, ["门下", "准奏", "封驳"]) },
        { name: "派发", meta: stageOf(t, ["尚书", "派单", "派发"]) },
        { name: "执行", meta: stageOf(t, ["执行", "完成"]) },
        { name: "回奏", meta: stageOf(t, ["回奏", "复核"]) },
      ];
      return { id: t.id, title: t.title, stages };
    });
  }, [tasks]);

  if (!available) {
    return (
      <div className={styles.edictRoot}>
        <Empty description="三省六部看板需要桌面端主进程（electronAPI.edict 未注入，请使用桌面版）" />
      </div>
    );
  }

  return (
    <div className={styles.edictRoot}>
      {/* P3：官署筛选横幅（从军机处总览抽屉跳转而来） */}
      {orgFilter && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 10, borderRadius: 10, background: "var(--color-bg-spotlight)", border: "1px dashed var(--color-border, #e5e7eb)" }}>
          <span style={{ fontSize: 15 }}>🎯</span>
          <span style={{ fontSize: 13, flex: 1 }}>
            正在查看 <b>{orgFilter}</b> 的任务（{filteredTasks.length} 道）
          </span>
          <button
            className={styles.issueBtnOutline}
            style={{ padding: "3px 10px", fontSize: 12 }}
            onClick={() => onClearOrgFilter?.()}
          >
            清除筛选
          </button>
        </div>
      )}

      {/* 下旨栏 */}
      <div className={styles.issueBar}>
        <Input
          className={styles.issueInput}
          placeholder="下旨：例如「传旨：开发积分商城会员体系，需财务与研发协同」"
          value={issueText}
          onChange={(e) => setIssueText(e.target.value)}
          onPressEnter={handleIssue}
          variant="borderless"
        />
        <div className={styles.issueSeg}>
          {(["auto", "light", "heavy"] as const).map((l) => (
            <button
              key={l}
              className={`${styles.issueSegItem} ${level === l ? styles.issueSegItemOn : ""}`}
              onClick={() => setLevel(l)}
            >
              {l === "auto" ? "自动" : l === "light" ? "⚡ 轻" : "📜 重"}
            </button>
          ))}
        </div>
        <button className={styles.issueBtnOutline} onClick={() => setIssueOpen(true)}>⚜ 详细下旨</button>
        <button className={styles.issueBtn} onClick={handleIssue}>下旨</button>
      </div>

      {/* 看板 */}
      <Spin spinning={loading}>
        <div className={styles.board}>
          {EDICT_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => col.states.includes(t.state));
            const isOver = dragOverCol === col.key;
            return (
              <div
                key={col.key}
                className={[
                  styles.boardCol,
                  col.tone === "royal" ? styles.colRoyal : "",
                  col.tone === "audit" ? styles.colAudit : "",
                  col.tone === "exec" ? styles.colExec : "",
                  col.tone === "done" ? styles.colDone : "",
                  isOver ? styles.colDragOver : "",
                ].filter(Boolean).join(" ")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.key);
                }}
                onDragLeave={() => setDragOverCol((p) => (p === col.key ? null : p))}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDrop(col.key, col.states[0]);
                }}
              >
                <div className={styles.colHead}>
                  {col.icon} {col.title}
                  <span className={styles.colCount}>{colTasks.length}</span>
                </div>
                <div className={styles.colBody}>
                  {colTasks.length === 0 && (
                    <div className={styles.colEmpty}>
                      {col.key === "shangshu" ? "待派发" : "暂无"}
                    </div>
                  )}
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(t.id);
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverCol(null);
                      }}
                      className={[
                        styles.taskCard,
                        t.rejected ? styles.taskCardRejected : "",
                        draggingId === t.id ? styles.taskCardDragging : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => setSelected(t)}
                    >
                      <div className={styles.taskCardTitle}>{t.title}</div>
                      <div className={styles.taskCardMeta}>
                        {t.level === "heavy" ? (
                          <span className={`${styles.tag} ${styles.tagHeavy}`}>重</span>
                        ) : (
                          <span className={`${styles.tag} ${styles.tagLight}`}>轻</span>
                        )}
                        <span className={`${styles.tag} ${styles.tagProfile}`}>{t.assignee}</span>
                        {t.priority === "high" && (
                          <span className={styles.tagPriorityHigh} style={{ fontSize: 10 }}>高</span>
                        )}
                      </div>
                      <div className={styles.taskCardRow}>
                        {t.dept && (
                          <span
                            className={styles.deptAvatar}
                            style={{ background: DEPT_COLORS[t.dept] ?? "#1f6feb" }}
                          >
                            {DEPT_AVATAR[t.dept] ?? t.dept[0]}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                          {formatRelativeTime(t.updatedAt)}
                        </span>
                        {t.rejected && (
                          <span className={`${styles.tag} ${styles.tagReject}`}>封驳</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Spin>

      {/* 奏折阁时间线 */}
      <div className={styles.timelinePanel}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            📜 奏折阁
            <span className={styles.panelSub}>最近回奏旨意的五阶段时间线</span>
          </div>
          <div className={styles.panelBody}>
            {doneTimelines.length === 0 ? (
              <Empty description="暂无回奏记录，完成的任务会出现在这里" />
            ) : (
              doneTimelines.map((tl) => (
                <div key={tl.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    {tl.id} · {tl.title}
                  </div>
                  <div className={styles.timeline}>
                    {tl.stages.map((s, i) => {
                      const done = !!s.meta;
                      return (
                        <div
                          key={s.name}
                          className={[
                            styles.tlStep,
                            done ? styles.tlDone : "",
                            !done && i === 0 ? "" : "",
                          ].filter(Boolean).join(" ")}
                        >
                          {i < 4 && <div className={styles.tlLine} />}
                          <div className={styles.tlDot} />
                          <div className={styles.tlName}>{s.name}</div>
                          <div className={styles.tlMeta}>{done ? s.meta : "—"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 任务详情抽屉 */}
      <Drawer
        title={`📜 ${selected?.id ?? ""} · 旨意详情`}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={440}
      >
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{selected.title}</div>
              {selected.desc && (
                <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                  {selected.desc}
                </div>
              )}
            </div>
            {selected.rejected && (
              <div
                style={{
                  background: "var(--color-error-light)",
                  border: "1px solid rgba(220,38,38,0.35)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12,
                  color: "var(--color-error)",
                  lineHeight: 1.6,
                }}
              >
                🔨 门下封驳：{selected.rejectReason}
              </div>
            )}
            {selected.block && (
              <div
                style={{
                  background: "var(--color-error-light)",
                  border: "1px solid rgba(220,38,38,0.35)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12,
                  color: "var(--color-error)",
                  lineHeight: 1.6,
                }}
              >
                ⛔ 阻塞原因：{selected.block}
              </div>
            )}
            {selected.output && (
              <div
                style={{
                  background: "var(--color-bg-spotlight)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12,
                  lineHeight: 1.7,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>📦 产出（完整交付）</div>
                <MediaRenderer content={selected.output} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className={`${styles.tag} ${selected.level === "heavy" ? styles.tagHeavy : styles.tagLight}`}>
                {selected.level === "heavy" ? "重" : "轻"}
              </span>
              <span className={`${styles.tag} ${styles.tagProfile}`}>{selected.assignee}</span>
              <span className={`${styles.tag} ${styles.tagProfile}`}>{EDICT_STATE_LABEL[selected.state]}</span>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", alignSelf: "center" }}>
                优先级：{priorityLabel(selected.priority)}
              </span>
            </div>

            {/* 动作区 */}
            {!["Done", "Cancelled"].includes(selected.state) && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selected.state !== "Blocked" && (
                  <button className={styles.issueBtn} style={{ flex: 1 }} onClick={() => void runAction(selected)}>
                    ▶ 执行编排
                  </button>
                )}
                {selected.state === "Menxia" && (
                  <>
                    <button className={styles.issueBtn} style={{ flex: 1 }} onClick={() => void approveAction(selected)}>
                      ✅ 准奏
                    </button>
                    <button
                      className={styles.issueBtn}
                      style={{ flex: 1, background: "#dc2626" }}
                      onClick={() => setPrompt({ kind: "veto", task: selected, text: "", output: "" })}
                    >
                      🔨 封驳
                    </button>
                  </>
                )}
                {selected.state === "Blocked" ? (
                  <button
                    className={styles.issueBtn}
                    style={{ flex: 1 }}
                    onClick={() => {
                      void (async () => {
                        const r = await edictTransition(selected.id, "Zhongshu", "解除阻塞，重新推进");
                        if (!r.ok) void message.error("解阻失败：" + (r.error || ""));
                        else {
                          void message.success("已解除阻塞，转中书省重新推进");
                          setSelected(null);
                          void loadBoard(true);
                        }
                      })();
                    }}
                  >
                    🔓 解除阻塞
                  </button>
                ) : (
                  <button
                    className={styles.issueBtn}
                    style={{ flex: 1, background: "#d97706" }}
                    onClick={() => setPrompt({ kind: "block", task: selected, text: "", output: "" })}
                  >
                    ⛔ 阻塞
                  </button>
                )}
                {(selected.state === "Doing" || selected.state === "Review") && (
                  <button
                    className={styles.issueBtn}
                    style={{ flex: 1, background: "#16a34a" }}
                    onClick={() => setPrompt({ kind: "complete", task: selected, text: "", output: "" })}
                  >
                    ✅ 完成回奏
                  </button>
                )}
              </div>
            )}

            {/* 官署输出（完整内容：文案直出，图片/视频预览，不显示链接） */}
            {selected.officialOutputs.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  官署输出
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-tertiary)" }}>
                    （完整内容 · 共 {selected.officialOutputs.length} 条）
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selected.officialOutputs.map((o, i) => (
                    <div
                      key={i}
                      style={{
                        border: "1px solid var(--color-border-secondary)",
                        borderRadius: 8,
                        padding: 10,
                        background: "var(--color-bg-subtle, rgba(0,0,0,0.02))",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{o.agentLabel || o.agent}</span>
                        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                          {o.at ? new Date(o.at).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--color-text-secondary)", wordBreak: "break-word" }}>
                        <MediaRenderer content={o.output} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 流转记录 */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>流转记录（flow_log）</div>
              <div className={styles.detailFlowLog}>
                {selected.flowLog.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>暂无流转记录</div>
                )}
                {selected.flowLog.map((f, i) => (
                  <div key={i} className={styles.flowItem}>
                    <span className={styles.flowTime}>
                      {f.at ? new Date(f.at).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                    <span className={styles.flowNote}>
                      <b>{f.from}</b> → <b>{f.to}</b>：{f.remark}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 进展记录 */}
            {selected.progressLog.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>进展（progress_log）</div>
                <div className={styles.detailFlowLog}>
                  {selected.progressLog.map((p, i) => (
                    <div key={i} className={styles.flowItem}>
                      <span className={styles.flowTime}>
                        {new Date(p.at).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={styles.flowNote}>
                        <b>{p.agentLabel || p.agent}</b>：{p.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 子任务 */}
            {selected.todos.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>子任务（todos）</div>
                <div className={styles.detailFlowLog}>
                  {selected.todos.map((todo) => (
                    <div key={todo.id} className={styles.flowItem}>
                      <span
                        style={{
                          fontSize: 11,
                          color:
                            todo.status === "completed"
                              ? "var(--color-success)"
                              : todo.status === "in-progress"
                                ? "var(--color-brand)"
                                : "var(--color-text-tertiary)",
                        }}
                      >
                        {todo.status === "completed" ? "✅" : todo.status === "in-progress" ? "🔄" : "⬜"}
                      </span>
                      <span className={styles.flowNote}>
                        {todo.title}
                        {todo.detail && <span style={{ color: "var(--color-text-tertiary)" }}> — {todo.detail}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* 完整下旨弹窗（标题/正文/分级/指定部门） */}
      <Modal
        title="⚜ 传旨（三省六部）"
        open={issueOpen}
        onOk={() => void handleIssueFull()}
        onCancel={() => setIssueOpen(false)}
        okText="传旨"
        cancelText="取消"
        confirmLoading={issuing}
        width={540}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 6 }}>
              旨意标题（10-30 字中文概括，必填）
            </div>
            <Input
              placeholder="例如：开发积分商城会员体系，需财务与研发协同"
              value={issueText}
              maxLength={80}
              onChange={(e) => setIssueText(e.target.value)}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 6 }}>旨意正文（可选）</div>
            <Input.TextArea
              placeholder="补充背景、目标、约束、验收标准等细节"
              value={issueBody}
              rows={4}
              onChange={(e) => setIssueBody(e.target.value)}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 6 }}>分级</div>
            <div className={styles.issueSeg}>
              {(["auto", "light", "heavy"] as const).map((l) => (
                <button
                  key={l}
                  className={`${styles.issueSegItem} ${level === l ? styles.issueSegItemOn : ""}`}
                  onClick={() => setLevel(l)}
                >
                  {l === "auto" ? "自动" : l === "light" ? "⚡ 轻" : "📜 重"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 6 }}>
              指定部门（快捷入口，可选；任务仍先经中书省起草）
            </div>
            <div className={styles.deptChips}>
              {["", "礼部", "户部", "吏部", "兵部", "刑部", "工部"].map((d) => (
                <button
                  key={d || "auto"}
                  className={`${styles.deptChip} ${issueDept === d ? styles.deptChipOn : ""}`}
                  onClick={() => setIssueDept(d)}
                >
                  {d || "自动分拣"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* 动作输入弹窗 */}
      <Modal
        title={
          prompt?.kind === "veto"
            ? "🔨 封驳（打回中书省重拟）"
            : prompt?.kind === "block"
              ? "⛔ 标记阻塞"
              : prompt?.kind === "complete"
                ? "✅ 完成回奏"
                : ""
        }
        open={!!prompt}
        onOk={() => void submitPrompt()}
        onCancel={() => setPrompt(null)}
        okText={prompt?.kind === "complete" ? "提交回奏" : "确认"}
        cancelText="取消"
      >
        {prompt && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {prompt.task.id} · {prompt.task.title}
            </span>
            {prompt.kind === "complete" ? (
              <>
                <Input.TextArea
                  placeholder="回奏摘要（summary）"
                  value={prompt.text}
                  onChange={(e) => setPrompt({ ...prompt, text: e.target.value })}
                  rows={2}
                />
                <Input.TextArea
                  placeholder="产出说明（output，可选）"
                  value={prompt.output}
                  onChange={(e) => setPrompt({ ...prompt, output: e.target.value })}
                  rows={3}
                />
              </>
            ) : (
              <Input.TextArea
                placeholder={prompt.kind === "veto" ? "封驳原因（按律驳回重拟）" : "阻塞原因"}
                value={prompt.text}
                onChange={(e) => setPrompt({ ...prompt, text: e.target.value })}
                rows={3}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
