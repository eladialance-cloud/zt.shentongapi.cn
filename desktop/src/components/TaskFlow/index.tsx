// 任务流可视化 - v0.3.1 共享组件 Task 3
// SVG 贝塞尔曲线 + 粒子系统，Office 与 TaskCenter 复用
//
// 三种渲染模式（互斥，优先级 multiTargets > from/to > nodes/edges）：
//   1. multiTargets 模式：多目标 Bezier 曲线 + 20 粒子/秒沿曲线粒子流
//   2. from/to 模式：单条 Bezier 曲线 + 文件图标 0.8s 匀速动画
//   3. nodes/edges 模式：原有 SVG 渲染逻辑（向后兼容 Office2DPage 调用）
import { useMemo } from 'react'
import styles from './styles.module.css'

export type TaskFlowNodeStatus = 'pending' | 'running' | 'success' | 'error'

export interface TaskFlowNode {
  id: string
  x: number
  y: number
  label: string
  status?: TaskFlowNodeStatus
}

export interface TaskFlowEdge {
  from: string
  to: string
  active?: boolean
}

/** 单 AI 模式起点 / 终点坐标 */
export interface TaskFlowPoint {
  x: number
  y: number
}

/** 多 AI 协同模式目标（数组首项视为发送方，其余为接收方） */
export interface TaskFlowTarget {
  x: number
  y: number
  label?: string
}

export interface TaskFlowProps {
  /** nodes/edges 模式（向后兼容 Office2DPage 调用） */
  nodes?: TaskFlowNode[]
  edges?: TaskFlowEdge[]
  width?: number
  height?: number
  /** 单 AI 模式起点 */
  from?: TaskFlowPoint
  /** 单 AI 模式终点 */
  to?: TaskFlowPoint
  /** 单 AI 模式主题色（默认 var(--color-primary)） */
  themeColor?: string
  /** 多 AI 协同模式目标数组（首项为发送方，其余为接收方） */
  multiTargets?: TaskFlowTarget[]
  /** 多 AI 模式发送方主题色（默认 var(--color-primary)） */
  senderColor?: string
  /** 多 AI 模式接收方主题色（multiTargets 共用，默认 var(--color-purple)） */
  receiverColor?: string
}

const NODE_RADIUS = 24
/** 控制点偏移 50px 向上（spec 不可变更决策） */
const CONTROL_OFFSET_UP = 50
/** 每条 active 曲线每秒生成 20 粒子（SVG 模式下以 20 个错峰粒子等效） */
const PARTICLES_PER_CURVE = 20
/** 单条曲线粒子动画周期 1s（20 粒子/秒视觉等效） */
const PARTICLE_DUR_SEC = 1
/** 文件图标 0.8s 匀速移动 */
const FILE_ICON_DUR = '0.8s'

const NODE_COLOR: Record<TaskFlowNodeStatus, string> = {
  pending: 'var(--color-text-tertiary)',
  running: 'var(--color-primary)',
  success: 'var(--color-success)',
  error: 'var(--color-error)'
}

interface EdgePath {
  id: string
  d: string
  active: boolean
}

/** 旧版三次贝塞尔路径（nodes/edges 模式，向后兼容） */
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1
  const offset = Math.max(40, Math.abs(dx) * 0.4)
  const cp1x = x1 + offset
  const cp1y = y1
  const cp2x = x2 - offset
  const cp2y = y2
  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`
}

/** 新版三次贝塞尔路径（控制点 cp1y/cp2y 减 50，即向上偏移 50px） */
function cubicBezierPathUp(x1: number, y1: number, x2: number, y2: number): string {
  const cp1x = x1
  const cp1y = y1 - CONTROL_OFFSET_UP
  const cp2x = x2
  const cp2y = y2 - CONTROL_OFFSET_UP
  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`
}

interface MultiCurvePath {
  id: string
  d: string
  label?: string
}

export default function TaskFlow({
  nodes = [],
  edges = [],
  width = 800,
  height = 400,
  from,
  to,
  themeColor,
  multiTargets,
  senderColor,
  receiverColor
}: TaskFlowProps) {
  // ===== 模式判断（优先级: multiTargets > from/to > nodes/edges） =====
  const isMultiTargetMode = !!(multiTargets && multiTargets.length >= 2)
  const isFromToMode = !isMultiTargetMode && !!from && !!to
  const isNodesEdgesMode = !isMultiTargetMode && !isFromToMode

  // ===== nodes/edges 模式 =====
  const nodeMap = useMemo(() => {
    const m = new Map<string, TaskFlowNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  const pathList = useMemo<EdgePath[]>(() => {
    if (!isNodesEdgesMode) return []
    const list: EdgePath[] = []
    edges.forEach((edge, idx) => {
      const f = nodeMap.get(edge.from)
      const t = nodeMap.get(edge.to)
      if (!f || !t) return
      list.push({
        id: `edge-${idx}`,
        d: bezierPath(f.x, f.y, t.x, t.y),
        active: !!edge.active
      })
    })
    return list
  }, [edges, nodeMap, isNodesEdgesMode])

  // ===== multiTargets 模式 =====
  const multiPaths = useMemo<MultiCurvePath[]>(() => {
    if (!isMultiTargetMode || !multiTargets) return []
    const sender = multiTargets[0]
    return multiTargets.slice(1).map((target, idx) => ({
      id: `multi-${idx}`,
      d: cubicBezierPathUp(sender.x, sender.y, target.x, target.y),
      label: target.label
    }))
  }, [multiTargets, isMultiTargetMode])

  // ===== from/to 模式 =====
  const fromToPath = useMemo(() => {
    if (!isFromToMode || !from || !to) return ''
    return cubicBezierPathUp(from.x, from.y, to.x, to.y)
  }, [from, to, isFromToMode])

  const themeColorResolved = themeColor || 'var(--color-primary)'
  const senderColorResolved = senderColor || 'var(--color-primary)'
  const receiverColorResolved = receiverColor || 'var(--color-purple)'

  // 沿曲线生成 20 个错峰粒子（视觉等效 20 粒子/秒，2px/frame 速度由 1s 周期近似）
  const renderCurveParticles = (pathId: string, pathD: string, color: string) => {
    const items = []
    for (let i = 0; i < PARTICLES_PER_CURVE; i++) {
      const begin = `${(i * PARTICLE_DUR_SEC) / PARTICLES_PER_CURVE}s`
      items.push(
        <circle
          key={`${pathId}-p-${i}`}
          r="3"
          fill={color}
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        >
          <animateMotion
            dur={`${PARTICLE_DUR_SEC}s`}
            repeatCount="indefinite"
            begin={begin}
            path={pathD}
          />
        </circle>
      )
    }
    return items
  }

  return (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <marker
          id="taskflow-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L6,3 z" fill="var(--color-text-tertiary)" />
        </marker>
        {/* 多目标模式渐变（每条曲线一个 linearGradient） */}
        {isMultiTargetMode &&
          multiPaths.map((p) => (
            <linearGradient
              key={`grad-${p.id}`}
              id={`grad-${p.id}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={senderColorResolved} />
              <stop offset="100%" stopColor={receiverColorResolved} />
            </linearGradient>
          ))}
      </defs>

      {/* ===== multiTargets 模式：多目标 Bezier 曲线 + 粒子流 ===== */}
      {isMultiTargetMode && (
        <>
          {multiPaths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              className={styles.edge}
              stroke={`url(#grad-${p.id})`}
              strokeWidth={2}
              fill="none"
            />
          ))}
          {multiPaths.map((p) =>
            renderCurveParticles(p.id, p.d, senderColorResolved)
          )}
          {multiTargets &&
            multiTargets
              .slice(1)
              .map((target, idx) =>
                target.label ? (
                  <text
                    key={`label-${idx}`}
                    x={target.x}
                    y={target.y - 8}
                    textAnchor="middle"
                    className={styles.nodeLabel}
                  >
                    {target.label}
                  </text>
                ) : null
              )}
        </>
      )}

      {/* ===== from/to 模式：单条 Bezier 曲线 + 文件图标 0.8s 匀速动画 ===== */}
      {isFromToMode && fromToPath && (
        <>
          <path
            d={fromToPath}
            className={styles.edge}
            stroke={themeColorResolved}
            strokeWidth={2}
            fill="none"
            markerEnd="url(#taskflow-arrow)"
          />
          <text x="0" y="0" fontSize="16" textAnchor="middle" className={styles.fileIcon}>
            📄
            <animateMotion
              dur={FILE_ICON_DUR}
              repeatCount="indefinite"
              path={fromToPath}
            />
          </text>
        </>
      )}

      {/* ===== nodes/edges 模式（向后兼容，不破坏 Office2DPage 调用） ===== */}
      {isNodesEdgesMode && (
        <>
          {pathList.map((p) => (
            <path
              key={p.id}
              d={p.d}
              className={styles.edge}
              markerEnd="url(#taskflow-arrow)"
              stroke={p.active ? 'var(--color-primary)' : 'var(--color-border)'}
            />
          ))}

          {pathList
            .filter((p) => p.active)
            .map((p) => (
              <circle key={`particle-${p.id}`} r="4" className={styles.particle}>
                <animateMotion dur="2s" repeatCount="indefinite" path={p.d} />
              </circle>
            ))}

          {nodes.map((node) => {
            const status: TaskFlowNodeStatus = node.status ?? 'pending'
            const color = NODE_COLOR[status]
            const isRunning = status === 'running'
            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                <circle
                  r={NODE_RADIUS}
                  fill={color}
                  stroke="var(--color-bg-container)"
                  strokeWidth="2"
                />
                {isRunning && (
                  <circle
                    r={NODE_RADIUS - 6}
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeDasharray="8 6"
                    className={styles.spinnerArc}
                  />
                )}
                <text
                  y={NODE_RADIUS + 16}
                  textAnchor="middle"
                  className={styles.nodeLabel}
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </>
      )}
    </svg>
  )
}
