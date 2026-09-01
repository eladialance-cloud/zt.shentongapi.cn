import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { OfficeAgent, OfficeDesk, OfficeConfig, OfficeAgentState } from './types'
import { hexToNumber, resolveColorMap } from './layout'

// ============================================================
// 场景常量
// ============================================================
const SCENE_WIDTH = 960
const SCENE_HEIGHT = 640

// ============================================================
// 角色精灵（纯2D 矢量：圆形大头 + 身体 + 状态点 + 标签）
// ============================================================
class AgentSprite extends Container {
  shadow: Graphics
  body: Graphics
  statusDot: Graphics
  labelText: Text | null = null
  agentId: string
  private walkPhase = 0
  private currentAgent: OfficeAgent

  constructor(agent: OfficeAgent, showLabel: boolean) {
    super()
    this.agentId = agent.id
    this.currentAgent = agent

    // 阴影
    this.shadow = new Graphics()
    this.shadow.ellipse(0, 16, 18, 5)
    this.shadow.fill({ color: 0x000000, alpha: 0.12 })
    this.addChild(this.shadow)

    // 身体（矢量绘制）
    this.body = new Graphics()
    this.addChild(this.body)

    // 状态指示点
    this.statusDot = new Graphics()
    this.addChild(this.statusDot)

    if (showLabel) {
      this.labelText = new Text({
        text: agent.name,
        style: new TextStyle({
          fontSize: 12,
          fill: '#334155',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: '600',
          align: 'center',
          stroke: { color: 0xFFFFFF, width: 3 },
        }),
      })
      this.labelText.anchor.set(0.5, 0)
      this.labelText.position.set(0, -52)
      this.addChild(this.labelText)
    }

    this.updateAgent(agent)
    this.position.set(agent.x, agent.y)
    this.drawBody()
  }

  /** 绘制矢量身体：圆形大头 + 身体 + 手臂 */
  private drawBody() {
    const g = this.body
    g.clear()
    const agent = this.currentAgent
    const state = agent.state
    const bounce = state === 'walking' ? Math.sin(this.walkPhase) * 2 : state === 'working' ? Math.sin(this.walkPhase * 2) * 1 : 0
    const facing = agent.facing
    const colorHex = parseInt(agent.color.replace('#', ''), 16) || 0x2563EB

    // 身体（圆角矩形）
    g.roundRect(-11, -8 + bounce, 22, 18, 4)
    g.fill(colorHex)

    // 头（大圆形）
    g.circle(facing * 1, -20 + bounce, 11)
    g.fill(0xffe0c4)
    // 头发
    g.roundRect(facing * 1 - 11, -30 + bounce, 22, 8, 3)
    g.fill(0x2a2a30)

    // 眼睛
    g.circle(facing * 1 - 4, -20 + bounce, 1.5)
    g.fill(0x333333)
    g.circle(facing * 1 + 4, -20 + bounce, 1.5)
    g.fill(0x333333)

    // 打字手臂
    if (state === 'working') {
      const armY = -4 + bounce + Math.sin(this.walkPhase * 3) * 2
      g.roundRect(facing * 12, armY, 8, 4, 2)
      g.fill(colorHex)
      g.circle(facing * 15, armY + 2, 2.5)
      g.fill(0xffe0c4)
    }

    // 思考点点
    if (state === 'thinking') {
      for (let i = 0; i < 3; i++) {
        g.circle(14 + i * 6, -36 + bounce, 2)
        g.fill({ color: 0x9b6dd7, alpha: i <= Math.floor(this.walkPhase) % 3 ? 1 : 0.3 })
      }
    }
  }

  updateAgent(agent: OfficeAgent) {
    this.currentAgent = agent
    const sd = this.statusDot
    sd.clear()
    const dotColor = agent.instanceStatus === 'running' ? 0x34D399 :
      agent.instanceStatus === 'error' ? 0xF87171 :
      agent.instanceStatus === 'stopped' ? 0xFBBF24 : 0x6E7681
    sd.circle(14, -38, 5)
    sd.fill(0xFFFFFF)
    sd.circle(14, -38, 3.5)
    sd.fill(dotColor)
    sd.stroke({ color: 0xFFFFFF, width: 1 })

    if (this.labelText) this.labelText.text = agent.name
    this.drawBody()
  }

  updateAnim(dt: number, agent: OfficeAgent) {
    this.currentAgent = agent
    this.walkPhase += dt * 8
    this.drawBody()
  }

  updatePosition(x: number, y: number) {
    this.position.set(x, y)
  }
}

// ============================================================
// 工位（桌子+椅子，矢量绘制，颜色来自 config）
// ============================================================
class DeskWorkstation extends Container {
  readonly deskId: string
  readonly shadowGfx = new Graphics()
  readonly deskLayer = new Container()
  readonly chairLayer = new Container()
  readonly occupiedIndicator = new Graphics()

  private desk: OfficeDesk
  private colors: { deskTop: number; chairColor: number }

  constructor(desk: OfficeDesk, colors: { deskTop: number; chairColor: number }) {
    super()
    this.deskId = desk.id
    this.desk = desk
    this.colors = colors

    const seatOffsetY = desk.seatY - desk.y

    for (const part of [this.shadowGfx, this.deskLayer, this.chairLayer, this.occupiedIndicator]) {
      part.position.set(desk.x, desk.y)
    }

    this.drawShadow(seatOffsetY)
    this.drawDesk(seatOffsetY)
    this.drawChair(seatOffsetY)

    this.shadowGfx.zIndex = desk.y - 0.5
    this.deskLayer.zIndex = desk.y
    this.chairLayer.zIndex = desk.seatY + 2
    this.occupiedIndicator.zIndex = desk.seatY + 2.5

    this.addChild(this.shadowGfx, this.deskLayer, this.chairLayer, this.occupiedIndicator)
  }

  setOccupied(occupied: boolean) {
    this.occupiedIndicator.clear()
    if (occupied) {
      const seatOffsetY = this.desk.seatY - this.desk.y
      this.occupiedIndicator.circle(0, seatOffsetY - 8, 3)
      this.occupiedIndicator.fill({ color: 0x50B86C, alpha: 0.6 })
    }
  }

  private drawShadow(seatOffsetY: number) {
    const g = this.shadowGfx
    g.clear()
    g.ellipse(0, seatOffsetY + 20, 50, 12)
    g.fill({ color: 0x000000, alpha: 0.08 })
  }

  private drawDesk(seatOffsetY: number) {
    const g = new Graphics()
    const c = this.colors.deskTop
    // 桌面
    g.roundRect(-50, -8, 100, 36, 8)
    g.fill(c)
    g.stroke({ color: 0xD8D0C4, width: 1.5, alpha: 0.5 })
    // 桌沿
    g.roundRect(-48, 24, 96, 6, 3)
    g.fill({ color: c, alpha: 0.85 })
    // 显示器
    g.roundRect(-24, -52, 48, 32, 6)
    g.fill(0x2E3238)
    g.roundRect(-20, -48, 40, 24, 4)
    g.fill(0x4A8FD9)
    // 键盘
    g.roundRect(-22, 0, 44, 8, 4)
    g.fill(0xEEEDEA)
    this.deskLayer.addChild(g)
  }

  private drawChair(seatOffsetY: number) {
    const g = new Graphics()
    const c = this.colors.chairColor
    // 椅背
    g.roundRect(-22, seatOffsetY - 10, 44, 14, 8)
    g.fill(c)
    // 坐垫
    g.roundRect(-24, seatOffsetY + 4, 48, 18, 14)
    g.fill(c)
    // 底座
    g.ellipse(0, seatOffsetY + 28, 30, 11)
    g.fill({ color: c, alpha: 0.7 })
    this.chairLayer.addChild(g)
  }
}

// ============================================================
// 主场景
// ============================================================
export class OfficeScene {
  private app: Application | null = null
  private world: Container | null = null
  private officeLayer: Container | null = null

  private agentGfxs = new Map<string, AgentSprite>()
  private deskGfxs = new Map<string, DeskWorkstation>()
  private agents: OfficeAgent[] = []
  private currentDesks: OfficeDesk[] = []
  private config: OfficeConfig
  private boundTick: ((ticker: any) => void) | null = null
  private onAgentClick?: (agent: OfficeAgent) => void

  constructor(config: OfficeConfig, onAgentClick?: (agent: OfficeAgent) => void) {
    this.config = config
    this.onAgentClick = onAgentClick
  }

  async init(container: HTMLElement, width: number, height: number) {
    const app = new Application()
    const colors = resolveColorMap(this.config.colors)
    await app.init({
      width,
      height,
      backgroundColor: colors.background,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    this.app = app
    container.appendChild(app.canvas)

    this.world = new Container()
    app.stage.addChild(this.world)

    this.fitStage(width, height)
    this.drawMap()
    this.spawnOffice()

    this.boundTick = this.onTick.bind(this)
    app.ticker.add(this.boundTick)
  }

  private fitStage(containerWidth: number, containerHeight: number) {
    if (!this.world) return
    const scale = Math.min(containerWidth / SCENE_WIDTH, containerHeight / SCENE_HEIGHT)
    const offsetX = (containerWidth - SCENE_WIDTH * scale) / 2
    const offsetY = (containerHeight - SCENE_HEIGHT * scale) / 2
    this.world.scale.set(scale)
    this.world.position.set(offsetX, offsetY)
  }

  /** 绘制地板和墙壁（纯色，颜色来自 config） */
  private drawMap() {
    if (!this.world) return
    const colors = resolveColorMap(this.config.colors)
    const map = new Container()
    map.label = 'map'

    // 地板
    const floor = new Graphics()
    floor.rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
    floor.fill(colors.floor)
    map.addChild(floor)

    // 墙壁（上部 20%）
    const wall = new Graphics()
    wall.rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT * 0.2)
    wall.fill(colors.wall)
    map.addChild(wall)

    // 墙脚线
    const base = new Graphics()
    base.rect(0, SCENE_HEIGHT * 0.2, SCENE_WIDTH, 2)
    base.fill({ color: 0x000000, alpha: 0.08 })
    map.addChild(base)

    this.world.addChildAt(map, 0)
  }

  /** 创建办公层 */
  private spawnOffice() {
    if (!this.world) return

    const layer = new Container()
    layer.label = 'office'
    layer.sortableChildren = true
    this.officeLayer = layer

    const colors = resolveColorMap(this.config.colors)
    const wsColors = { deskTop: colors.deskTop, chairColor: colors.chairColor }

    // 桌椅工位
    for (const desk of this.currentDesks) {
      const ws = new DeskWorkstation(desk, wsColors)
      this.deskGfxs.set(desk.id, ws)
      layer.addChild(ws.shadowGfx, ws.deskLayer, ws.chairLayer, ws.occupiedIndicator)
    }

    // 装饰（植物矢量）
    this.addDecorations(layer)

    // 角色
    for (const agent of this.agents) {
      const gfx = new AgentSprite(agent, this.config.showLabels)
      gfx.eventMode = 'static'
      gfx.cursor = 'pointer'
      gfx.zIndex = agent.y
      gfx.on('pointertap', () => this.onAgentClick?.(agent))
      this.agentGfxs.set(agent.id, gfx)
      layer.addChild(gfx)
    }

    layer.sortChildren()
    this.world.addChild(layer)
  }

  /** 矢量装饰（植物） */
  private addDecorations(parent: Container) {
    const positions = [
      { x: 40, y: SCENE_HEIGHT - 20 },
      { x: SCENE_WIDTH - 40, y: SCENE_HEIGHT - 20 },
      { x: 60, y: 140 },
      { x: SCENE_WIDTH - 60, y: 140 },
      { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT - 30 },
    ]
    for (const pos of positions) {
      const g = new Graphics()
      // 花盆
      g.roundRect(-10, 0, 20, 16, 3)
      g.fill(0xB8A88E)
      // 叶子
      g.circle(0, -8, 14)
      g.fill(0x4CAF50)
      g.circle(-6, -14, 8)
      g.fill(0x66BB6A)
      g.circle(6, -14, 8)
      g.fill(0x66BB6A)
      g.position.set(pos.x, pos.y)
      g.zIndex = pos.y
      parent.addChild(g)
    }
  }

  setAgents(agents: OfficeAgent[], desks: OfficeDesk[]) {
    this.agents = agents
    this.currentDesks = desks
    if (this.officeLayer && this.world) {
      this.world.removeChild(this.officeLayer)
      this.officeLayer.destroy({ children: true })
      this.officeLayer = null
    }
    this.agentGfxs.clear()
    this.deskGfxs.clear()
    this.spawnOffice()
  }

  updateConfig(config: OfficeConfig) {
    this.config = config
    if (this.app) {
      this.app.renderer.background.color = hexToNumber(config.colors.background)
    }
    // 重建地图层和办公层以应用新颜色
    if (this.world) {
      // 移除旧 map
      const oldMap = this.world.getChildByLabel?.('map')
      if (oldMap) {
        this.world.removeChild(oldMap)
        oldMap.destroy({ children: true })
      }
      this.drawMap()

      // 重建办公层
      if (this.officeLayer) {
        this.world.removeChild(this.officeLayer)
        this.officeLayer.destroy({ children: true })
        this.officeLayer = null
      }
      this.agentGfxs.clear()
      this.deskGfxs.clear()
      this.spawnOffice()
    }
  }

  getAgent(id: string): OfficeAgent | undefined {
    return this.agents.find(a => a.id === id)
  }

  destroy() {
    if (this.boundTick && this.app) {
      this.app.ticker.remove(this.boundTick)
    }
    this.app?.destroy(true)
    this.app = null
    this.world = null
    this.agentGfxs.clear()
    this.deskGfxs.clear()
  }

  private onTick(ticker: any) {
    const dt = ticker.deltaTime / 60 * this.config.animationSpeed

    for (const [id, gfx] of this.agentGfxs) {
      const agent = this.agents.find(a => a.id === id)
      if (agent) {
        gfx.updateAnim(dt, agent)
        // 平滑移动
        const dx = agent.x - gfx.position.x
        const dy = agent.y - gfx.position.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 1) {
          const speed = 120 * this.config.animationSpeed
          const step = Math.min(speed * dt, dist)
          gfx.updatePosition(
            gfx.position.x + (dx / dist) * step,
            gfx.position.y + (dy / dist) * step,
          )
        }
        gfx.zIndex = gfx.position.y
      }
    }

    // 同步桌位占用状态
    const occupied = new Set(
      this.agents.filter(a => a.state === 'working' && a.deskId).map(a => a.deskId!)
    )
    for (const [deskId, ws] of this.deskGfxs) {
      ws.setOccupied(occupied.has(deskId))
    }

    if (this.officeLayer) {
      this.officeLayer.sortChildren()
    }
  }

  resize(width: number, height: number) {
    if (!this.app || !this.world) return
    this.app.renderer.resize(width, height)
    this.fitStage(width, height)
  }
}
