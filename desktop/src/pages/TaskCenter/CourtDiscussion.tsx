/**
 * 朝堂议政（edict 原版 CourtDiscussion 照搬 + 深瞳 IPC 适配）
 * 数据源：edict:court-discuss/start|advance|conclude|destroy|fate（主进程 court-extra 持久化到 userData/edict-data/court-sessions/）
 * 预设议题：从当前看板活跃旨意提取（edict:board + onBoardUpdated 实时刷新）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isEdictAvailable, edictBoard, edictCourtAdvance, edictCourtConclude, edictCourtDestroy, edictCourtFate, edictCourtStart, onEdictBoardUpdated } from "@/api/edict-api";
import type { EdictCourtDiscussResult, EdictCourtMessage, EdictCourtOfficial, EdictTask } from "@shared/edict-types";
import { DEPTS, toast } from "./panels-data";

// ── 常量（照搬 edict 原版 CourtDiscussion） ──

const OFFICIAL_COLORS: Record<string, string> = {
  taizi: "#e8a040", zhongshu: "#a07aff", menxia: "#6a9eff", shangshu: "#2ecc8a",
  libu: "#f5c842", hubu: "#ff9a6a", bingbu: "#ff5270", xingbu: "#cc4444",
  gongbu: "#44aaff", libu_hr: "#9b59b6", zaochao: "#f5c842", qintianjian: "#44aaff",
};

const EMOTION_EMOJI: Record<string, string> = {
  neutral: "", confident: "😏", worried: "😟", angry: "😤",
  thinking: "🤔", amused: "😄", happy: "😊",
};

const COURT_POSITIONS: Record<string, { x: number; y: number }> = {
  zhongshu: { x: 15, y: 25 }, menxia: { x: 15, y: 45 }, shangshu: { x: 15, y: 65 },
  libu: { x: 85, y: 20 }, hubu: { x: 85, y: 35 }, bingbu: { x: 85, y: 50 },
  xingbu: { x: 85, y: 65 }, gongbu: { x: 85, y: 80 },
  taizi: { x: 50, y: 20 }, libu_hr: { x: 50, y: 80 },
};

interface CourtSessionView {
  session_id: string;
  topic: string;
  officials: EdictCourtOfficial[];
  messages: EdictCourtMessage[];
  round: number;
  phase: string;
}

export default function CourtDiscussion() {
  const [phase, setPhase] = useState<"setup" | "session">("setup");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState("");
  const [session, setSession] = useState<CourtSessionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const autoPlayRef = useRef(false);

  const [userInput, setUserInput] = useState("");
  const [showDecree, setShowDecree] = useState(false);
  const [decreeInput, setDecreeInput] = useState("");
  const [decreeFlash, setDecreeFlash] = useState(false);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceResult, setDiceResult] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [emotions, setEmotions] = useState<Record<string, string>>({});
  const [activeTasks, setActiveTasks] = useState<EdictTask[]>([]);
  const [available] = useState<boolean>(() => isEdictAvailable());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages?.length]);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    if (!available) return;
    void edictBoard().then((b) => setActiveTasks(b.tasks || [])).catch(() => undefined);
    const off = onEdictBoardUpdated((b) => setActiveTasks(b.tasks || []));
    return () => off();
  }, [available]);

  useEffect(() => {
    if (!autoPlay || !session || loading) return;
    const timer = setInterval(() => {
      if (autoPlayRef.current && !loading) void handleAdvance();
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, session, loading]);

  const toggleOfficial = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 8) next.add(id);
      return next;
    });
  };

  const handleStart = async () => {
    if (!topic.trim() || selectedIds.size < 2 || loading) return;
    setLoading(true);
    try {
      const res = await edictCourtStart(topic, Array.from(selectedIds));
      if (!res.ok) throw new Error(res.error || "启动失败");
      setSession({
        session_id: res.session_id || "",
        topic: res.topic || topic,
        officials: res.officials || [],
        messages: res.messages || [],
        round: res.round || 0,
        phase: res.phase || "session",
      });
      setPhase("session");
    } catch (e: unknown) {
      toast((e as Error).message || "启动失败", "err");
    } finally {
      setLoading(false);
    }
  };

  const handleAdvance = useCallback(async (userMsg?: string, decree?: string) => {
    if (!session || loading) return;
    setLoading(true);
    try {
      const res = await edictCourtAdvance(session.session_id, userMsg, decree);
      if (!res.ok) throw new Error(res.error || "推进失败");
      setSession((prev) => {
        if (!prev) return prev;
        const newMsgs: EdictCourtMessage[] = [];
        if (userMsg) newMsgs.push({ type: "emperor", content: userMsg, timestamp: Date.now() / 1000 });
        if (decree) newMsgs.push({ type: "decree", content: decree, timestamp: Date.now() / 1000 });
        const aiMsgs = (res.new_messages || []).map((m) => ({
          type: "official",
          official_id: m.official_id,
          official_name: m.name,
          content: m.content,
          emotion: m.emotion,
          action: m.action,
          timestamp: Date.now() / 1000,
        }));
        if (res.scene_note) {
          newMsgs.push({ type: "scene_note", content: res.scene_note, timestamp: Date.now() / 1000 });
        }
        return {
          ...prev,
          round: res.round ?? prev.round + 1,
          messages: [...prev.messages, ...newMsgs, ...aiMsgs],
        };
      });
      const aiMsgs = res.new_messages || [];
      if (aiMsgs.length > 0) {
        const emotionMap: Record<string, string> = {};
        let idx = 0;
        const cycle = () => {
          if (idx < aiMsgs.length) {
            setSpeakingId(aiMsgs[idx].official_id);
            emotionMap[aiMsgs[idx].official_id] = aiMsgs[idx].emotion || "neutral";
            idx++;
            setTimeout(cycle, 1200);
          } else {
            setSpeakingId(null);
          }
        };
        cycle();
        setEmotions((prev) => ({ ...prev, ...emotionMap }));
      }
    } catch {
      // 静默
    } finally {
      setLoading(false);
    }
  }, [session, loading]);

  const handleEmperor = () => {
    const msg = userInput.trim();
    if (!msg) return;
    setUserInput("");
    void handleAdvance(msg);
  };

  const handleDecree = () => {
    const msg = decreeInput.trim();
    if (!msg) return;
    setDecreeInput("");
    setShowDecree(false);
    setDecreeFlash(true);
    setTimeout(() => setDecreeFlash(false), 800);
    void handleAdvance(undefined, msg);
  };

  const handleDice = async () => {
    if (loading || diceRolling) return;
    setDiceRolling(true);
    setDiceResult(null);
    let count = 0;
    const timer = setInterval(async () => {
      count++;
      setDiceResult("🎲 命运轮转中...");
      if (count >= 6) {
        clearInterval(timer);
        try {
          const res = await edictCourtFate();
          const event = res.event || "边疆急报传来";
          setDiceResult(event);
          setDiceRolling(false);
          void handleAdvance(undefined, "【命运骰子】" + event);
        } catch {
          setDiceResult("命运之力暂时无法触及");
          setDiceRolling(false);
        }
      }
    }, 200);
  };

  const handleConclude = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await edictCourtConclude(session.session_id);
      if (res.ok && res.summary) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                phase: "concluded",
                messages: [...prev.messages, { type: "system", content: "📋 朝堂议政结束 — " + res.summary, timestamp: Date.now() / 1000 }],
              }
            : prev
        );
      } else if (!res.ok) {
        toast(res.error || "结束失败", "err");
      }
      setAutoPlay(false);
    } catch {
      toast("结束失败", "err");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (session) void edictCourtDestroy(session.session_id).catch(() => undefined);
    setPhase("setup");
    setSession(null);
    setAutoPlay(false);
    setEmotions({});
    setSpeakingId(null);
    setDiceResult(null);
  };

  const presetTopics = [
    ...activeTasks
      .filter((t) => /^JJC-/i.test(t.id || "") && !["Done", "Cancelled"].includes(t.state))
      .slice(0, 3)
      .map((t) => ({ text: "讨论旨意 " + t.id + "：" + t.title, taskId: t.id, icon: "📜" })),
    { text: "讨论系统架构优化方案", taskId: "", icon: "🏗️" },
    { text: "评估当前项目进展和风险", taskId: "", icon: "📊" },
    { text: "制定下周工作计划", taskId: "", icon: "📋" },
    { text: "紧急问题：线上Bug排查方案", taskId: "", icon: "🚨" },
  ];

  // ═══ 设置页 ═══
  if (phase === "setup") {
    return (
      <div className="edictPanels" style={{ maxWidth: 980, margin: "0 auto", padding: "4px 0 24px" }}>
        <div className="text-center py-4">
          <div className="text-xl font-bold" style={{ background: "linear-gradient(90deg,#f5c842,#a07aff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            🏛 朝堂议政
          </div>
          <div className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
            择臣上殿，围绕议题展开讨论 · 陛下可随时发言或降下天意改变走向
          </div>
        </div>

        {/* 选择官员 */}
        <div className="cl-wrap" style={{ marginBottom: 14 }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold">👔 选择参朝官员</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>（{selectedIds.size}/8，至少2位）</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {DEPTS.map((d) => {
              const active = selectedIds.has(d.id);
              const color = OFFICIAL_COLORS[d.id] || "#6a9eff";
              return (
                <button key={d.id} onClick={() => toggleOfficial(d.id)} className="p-2 rounded-lg border transition-all text-left" style={{ borderColor: active ? color + "80" : "var(--line)", background: active ? color + "15" : "var(--panel2)", boxShadow: active ? "0 0 12px " + color + "20" : "none", cursor: "pointer" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{d.emoji}</span>
                    <div>
                      <div className="text-xs font-semibold" style={{ color: active ? color : "var(--text)" }}>{d.label}</div>
                      <div className="text-[10px]" style={{ color: "var(--muted)" }}>{d.role}</div>
                    </div>
                    {active && <span className="ml-auto w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white" style={{ background: color }}>✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 议题 */}
        <div className="cl-wrap" style={{ marginBottom: 14 }}>
          <div className="text-sm font-semibold mb-2">📜 设定议题</div>
          {presetTopics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {presetTopics.map((p, i) => (
                <button key={i} onClick={() => setTopic(p.text)} className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors" style={{ background: topic === p.text ? "var(--acc)" + "18" : "transparent", borderColor: topic === p.text ? "var(--acc)" : "var(--line)", color: topic === p.text ? "var(--acc)" : "var(--muted)", cursor: "pointer" }}>
                  {p.icon} {p.text}
                </button>
              ))}
            </div>
          )}
          <textarea className="w-full rounded-lg p-3 text-sm border outline-none resize-none" style={{ background: "var(--panel2)", borderColor: "var(--line)", color: "var(--text)", minHeight: 64 }} placeholder="或自定义议题..." value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>

        {/* 特性标签 */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {["👑 皇帝发言", "⚡ 天命降临", "🎲 命运骰子", "🔄 自动推进", "📜 讨论记录"].map((tag) => (
            <span key={tag} className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>{tag}</span>
          ))}
        </div>

        <button
          onClick={() => void handleStart()}
          disabled={selectedIds.size < 2 || !topic.trim() || loading}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
          style={{
            background: selectedIds.size >= 2 && topic.trim() ? "linear-gradient(135deg, #6a9eff, #a07aff)" : "var(--panel2)",
            color: selectedIds.size >= 2 && topic.trim() ? "#fff" : "var(--muted)",
            opacity: loading ? 0.6 : 1,
            cursor: selectedIds.size >= 2 && topic.trim() && !loading ? "pointer" : "not-allowed",
            border: "none",
          }}
        >
          {loading ? "召集中..." : "🏛 开始朝议（" + selectedIds.size + "位上殿）"}
        </button>
      </div>
    );
  }

  // ═══ 议政进行中 ═══
  const officials = session?.officials || [];
  const messages = session?.messages || [];

  return (
    <div className="edictPanels" style={{ maxWidth: 1100, margin: "0 auto", padding: "4px 0 24px" }}>
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between flex-wrap gap-2 rounded-xl px-4 py-2 border" style={{ background: "var(--panel)", borderColor: "var(--line)", marginBottom: 12 }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">🏛 朝堂议政</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--acc)20", color: "var(--acc)", border: "1px solid var(--acc)30" }}>第{session?.round || 0}轮</span>
          {session?.phase === "concluded" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(46,204,138,.12)", color: "var(--ok)", border: "1px solid var(--ok)" }}>已结束</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowDecree(!showDecree)} className="text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: "rgba(245,200,66,.4)", color: "#f5c842", background: "transparent", cursor: "pointer" }} title="天命降临 — 上帝视角干预">⚡ 天命</button>
          <button onClick={() => void handleDice()} disabled={diceRolling || loading} className="text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: "rgba(160,122,255,.4)", color: "#a07aff", background: "transparent", cursor: diceRolling || loading ? "not-allowed" : "pointer" }} title="命运骰子 — 随机事件">🎲 {diceRolling ? "..." : "骰子"}</button>
          <button onClick={() => setAutoPlay(!autoPlay)} className="text-xs px-2.5 py-1 rounded-lg border transition" style={autoPlay ? { borderColor: "rgba(46,204,138,.4)", color: "var(--ok)", background: "rgba(46,204,138,.12)", cursor: "pointer" } : { borderColor: "var(--line)", color: "var(--muted)", background: "transparent", cursor: "pointer" }}>
            {autoPlay ? "⏸ 暂停" : "▶ 自动"}
          </button>
          {session?.phase !== "concluded" && (
            <button onClick={() => void handleConclude()} className="text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: "var(--line)", color: "var(--muted)", background: "transparent", cursor: "pointer" }}>📋 散朝</button>
          )}
          <button onClick={handleReset} className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: "rgba(255,82,112,.4)", color: "rgba(255,82,112,.7)", background: "transparent", cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* 天命降临面板 */}
      {showDecree && (
        <div className="rounded-xl p-4 border" style={{ background: "linear-gradient(135deg, rgba(120,72,0,.4), rgba(80,40,120,.3))", borderColor: "rgba(180,120,0,.3)", marginBottom: 12 }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold" style={{ color: "#f5c842" }}>⚡ 天命降临 — 上帝视角</span>
            <button onClick={() => setShowDecree(false)} className="text-xs" style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
          </div>
          <p className="text-[10px] mb-2" style={{ color: "rgba(245,200,66,.6)" }}>降下天意改变讨论走向，所有官员将对此做出反应</p>
          <div className="flex gap-2">
            <input value={decreeInput} onChange={(e) => setDecreeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleDecree()} placeholder="例如：突然发现预算多出一倍..." className="flex-1 rounded-lg px-3 py-1.5 text-sm border outline-none" style={{ background: "rgba(0,0,0,.3)", borderColor: "rgba(180,120,0,.4)", color: "var(--text)" }} />
            <button onClick={handleDecree} disabled={!decreeInput.trim()} className="px-4 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "linear-gradient(90deg,#d97706,#7c3aed)", color: "#fff", border: "none", cursor: decreeInput.trim() ? "pointer" : "not-allowed", opacity: decreeInput.trim() ? 1 : 0.4 }}>降旨</button>
          </div>
        </div>
      )}

      {/* 命运骰子结果 */}
      {diceResult && (
        <div className="rounded-lg px-3 py-2 border text-xs flex items-center gap-2" style={{ background: "rgba(80,40,120,.4)", borderColor: "rgba(160,122,255,.3)", color: "#c084fc", marginBottom: 12 }}>
          <span className="text-lg">🎲</span>
          {diceResult}
        </div>
      )}

      {/* 天命闪光 */}
      {decreeFlash && (
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 50, background: "radial-gradient(circle, rgba(255,200,50,0.3), transparent 70%)", animation: "fadeOut .8s forwards" }} />
      )}

      {/* 议题 */}
      <div className="text-xs text-center py-1" style={{ color: "var(--muted)" }}>📜 {session?.topic || ""}</div>

      {/* 主内容：朝堂布局 + 聊天记录 */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3">
        {/* 左侧：朝堂可视化 */}
        <div className="rounded-xl p-3 border relative overflow-hidden" style={{ background: "var(--panel)", borderColor: "var(--line)", minHeight: 320 }}>
          <div className="text-center mb-2">
            <div style={{ fontSize: 28 }}>👑</div>
            <div className="text-[10px]" style={{ color: "#f5c842" }}>龙椅</div>
          </div>
          {officials.map((o) => {
            const color = OFFICIAL_COLORS[o.id] || "#6a9eff";
            const pos = COURT_POSITIONS[o.id] || { x: 50, y: 50 };
            const isSpeaking = speakingId === o.id;
            const emotion = emotions[o.id];
            return (
              <div key={o.id} className="absolute flex flex-col items-center" style={{ left: pos.x + "%", top: pos.y + "%", transform: "translate(-50%,-50%)", transition: "all .3s" }}>
                <div
                  className="flex items-center justify-center rounded-full border"
                  style={{
                    width: 40, height: 40, fontSize: 20,
                    borderColor: isSpeaking ? color : color + "60",
                    background: isSpeaking ? color + "30" : color + "15",
                    boxShadow: isSpeaking ? "0 0 18px " + color + "60" : "none",
                    animation: isSpeaking ? "pulse 1s infinite" : "none",
                  }}
                >
                  {o.emoji || "🏛️"}
                  {emotion && EMOTION_EMOJI[emotion] && (
                    <span className="absolute" style={{ right: -10, top: -8, fontSize: 14, animation: "bounceIn .3s" }}>{EMOTION_EMOJI[emotion]}</span>
                  )}
                </div>
                <div className="text-[9px] text-center mt-0.5 whitespace-nowrap" style={{ color: isSpeaking ? color : "var(--muted)" }}>{o.name}</div>
              </div>
            );
          })}
        </div>

        {/* 右侧：聊天记录 */}
        <div className="rounded-xl border flex flex-col" style={{ background: "var(--panel)", borderColor: "var(--line)", maxHeight: 500 }}>
          <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 200 }}>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} officials={officials} colors={OFFICIAL_COLORS} emojis={EMOTION_EMOJI} />
            ))}
            {loading && <div className="text-xs text-center py-2" style={{ color: "var(--muted)", animation: "pulse 1.5s infinite" }}>🏛 群臣正在思考...</div>}
            <div ref={messagesEndRef} />
          </div>

          {session?.phase !== "concluded" && (
            <div className="border-t p-2 flex gap-2" style={{ borderColor: "var(--line)" }}>
              <input value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEmperor()} placeholder="朕有话说..." className="flex-1 rounded-lg px-3 py-1.5 text-sm border outline-none" style={{ background: "var(--panel2)", borderColor: "var(--line)", color: "var(--text)" }} />
              <button onClick={handleEmperor} disabled={!userInput.trim() || loading} className="px-4 py-1.5 rounded-lg text-xs font-semibold" style={{ background: userInput.trim() ? "linear-gradient(135deg, #e8a040, #f5c842)" : "var(--panel2)", color: userInput.trim() ? "#000" : "var(--muted)", border: "none", cursor: userInput.trim() && !loading ? "pointer" : "not-allowed", opacity: userInput.trim() && !loading ? 1 : 0.4 }}>
                👑 发言
              </button>
              <button onClick={() => void handleAdvance()} disabled={loading} className="px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: "var(--acc)40", color: "var(--acc)", background: "transparent", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.4 : 1 }}>
                ▶ 下一轮
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 消息气泡 ──

function MessageBubble({ msg, officials, colors, emojis }: { msg: EdictCourtMessage; officials: EdictCourtOfficial[]; colors: Record<string, string>; emojis: Record<string, string> }) {
  const color = colors[msg.official_id || ""] || "#6a9eff";
  const official = officials.find((o) => o.id === msg.official_id);

  if (msg.type === "system") {
    return <div className="text-center text-[10px] py-1" style={{ color: "var(--muted)", borderBottom: "1px dashed var(--line)" }}>{msg.content}</div>;
  }
  if (msg.type === "scene_note") {
    return <div className="text-center text-[10px] py-1 italic" style={{ color: "rgba(192,132,252,.8)" }}>✦ {msg.content} ✦</div>;
  }
  if (msg.type === "emperor") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-xl px-3 py-2 border" style={{ background: "linear-gradient(135deg, rgba(120,72,0,.4), rgba(120,96,0,.2))", borderColor: "rgba(180,120,0,.3)" }}>
          <div className="text-[10px] mb-0.5" style={{ color: "#f5c842" }}>👑 皇帝</div>
          <div className="text-sm" style={{ color: "var(--text)" }}>{msg.content}</div>
        </div>
      </div>
    );
  }
  if (msg.type === "decree") {
    return (
      <div className="text-center py-2">
        <div className="inline-block rounded-lg px-4 py-2 border" style={{ background: "linear-gradient(90deg, rgba(120,72,0,.3), rgba(80,40,120,.3), rgba(120,72,0,.3))", borderColor: "rgba(180,120,0,.3)" }}>
          <div className="text-xs font-bold" style={{ color: "#f5c842" }}>⚡ 天命降临</div>
          <div className="text-sm mt-0.5" style={{ color: "var(--text)" }}>{msg.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-start" style={{ animation: "fadeIn .4s" }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 border" style={{ borderColor: color + "60", background: color + "15" }}>
        {official?.emoji || "💬"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-semibold" style={{ color }}>{msg.official_name || "官员"}</span>
          {msg.emotion && emojis[msg.emotion] && <span className="text-xs">{emojis[msg.emotion]}</span>}
        </div>
        <div className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
          {String(msg.content || "")
            .split(/(\*[^*]+\*)/)
            .map((part, i) => {
              if (part.startsWith("*") && part.endsWith("*")) {
                return <span key={i} className="italic text-xs" style={{ color: "var(--muted)" }}>{part.slice(1, -1)}</span>;
              }
              return <span key={i}>{part}</span>;
            })}
        </div>
      </div>
    </div>
  );
}
