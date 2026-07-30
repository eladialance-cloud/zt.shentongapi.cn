/**
 * Office2DPage — 2D 画布 + 右侧 Drawer (3 个 Tab)
 * (v0.3.1 Task 11)
 *
 * Tab 1: 员工详情
 * Tab 2: 任务流转 (使用 @/components/TaskFlow)
 * Tab 3: 办公室日志
 *
 * Task 10 扩展：新增「Demo 模式」入口（Drawer），支持选择并播放 3 个 Demo 场景。
 *   - Demo 播放时显示顶部进度条 + 底部解说
 *   - Demo 期间禁用其他热区交互（demoMode=true）
 */


import { useCallback, useEffect, useMemo, useRef, useState } from '\''react'\'';
import { Button, ColorPicker, Drawer, Empty, Radio, Slider, Switch, Tag, Tabs, Tooltip } from '\''antd'\'';
import OfficeIsoCanvas from '\''./OfficeIsoCanvas'\'';
import MeetingRoom from '\''./MeetingRoom'\'';
import { AI_EMPLOYEES } from '\''./employees'\'';
import { loadTeamEmployees, buildDynamicRoleMap } from '\''./dynamic-employees'\'';
import { listTeams } from '\''@/api/team-api'\'';
import { STATE_LABELS, getStatusVisualColor } from '\''./state-machine'\'';import TaskFlow from '@/components/TaskFlow';
import styles from './office-canvas.module.css';

interface Office2DPageProps {
  /** 是否内嵌显示 (true: 不渲染外层 padding; false: 独立页面) */
  embedded?: boolean;
}

export default function Office2DPage({ embedded = false }: Office2DPageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'employees' | 'flow' | 'log'>('employees');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>();

  // Task 2: 会议室 Drawer 状态 (meeting 热区点击触发)
  const [meetingRoomOpen, setMeetingRoomOpen] = useState(false);

  // Task 24: 设置面板状态（从 localStorage 加载初始值）
  const [settings, setSettings] = useState<OfficeSettings>(() => loadOfficeSettings());
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);

  // Task 24: 更新设置（同时持久化到 localStorage）
  const updateSettings = useCallback((partial: Partial<OfficeSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveOfficeSettings(next);
      return next;
    });
  }, []);

  // 实时员工快照 (每 1s 由 OfficeCanvas 同步; 此处维护本地副本以驱动 Drawer)
  const [snapshot, setSnapshot] = useState<AIEmployee[]>(() => AI_EMPLOYEES.map((e) => ({ ...e, currentPos: { ...e.currentPos } })));
  const snapshotRef = useRef(snapshot);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  // 日志事件
  const [logs, setLogs] = useState<OfficeLogEvent[]>([]);
  const logIdRef = useRef(0);

  // 任务流边
  const [edges, setEdges] = useState<TaskFlowEdge[]>([]);

  // ===== Task 10: Demo 模式状态 =====
  const [demoDrawerOpen, setDemoDrawerOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoRuntime, setDemoRuntime] = useState({
    isPlaying: false,
    progressPercent: 0,
    progressText: '',
    narration: '',
  });
  const currentDemoRef = useRef<DemoController | null>(null);
  // 通过 window 调用 OfficeCanvas 暴露的接口
  type WindowOffice = Window & {
    __officeDispatch?: (e: StatusUpdateEvent) => void;
    __officeAddBubble?: (employeeId: string, type: ChatBubbleType, content: string, emoji?: string, duration?: number) => void;
    __officeClearBubbles?: () => void;
    __officeMoveEmployee?: (id: string, to: PixelPoint, speed?: number) => Promise<void>;
    __officeResetAll?: () => void;
  };

  // 监听状态变更
  const handleStatusChange = useCallback((event: StatusUpdateEvent) => {
    const ts = Date.now();
    const emp = snapshotRef.current.find((x) => x.id === event.employeeId);
    if (!emp) return;
    const logEvent: OfficeLogEvent = {
      id: `log-${logIdRef.current++}`,
      timestamp: ts,
      employeeId: event.employeeId,
      employeeName: emp.name,
      type:
        event.status === 'IN_MEETING' ? 'meeting' :
        event.status === 'VISITING' ? 'visit' :
        event.status === 'WORKING' || event.status === 'WORKING_DEEP' ? 'task_complete' :
        'status_change',
      text: `${emp.name} -> ${STATE_LABELS[event.status]}`,
    };
    setLogs((prev) => [logEvent, ...prev].slice(0, 100));
    // 更新员工快照
    setSnapshot((prev) => prev.map((e) => e.id === event.employeeId ? { ...e, status: event.status, statusStartTime: ts } : e));
  }, []);

  // 定时拉取最新员工状态 (从 window.__officeDispatch 不便反向读, 改用定时读取 employees)
  useEffect(() => {
    // 由 OfficeCanvas 内部维护, 此处仅做 UI 刷新触发
    const timer = setInterval(() => {
      // 触发空状态更新让 Tag 颜色随状态变 (snapshot 由 statusChange 回调更新)
      setSnapshot((prev) => prev.map((e) => ({ ...e })));
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // 热点点击
  const handleHotspotClick = useCallback((h: { id: string; label: string; employeeId?: string }) => {
    // Task 10: Demo 期间禁用其他热区交互
    if (demoMode) return;
    // Task 2: 会议室热区点击 -> 滑出 MeetingRoom Drawer (不进入员工详情 Drawer)
    if (h.id === 'meeting') {
      setMeetingRoomOpen(true);
      return;
    }
    setDrawerOpen(true);
    setActiveTab('employees');
    if (h.employeeId) setSelectedEmployeeId(h.employeeId);
  }, [demoMode]);

  // 员工点击
  const handleEmployeeClick = useCallback((emp: AIEmployee) => {
    // Task 10: Demo 期间禁用员工点击
    if (demoMode) return;
    setSelectedEmployeeId(emp.id);
  }, [demoMode]);

  // ===== Task 10: Demo 模式处理函数 =====

  /** 构建 DemoContext（通过 window 调用 OfficeCanvas 暴露的接口） */
  const buildDemoContext = useCallback((): DemoContext => {
    return {
      setEmployeeStatus: (id: string, status: AIEmployeeStatus, pos?: { x: number; y: number }) => {
        const w = window as WindowOffice;
        if (w.__officeDispatch) {
          w.__officeDispatch({ employeeId: id, status, reason: 'demo' });
        }
        // 若指定了 pos，再触发一次移动（先 dispatch 切换状态，再 moveEmployee）
        if (pos) {
          setTimeout(() => {
            if (w.__officeMoveEmployee) {
              void w.__officeMoveEmployee(id, pos, 70);
            }
          }, 50);
        }
      },
      addBubble: (employeeId: string, type: ChatBubbleType, content: string, emoji?: string, duration?: number) => {
        const w = window as WindowOffice;
        if (w.__officeAddBubble) {
          w.__officeAddBubble(employeeId, type, content, emoji, duration);
        }
      },
      moveEmployee: async (id: string, to: { x: number; y: number }, speed?: number) => {
        const w = window as WindowOffice;
        if (w.__officeMoveEmployee) {
          await w.__officeMoveEmployee(id, to, speed);
        }
      },
      showProgress: (percent: number, text: string) => {
        setDemoRuntime((prev) => ({
          ...prev,
          progressPercent: Math.max(0, Math.min(100, percent)),
          progressText: text,
        }));
      },
      showNarration: (text: string) => {
        setDemoRuntime((prev) => ({ ...prev, narration: text }));
      },
    };
  }, []);

  /** 启动 Demo */
  const handleStartDemo = useCallback(async (demo: DemoController) => {
    // 先停止当前正在播放的 Demo
    if (currentDemoRef.current) {
      currentDemoRef.current.stop();
    }
    currentDemoRef.current = demo;
    setDemoMode(true);
    setDemoDrawerOpen(false);
    setDemoRuntime({
      isPlaying: true,
      progressPercent: 0,
      progressText: `正在启动 ${demo.title}...`,
      narration: '',
    });
    const ctx = buildDemoContext();
    try {
      await demo.play(ctx);
    } catch (err) {
      console.error('[Demo] play failed', err);
    }
    // 播放完成后自动重置状态（但保持 demoMode=false 让用户能继续操作）
    setDemoRuntime((prev) => ({
      ...prev,
      isPlaying: false,
      progressPercent: 100,
      progressText: `${demo.title} 已完成`,
      narration: 'Demo 播放完毕。3 秒后自动清理...',
    }));
    // 3 秒后清理
    setTimeout(() => {
      setDemoMode(false);
      setDemoRuntime({
        isPlaying: false,
        progressPercent: 0,
        progressText: '',
        narration: '',
      });
      // 重置所有员工状态到 IDLE
      const w = window as WindowOffice;
      if (w.__officeResetAll) w.__officeResetAll();
      currentDemoRef.current = null;
    }, 3000);
  }, [buildDemoContext]);

  /** 停止 Demo（重置所有员工状态到 IDLE，清空 bubbles，移除进度条与解说） */
  const handleStopDemo = useCallback(() => {
    if (currentDemoRef.current) {
      currentDemoRef.current.stop();
      currentDemoRef.current = null;
    }
    setDemoMode(false);
    setDemoRuntime({
      isPlaying: false,
      progressPercent: 0,
      progressText: '',
      narration: '',
    });
    // 重置所有员工状态到 IDLE
    const w = window as WindowOffice;
    if (w.__officeResetAll) w.__officeResetAll();
  }, []);

  // 构建 TaskFlow 组件所需 nodes / edges
  const taskFlowNodes = useMemo(() => {
    return snapshot.map((e, i) => ({
      id: e.id,
      x: 80 + (i % 3) * 180,
      y: 60 + Math.floor(i / 3) * 120,
      label: e.name,
      status: (e.status === 'WORKING' || e.status === 'WORKING_DEEP' ? 'running' :
               e.status === 'OFFLINE' ? 'error' :
               e.status === 'IDLE' ? 'pending' : 'success') as 'running' | 'error' | 'pending' | 'success',
    }));
  }, [snapshot]);

  const taskFlowEdges = useMemo(() => {
    return edges.map((e) => ({
      from: e.fromEmployeeId,
      to: e.toEmployeeId,
      active: e.active,
    }));
  }, [edges]);

  // 暴露 edges 更新接口 (供 OfficeCanvas 通过 window 同步) — 简化: 这里用默认边
  useEffect(() => {
    // 使用默认边
    import('./employees').then(({ createDefaultTaskFlowEdges }) => {
      setEdges(createDefaultTaskFlowEdges());
    });
  }, []);

  return (
    <div className={embedded ? styles.tabContainer : undefined} style={embedded ? undefined : { width: '100%', height: '100%' }}>
      <OfficeIsoCanvas
        onHotspotClick={handleHotspotClick}
        onEmployeeClick={handleEmployeeClick}
        onStatusChange={handleStatusChange}
        enableMockStatus
        mockStatusIntervalMs={5000}
        settings={settings}
      />

      {/* Task 10: Demo 模式入口按钮 + Task 24: 设置面板按钮（右上角浮层，不在 Demo 期间显示） */}
      {!demoMode && (
        <div className={styles.demoEntryBar}>
          <Button
            size="small"
            onClick={() => setSettingsDrawerOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #1677FF 0%, #13C2C2 100%)',
              border: 'none',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(22, 119, 255, 0.3)',
            }}
          >
            ⚙ 设置
          </Button>
          <Button
            type="primary"
            size="small"
            onClick={() => setDemoDrawerOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #722ED1 0%, #1677FF 100%)',
              border: 'none',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(114, 46, 209, 0.3)',
            }}
          >
            🎬 Demo 模式
          </Button>
        </div>
      )}

      {/* Task 10: Demo 选择 Drawer */}
      <Drawer
        open={demoDrawerOpen}
        onClose={() => setDemoDrawerOpen(false)}
        title={<span className={styles.drawerTitle}>🎬 Demo 模式</span>}
        width={380}
        placement="right"
        destroyOnClose={false}
      >
        <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
          选择一个 Demo 场景，将自动播放完整业务流程动画。
          <br />
          播放期间禁用其他热区交互，可随时点击「停止」按钮中断。
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DEMO_LIST.map((demo) => (
            <div
              key={demo.id}
              className={styles.demoCard}
              onClick={() => void handleStartDemo(demo)}
            >
              <div className={styles.demoCardTitle}>
                {demo.title}
              </div>
              <div className={styles.demoCardDesc}>
                {demo.description}
              </div>
            </div>
          ))}
        </div>
      </Drawer>

      {/* Task 24: 设置面板 Drawer — 4 控件（Switch / ColorPicker / Radio.Group / Slider） */}
      <Drawer
        open={settingsDrawerOpen}
        onClose={() => setSettingsDrawerOpen(false)}
        title={<span className={styles.drawerTitle}>⚙ 办公室设置</span>}
        width={380}
        placement="right"
        destroyOnClose={false}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 1. 动效开关：切换时停止/启动 requestAnimationFrame */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>动效开关</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch
                checked={settings.animationEnabled}
                onChange={(checked) => updateSettings({ animationEnabled: checked })}
              />
              <span style={{ fontSize: 12, color: '#999' }}>
                {settings.animationEnabled ? '已启用（持续渲染）' : '已关闭（仅静态画面）'}
              </span>
            </div>
          </div>

          {/* 2. 主题色：切换时更新所有 AI 员工主题色 */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>主题色</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ColorPicker
                value={settings.themeColor}
                onChangeComplete={(color) => updateSettings({ themeColor: color.toHexString() })}
                showText
              />
              <span style={{ fontSize: 12, color: '#999' }}>应用到所有 AI 员工</span>
            </div>
          </div>

          {/* 3. 性能模式：切换时调整 fps（高性能 60fps / 平衡 30fps / 省电 15fps） */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>性能模式</div>
            <Radio.Group
              value={settings.performanceMode}
              onChange={(e) => updateSettings({ performanceMode: e.target.value as PerformanceMode })}
            >
              <Radio.Button value="high">高性能 60fps</Radio.Button>
              <Radio.Button value="balanced">平衡 30fps</Radio.Button>
              <Radio.Button value="power-saving">省电 15fps</Radio.Button>
            </Radio.Group>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
              调整画布帧率以平衡性能与功耗
            </div>
          </div>

          {/* 4. 角色显示数量：滑动条调整时显示对应数量 AI 员工（1-5） */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>角色显示数量</div>
            <Slider
              min={1}
              max={5}
              step={1}
              value={settings.visibleEmployeeCount}
              onChange={(value) => updateSettings({ visibleEmployeeCount: value })}
              marks={{ 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' }}
            />
            <div style={{ fontSize: 11, color: '#999' }}>
              当前显示前 {settings.visibleEmployeeCount} 个 AI 员工
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
            所有配置已持久化到 localStorage（key: office-settings），刷新后仍生效。
          </div>
        </div>
      </Drawer>

      {/* Task 10: Demo 进度条（顶部 fixed） */}
      {demoMode && (
        <div className={styles.demoProgressBar}>
          <span className={styles.demoProgressText}>
            {demoRuntime.progressText || '准备中...'}
          </span>
          <div className={styles.demoProgressTrack}>
            <div
              className={styles.demoProgressFill}
              style={{ width: `${demoRuntime.progressPercent}%` }}
            />
          </div>
          <span style={{ fontSize: 11, color: '#aaa', minWidth: 36 }}>
            {demoRuntime.progressPercent}%
          </span>
          <button
            className={styles.demoStopBtn}
            onClick={handleStopDemo}
          >
            停止
          </button>
        </div>
      )}

      {/* Task 10: Demo 解说（底部 fixed） */}
      {demoMode && demoRuntime.narration && (
        <div className={styles.demoNarration}>
          {demoRuntime.narration}
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={<span className={styles.drawerTitle}>🏢 办公室详情</span>}
        width={420}
        placement="right"
        destroyOnClose={false}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as typeof activeTab)}
          items={[
            {
              key: 'employees',
              label: '员工详情',
              children: <EmployeesTab
                employees={snapshot}
                selectedId={selectedEmployeeId}
                onSelect={(id) => setSelectedEmployeeId(id)}
              />,
            },
            {
              key: 'flow',
              label: '任务流转',
              children: <FlowTab nodes={taskFlowNodes} edges={taskFlowEdges} />,
            },
            {
              key: 'log',
              label: '办公室日志',
              children: <LogTab logs={logs} onClear={() => setLogs([])} />,
            },
          ]}
        />
      </Drawer>

      {/* Task 2: 会议室 Drawer (meeting 热区点击触发) */}
      <MeetingRoom
        open={meetingRoomOpen}
        onClose={() => setMeetingRoomOpen(false)}
        employees={snapshot}
      />
    </div>
  );
}

// ===== 员工详情 Tab =====
function EmployeesTab({
  employees,
  selectedId,
  onSelect,
}: {
  employees: AIEmployee[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (employees.length === 0) {
    return <Empty description="暂无员工" />;
  }
  return (
    <div className={styles.tabContainer}>
      {employees.map((e) => {
        const statusColor = getStatusVisualColor(e.status);
        const isSelected = e.id === selectedId;
        return (
          <div
            key={e.id}
            className={styles.employeeCard}
            style={isSelected ? { borderColor: e.themeColor, background: `${e.themeColor}10` } : undefined}
            onClick={() => onSelect(e.id)}
          >
            <div className={styles.employeeHeader}>
              <span className={styles.employeeName}>
                <span style={{ fontSize: 16 }}>{e.emoji}</span>
                <span style={{ color: e.themeColor }}>{e.name}</span>
              </span>
              <Tag color={statusColor} style={{ color: '#fff', border: 'none' }}>
                {STATE_LABELS[e.status]}
              </Tag>
            </div>
            <div className={styles.employeeStats}>
              <span>今日完成 <strong>{e.todayCompleted}</strong></span>
              <span>待办 <strong>{e.todoCount}</strong></span>
              <span>位置 ({Math.round(e.currentPos.x)}, {Math.round(e.currentPos.y)})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== 任务流转 Tab =====
function FlowTab({
  nodes,
  edges,
}: {
  nodes: Array<{ id: string; x: number; y: number; label: string; status?: 'pending' | 'running' | 'success' | 'error' }>;
  edges: Array<{ from: string; to: string; active?: boolean }>;
}) {
  return (
    <div>
      <TaskFlow nodes={nodes} edges={edges} width={380} height={300} />
      <div className={styles.flowList} style={{ marginTop: 12 }}>
        {edges.length === 0 ? (
          <Empty description="暂无任务流" />
        ) : (
          edges.map((e, i) => {
            const from = nodes.find((n) => n.id === e.from);
            const to = nodes.find((n) => n.id === e.to);
            if (!from || !to) return null;
            return (
              <div key={i} className={`${styles.flowItem} ${e.active ? styles.flowActive : ''}`}>
                <span>{from.label}</span>
                <span className={styles.flowArrow}>→</span>
                <span>{to.label}</span>
                <Tag color={e.active ? 'blue' : 'default'} style={{ marginLeft: 'auto' }}>
                  {e.active ? '进行中' : '空闲'}
                </Tag>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ===== 办公室日志 Tab =====
function LogTab({ logs, onClear }: { logs: OfficeLogEvent[]; onClear: () => void }) {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#999' }}>最近 {logs.length} 条事件</span>
        <Button size="small" onClick={onClear}>清空</Button>
      </div>
      {logs.length === 0 ? (
        <Empty description="暂无事件" />
      ) : (
        <div className={styles.logTimeline}>
          {logs.map((log) => (
            <div key={log.id} className={`${styles.logEntry} ${styles[log.type] ?? ''}`}>
              <span className={styles.logTime}>{formatTime(log.timestamp)}</span>
              <span className={styles.logText}>{log.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
