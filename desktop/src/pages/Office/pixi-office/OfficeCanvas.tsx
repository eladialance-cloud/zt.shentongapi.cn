import { useEffect, useRef, useState } from 'react'
import { OfficeScene, type OfficeAgentClick } from '../scene/OfficeScene'
import type { Agent, AgentState } from '../types/agent'

type AgentMenuState = {
  agent: Agent
  rosterNo: number
  x: number
  y: number
  agents: Agent[]
  pickingTarget: boolean
}

const STATE_ACTIONS: Array<{
  label: string
  state: AgentState
  task?: string
}> = [
  { label: '开始工作', state: 'working', task: '处理当前任务…' },
  { label: '进入思考', state: 'thinking', task: '思考下一步…' },
  { label: '暂时空闲', state: 'idle' },
]

const EMOTE_ACTIONS = [
  { label: '生气', animation: 'emotes/angry' },
  { label: '打嗝', animation: 'emotes/burp' },
  { label: '困惑', animation: 'emotes/confused' },
  { label: '哭泣', animation: 'emotes/crying' },
  { label: '倒下', animation: 'emotes/dead' },
  { label: '坚定', animation: 'emotes/determined' },
  { label: '凝视', animation: 'emotes/dramatic-stare' },
  { label: '兴奋', animation: 'emotes/excited' },
  { label: '撒娇', animation: 'emotes/fawning' },
  { label: '脸红', animation: 'emotes/flushed' },
  { label: '欢呼', animation: 'emotes/hooray' },
  { label: '灵感', animation: 'emotes/idea' },
  { label: '刚刚好', animation: 'emotes/just-right' },
  { label: '大笑', animation: 'emotes/laugh' },
  { label: '喜欢', animation: 'emotes/love' },
  { label: '害怕', animation: 'emotes/scared' },
  { label: '遮眼', animation: 'emotes/see-no-evil' },
  { label: '耸肩', animation: 'emotes/shrug' },
  { label: '闷闷不乐', animation: 'emotes/sulk' },
  { label: '冒汗', animation: 'emotes/sweat' },
  { label: '思考表情', animation: 'emotes/thinking' },
  { label: '吐舌', animation: 'emotes/tongue-out' },
  { label: '挥手', animation: 'emotes/wave' },
] as const

interface OfficeCanvasProps {
  /** 场景就绪后回调，供外部控制暂停/继续等 */
  onSceneReady?: (scene: OfficeScene) => void
}

export default function OfficeCanvas({ onSceneReady }: OfficeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<OfficeScene | null>(null)
  const readyRef = useRef(false)
  const [menu, setMenu] = useState<AgentMenuState | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || readyRef.current) return

    const handleAgentClick = (event: OfficeAgentClick) => {
      const rect = host.getBoundingClientRect()
      const menuWidth = 260
      const menuHeight = Math.min(520, rect.height - 24)
      setMenu({
        agent: event.agent,
        rosterNo: event.rosterNo,
        x: Math.max(12, Math.min(event.clientX - rect.left, rect.width - menuWidth - 12)),
        y: Math.max(12, Math.min(event.clientY - rect.top, rect.height - menuHeight - 12)),
        agents: sceneRef.current?.getAgents() ?? [],
        pickingTarget: false,
      })
    }

    const scene = new OfficeScene({ onAgentClick: handleAgentClick })
    sceneRef.current = scene
    onSceneReady?.(scene)

    const doInit = (w: number, h: number) => {
      if (w <= 0 || h <= 0 || readyRef.current) return
      readyRef.current = true
      void scene.init(host, w, h).catch((err) => {
        console.error('[OfficeCanvas] init failed:', err)
        readyRef.current = false
      })
    }

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect
      if (width <= 0 || height <= 0) return
      if (!readyRef.current) {
        doInit(width, height)
      } else {
        sceneRef.current?.resize(width, height)
      }
    })
    ro.observe(host)

    // Fallback: CDP 环境下 ResizeObserver 可能不触发
    const w = host.offsetWidth
    const h = host.offsetHeight
    if (w > 0 && h > 0) {
      doInit(w, h)
    } else {
      requestAnimationFrame(() => {
        doInit(host.offsetWidth, host.offsetHeight)
      })
    }

    return () => {
      ro.disconnect()
      readyRef.current = false
      scene.destroy()
      sceneRef.current = null
    }
  }, [])

  // 菜单关闭逻辑
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.agent-action-menu')) {
        return
      }
      setMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }

    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const applyState = (state: AgentState, task?: string) => {
    if (!menu) return
    sceneRef.current?.setAgentState(menu.agent.id, state, task)
    setMenu(null)
  }

  const playEmote = (animation: string, label: string) => {
    if (!menu) return
    sceneRef.current?.playAgentAnimation(menu.agent.id, animation, label)
    setMenu(null)
  }

  const startInteraction = (targetRosterNo: number, targetName: string) => {
    if (!menu || targetRosterNo === menu.rosterNo) return
    sceneRef.current?.requestDeskVisit(
      menu.rosterNo,
      targetRosterNo,
      `${targetName}，我来和你同步一下。`,
    )
    setMenu(null)
  }

  return (
    <div
      ref={hostRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {menu && (
        <div
          className="agent-action-menu"
          style={{
            position: 'absolute',
            left: menu.x,
            top: menu.y,
            width: 260,
            maxHeight: Math.min(520, 600),
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-lg)',
            padding: '12px 14px',
            zIndex: 100,
            overflowY: 'auto',
            fontSize: 13,
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--color-split)' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{menu.agent.name}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{menu.agent.state}</span>
          </div>

          {!menu.pickingTarget ? (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: 11, marginBottom: 4 }}>互动</div>
                <button
                  type="button"
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--color-text-primary)' }}
                  onClick={() => setMenu((c) => c ? { ...c, pickingTarget: true } : c)}
                >
                  互动…
                </button>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: 11, marginBottom: 4 }}>状态</div>
                {STATE_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--color-text-primary)' }}
                    onClick={() => applyState(action.state, action.task)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div>
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: 11, marginBottom: 4 }}>表情动作</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {EMOTE_ACTIONS.map((action) => (
                    <button
                      key={action.animation}
                      type="button"
                      style={{ padding: '3px 8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-layout)', color: 'var(--color-text-secondary)', cursor: 'pointer', borderRadius: 12, fontSize: 11 }}
                      onClick={() => playEmote(action.animation, action.label)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div>
              <div style={{ color: 'var(--color-text-tertiary)', fontSize: 11, marginBottom: 4 }}>选择互动对象</div>
              <button
                type="button"
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}
                onClick={() => setMenu((c) => c ? { ...c, pickingTarget: false } : c)}
              >
                ← 返回动作
              </button>
              {menu.agents
                .map((agent, index) => ({ agent, rosterNo: index + 1 }))
                .filter(({ agent }) => agent.id !== menu.agent.id)
                .map(({ agent, rosterNo }) => (
                  <button
                    key={agent.id}
                    type="button"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13 }}
                    onClick={() => startInteraction(rosterNo, agent.name)}
                  >
                    和 {agent.name} 互动
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
