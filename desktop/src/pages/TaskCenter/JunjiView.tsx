/**
 * 军机处 — 朝堂总览视图（真实数据）
 * 数据源：IPC edict:officials / edict:stats / edict:board（推送 edict:board-updated 实时刷新）
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Empty, Spin } from "antd";
import {
  isEdictAvailable,
  edictAgentConfig,
  edictBoard,
  edictModels,
  edictOfficials,
  edictStats,
  onEdictBoardUpdated,
} from "@/api/edict-api";
import {
  buildJunjiStats,
  buildNews,
  buildOfficialCards,
  EDICT_COLUMNS,
  EDICT_STATE_LABEL,
  OFFICIAL_META,
  type OfficialCard,
} from "./edict-data";
import styles from "./edict.module.css";
import CourtCeremony from "./CourtCeremony";

const STATUS_CLASS: Record<OfficialCard["status"], string> = {
  idle: styles.statusIdle,
  work: styles.statusWork,
  deep: styles.statusDeep,
  offline: styles.statusOffline,
};

export default function JunjiView({ onNavigateModels, onNavigateBoard }: { onNavigateModels?: () => void; onNavigateBoard?: (orgName?: string) => void }) {
  const [available] = useState<boolean>(() => isEdictAvailable());
  const [loading, setLoading] = useState(true);
  const [drawerOfficial, setDrawerOfficial] = useState<OfficialCard | null>(null);
  const [officials, setOfficials] = useState<OfficialCard[]>([]);
  const [stats, setStats] = useState<ReturnType<typeof buildJunjiStats>>({
    issuedToday: 0, executing: 0, doneToday: 0, rejected: 0, byState: {}, avgMinutes: 0,
  });
  const [news, setNews] = useState<ReturnType<typeof buildNews>>([]);
  const [boardTasks, setBoardTasks] = useState<import("@shared/edict-types").EdictTask[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [agentModels, setAgentModels] = useState<Record<string, string>>({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [courtOpen, setCourtOpen] = useState(false);
  const closeCourt = useCallback(() => setCourtOpen(false), []);

  const loadAll = useCallback(async () => {
    try {
      const [officialRes, boardRes, statsRes, agentCfg] = await Promise.all([
        edictOfficials(),
        edictBoard(),
        edictStats(),
        edictAgentConfig().catch(() => null),
      ]);
      if (agentCfg?.agents) {
        const m: Record<string, string> = {};
        agentCfg.agents.forEach((a) => { m[a.id] = a.model; });
        setAgentModels(m);
      }
      setBoardTasks(boardRes.tasks || []);
      setOfficials(buildOfficialCards(officialRes, boardRes.tasks));
      setStats(buildJunjiStats(boardRes.tasks));
      setNews(buildNews(boardRes.tasks));
      const s = statsRes as { byState: Record<string, number> };
      setStats((prev) => ({ ...prev, byState: s.byState ?? prev.byState }));
    } catch (err) {
      console.warn("[JunjiView] 加载失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    if (!isEdictAvailable()) return;
    setModelsLoading(true);
    try {
      const m = await edictModels();
      setDefaultModel(m.default || "未配置");
    } catch {
      setDefaultModel("未配置");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!available) {
      setLoading(false);
      return;
    }
    void loadAll();
    void loadModels();
    const off = onEdictBoardUpdated(() => void loadAll());
    return () => off();
  }, [available, loadAll, loadModels]);

  /** 每日首次进入军机处自动上朝（照搬 edict 原版 localStorage 日期逻辑） */
  useEffect(() => {
    if (!available) return;
    const last = localStorage.getItem("shentong_court_date");
    const today = new Date().toISOString().substring(0, 10);
    if (last !== today) {
      localStorage.setItem("shentong_court_date", today);
      setCourtOpen(true);
    }
  }, [available]);

  if (!available) {
    return (
      <div className={styles.junjiRoot}>
        <Empty description="军机处需要桌面端主进程（electronAPI.edict 未注入，请使用桌面版）" />
      </div>
    );
  }

  const pendingReview = stats.byState.Menxia || 0;
  const pendingConfirm = stats.byState.PendingConfirm || 0;

  return (
    <div className={styles.junjiRoot}>
      {/* 上朝横幅 */}
      <div className={styles.banner}>
        <div className={styles.bannerInner}>
          <span className={styles.bannerSeal}>⚜</span>
          <div>
            <div className={styles.bannerTitle}>奉天承运 · 上朝议事</div>
            <div className={styles.bannerDesc}>
              三省六部共 {officials.length || OFFICIAL_META.length} 位官员在朝 · 今日已处理 {stats.issuedToday} 道旨意 ·{" "}
              {pendingReview} 道待审 · {stats.rejected} 道封驳待重拟
            </div>
          </div>
          <div className={styles.bannerSpacer} />
          <button className={styles.bannerBtn} onClick={() => setCourtOpen(true)}>🎎 上朝</button>
        </div>
      </div>

      {/* 统计卡 */}
      <Spin spinning={loading}>
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.statGold}`}>
            <div className={styles.statIcon}>📜</div>
            <div>
              <div className={styles.statNum}>{stats.issuedToday}</div>
              <div className={styles.statLbl}>今日下旨</div>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statBlue}`}>
            <div className={styles.statIcon}>⚙️</div>
            <div>
              <div className={styles.statNum}>{stats.executing}</div>
              <div className={styles.statLbl}>六部执行中</div>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statGreen}`}>
            <div className={styles.statIcon}>✅</div>
            <div>
              <div className={styles.statNum}>{stats.doneToday}</div>
              <div className={styles.statLbl}>已回奏</div>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statRed}`}>
            <div className={styles.statIcon}>🛡️</div>
            <div>
              <div className={styles.statNum}>{stats.rejected}</div>
              <div className={styles.statLbl}>门下封驳</div>
            </div>
          </div>
        </div>

        {/* 空看板引导（P3：无旨意任务时引导去下旨） */}
        {boardTasks.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", marginBottom: 12, borderRadius: 12, background: "var(--color-bg-spotlight)", border: "1px dashed var(--color-border, #e5e7eb)" }}>
            <span style={{ fontSize: 22 }}>⚜️</span>
            <div style={{ flex: 1, fontSize: 13, color: "var(--color-text-secondary)" }}>
              三省六部暂无旨意任务。下旨后由太子分拣 → 中书省起草 → 门下省审议 → 尚书省派发六部执行。
            </div>
            <button
              className={styles.bannerBtn}
              style={{ whiteSpace: "nowrap" }}
              onClick={() => onNavigateBoard?.()}
            >
              📜 去三省六部下旨
            </button>
          </div>
        )}

        {/* 两栏 */}
        <div className={styles.junjiCols}>
          <div className={styles.junjiColLeft}>
            {/* 官员总览 */}
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                👥 官员总览
                <span className={styles.panelSub}>{officials.length || OFFICIAL_META.length} 官署 · 实时状态</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.officialsGrid}>
                  {officials.map((o) => (
                    <div
                      key={o.id}
                      className={styles.official}
                      onClick={() => setDrawerOfficial(o)}
                    >
                      <div
                        className={styles.offAvatar}
                        style={{ background: `${o.color}1f` }}
                      >
                        {o.emoji}
                      </div>
                      <div>
                        <div className={styles.offName}>{o.name}</div>
                        <div className={styles.offRole}>{o.role}</div>
                      </div>
                      <div className={styles.offStatus}>
                        <span className={`${styles.statusLight} ${STATUS_CLASS[o.status]}`} />
                        {o.statusText}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 模型配置（展示默认模型；官署独立热切换待 Hermes 联调 T2.2） */}
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                ⚙️ 模型配置
                <span className={styles.panelSub}>
                  全局默认 {defaultModel || (modelsLoading ? "加载中…" : "未配置")} · 各官署当前模型
                </span>
                {onNavigateModels && <button className={styles.bannerBtn} style={{ padding: "4px 12px", fontSize: 12 }} onClick={onNavigateModels}>去模型配置</button>}
              </div>
              <div className={styles.panelBody}>
                <div className={styles.modelList}>
                  {OFFICIAL_META.map((o) => (
                    <div key={o.id} className={styles.modelRow}>
                      <span className={styles.modelName}>{o.emoji} {o.name}</span>
                      <span className={styles.modelValue}>{agentModels[o.id] || "未配置"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.junjiColRight}>
            {/* 天下要闻 */}
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                📢 天下要闻
                <span className={styles.panelSub}>看板流转动态</span>
              </div>
              <div className={styles.panelBody}>
                {news.length === 0 ? (
                  <div style={{ padding: 16 }}>
                    <Empty description="暂无流转动态" />
                  </div>
                ) : (
                  <div className={styles.newsList}>
                    {news.map((n, i) => (
                      <div key={i} className={styles.newsItem}>
                        <span className={styles.newsTime}>{n.time}</span>
                        <span className={styles.newsText}>
                          <b>{n.dept}</b> {n.action}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 三省六部流转 */}
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                🏛️ 三省六部状态
                <span className={styles.panelSub}>各列当前任务数</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.flowStats}>
                  {EDICT_COLUMNS.map((col) => {
                    const n = col.states.reduce((s, st) => s + (stats.byState[st] || 0), 0);
                    return (
                      <span key={col.key} style={{ marginRight: 10 }}>
                        {col.title} <b>{n}</b>
                      </span>
                    );
                  })}
                  <br />
                  平均流转时长 <b>{stats.avgMinutes} 分钟</b> · 待回奏确认 <b>{pendingConfirm}</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Spin>

      {/* 上朝动画（手动按钮 + 每日首次自动） */}
      {courtOpen && <CourtCeremony open={courtOpen} onClose={closeCourt} />}

      {/* 官员详情抽屉 */}
      <Drawer
        title={`${drawerOfficial?.emoji ?? ""} ${drawerOfficial?.name ?? ""} · 官署详情`}
        open={!!drawerOfficial}
        onClose={() => setDrawerOfficial(null)}
        width={380}
      >
        {drawerOfficial && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  background: `${drawerOfficial.color}1f`,
                }}
              >
                {drawerOfficial.emoji}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{drawerOfficial.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  {drawerOfficial.role} · profile: {drawerOfficial.id}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div
                style={{
                  background: "var(--color-bg-spotlight)",
                  borderRadius: 10,
                  padding: 10,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-success)" }}>
                  {drawerOfficial.todayCompleted}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>今日完成</div>
              </div>
              <div
                style={{
                  background: "var(--color-bg-spotlight)",
                  borderRadius: 10,
                  padding: 10,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-brand)" }}>
                  {drawerOfficial.todoCount}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>待办</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              当前状态：<b>{drawerOfficial.statusText}</b>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: "var(--color-bg-spotlight)", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>当前模型</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{agentModels[drawerOfficial.id] || "未配置"}</div>
              </div>
              <div style={{ background: "var(--color-bg-spotlight)", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>官署技能</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>在「技能」面板管理</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
              最近任务（{drawerOfficial.name} 相关）：
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
              {boardTasks
                .filter((t) => t.org === drawerOfficial.name || t.assigneeOrg === drawerOfficial.name)
                .slice(0, 5)
                .map((t) => (
                  <div key={t.id} style={{ fontSize: 12, background: "var(--color-bg-spotlight)", borderRadius: 8, padding: "6px 10px" }}>
                    <div style={{ fontWeight: 600 }}>{t.id} · {t.title}</div>
                    <div style={{ color: "var(--color-text-tertiary)", marginTop: 2 }}>{t.state} · {t.now || t.output || ""}</div>
                  </div>
                ))}
              {boardTasks.filter((t) => t.org === drawerOfficial.name || t.assigneeOrg === drawerOfficial.name).length === 0 && (
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>暂无相关任务</div>
              )}
            </div>
            <Button
              type="primary"
              block
              onClick={() => {
                const org = drawerOfficial.name;
                setDrawerOfficial(null);
                onNavigateBoard?.(org);
              }}
            >
              查看该官署任务（回看板）
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
