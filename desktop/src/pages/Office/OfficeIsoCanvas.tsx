/**
 * OfficeIsoCanvas — AI 办公室等距 2.5D 画布主组件 (Spec upgrade-office-to-isometric-25d Task 3.9~3.10)
 *
 * 替代 OfficeCanvas.tsx (Canvas 2D), 改用 PixiJS 8.x Application 渲染等距 2.5D 场景。
 *
 * 职责:
 *  - PixiJS Application 初始化 + 挂载 + ticker 动画循环
 *  - StrictMode 双挂载防护 (useRef + cleanup destroy)
 *  - 员工移动 + A* 寻路 (复用 astar.ts, 像素坐标系)
 *  - 状态机驱动 + WebSocket 接入
 *  - 对话气泡渲染 (PIXI Text, resolution: devicePixelRatio 防模糊)
 *  - 暴露 window.__officeDispatch / __officeAddBubble / __officeClearBubbles / __officeMoveEmployee / __officeResetAll
 *    接口与 OfficeCanvas.tsx 完全一致, 便于 Office2DPage.tsx 无缝替换
 *
 * Props 与 OfficeCanvas.tsx 完全对齐 (便于直接替换)。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// 在受限运行环境（如 Electron + CSP）中启用 PixiJS unsafe-eval 支持
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { IsoRenderer } from './iso-renderer';
import { preloadOfficeAssets } from './asset-loader';
import { getIsoCanvasLayout } from './iso-config';
import {
  DYNAMIC_AGENT_RADIUS_PX,
  MOVE_SPEED,
  REPATH_INTERVAL_MS,
  getDefaultAStar,
} from './astar';
import { AI_EMPLOYEES, createDefaultTaskFlowEdges, createEmployees } from './employees';
import { RESOURCE_TARGETS } from './office-2d-config';
import {
  canTransition,
  isAtWorkstation,
  STATE_LABELS,
} from './state-machine';
import { directionFromDelta } from './sprites/spritesheet-loader';
import {
  createOfficeWebSocket,
  type OfficeStatusUpdate,
  type OfficeWebSocketClient,
} from '@/services/office-ws';
import type {
  AIEmployee,
  AIEmployeeStatus,
  ChatBubbleType,
  OfficeChatBubble,
  OfficeLogEvent,
  PixelPoint,
  StatusUpdateEvent,
  TaskFlowEdge,
} from './types';
import { DEFAULT_OFFICE_SETTINGS, type OfficeSettings } from './types';
import styles from './office-canvas.module.css';

// ============================================================
// Props (与 OfficeCanvas.tsx 完全对齐)
// ============================================================
export interface OfficeIsoCanvasProps {
  width?: number;
  height?: number;
  className?: string;
  /** 热点点击回调 */
  onHotspotClick?: (hotspot: { id: string; label: string; employeeId?: string }) => void;
  /** 员工点击回调 */
  onEmployeeClick?: (employee: AIEmployee) => void;
  /** 外部状态变更 (用于驱动 Drawer / 日志) */
  onStatusChange?: (event: StatusUpdateEvent) => void;
  /** 是否启用 mock 状态推送 (默认 true; 真实 WebSocket 活跃时自动跳过) */
  enableMockStatus?: boolean;
  /** mock 推送间隔 (ms, 默认 5000) */
  mockStatusIntervalMs?: number;
  /** 设置面板参数 (动画开关/主题色/性能模式/角色显示数量) */
  settings?: OfficeSettings;
}

// ============================================================
// 状态转移辅助
// ============================================================

/** 状态对应目标像素位置 (与 OfficeCanvas.tsx 一致) */
function targetForStatus(emp: AIEmployee, next: AIEmployeeStatus): PixelPoint | null {
  switch (next) {
    case 'IN_MEETING':
      return RESOURCE_TARGETS.meetingRoom;
    case 'AT_RESOURCE': {
      const idx = Math.floor(Math.random() * 3);
      const targets = [RESOURCE_TARGETS.library, RESOURCE_TARGETS.skillWall, RESOURCE_TARGETS.equipmentRoom];
      return targets[idx];
    }
    case 'RESTING':
      return RESOURCE_TARGETS.lounge;
    case 'VISITING':
      return emp.workstation;
    case 'MOVING':
      return { x: 200 + Math.random() * 800, y: 200 + Math.random() * 400 };
    case 'IDLE':
    case 'WORKING':
    case 'WORKING_DEEP':
    case 'OFFLINE':
    default:
      return emp.workstation;
  }
}

/**
 * 移动目的 (用于 tick 内判断 MOVING 到达后应切换的状态)。
 * 由于 types.ts 不可修改, 这里用闭包 Map 跟踪每个员工的移动目的, 不污染 AIEmployee 类型。
 * - 'visit'       : 拜访他人工位, 到达后切 VISITING (3.5s 后由 tick 自动 returnToDesk)
 * - 'at_resource' : 前往资源区 (资料室/技能墙/设备间/前台), 到达后切 AT_RESOURCE
 * - 'in_meeting'  : 前往会议室, 到达后切 IN_MEETING
 * - 'resting'     : 前往休息区, 到达后切 RESTING
 * - 'normal'      : 普通移动 (含 returnToDesk), 到达后随机切 IDLE/WORKING
 */
export type MovingPurpose = 'visit' | 'at_resource' | 'in_meeting' | 'resting' | 'normal';

/** 根据 MovingPurpose 推导 MOVING 到达后应切换的状态 (normal 时随机 IDLE/WORKING) */
function arrivalStatusForPurpose(purpose: MovingPurpose): AIEmployeeStatus {
  switch (purpose) {
    case 'visit': return 'VISITING';
    case 'at_resource': return 'AT_RESOURCE';
    case 'in_meeting': return 'IN_MEETING';
    case 'resting': return 'RESTING';
    case 'normal':
    default:
      return Math.random() > 0.5 ? 'IDLE' : 'WORKING';
  }
}

/** 单帧 tick: 更新员工位置 / 状态超时切换
 *  @param purposeMap 移动目的 Map (可选), 由组件内 movingPurposeRef 传入;
 *                   用于在 MOVING 到达后决定切换为 VISITING / AT_RESOURCE / IN_MEETING / RESTING / IDLE|WORKING。
 *                   到达并完成切换后, 对应 key 会被删除。
 */
function tickEmployees(
  employees: AIEmployee[],
  nowTs: number,
  deltaMs: number,
  purposeMap?: Map<string, MovingPurpose>,
): void {
  const dtSec = deltaMs / 1000;
  const VISITING_TIMEOUT_MS = 3500; // VISITING 3.5s 后返回工位

  for (const emp of employees) {
    // 状态超时: VISITING 3.5s 后切回 MOVING 返回工位 (即自动 returnToDesk)
    if (emp.status === 'VISITING' && nowTs - emp.statusStartTime > VISITING_TIMEOUT_MS) {
      const target = emp.workstation;
      emp.status = 'MOVING';
      emp.statusStartTime = nowTs;
      emp.targetPos = target;
      emp.path = [];
      emp.lastRepathAt = undefined;
      // 标记为返回工位 (normal), 到达后切 IDLE/WORKING
      purposeMap?.set(emp.id, 'normal');
    }

    if (
      emp.status === 'MOVING' ||
      emp.status === 'VISITING' ||
      emp.status === 'IN_MEETING' ||
      emp.status === 'AT_RESOURCE' ||
      emp.status === 'RESTING'
    ) {
      // 若不在工位且无路径, 计算路径
      if (emp.path.length === 0) {
        const target = emp.targetPos;
        if (Math.abs(emp.currentPos.x - target.x) < 2 && Math.abs(emp.currentPos.y - target.y) < 2) {
          // 已到达: 根据移动目的切换状态
          if (emp.status === 'MOVING') {
            const purpose = purposeMap?.get(emp.id) ?? 'normal';
            emp.status = arrivalStatusForPurpose(purpose);
            emp.statusStartTime = nowTs;
            purposeMap?.delete(emp.id);
          }
        } else {
          // 重新规划路径
          const shouldRepath = !emp.lastRepathAt || (nowTs - emp.lastRepathAt > REPATH_INTERVAL_MS);
          if (shouldRepath) {
            const astar = getDefaultAStar();
            const dynamicObstacles = employees
              .filter((other) => other.id !== emp.id)
              .map((other) => ({
                cx: other.currentPos.x,
                cy: other.currentPos.y,
                radius: DYNAMIC_AGENT_RADIUS_PX,
              }));
            const path = astar.findPathPixels(emp.currentPos, target, dynamicObstacles);
            if (path.length > 1) {
              emp.path = path.slice(1);
            } else {
              emp.path = [target];
            }
            emp.lastRepathAt = nowTs;
          }
        }
      } else {
        // 沿 path 移动
        const next = emp.path[0];
        const dx = next.x - emp.currentPos.x;
        const dy = next.y - emp.currentPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.1) {
          emp.direction = directionFromDelta(dx, dy);
        }
        const speed = emp.moveSpeed ?? MOVE_SPEED.normal;
        const step = speed * dtSec;
        if (dist <= step) {
          emp.currentPos = { x: next.x, y: next.y };
          emp.path.shift();
          if (emp.path.length === 0) {
            // 到达终点: 根据移动目的切换状态
            if (emp.status === 'MOVING') {
              const purpose = purposeMap?.get(emp.id) ?? 'normal';
              emp.status = arrivalStatusForPurpose(purpose);
              emp.statusStartTime = nowTs;
              purposeMap?.delete(emp.id);
            }
          }
        } else {
          emp.currentPos = {
            x: emp.currentPos.x + (dx / dist) * step,
            y: emp.currentPos.y + (dy / dist) * step,
          };
        }
      }
    }
  }

  // 简单碰撞规避
  for (let i = 0; i < employees.length; i++) {
    for (let j = i + 1; j < employees.length; j++) {
      const a = employees[i];
      const b = employees[j];
      const dx = a.currentPos.x - b.currentPos.x;
      const dy = a.currentPos.y - b.currentPos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 16 * 16 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (16 - d) / 2;
        a.currentPos.x += (dx / d) * push + 5;
        b.currentPos.x -= (dx / d) * push - 5;
      }
    }
  }
}

/** 模拟状态推送: 随机切换员工状态 */
function pickRandomStatus(emp: AIEmployee): AIEmployeeStatus {
  const choices: AIEmployeeStatus[] = [
    'IDLE', 'WORKING', 'WORKING_DEEP', 'RESTING',
    'AT_RESOURCE', 'IN_MEETING', 'MOVING',
  ];
  if (Math.random() < 0.1) choices.push('OFFLINE');
  let next: AIEmployeeStatus;
  do {
    next = choices[Math.floor(Math.random() * choices.length)];
  } while (next === emp.status);
  return next;
}

// ============================================================
// 主组件
// ============================================================
export default function OfficeIsoCanvas({
  width,
  height,
  className = '',
  onHotspotClick,
  onEmployeeClick,
  onStatusChange,
  enableMockStatus = true,
  mockStatusIntervalMs = 5000,
  settings = DEFAULT_OFFICE_SETTINGS,
}: OfficeIsoCanvasProps) {
  const divRef = useRef<HTMLDivElement>(null);
  // K4 fix: init 失败时显示降级 UI
  const [initError, setInitError] = useState<string | null>(null);
  // PixiJS Application + IsoRenderer (useRef 持有, 避免重渲染)
  const appRef = useRef<Application | null>(null);
  const rendererRef = useRef<IsoRenderer | null>(null);
  // K5 fix: 同步初始化锁，防止 StrictMode 双挂载竞态
  const initializingRef = useRef(false);
  // 员工/边/气泡状态 (React state 用于触发 UI 更新, ref 镜像用于 RAF 内访问最新值)
  const [employees, setEmployees] = useState<AIEmployee[]>(() => createEmployees());
  const [edges] = useState<TaskFlowEdge[]>(() => createDefaultTaskFlowEdges());
  const [bubbles, setBubbles] = useState<OfficeChatBubble[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined);

  const employeesRef = useRef(employees);
  const edgesRef = useRef(edges);
  const bubblesRef = useRef(bubbles);
  const selectedRef = useRef(selectedEmployeeId);
  const onHotspotClickRef = useRef(onHotspotClick);
  const onEmployeeClickRef = useRef(onEmployeeClick);
  const onStatusChangeRef = useRef(onStatusChange);
  const settingsRef = useRef(settings);
  const wsClientRef = useRef<OfficeWebSocketClient | null>(null);
  const bubbleIdRef = useRef(0);
  // Task 5: 移动目的 Map — 跟踪每个员工 MOVING 的目的 (visit/at_resource/in_meeting/resting/normal),
  // 由 visitEmployee / returnToDesk / moveEmployeeToDesk / moveEmployeeToZone 设置,
  // tickEmployees 在 MOVING 到达后据此切换状态, 并删除 key。
  const movingPurposeRef = useRef<Map<string, MovingPurpose>>(new Map());

  useEffect(() => { employeesRef.current = employees; }, [employees]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { bubblesRef.current = bubbles; }, [bubbles]);
  useEffect(() => { selectedRef.current = selectedEmployeeId; }, [selectedEmployeeId]);
  useEffect(() => { onHotspotClickRef.current = onHotspotClick; }, [onHotspotClick]);
  useEffect(() => { onEmployeeClickRef.current = onEmployeeClick; }, [onEmployeeClick]);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // A* 实例 (惰性创建, 复用全局单例)
  const astar = useMemo(() => getDefaultAStar(), []);

  // 主题色变更时更新所有 AI 员工 themeColor
  useEffect(() => {
    setEmployees((prev) =>
      prev.map((e) => ({ ...e, themeColor: settings.themeColor })),
    );
  }, [settings.themeColor]);

  // ============================================================
  // PixiJS Application 初始化 + ticker (StrictMode 双挂载防护)
  // ============================================================
  useEffect(() => {
    const container = divRef.current;
    if (!container) return;
    let cancelled = false;
    let tickerCallback: ((ticker: { deltaMS: number }) => void) | null = null;

    // K5 fix: 同步初始化锁，防止 StrictMode 双挂载竞态
    if (initializingRef.current || appRef.current) return;
    initializingRef.current = true;

    void (async () => {
      const layout = getIsoCanvasLayout();
      let app: Application | null = new Application();
      const initOptions = {
        background: 0xf5f5f0,
        antialias: true,
        resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
        autoDensity: true,
        width: width ?? layout.canvasWidth,
        height: height ?? layout.canvasHeight,
      };
      try {
        // 优先尝试 WebGL（默认）
        await app.init(initOptions);
      } catch (webglErr) {
        console.warn('[OfficeIsoCanvas] WebGL init failed, fallback to Canvas2D', webglErr);
        // 销毁失败的 Application 实例，避免资源泄漏
        try { app.destroy(true); } catch { /* ignore */ }
        // PixiJS 8.x 默认失败不回退，需显式指定 preference: 'canvas'
        app = new Application();
        try {
          await app.init({ ...initOptions, preference: 'canvas' });
        } catch (canvasErr) {
          console.error('[OfficeIsoCanvas] PixiJS Application init failed (WebGL + Canvas2D)', canvasErr);
          try { app.destroy(true); } catch { /* ignore */ }
          setInitError('图形加速不可用，请检查显卡驱动或关闭硬件加速后重试');
          initializingRef.current = false;
          return;
        }
      }
      // K5 fix: 检查取消标记和同步锁
      if (cancelled || appRef.current) {
        app.destroy(true);
        initializingRef.current = false;
        return;
      }
      appRef.current = app;
      // K6 fix: appendChild 前检查容器仍连接 DOM
      if (!container.isConnected) {
        console.warn('[OfficeIsoCanvas] Container detached before appendChild');
        app.destroy(true);
        appRef.current = null;
        initializingRef.current = false;
        return;
      }
      container.appendChild(app.canvas);

      // 创建等距渲染器
      const renderer = new IsoRenderer(app);
      rendererRef.current = renderer;
      // 点击员工回调
      renderer.onEmployeeClick = (id: string) => {
        const emp = employeesRef.current.find((e) => e.id === id);
        if (emp && onEmployeeClickRef.current) {
          onEmployeeClickRef.current(emp);
        }
        setSelectedEmployeeId((prev) => (prev === id ? undefined : id));
      };
      // 点击地块回调: 移动选中员工到该位置
      renderer.onTileClick = (px: number, py: number) => {
        // 检查是否点中热点 (复用 HOTSPOTS 逻辑)
        // 简化: 仅做空白处点击 - 关闭选中
        void px;
        void py;
        setSelectedEmployeeId(undefined);
      };

      // 预加载 PNG 素材 (Task 5: 在 renderer.init() 前加载所有静态 PNG + 角色精灵图)
      // 加载失败时 renderer 各分支会自动走矢量 fallback，场景不空白
      try {
        await renderer.loadAssets();
        await preloadOfficeAssets();
      } catch (err) {
        console.warn('[OfficeIsoCanvas] 素材预加载失败，将使用矢量 fallback', err);
      }

      // 初始化静态层
      renderer.init();

      // ticker 动画循环
      let lastTs = performance.now();
      let lastRenderTs = 0;
      tickerCallback = (ticker) => {
        try {
        const now = performance.now();
        const delta = Math.min(100, now - lastTs);
        lastTs = now;
        // Task 24.2: animationEnabled === false 时停止 tick (但仍可单帧渲染)
        if (!settingsRef.current.animationEnabled) {
          // 仅渲染一次静态画面 (用 renderer.init 已绘制静态层, 这里只渲染一帧员工)
          if (now - lastRenderTs > 1000) {
            lastRenderTs = now;
            const visibleCount = settingsRef.current.visibleEmployeeCount;
            const visibleEmployees = employeesRef.current.slice(0, Math.max(1, visibleCount));
            renderer.render(visibleEmployees, bubblesRef.current, selectedRef.current, Date.now());
          }
          return;
        }
        // Task 24.4: 性能模式 fps 限制
        const mode = settingsRef.current.performanceMode;
        const interval = mode === 'high' ? 1000 / 60 : mode === 'power-saving' ? 1000 / 15 : 1000 / 30;
        if (now - lastRenderTs < interval) return;
        lastRenderTs = now;
        // tick 更新员工位置 / 状态 (传入 movingPurposeRef 以便到达后按目的切换状态)
        tickEmployees(employeesRef.current, Date.now(), delta, movingPurposeRef.current);
        // 清理过期气泡
        const liveBubbles = bubblesRef.current.filter((b) => {
          const dur = b.duration ?? 3000;
          return (Date.now() - b.createdAt) < dur;
        });
        if (liveBubbles.length !== bubblesRef.current.length) {
          bubblesRef.current = liveBubbles;
          setBubbles(liveBubbles);
        }
        // 渲染
        const visibleCount = settingsRef.current.visibleEmployeeCount;
        const visibleEmployees = employeesRef.current.slice(0, Math.max(1, visibleCount));
        renderer.render(visibleEmployees, bubblesRef.current, selectedRef.current, Date.now());
        void ticker.deltaMS;
        } catch (tickErr) {
          // K7 fix: ticker 回调异常不應停止動畫循環
          console.error('[OfficeIsoCanvas] ticker callback error', tickErr);
        }
      };
      app.ticker.add(tickerCallback);
    })();

    return () => {
      cancelled = true;
      initializingRef.current = false;
      // 清理 ticker
      if (appRef.current && tickerCallback) {
        appRef.current.ticker.remove(tickerCallback);
      }
      // 清理渲染器
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      // 清理 Application
      if (appRef.current) {
        try {
          appRef.current.destroy(true, { children: true });
        } catch (err) {
          console.error('[OfficeIsoCanvas] destroy failed', err);
        }
        appRef.current = null;
      }
      // 清空 DOM
      if (container && container.firstChild) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [astar]);

  // ============================================================
  // 每秒同步 state (触发 React 重渲染, 让 Drawer 看到最新数据)
  // ============================================================
  useEffect(() => {
    const timer = setInterval(() => {
      setEmployees((prev) => prev.map((e) => ({ ...e, currentPos: { ...e.currentPos } })));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ============================================================
  // mock 状态推送 (每 mockStatusIntervalMs 切换一个员工状态)
  // ============================================================
  useEffect(() => {
    if (!enableMockStatus) return;
    const useMock = import.meta.env.VITE_OFFICE_USE_MOCK_WS !== 'false';
    if (!useMock) return;
    const timer = setInterval(() => {
      const list = employeesRef.current;
      if (list.length === 0) return;
      const idx = Math.floor(Math.random() * list.length);
      const emp = list[idx];
      const next = pickRandomStatus(emp);
      if (!canTransition(emp.status, next)) return;
      const target = targetForStatus(emp, next);
      const event: StatusUpdateEvent = { employeeId: emp.id, status: next, reason: 'mock' };
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id !== emp.id) return e;
          const updated: AIEmployee = {
            ...e,
            status: next,
            statusStartTime: Date.now(),
            path: [],
            lastRepathAt: undefined,
            targetPos: target ?? e.workstation,
          };
          if (next === 'WORKING' || next === 'WORKING_DEEP') {
            updated.todayCompleted += Math.random() > 0.5 ? 1 : 0;
          }
          return updated;
        }),
      );
      if (onStatusChangeRef.current) onStatusChangeRef.current(event);
    }, mockStatusIntervalMs);
    return () => clearInterval(timer);
  }, [enableMockStatus, mockStatusIntervalMs]);

  // ============================================================
  // 真实 WebSocket 接入
  // ============================================================
  useEffect(() => {
    const wsClient = createOfficeWebSocket();
    if (!wsClient) {
      wsClientRef.current = null;
      return;
    }
    wsClientRef.current = wsClient;
    const unsubscribe = wsClient.subscribe((update: OfficeStatusUpdate) => {
      const emp = employeesRef.current.find((x) => x.id === update.employeeId);
      if (!emp) return;
      if (!canTransition(emp.status, update.status)) return;
      const target = targetForStatus(emp, update.status);
      const event: StatusUpdateEvent = { employeeId: update.employeeId, status: update.status, reason: 'websocket' };
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === update.employeeId
            ? {
                ...e,
                status: update.status,
                statusStartTime: Date.now(),
                path: [],
                lastRepathAt: undefined,
                targetPos: target ?? e.workstation,
              }
            : e,
        ),
      );
      if (onStatusChangeRef.current) onStatusChangeRef.current(event);
    });
    wsClient.connect();
    return () => {
      unsubscribe();
      wsClient.disconnect();
      wsClientRef.current = null;
    };
  }, []);

  // ============================================================
  // 状态变更派发 (供外部按钮/Demo 调用)
  // ============================================================
  const dispatchStatusChange = useCallback((event: StatusUpdateEvent) => {
    const emp = employeesRef.current.find((x) => x.id === event.employeeId);
    if (!emp) return;
    if (!canTransition(emp.status, event.status)) return;
    const target = targetForStatus(emp, event.status);
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === event.employeeId
          ? {
              ...e,
              status: event.status,
              statusStartTime: Date.now(),
              path: [],
              lastRepathAt: undefined,
              targetPos: target ?? e.workstation,
            }
          : e,
      ),
    );
    if (onStatusChangeRef.current) onStatusChangeRef.current(event);
  }, []);

  const dispatchRef = useRef(dispatchStatusChange);
  useEffect(() => { dispatchRef.current = dispatchStatusChange; }, [dispatchStatusChange]);

  // 暴露 window.__officeDispatch
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __officeDispatch?: (e: StatusUpdateEvent) => void };
    w.__officeDispatch = dispatchStatusChange;
    return () => {
      delete w.__officeDispatch;
    };
  }, [dispatchStatusChange]);

  // ============================================================
  // 对话气泡接口 (供 Demo / 外部调用)
  // ============================================================
  const addBubble = useCallback((
    employeeId: string,
    type: ChatBubbleType,
    content: string,
    emoji?: string,
    duration?: number,
  ) => {
    const bubble: OfficeChatBubble = {
      id: `bubble-${bubbleIdRef.current++}`,
      employeeId,
      type,
      content,
      emoji,
      duration,
      createdAt: Date.now(),
    };
    setBubbles((prev) => [...prev, bubble]);
  }, []);

  const clearBubbles = useCallback(() => {
    setBubbles([]);
    bubblesRef.current = [];
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      __officeAddBubble?: typeof addBubble;
      __officeClearBubbles?: typeof clearBubbles;
    };
    w.__officeAddBubble = addBubble;
    w.__officeClearBubbles = clearBubbles;
    return () => {
      delete w.__officeAddBubble;
      delete w.__officeClearBubbles;
    };
  }, [addBubble, clearBubbles]);

  // ============================================================
  // 移动员工 (A* 寻路, Promise 返回到达)
  // ============================================================
  const moveEmployee = useCallback(async (id: string, to: PixelPoint, speed?: number): Promise<void> => {
    return new Promise((resolve) => {
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          const dynamicObstacles = prev
            .filter((o) => o.id !== id)
            .map((o) => ({
              cx: o.currentPos.x,
              cy: o.currentPos.y,
              radius: DYNAMIC_AGENT_RADIUS_PX,
            }));
          const path = astar.findPathPixels(e.currentPos, to, dynamicObstacles);
          return {
            ...e,
            status: 'MOVING',
            statusStartTime: Date.now(),
            targetPos: to,
            path: path.length > 1 ? path.slice(1) : [to],
            lastRepathAt: undefined,
            moveSpeed: speed ?? e.moveSpeed ?? MOVE_SPEED.normal,
          };
        }),
      );
      const checkArrival = setInterval(() => {
        const emp = employeesRef.current.find((x) => x.id === id);
        if (!emp) {
          clearInterval(checkArrival);
          resolve();
          return;
        }
        const dx = emp.currentPos.x - to.x;
        const dy = emp.currentPos.y - to.y;
        if (dx * dx + dy * dy < 16) {
          clearInterval(checkArrival);
          resolve();
        }
      }, 200);
      setTimeout(() => {
        clearInterval(checkArrival);
        resolve();
      }, 10000);
    });
  }, [astar]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __officeMoveEmployee?: typeof moveEmployee };
    w.__officeMoveEmployee = moveEmployee;
    return () => {
      delete w.__officeMoveEmployee;
    };
  }, [moveEmployee]);

  // ============================================================
  // Task 5.3: visitEmployee — 拜访他人工位
  // 流程: visitor MOVING → target.workstation → VISITING (3.5s) → 自动 returnToDesk → MOVING → 工位 → IDLE/WORKING
  // ============================================================

  /**
   * 让 visitorId 走到 targetId 工位前拜访。
   * - 调用 A* 寻路到目标员工工位 (动态障碍物 = 其他 MOVING 员工, 半径 16px 圆形)
   * - 设置 status='MOVING', targetPos=target.workstation, path=A* 结果
   * - 在 movingPurposeRef 标记 purpose='visit', tick 到达后切 VISITING
   * - VISITING 3.5s 超时后由 tickEmployees 自动切 MOVING 返回工位 (purpose='normal')
   * @returns true 表示已派发; false 表示参数非法或状态机不允许 (canTransition 失败)
   */
  const visitEmployee = useCallback((visitorId: string, targetId: string): boolean => {
    if (visitorId === targetId) return false;
    const visitor = employeesRef.current.find((e) => e.id === visitorId);
    const target = employeesRef.current.find((e) => e.id === targetId);
    if (!visitor || !target) return false;
    // 状态机校验: 当前状态必须能切到 MOVING
    if (!canTransition(visitor.status, 'MOVING')) return false;
    // 记录移动目的为 visit (tick 到达后切 VISITING)
    movingPurposeRef.current.set(visitorId, 'visit');
    // 复用 moveEmployee 完成 A* 寻路 + 状态设置 (内部已传入动态障碍物)
    void moveEmployee(visitorId, target.workstation);
    return true;
  }, [moveEmployee]);

  /**
   * Task 5.3: returnToDesk — 返回自己工位
   * - 调用 A* 寻路回 visitor.workstation
   * - 设置 status='MOVING', purpose='normal' (到达后切 IDLE/WORKING)
   * 通常由 tickEmployees 在 VISITING 3.5s 超时后自动触发; 也可外部主动调用 (如 Demo 中断)。
   */
  const returnToDesk = useCallback((visitorId: string): boolean => {
    const visitor = employeesRef.current.find((e) => e.id === visitorId);
    if (!visitor) return false;
    if (!canTransition(visitor.status, 'MOVING')) return false;
    // 标记为返回工位 (normal), 到达后切 IDLE/WORKING
    movingPurposeRef.current.set(visitorId, 'normal');
    void moveEmployee(visitorId, visitor.workstation);
    return true;
  }, [moveEmployee]);

  // 暴露 visitEmployee / returnToDesk 到 window (供 Office2DPage / officeBridge 调用)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      __officeVisitEmployee?: typeof visitEmployee;
      __officeReturnToDesk?: typeof returnToDesk;
    };
    w.__officeVisitEmployee = visitEmployee;
    w.__officeReturnToDesk = returnToDesk;
    return () => {
      delete w.__officeVisitEmployee;
      delete w.__officeReturnToDesk;
    };
  }, [visitEmployee, returnToDesk]);

  // ============================================================
  // Task 5.4: moveEmployeeToDesk / moveEmployeeToZone
  // ============================================================

  /**
   * 让员工返回自己工位 (与 returnToDesk 行为一致, 语义别名, 供 officeBridge 调用)。
   * - 调用 A* 寻路到 emp.workstation
   * - 设置 status='MOVING', purpose='normal', 到达后切 IDLE/WORKING
   */
  const moveEmployeeToDesk = useCallback((empId: string): boolean => {
    const emp = employeesRef.current.find((e) => e.id === empId);
    if (!emp) return false;
    if (!canTransition(emp.status, 'MOVING')) return false;
    movingPurposeRef.current.set(empId, 'normal');
    void moveEmployee(empId, emp.workstation);
    return true;
  }, [moveEmployee]);

  /**
   * 让员工移动到指定区域 (zoneId 取自 RESOURCE_TARGETS)。
   * - 根据 zoneId 决定到达后状态:
   *   meetingRoom → IN_MEETING
   *   lounge      → RESTING
   *   library / skillWall / equipmentRoom / reception → AT_RESOURCE
   *   其他        → normal (IDLE/WORKING)
   * - 调用 A* 寻路 (动态障碍物 = 其他员工, 半径 16px 圆形)
   */
  const moveEmployeeToZone = useCallback((empId: string, zoneId: string): boolean => {
    const emp = employeesRef.current.find((e) => e.id === empId);
    if (!emp) return false;
    const target = RESOURCE_TARGETS[zoneId];
    if (!target) return false;
    if (!canTransition(emp.status, 'MOVING')) return false;
    // 根据 zoneId 推导到达后状态 (MovingPurpose)
    let purpose: MovingPurpose;
    switch (zoneId) {
      case 'meetingRoom': purpose = 'in_meeting'; break;
      case 'lounge': purpose = 'resting'; break;
      case 'library':
      case 'skillWall':
      case 'equipmentRoom':
      case 'reception':
        purpose = 'at_resource'; break;
      default: purpose = 'normal';
    }
    movingPurposeRef.current.set(empId, purpose);
    void moveEmployee(empId, target);
    return true;
  }, [moveEmployee]);

  // 暴露 moveEmployeeToDesk / moveEmployeeToZone 到 window
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      __officeMoveEmployeeToDesk?: typeof moveEmployeeToDesk;
      __officeMoveEmployeeToZone?: typeof moveEmployeeToZone;
    };
    w.__officeMoveEmployeeToDesk = moveEmployeeToDesk;
    w.__officeMoveEmployeeToZone = moveEmployeeToZone;
    return () => {
      delete w.__officeMoveEmployeeToDesk;
      delete w.__officeMoveEmployeeToZone;
    };
  }, [moveEmployeeToDesk, moveEmployeeToZone]);

  // ============================================================
  // 重置所有员工
  // ============================================================
  const resetAllEmployees = useCallback(() => {
    const now = Date.now();
    // 清理移动目的 Map (避免 reset 后残留 purpose 影响下次移动到达判断)
    movingPurposeRef.current.clear();
    setEmployees((prev) => prev.map((e) => ({
      ...e,
      status: 'IDLE' as AIEmployeeStatus,
      statusStartTime: now,
      path: [],
      lastRepathAt: undefined,
      targetPos: { ...e.workstation },
      currentPos: { ...e.workstation },
      direction: undefined,
      taskCompleteAt: undefined,
      taskFailedAt: undefined,
    })));
    clearBubbles();
  }, [clearBubbles]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __officeResetAll?: typeof resetAllEmployees };
    w.__officeResetAll = resetAllEmployees;
    return () => {
      delete w.__officeResetAll;
    };
  }, [resetAllEmployees]);

  // ============================================================
  // WebGL / Canvas2D 均初始化失败时：请求主进程关闭硬件加速并重启
  // ============================================================
  const handleDisableHardwareAcceleration = useCallback(async () => {
    try {
      await window.electronAPI?.app?.disableHardwareAcceleration?.();
    } catch (err) {
      console.error('[OfficeIsoCanvas] disableHardwareAcceleration IPC failed', err);
      // IPC 失败时仍保留原降级提示，不额外阻塞用户
    }
  }, []);

  // ============================================================
  // 渲染 React DOM (PixiJS canvas 通过 ref 挂载)
  // ============================================================
  return (
    <div className={`${styles.wrap} ${className}`}>
      {initError ? (
        // K4 fix: PixiJS 初始化失败降级 UI
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          minHeight: 600,
          color: 'var(--color-text-secondary, #666)',
          gap: 12,
        }}>
          <span style={{ fontSize: 48 }}>🎮</span>
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>图形加速不可用</p>
          <p style={{ fontSize: 13, margin: 0, textAlign: 'center', maxWidth: 400 }}>{initError}</p>
          <button
            type="button"
            onClick={handleDisableHardwareAcceleration}
            style={{
              marginTop: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              color: '#fff',
              backgroundColor: 'var(--color-primary, #1677ff)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            关闭硬件加速并重启应用
          </button>
        </div>
      ) : (
        <div
          ref={divRef}
          className={styles.canvas}
          style={{
            width: '100%',
            height: 'auto',
            maxWidth: 1200,
            minHeight: 600,
            overflow: 'hidden',
          }}
        />
      )}
      <div className={styles.hint}>
        等距 2.5D 视图 · 点击员工查看详情 · 状态每 {Math.round(mockStatusIntervalMs / 1000)}s 自动切换
      </div>
    </div>
  );
}

// ============================================================
// 类型/常量导出 (与 OfficeCanvas.tsx 保持兼容)
// ============================================================
export type { AIEmployee, AIEmployeeStatus, OfficeLogEvent };
export { STATE_LABELS, isAtWorkstation };
// AI_EMPLOYEES 默认导出兼容 (Office2DPage.tsx 使用)
export { AI_EMPLOYEES };
