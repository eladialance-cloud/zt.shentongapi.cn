/**
 * 省部调度（edict 原版 MonitorPanel 照搬 + 深瞳 IPC 适配）
 * 数据源：edict:agents-status（真实 Hermes 运行时状态 + 看板活跃聚合）+ edict:agent-wake 唤醒
 * P2：任务卡可点击 → 操作弹窗（重试/推进/升级/解阻/取消）+ 官署心跳展示
 * P5：结果回传通知（飞书/企微 webhook）配置入口
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Input, Modal, Switch } from "antd";
import {
  edictAdvance,
  edictAgentsStatus,
  edictAgentWake,
  edictBoard,
  edictCancel,
  edictEscalate,
  edictNotifyConfig,
  edictRetry,
  edictSaveNotifyConfig,
  edictTestNotify,
  edictUnblock,
  isEdictAvailable,
} from "@/api/edict-api";
import type { EdictAgentsStatusData, EdictNotifyConfig, EdictTask } from "@shared/edict-types";
import { DEPTS, STATE_LABEL, toast, timeAgo } from "./panels-data";

/** 心跳新鲜度阈值：5 分钟内视为活跃心跳 */
const HEARTBEAT_FRESH_MS = 5 * 60_000;

function isHeartbeatFresh(lastActive?: string): boolean {
  if (!lastActive) return false;
  const t = new Date(lastActive).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < HEARTBEAT_FRESH_MS;
}

export default function MonitorPanel({ onNavigateBoard }: { onNavigateBoard?: (orgName?: string) => void }) {
  const [status, setStatus] = useState<EdictAgentsStatusData | null>(null);
  const [tasks, setTasks] = useState<EdictTask[]>([]);
  const [waking, setWaking] = useState<Record<string, boolean>>({});
  const [available] = useState<boolean>(() => isEdictAvailable());
  /** P2：任务操作弹窗 */
  const [modalTask, setModalTask] = useState<EdictTask | null>(null);
  const [acting, setActing] = useState<Record<string, boolean>>({});
  /** P5：通知配置弹窗 */
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyCfg, setNotifyCfg] = useState<EdictNotifyConfig>({ enabled: false, feishuWebhook: "", wecomWebhook: "" });
  const [notifySaving, setNotifySaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [st, board] = await Promise.all([edictAgentsStatus(), edictBoard()]);
      setStatus(st);
      setTasks(board.tasks || []);
    } catch (err) {
      console.warn("[MonitorPanel] 加载失败:", err);
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    void loadAll();
    const timer = setInterval(() => void loadAll(), 30000);
    return () => clearInterval(timer);
  }, [available, loadAll]);

  const handleWake = async (agentId: string) => {
    setWaking((p) => ({ ...p, [agentId]: true }));
    try {
      const r = await edictAgentWake(agentId);
      toast(r.ok ? String(r.data || "唤醒指令已发出") : r.error || "唤醒失败", r.ok ? "ok" : "err");
      if (r.ok) setTimeout(() => void loadAll(), 2000);
    } catch {
      toast("唤醒失败", "err");
    } finally {
      setWaking((p) => ({ ...p, [agentId]: false }));
    }
  };

  const handleWakeAll = async () => {
    if (!status) return;
    const toWake = status.agents.filter((a) => a.id !== "main" && (a.status === "unconfigured" || a.status === "offline"));
    if (!toWake.length) {
      toast("所有官署均已就绪");
      return;
    }
    toast(`正在配置 ${toWake.length} 个官署...`);
    for (const a of toWake) {
      await handleWake(a.id);
    }
    setTimeout(() => void loadAll(), 3000);
  };

  /* ===== P2 任务操作 ===== */
  const runAction = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, successText: string) => {
    if (!modalTask) return;
    setActing((p) => ({ ...p, [key]: true }));
    try {
      const r = await fn();
      toast(r.ok ? successText : r.error || "操作失败", r.ok ? "ok" : "err");
      if (r.ok) {
        setModalTask(null);
        void loadAll();
      } else {
        // 失败保留弹窗，刷新看板便于查看最新状态
        void loadAll();
      }
    } catch (err) {
      toast("操作失败：" + (err as Error).message, "err");
    } finally {
      setActing((p) => ({ ...p, [key]: false }));
    }
  };

  /* ===== P5 通知配置 ===== */
  const openNotify = async () => {
    try {
      const cfg = await edictNotifyConfig();
      setNotifyCfg(cfg);
      setNotifyOpen(true);
    } catch {
      setNotifyCfg({ enabled: false, feishuWebhook: "", wecomWebhook: "" });
      setNotifyOpen(true);
    }
  };
  const saveNotify = async () => {
    setNotifySaving(true);
    try {
      const r = await edictSaveNotifyConfig(notifyCfg);
      toast(r.ok ? "通知配置已保存" : r.error || "保存失败", r.ok ? "ok" : "err");
      if (r.ok) setNotifyOpen(false);
    } catch (err) {
      toast("保存失败：" + (err as Error).message, "err");
    } finally {
      setNotifySaving(false);
    }
  };
  const testNotify = async () => {
    try {
      const r = await edictTestNotify();
      toast(r.ok ? String(r.data || "测试消息已发送") : r.error || "发送失败", r.ok ? "ok" : "err");
    } catch (err) {
      toast("发送失败：" + (err as Error).message, "err");
    }
  };

  const activeTasks = tasks.filter((t) => !["Done", "Cancelled"].includes(t.state));

  const agents = (status?.agents || []).filter((a) => a.id !== "main");
  const running = agents.filter((a) => a.status === "running").length;
  const idle = agents.filter((a) => a.status === "idle").length;
  const offline = agents.filter((a) => a.status === "offline").length;
  const unconf = agents.filter((a) => a.status === "unconfigured").length;
  const gw = status?.gateway;
  const gwCls = gw?.probe ? "ok" : gw?.alive ? "warn" : "err";

  return (
    <div className="edictPanels">
      {/* Agent 在线状态 */}
      {status && status.ok && (
        <div className="as-panel">
          <div className="as-header">
            <span className="as-title">🔌 官署在线状态</span>
            <span className={`as-gw ${gwCls}`}>
              Hermes: {gw?.status || "未知"}
            </span>
            <button className="btn-refresh" onClick={() => void loadAll()} style={{ marginLeft: 8 }}>
              🔄 刷新
            </button>
            {(offline + unconf > 0) && (
              <button className="btn-refresh" onClick={handleWakeAll} style={{ marginLeft: 4, borderColor: "var(--warn)", color: "var(--warn)" }}>
                ⚡ 全部配置
              </button>
            )}
            <button className="btn-refresh" onClick={() => void openNotify()} style={{ marginLeft: 4 }}>
              🔔 结果通知
            </button>
          </div>
          <div className="as-grid">
            {agents.map((a) => {
              const canWake = a.status === "unconfigured";
              const fresh = isHeartbeatFresh(a.lastActive);
              return (
                <div key={a.id} className={`as-card`} title={`${a.role} · ${a.statusLabel}`}>
                  <div className={`as-dot ${a.status}`} />
                  <div style={{ fontSize: 22 }}>{a.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{a.label}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{a.role}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{a.statusLabel}</div>
                  {a.tasksActive > 0 && (
                    <div style={{ fontSize: 10, color: "var(--acc)" }}>在办 {a.tasksActive} 项</div>
                  )}
                  {a.lastActive ? (
                    <div style={{ fontSize: 10, color: fresh ? "var(--acc)" : "var(--muted)" }}>
                      {fresh ? "🫀 " : "⏰ "}{timeAgo(a.lastActive)}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>无活动记录</div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>🤖 {a.model || "待配置"}</div>
                  {canWake && (
                    <button className="as-wake-btn" onClick={(e) => { e.stopPropagation(); void handleWake(a.id); }} disabled={waking[a.id]}>
                      {waking[a.id] ? "配置中…" : "⚡ 配置"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="as-summary">
            <span><span className="as-dot running" style={{ position: "static", width: 8, height: 8 }} /> {running} 执行中</span>
            <span><span className="as-dot idle" style={{ position: "static", width: 8, height: 8 }} /> {idle} 待命</span>
            {offline > 0 && <span><span className="as-dot offline" style={{ position: "static", width: 8, height: 8 }} /> {offline} 离线</span>}
            {unconf > 0 && <span><span className="as-dot unconfigured" style={{ position: "static", width: 8, height: 8 }} /> {unconf} 未配置</span>}
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>
              检测于 {(status.checkedAt || "").substring(11, 19)} · 30 秒自动刷新
            </span>
          </div>
        </div>
      )}

      {/* 值班网格 */}
      <div className="duty-grid">
        {DEPTS.map((d) => {
          const myTasks = activeTasks.filter((t) => t.org === d.label || t.assigneeOrg === d.label);
          const isActive = myTasks.some((t) => t.state === "Doing" || t.state === "Review");
          const isBlocked = myTasks.some((t) => t.state === "Blocked");
          const off = agents.find((a) => a.id === d.id);
          const hbFresh = isHeartbeatFresh(off?.lastActive);
          const dotCls = isBlocked ? "blocked" : isActive ? "busy" : off?.status === "running" ? "active" : "idle";
          const statusText = isBlocked ? "⚠️ 阻塞" : isActive ? "⚙️ 执行中" : off?.status === "running" ? "🟢 活跃" : "⚪ 候命";
          const cardCls = isBlocked ? "blocked-card" : isActive ? "active-card" : "";

          return (
            <div key={d.id} className={`duty-card ${cardCls}`}>
              <div className="dc-hdr">
                <span className="dc-emoji">{d.emoji}</span>
                <div className="dc-info">
                  <div className="dc-name">{d.label}</div>
                  <div className="dc-role">{d.role} · {d.rank}</div>
                </div>
                <div className="dc-status">
                  <span className={`dc-dot ${dotCls}`} />
                  <span>{statusText}</span>
                </div>
              </div>
              <div className="dc-body">
                {myTasks.length > 0 ? (
                  myTasks.slice(0, 3).map((t) => (
                    <div key={t.id} className="dc-task" style={{ cursor: "pointer" }} onClick={() => setModalTask(t)}>
                      <div className="dc-task-id">{t.id}</div>
                      <div className="dc-task-title">{t.title || "(无标题)"}</div>
                      {t.now && t.now !== "-" && <div className="dc-task-now">{t.now.substring(0, 70)}</div>}
                      <div className="dc-task-meta">
                        <span className={`tag st-${t.state}`}>{STATE_LABEL[t.state] || t.state}</span>
                        {t.block && t.block !== "无" && (
                          <span className="tag" style={{ borderColor: "#ff527044", color: "var(--danger)" }}>🚫{t.block}</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="dc-idle">
                    <span style={{ fontSize: 20 }}>🪭</span>
                    <span>候命中</span>
                  </div>
                )}
              </div>
              <div className="dc-footer">
                <span className="dc-model">🤖 {off?.model || "待配置"}</span>
                {off?.lastActive ? (
                  <span className="dc-la" style={{ color: hbFresh ? "var(--acc)" : undefined }}>
                    {hbFresh ? "🫀 " : "⏰ "}{timeAgo(off.lastActive)}
                  </span>
                ) : (
                  <span className="dc-la">⏰ 无心跳</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* P2：任务操作弹窗 */}
      <Modal
        title={modalTask ? `📜 ${modalTask.id} · 任务操作` : ""}
        open={!!modalTask}
        onCancel={() => setModalTask(null)}
        footer={null}
        width={520}
      >
        {modalTask && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{modalTask.title || "(无标题)"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                状态：<b>{STATE_LABEL[modalTask.state] || modalTask.state}</b>
                {modalTask.assigneeOrg && <> · 承办：{modalTask.assigneeOrg}</>}
                {modalTask.priority && <> · 分级：{modalTask.priority}</>}
              </div>
              {modalTask.block && modalTask.block !== "无" && (
                <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>🚫 {modalTask.block}</div>
              )}
            </div>
            {(modalTask.progress_log?.length || 0) > 0 && (
              <div style={{ maxHeight: 130, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {modalTask.progress_log.slice(-5).map((p, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--muted)" }}>
                    {new Date(p.at).toLocaleTimeString("zh-CN", { hour12: false })} · {p.text?.substring(0, 60)}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {!["Done", "Cancelled"].includes(modalTask.state) && (
                <>
                  <Button size="small" loading={acting.retry} onClick={() => void runAction("retry", () => edictRetry(modalTask.id), "已重新触发三省六部编排")}>
                    🔄 重试
                  </Button>
                  <Button size="small" loading={acting.advance} onClick={() => void runAction("advance", () => edictAdvance(modalTask.id), "已推进到下一状态")}>
                    ⏩ 推进
                  </Button>
                  <Button size="small" danger loading={acting.escalate} onClick={() => void runAction("escalate", () => edictEscalate(modalTask.id), "已执行停滞升级")}>
                    ⬆️ 升级
                  </Button>
                  <Button size="small" danger loading={acting.cancel} onClick={() => void runAction("cancel", () => edictCancel(modalTask.id), "任务已取消")}>
                    🗑 取消
                  </Button>
                </>
              )}
              {modalTask.state === "Blocked" && (
                <Button size="small" type="primary" loading={acting.unblock} onClick={() => void runAction("unblock", () => edictUnblock(modalTask.id), "已解阻，中书省重新起草")}>
                  ✅ 解阻
                </Button>
              )}
              <Button
                size="small"
                onClick={() => {
                  const org = modalTask.assigneeOrg || modalTask.org || undefined;
                  setModalTask(null);
                  onNavigateBoard?.(org);
                }}
              >
                📋 去看板
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* P5：结果回传通知配置 */}
      <Modal
        title="🔔 结果回传通知（飞书 / 企业微信群机器人）"
        open={notifyOpen}
        onCancel={() => setNotifyOpen(false)}
        onOk={() => void saveNotify()}
        okText="保存"
        cancelText="取消"
        confirmLoading={notifySaving}
        width={520}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            三省六部任务完成 / 失败 / 阻塞时，自动推送到群机器人（照搬 edict 原版 feishu.py / wecom.py 负载格式）。
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Switch checked={notifyCfg.enabled} onChange={(v) => setNotifyCfg((p) => ({ ...p, enabled: v }))} />
            <span style={{ fontSize: 13 }}>启用结果回传通知</span>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>飞书 Webhook</div>
            <Input
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
              value={notifyCfg.feishuWebhook}
              onChange={(e) => setNotifyCfg((p) => ({ ...p, feishuWebhook: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>企业微信 Webhook</div>
            <Input
              placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
              value={notifyCfg.wecomWebhook}
              onChange={(e) => setNotifyCfg((p) => ({ ...p, wecomWebhook: e.target.value }))}
            />
          </div>
          <Button size="small" onClick={() => void testNotify()}>
            🧪 发送测试消息
          </Button>
        </div>
      </Modal>
    </div>
  );
}
