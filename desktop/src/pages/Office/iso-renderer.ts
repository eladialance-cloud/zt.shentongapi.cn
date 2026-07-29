/**
 * 等距 2.5D 渲染器 (Spec upgrade-office-to-isometric-25d Task 3.2~3.8)
 *
 * 基于 PixiJS 8.x 实现：
 *  - 5 层容器 (background / zone / desk / employee / ui)
 *  - 等距地块 (菱形) + 墙壁 (有高度感)
 *  - 12 种家具 (办公桌/椅子/显示器/会议桌/会议椅/沙发/咖啡机/植物/书架/技能墙/机柜/前台)
 *  - 等距人物 (8 方向 + 状态环 + 选中高亮 + 状态光晕)
 *  - 5 种对话气泡 (text/icon/thinking/emotion/voice)
 *  - 深度排序 (按 worldX+worldY)
 *  - 点击交互 (人物/地块)
 *
 * 静态层 (背景/家具) 只在 init 时绘制一次；动态层 (人物/气泡) 每帧重绘。
 */

import { Application, Assets, Circle, Container, Graphics, Sprite, Text, TextStyle, FederatedPointerEvent, Texture } from 'pixi.js';

import {
  CANVAS_PADDING,
  ISO_AREAS,
  ISO_COLORS,
  ISO_FURNITURE,
  ISO_GRID_COLS,
  ISO_GRID_ROWS,
  TILE_HEIGHT,
  TILE_WIDTH,
  WALL_HEIGHT,
  canvasToPixel,
  getIsoCanvasLayout,
  hexToNumber,
  pixelToIso,
  rgbaToPixi,
  worldToScreen,
} from './iso-config';
import { getPose, getStatusHaloColor, getStatusVisualColor, STATE_LABELS } from './state-machine';
import { directionFromDelta, getEmployeeSprite, type Direction } from './sprites/spritesheet-loader';
import { getAssetUrl } from './asset-loader';
import { ASSET_PATHS } from './asset-config';
import type {
  AIEmployee,
  ChatBubbleType,
  Furniture,
  FurnitureType,
  OfficeChatBubble,
  OfficeArea,
} from './types';

/** 颜色工具: hex → number */
function c(hex: string): number {
  return hexToNumber(hex);
}

/** 颜色工具: rgba → { color, alpha } */
function ca(rgba: string): { color: number; alpha: number } {
  return rgbaToPixi(rgba);
}

/**
 * 等距渲染器
 *
 * 使用方式:
 *   const renderer = new IsoRenderer(app);
 *   renderer.init();  // 绘制静态层
 *   renderer.render(employees, bubbles, selectedId, ts);  // 每帧调用
 */
export class IsoRenderer {
  // 5 层容器 (按渲染顺序: background → zone → desk → employee → ui)
  backgroundLayer: Container;
  zoneLayer: Container;
  deskLayer: Container;
  employeeLayer: Container;
  uiLayer: Container;

  /** 点击员工回调 */
  onEmployeeClick?: (id: string) => void;
  /** 点击地块回调 (返回像素坐标, 与 astar.ts 坐标系一致) */
  onTileClick?: (pixelX: number, pixelY: number) => void;

  private app: Application;
  /** 场景根容器, 应用 renderOffset 平移使所有坐标为正 */
  private sceneRoot: Container;
  /** 员工 Container 缓存 (按 id 索引, 每个含 underlay/bodySprite/overlay 3 个子对象) */
  private employeeContainers: Map<string, Container> = new Map();
  /** 静态素材纹理缓存 (key → Texture) — 14 个静态 PNG */
  private textures: Map<string, Texture> = new Map();
  /** 气泡 Container 缓存 (按 bubble.id 索引) */
  private bubbleContainers: Map<string, Container> = new Map();
  /** 静态层是否已初始化 */
  private staticInitialized = false;
  /** 已销毁标记 */
  private destroyed = false;

  constructor(app: Application) {
    this.app = app;
    const layout = getIsoCanvasLayout();
    this.sceneRoot = new Container();
    this.sceneRoot.position.set(layout.renderOffsetX, layout.renderOffsetY);
    app.stage.addChild(this.sceneRoot);

    this.backgroundLayer = new Container();
    this.backgroundLayer.label = 'background';
    this.zoneLayer = new Container();
    this.zoneLayer.label = 'zone';
    this.deskLayer = new Container();
    this.deskLayer.label = 'desk';
    this.deskLayer.sortableChildren = true;
    this.employeeLayer = new Container();
    this.employeeLayer.label = 'employee';
    this.employeeLayer.sortableChildren = true;
    this.uiLayer = new Container();
    this.uiLayer.label = 'ui';

    this.sceneRoot.addChild(
      this.backgroundLayer,
      this.zoneLayer,
      this.deskLayer,
      this.employeeLayer,
      this.uiLayer,
    );
  }

  // ============================================================
  // 初始化: 绘制静态层 (地块 / 墙壁 / 区域 / 家具)
  // ============================================================

  /** 初始化静态层, 仅调用一次 */
  init(): void {
    if (this.staticInitialized || this.destroyed) return;
    this.drawFloor();
    this.drawWalls();
    this.drawZones();
    this.drawAllFurniture();
    this.staticInitialized = true;
  }

  /**
   * 异步加载 14 个静态 PNG 素材到 textures Map。
   * 失败的素材不设置纹理, 渲染时走矢量 fallback。
   * 应在 init() 之前调用 (通常与 preloadOfficeAssets 协同)。
   */
  async loadAssets(): Promise<void> {
    const entries: Array<[string, string]> = [
      ['background', ASSET_PATHS.background],
      ['deskWithMonitor', ASSET_PATHS.deskWithMonitor],
      ['chair', ASSET_PATHS.chair],
      ['meetingTable', ASSET_PATHS.meetingTable],
      ['largeScreen', ASSET_PATHS.largeScreen],
      ['plant', ASSET_PATHS.plant],
      ['receptionDesk', ASSET_PATHS.receptionDesk],
      ['bookshelf', ASSET_PATHS.bookshelf],
      ['loungeSofa', ASSET_PATHS.loungeSofa],
      ['screenDivider', ASSET_PATHS.screenDivider],
      ['tileCarpet', ASSET_PATHS.tileCarpet],
      ['tileWoodFloor', ASSET_PATHS.tileWoodFloor],
      ['wallGlassPartition', ASSET_PATHS.wallGlassPartition],
      ['wallExterior', ASSET_PATHS.wallExterior],
    ];
    for (const [key, relPath] of entries) {
      try {
        const url = getAssetUrl(relPath);
        const tex = await Assets.load<Texture>(url);
        this.textures.set(key, tex);
      } catch (err) {
        console.warn(`[IsoRenderer.loadAssets] 素材加载失败: ${key}`, err);
        // 失败时不设置纹理，渲染时走 fallback
      }
    }
  }

  /**
   * 绘制等距地块。
   * - 若 background 纹理已加载: 用 office-background.png 大图覆盖地板 bounding box 区域,
   *   并叠加一个透明 hitArea Graphics 接收点击。
   * - 否则: 调用 drawFloorFallback() 走原矢量绘制 (含点击交互)。
   */
  private drawFloor(): void {
    const bgTex = this.textures.get('background');
    if (bgTex) {
      // 用 office-background.png 大图覆盖地板区域
      const sprite = new Sprite(bgTex);
      // 地板 4 角的屏幕坐标 (sceneRoot 坐标系, 未含 renderOffset)
      const c0 = worldToScreen(0, 0);                          // 上
      const c1 = worldToScreen(ISO_GRID_COLS, 0);              // 右
      const c2 = worldToScreen(ISO_GRID_COLS, ISO_GRID_ROWS);  // 下
      const c3 = worldToScreen(0, ISO_GRID_ROWS);              // 左
      // bounding box
      const minX = Math.min(c0.x, c1.x, c2.x, c3.x);
      const minY = Math.min(c0.y, c1.y, c2.y, c3.y);
      const maxX = Math.max(c0.x, c1.x, c2.x, c3.x);
      const maxY = Math.max(c0.y, c1.y, c2.y, c3.y);
      const boxW = maxX - minX;
      const boxH = maxY - minY;
      sprite.position.set(minX, minY);
      sprite.width = boxW;
      sprite.height = boxH;
      sprite.label = 'floor-background';
      this.backgroundLayer.addChild(sprite);

      // 透明 hitArea 接收点击 (保留原点击逻辑)
      const hitG = new Graphics();
      hitG.poly([c0.x, c0.y, c1.x, c1.y, c2.x, c2.y, c3.x, c3.y]);
      hitG.fill({ color: 0xffffff, alpha: 0 }); // 透明
      hitG.eventMode = 'static';
      hitG.cursor = 'default';
      hitG.hitArea = new Circle(0, 0, Math.max(ISO_GRID_COLS, ISO_GRID_ROWS) * TILE_WIDTH);
      hitG.on('pointerdown', (e: FederatedPointerEvent) => {
        if (this.destroyed) return;
        const localX = e.global.x - this.sceneRoot.position.x;
        const localY = e.global.y - this.sceneRoot.position.y;
        const pixel = canvasToPixel(localX, localY);
        if (this.onTileClick) this.onTileClick(pixel.x, pixel.y);
      });
      this.backgroundLayer.addChild(hitG);
      return;
    }
    // PNG 加载失败 → 矢量 fallback
    this.drawFloorFallback();
  }

  /** drawFloor 矢量 fallback: 菱形地块 + 木地板纹理线条 + 点击交互 */
  private drawFloorFallback(): void {
    const g = new Graphics();
    // 整体地块菱形 (覆盖 60×40 网格)
    const corners = [
      worldToScreen(0, 0),
      worldToScreen(ISO_GRID_COLS, 0),
      worldToScreen(ISO_GRID_COLS, ISO_GRID_ROWS),
      worldToScreen(0, ISO_GRID_ROWS),
    ];
    g.poly([corners[0].x, corners[0].y, corners[1].x, corners[1].y, corners[2].x, corners[2].y, corners[3].x, corners[3].y]);
    g.fill({ color: c(ISO_COLORS.floor) });

    // 木地板纹理: 沿世界 X 轴的细线 (每 2 格一条)
    g.setStrokeStyle({ width: 1, color: c(ISO_COLORS.floorLine), alpha: 0.6 });
    for (let gx = 0; gx <= ISO_GRID_COLS; gx += 2) {
      const p1 = worldToScreen(gx, 0);
      const p2 = worldToScreen(gx, ISO_GRID_ROWS);
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
      g.stroke();
    }
    // 沿世界 Y 轴的细线
    for (let gy = 0; gy <= ISO_GRID_ROWS; gy += 2) {
      const p1 = worldToScreen(0, gy);
      const p2 = worldToScreen(ISO_GRID_COLS, gy);
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
      g.stroke();
    }

    // 点击交互: 地块 Graphics 接收点击
    g.eventMode = 'static';
    g.cursor = 'default';
    g.hitArea = new Circle(0, 0, Math.max(ISO_GRID_COLS, ISO_GRID_ROWS) * TILE_WIDTH);
    g.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.destroyed) return;
      // e.global 是 stage 坐标, 减去 sceneRoot.position 得到 sceneRoot 内坐标
      const localX = e.global.x - this.sceneRoot.position.x;
      const localY = e.global.y - this.sceneRoot.position.y;
      const pixel = canvasToPixel(localX, localY);
      if (this.onTileClick) {
        this.onTileClick(pixel.x, pixel.y);
      }
    });

    this.backgroundLayer.addChild(g);
  }

  /**
   * 绘制等距墙壁。
   * - 若 wallExterior 纹理已加载: 背景大图 office-background.png 已包含墙壁视觉,
   *   此处不重复绘制 (no-op)。
   * - 否则: 调用 drawWallsFallback() 走原矢量墙壁绘制。
   */
  private drawWalls(): void {
    const wallTex = this.textures.get('wallExterior');
    if (wallTex) {
      // 背景大图 office-background.png 已包含墙壁视觉，此处不重复绘制
      return;
    }
    this.drawWallsFallback();
  }

  /** drawWalls 矢量 fallback: 沿 worldX=0 与 worldY=0 绘制两面等距墙壁 */
  private drawWallsFallback(): void {
    const wallH = WALL_HEIGHT;
    // 上墙: 沿 worldX 轴方向 (worldY=0), 朝向屏幕上方
    // 左墙: 沿 worldY 轴方向 (worldX=0), 朝向屏幕左方
    // 这两面墙的高度向上延伸 (屏幕 -Y 方向)

    // 左墙 (worldX=0, worldY 从 0 到 ROWS)
    this.drawWallSegment(
      worldToScreen(0, 0),
      worldToScreen(0, ISO_GRID_ROWS),
      wallH,
      'left',
    );
    // 上墙 (worldY=0, worldX 从 0 到 COLS)
    this.drawWallSegment(
      worldToScreen(0, 0),
      worldToScreen(ISO_GRID_COLS, 0),
      wallH,
      'right',
    );
  }

  /**
   * 绘制一段墙壁 (顶面 + 左面 + 右面)
   * @param p1 起点 (屏幕坐标, 在地面)
   * @param p2 终点 (屏幕坐标, 在地面)
   * @param height 墙壁高度 (px, 向上延伸)
   * @param side 'left' (左侧墙, 显示右面) / 'right' (右侧墙, 显示左面)
   */
  private drawWallSegment(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    height: number,
    side: 'left' | 'right',
  ): void {
    const g = new Graphics();
    // 顶部 4 点 (地面 2 点 + 上方 2 点)
    const t1 = { x: p1.x, y: p1.y - height };
    const t2 = { x: p2.x, y: p2.y - height };

    const wallTop = c(ISO_COLORS.wall);
    const wallSide = c(ISO_COLORS.wallBaseboard);
    const wallDark = wallSide; // 最暗面

    // 顶面 (墙面朝向观察者的一面, 高亮)
    g.poly([p1.x, p1.y, p2.x, p2.y, t2.x, t2.y, t1.x, t1.y]);
    g.fill({ color: wallTop });

    // 侧面 (墙体厚度, 较暗) - 只绘制可见的一侧
    if (side === 'left') {
      // 左墙: 显示右侧面 (向地面延伸的厚度, 简化为墙面顶部到地面的"侧三角形")
      // 由于是平面墙, 主要可见的是正面 (顶面), 侧面厚度简化为 4px 描边
      g.setStrokeStyle({ width: 2, color: wallSide, alpha: 1 });
      g.moveTo(p1.x, p1.y);
      g.lineTo(t1.x, t1.y);
      g.stroke();
      g.moveTo(p2.x, p2.y);
      g.lineTo(t2.x, t2.y);
      g.stroke();
    } else {
      g.setStrokeStyle({ width: 2, color: wallDark, alpha: 1 });
      g.moveTo(p1.x, p1.y);
      g.lineTo(t1.x, t1.y);
      g.stroke();
      g.moveTo(p2.x, p2.y);
      g.lineTo(t2.x, t2.y);
      g.stroke();
    }

    // 踢脚线 (墙底, 较深色)
    g.setStrokeStyle({ width: 3, color: wallSide, alpha: 1 });
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.stroke();

    this.backgroundLayer.addChild(g);
  }

  /** 绘制所有区域 (玻璃隔间 / 休息区地毯) */
  private drawZones(): void {
    for (const area of ISO_AREAS) {
      this.drawZone(area);
    }
  }

  /** 绘制单个区域 (玻璃隔间半透明蓝绿色菱形 + 边框 + 门; 休息区紫色渐变菱形) */
  private drawZone(area: OfficeArea): void {
    const g = new Graphics();
    // 区域像素坐标 → 等距屏幕坐标
    const tl = pixelToIso(area.x, area.y);
    const tr = pixelToIso(area.x + area.width, area.y);
    const br = pixelToIso(area.x + area.width, area.y + area.height);
    const bl = pixelToIso(area.x, area.y + area.height);

    const isLounge = area.id === 'lounge';
    const isGlassRoom = area.id === 'meetingRoom' || area.id === 'library' ||
                        area.id === 'skillWall' || area.id === 'equipmentRoom';

    if (isLounge) {
      // 休息区地毯: 紫色渐变菱形
      const fillInfo = ca('rgba(107, 91, 149, 0.5)');
      g.poly([tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      g.fill({ color: fillInfo.color, alpha: fillInfo.alpha });
      // 同心圆花纹
      const center = { x: (tl.x + br.x) / 2, y: (tl.y + br.y) / 2 };
      for (let i = 0; i < 5; i++) {
        g.circle(center.x, center.y, 18 + i * 12);
        g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.12 });
        g.stroke();
      }
    } else if (isGlassRoom) {
      // 玻璃隔间: 半透明蓝绿色菱形 + 边框
      const fillInfo = ca('rgba(120, 180, 220, 0.18)');
      g.poly([tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      g.fill({ color: fillInfo.color, alpha: fillInfo.alpha });
      const borderInfo = ca('rgba(80, 140, 180, 0.55)');
      g.setStrokeStyle({ width: 1.5, color: borderInfo.color, alpha: borderInfo.alpha });
      g.stroke();
      // 门 (在 entrance 一侧留缺口, 简化为绘制一个 4px 宽的开口标记)
      if (area.entrance) {
        const doorPx = { x: area.entrance.x * 20, y: area.entrance.y * 20 };
        const doorScreen = pixelToIso(doorPx.x, doorPx.y);
        g.circle(doorScreen.x, doorScreen.y, 6);
        g.fill({ color: 0xffd166, alpha: 0.6 });
      }
    } else {
      // 普通区域: 半透明菱形 + 虚线边框 (用 setLineDash 不支持, 用短直线模拟)
      const fillInfo = ca(area.color);
      g.poly([tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      g.fill({ color: fillInfo.color, alpha: fillInfo.alpha * 0.5 });
      g.setStrokeStyle({ width: 1, color: 0x3c3c3c, alpha: 0.35 });
      g.stroke();
    }

    // 区域标签
    const labelOffsetX = 8;
    const labelOffsetY = 4;
    const labelText = new Text({
      text: area.label,
      style: new TextStyle({
        fontFamily: '-apple-system, "Segoe UI", sans-serif',
        fontSize: 11,
        fill: 0x32323c,
        align: 'left',
      }),
      resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    });
    labelText.anchor.set(0, 0);
    labelText.position.set(tl.x + labelOffsetX, tl.y + labelOffsetY);
    this.zoneLayer.addChild(g);
    this.zoneLayer.addChild(labelText);
  }

  /** 绘制所有家具 */
  private drawAllFurniture(): void {
    for (const f of ISO_FURNITURE) {
      this.drawFurniture(f);
    }
  }

  /** 家具类型 → textures Map key 映射 (用于 PNG Sprite 渲染) */
  private static readonly FURNITURE_TEXTURE_MAP: Partial<Record<FurnitureType, string>> = {
    desk: 'deskWithMonitor',        // 办公桌 (含显示器, monitor 不再单独绘制)
    chair: 'chair',
    roundTable: 'meetingTable',     // 圆桌用会议桌素材
    meetingChair: 'chair',          // 会议椅用椅子素材
    sofa: 'loungeSofa',
    plant: 'plant',
    bookshelf: 'bookshelf',
    receptionDesk: 'receptionDesk',
    // monitor: 不映射 (已含在 deskWithMonitor 中)
    // coffeeMachine / toolWall / serverCabinet: 无对应素材, 走 fallback
  };

  /**
   * 绘制单个家具。
   * - 若 f.type === 'monitor' 且 'deskWithMonitor' 纹理已加载 (PNG 模式):
   *   直接 return (显示器已含在 desk 素材中, 不重复绘制)。
   * - 若 FURNITURE_TEXTURE_MAP 映射的纹理存在: 创建 Sprite, 锚点底部中心,
   *   缩放到家具等距屏幕尺寸, addChild 到 deskLayer 并设置 zIndex。
   * - 否则: 调用 drawFurnitureFallback(f) 走原矢量绘制。
   * 深度排序: zIndex = pixelX + pixelY (越大越在前)
   */
  private drawFurniture(f: Furniture): void {
    // PNG 模式下 monitor 不单独绘制 (已含在 deskWithMonitor 素材中)
    if (f.type === 'monitor' && this.textures.has('deskWithMonitor')) {
      return;
    }

    const texKey = IsoRenderer.FURNITURE_TEXTURE_MAP[f.type];
    const tex = texKey ? this.textures.get(texKey) : undefined;

    // 家具像素中心
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    // 等距屏幕坐标
    const screen = pixelToIso(cx, cy);

    if (tex) {
      const sprite = new Sprite(tex);
      sprite.label = `furniture-${f.type}`;
      // 锚点设为底部中心 (让家具"站"在屏幕坐标点上)
      sprite.anchor.set(0.5, 1);
      sprite.position.set(screen.x, screen.y);
      // 缩放: 根据家具像素尺寸估算等距屏幕尺寸
      const targetW = (f.width / 20) * TILE_WIDTH; // 粗略缩放
      const scale = targetW / tex.width;
      sprite.scale.set(scale);
      sprite.zIndex = cx + cy;
      this.deskLayer.addChild(sprite);
      return;
    }

    // PNG 素材不存在 (或 f.type === 'monitor' 在 PNG 模式下) → 矢量 fallback
    this.drawFurnitureFallback(f);
  }

  /** drawFurniture 矢量 fallback: Graphics + 12 种 case 分支绘制 */
  private drawFurnitureFallback(f: Furniture): void {
    const g = new Graphics();
    g.label = `furniture-${f.type}`;
    // 家具像素中心
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    // 等距屏幕坐标
    const screen = pixelToIso(cx, cy);
    g.position.set(screen.x, screen.y);
    // 深度排序
    g.zIndex = cx + cy;

    switch (f.type) {
      case 'desk':
        this.drawDesk(g, f);
        break;
      case 'chair':
        this.drawChair(g, f);
        break;
      case 'monitor':
        this.drawMonitor(g, f);
        break;
      case 'roundTable':
        this.drawRoundTable(g, f);
        break;
      case 'meetingChair':
        this.drawMeetingChair(g, f);
        break;
      case 'sofa':
        this.drawSofa(g, f);
        break;
      case 'coffeeMachine':
        this.drawCoffeeMachine(g, f);
        break;
      case 'plant':
        this.drawPlant(g, f);
        break;
      case 'bookshelf':
        this.drawBookshelf(g, f);
        break;
      case 'toolWall':
        this.drawToolWall(g, f);
        break;
      case 'serverCabinet':
        this.drawServerCabinet(g, f);
        break;
      case 'receptionDesk':
        this.drawReceptionDesk(g, f);
        break;
    }
    this.deskLayer.addChild(g);
  }

  // ============================================================
  // 家具绘制函数 (12 种)
  // ============================================================

  /** 等距办公桌 (顶面 + 侧面, 含显示器底座预留) */
  private drawDesk(g: Graphics, f: Furniture): void {
    // 把家具像素尺寸缩放到等距视图 (除以 CELL_SIZE 得到网格尺寸, 再乘 TILE 得屏幕尺寸)
    const wIso = (f.width / 20) * TILE_WIDTH / 2;
    const hIso = (f.height / 20) * TILE_HEIGHT / 2;
    const deskH = 12; // 桌面高度
    const color = c(f.color ?? ISO_COLORS.wood);
    const colorDark = c(ISO_COLORS.woodDark);

    // 顶面 (菱形)
    g.poly([-wIso, 0, 0, -hIso, wIso, 0, 0, hIso]);
    g.fill({ color });
    // 右侧面 (较暗)
    g.poly([wIso, 0, 0, hIso, 0, hIso + deskH, wIso, deskH]);
    g.fill({ color: colorDark });
    // 左侧面 (最暗)
    g.poly([-wIso, 0, 0, hIso, 0, hIso + deskH, -wIso, deskH]);
    g.fill({ color: colorDark, alpha: 0.7 });

    // 桌面高光
    g.poly([-wIso + 2, 0, 0, -hIso + 1, wIso - 2, 0, 0, hIso - 1]);
    g.fill({ color: 0xffffff, alpha: 0.1 });
  }

  /** 等距椅子 (小圆 + 靠背) */
  private drawChair(g: Graphics, f: Furniture): void {
    const r = Math.min(f.width, f.height) / 20 * TILE_WIDTH / 2 * 0.6;
    const color = c(f.color ?? '#999999');
    // 椅座 (椭圆)
    g.ellipse(0, 0, r, r * 0.5);
    g.fill({ color });
    // 靠背 (小弧线)
    g.ellipse(0, -r * 0.6, r * 0.7, r * 0.3);
    g.fill({ color: color, alpha: 0.7 });
    // 描边
    g.ellipse(0, 0, r, r * 0.5);
    g.setStrokeStyle({ width: 1, color: 0x000000, alpha: 0.3 });
    g.stroke();
  }

  /** 等距显示器 (屏幕 + 底座) */
  private drawMonitor(g: Graphics, f: Furniture): void {
    const wIso = (f.width / 20) * TILE_WIDTH / 2;
    const hIso = (f.height / 20) * TILE_HEIGHT / 2;
    const screenH = 18; // 屏幕高度
    const color = c(f.color ?? ISO_COLORS.screenOn);
    // 底座 (小菱形)
    g.poly([-wIso * 0.5, 0, 0, -hIso * 0.3, wIso * 0.5, 0, 0, hIso * 0.3]);
    g.fill({ color: 0x202028 });
    // 屏幕支架 (竖线)
    g.rect(-1, -screenH * 0.5, 2, screenH * 0.5);
    g.fill({ color: 0x202028 });
    // 屏幕 (等距矩形, 朝向观察者)
    g.poly([-wIso, -screenH, wIso, -screenH, wIso, 0, -wIso, 0]);
    g.fill({ color: 0x202028 });
    g.poly([-wIso + 1, -screenH + 1, wIso - 1, -screenH + 1, wIso - 1, -1, -wIso + 1, -1]);
    g.fill({ color });
    // 屏幕内容线
    for (let i = 0; i < 3; i++) {
      g.rect(-wIso + 3, -screenH + 3 + i * 4, (wIso - 3) * 1.5, 1.5);
      g.fill({ color: 0xffffff, alpha: 0.4 });
    }
  }

  /** 等距椭圆会议桌 */
  private drawRoundTable(g: Graphics, f: Furniture): void {
    const rx = (f.width / 20) * TILE_WIDTH / 2;
    const ry = (f.height / 20) * TILE_HEIGHT / 2;
    const color = c(f.color ?? ISO_COLORS.woodDark);
    // 桌面 (椭圆)
    g.ellipse(0, 0, rx, ry);
    g.fill({ color });
    // 侧面 (椭圆向下偏移 6px)
    g.ellipse(0, 6, rx, ry);
    g.fill({ color: 0x000000, alpha: 0.2 });
    // 桌面描边
    g.ellipse(0, 0, rx, ry);
    g.setStrokeStyle({ width: 1.5, color: 0x000000, alpha: 0.3 });
    g.stroke();
  }

  /** 等距会议椅 (小圆) */
  private drawMeetingChair(g: Graphics, f: Furniture): void {
    const r = Math.min(f.width, f.height) / 20 * TILE_WIDTH / 2 * 0.7;
    const color = c(f.color ?? '#6B5B95');
    g.ellipse(0, 0, r, r * 0.5);
    g.fill({ color });
    g.ellipse(0, 0, r, r * 0.5);
    g.setStrokeStyle({ width: 1, color: 0x000000, alpha: 0.3 });
    g.stroke();
  }

  /** 等距沙发 (带靠垫) */
  private drawSofa(g: Graphics, f: Furniture): void {
    const wIso = (f.width / 20) * TILE_WIDTH / 2;
    const hIso = (f.height / 20) * TILE_HEIGHT / 2;
    const sofaH = 10;
    const color = c(f.color ?? '#8B7DAB');
    const colorDark = c(ISO_COLORS.woodDark);
    // 底座顶面
    g.poly([-wIso, 0, 0, -hIso, wIso, 0, 0, hIso]);
    g.fill({ color });
    // 右侧
    g.poly([wIso, 0, 0, hIso, 0, hIso + sofaH, wIso, sofaH]);
    g.fill({ color: colorDark, alpha: 0.8 });
    // 左侧
    g.poly([-wIso, 0, 0, hIso, 0, hIso + sofaH, -wIso, sofaH]);
    g.fill({ color: colorDark, alpha: 0.6 });
    // 靠垫 (顶面上一个小菱形)
    g.poly([-wIso * 0.6, 0, 0, -hIso * 0.6, wIso * 0.6, 0, 0, hIso * 0.6]);
    g.fill({ color: 0xffffff, alpha: 0.2 });
    // 靠背 (顶部, 高一些)
    g.poly([-wIso, -sofaH, 0, -hIso - sofaH, wIso, -sofaH, 0, hIso - sofaH]);
    // 简化: 靠背不绘制, 用底座替代
  }

  /** 等距咖啡机 (小立方体) */
  private drawCoffeeMachine(g: Graphics, f: Furniture): void {
    const s = Math.min(f.width, f.height) / 20 * TILE_WIDTH / 2;
    const machineH = 18;
    const color = c(f.color ?? ISO_COLORS.metalDark);
    const colorTop = c(ISO_COLORS.metal);
    // 顶面
    g.poly([-s, 0, 0, -s * 0.5, s, 0, 0, s * 0.5]);
    g.fill({ color: colorTop });
    // 右面
    g.poly([s, 0, 0, s * 0.5, 0, s * 0.5 + machineH, s, machineH]);
    g.fill({ color });
    // 左面
    g.poly([-s, 0, 0, s * 0.5, 0, s * 0.5 + machineH, -s, machineH]);
    g.fill({ color: color, alpha: 0.7 });
    // 出水口 (小圆点)
    g.circle(0, machineH * 0.5, 2);
    g.fill({ color: 0x000000 });
  }

  /** 等距植物 (花盆 + 圆形叶冠) */
  private drawPlant(g: Graphics, f: Furniture): void {
    const r = Math.min(f.width, f.height) / 20 * TILE_WIDTH / 2;
    // 花盆 (小菱形)
    g.poly([-r * 0.6, 0, 0, -r * 0.3, r * 0.6, 0, 0, r * 0.3]);
    g.fill({ color: 0xa0522d });
    // 花盆侧面
    g.poly([r * 0.6, 0, 0, r * 0.3, 0, r * 0.3 + 6, r * 0.6, 6]);
    g.fill({ color: 0x7a3e22 });
    g.poly([-r * 0.6, 0, 0, r * 0.3, 0, r * 0.3 + 6, -r * 0.6, 6]);
    g.fill({ color: 0x7a3e22, alpha: 0.7 });
    // 叶冠 (圆形, 立在花盆上方)
    g.circle(0, -r * 0.8, r * 0.7);
    g.fill({ color: c(ISO_COLORS.plant) });
    g.circle(-r * 0.3, -r, r * 0.3);
    g.fill({ color: c(ISO_COLORS.plantDark) });
    g.circle(r * 0.3, -r, r * 0.3);
    g.fill({ color: c(ISO_COLORS.plantDark) });
  }

  /** 等距书架 (带书脊彩色条纹) */
  private drawBookshelf(g: Graphics, f: Furniture): void {
    const wIso = (f.width / 20) * TILE_WIDTH / 2;
    const hIso = (f.height / 20) * TILE_HEIGHT / 2;
    const shelfH = 50; // 书架高度
    const color = c(ISO_COLORS.woodDark);
    // 顶面
    g.poly([-wIso, 0, 0, -hIso, wIso, 0, 0, hIso]);
    g.fill({ color });
    // 右面 (书脊朝向)
    g.poly([wIso, 0, 0, hIso, 0, hIso + shelfH, wIso, shelfH]);
    g.fill({ color: 0x5c4330 });
    // 左面
    g.poly([-wIso, 0, 0, hIso, 0, hIso + shelfH, -wIso, shelfH]);
    g.fill({ color: 0x3c2a1f });
    // 书脊 (在右面上绘制彩色条纹)
    const palette = [c(ISO_COLORS.bookSpine1), c(ISO_COLORS.bookSpine2), c(ISO_COLORS.bookSpine3), c(ISO_COLORS.bookSpine4)];
    const shelfLevels = 3;
    const levelH = shelfH / shelfLevels;
    for (let lv = 0; lv < shelfLevels; lv++) {
      const yBase = lv * levelH;
      let xOff = 0;
      let i = 0;
      while (xOff < wIso * 0.9) {
        const bookW = 3 + (i % 3);
        // 书脊是右面上的竖线
        g.moveTo(xOff, yBase + 2);
        g.lineTo(xOff, yBase + levelH - 2);
        g.setStrokeStyle({ width: bookW, color: palette[(i + lv) % palette.length] });
        g.stroke();
        xOff += bookW + 1;
        i++;
      }
    }
  }

  /** 等距技能墙 (格子 + 工具图标) */
  private drawToolWall(g: Graphics, f: Furniture): void {
    const wIso = (f.width / 20) * TILE_WIDTH / 2;
    const hIso = (f.height / 20) * TILE_HEIGHT / 2;
    const wallH = 60;
    const color = c(ISO_COLORS.woodDark);
    // 顶面
    g.poly([-wIso, 0, 0, -hIso, wIso, 0, 0, hIso]);
    g.fill({ color });
    // 右面 (主展示面)
    g.poly([wIso, 0, 0, hIso, 0, hIso + wallH, wIso, wallH]);
    g.fill({ color: 0x3c2a1f });
    // 左面
    g.poly([-wIso, 0, 0, hIso, 0, hIso + wallH, -wIso, wallH]);
    g.fill({ color: 0x2c1a0f });
    // 工具格子 (在右面上)
    const gridCols = 4;
    const gridRows = 4;
    const cellW = wIso / gridCols;
    const cellH = wallH / gridRows;
    const toolColors = [0xfa8c16, 0x1677ff, 0x52c41a, 0x722ed1, 0x13c2c2, 0xfa541c];
    for (let gx = 0; gx < gridCols; gx++) {
      for (let gy = 0; gy < gridRows; gy++) {
        // 格子在右面上的坐标 (注意右面坐标系: x 从 0 到 wIso, y 从 0 到 wallH)
        const cellX = gx * cellW;
        const cellY = gy * cellH;
        // 工具图标 (小矩形)
        g.rect(cellX + 1, cellY + 1, cellW - 2, cellH - 2);
        g.fill({ color: toolColors[(gx + gy) % toolColors.length], alpha: 0.7 });
        g.rect(cellX + 1, cellY + 1, cellW - 2, cellH - 2);
        g.setStrokeStyle({ width: 0.5, color: 0xffffff, alpha: 0.3 });
        g.stroke();
      }
    }
    // 标签
    if (f.label) {
      const label = new Text({
        text: f.label,
        style: new TextStyle({
          fontFamily: 'sans-serif',
          fontSize: 9,
          fill: 0xffffff,
          align: 'center',
        }),
        resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
      });
      label.anchor.set(0.5, 1);
      label.position.set(0, wallH + 2);
      g.addChild(label);
    }
  }

  /** 等距机柜 (带闪烁指示灯) */
  private drawServerCabinet(g: Graphics, f: Furniture): void {
    const wIso = (f.width / 20) * TILE_WIDTH / 2;
    const hIso = (f.height / 20) * TILE_HEIGHT / 2;
    const cabH = 60;
    const color = c(ISO_COLORS.metalDark);
    // 顶面
    g.poly([-wIso, 0, 0, -hIso, wIso, 0, 0, hIso]);
    g.fill({ color: c(ISO_COLORS.metal) });
    // 右面
    g.poly([wIso, 0, 0, hIso, 0, hIso + cabH, wIso, cabH]);
    g.fill({ color });
    // 左面
    g.poly([-wIso, 0, 0, hIso, 0, hIso + cabH, -wIso, cabH]);
    g.fill({ color: color, alpha: 0.7 });
    // 服务器单元 (在右面上绘制水平条纹)
    const unitCount = 5;
    const unitH = cabH / unitCount;
    for (let i = 0; i < unitCount; i++) {
      const y = i * unitH;
      g.rect(2, y + 1, wIso * 0.9 - 2, unitH - 2);
      g.fill({ color: 0x1f2937 });
      // 指示灯 (静态, 闪烁由动态层处理 - 简化)
      g.circle(4, y + unitH / 2, 1.5);
      g.fill({ color: i % 2 === 0 ? 0x52c41a : 0xfa8c16 });
    }
    // 标签
    if (f.label) {
      const label = new Text({
        text: f.label,
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 8,
          fill: 0xffffff,
          align: 'center',
        }),
        resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
      });
      label.anchor.set(0.5, 1);
      label.position.set(0, cabH + 2);
      g.addChild(label);
    }
  }

  /** 等距前台 (L 形) */
  private drawReceptionDesk(g: Graphics, f: Furniture): void {
    const wIso = (f.width / 20) * TILE_WIDTH / 2;
    const hIso = (f.height / 20) * TILE_HEIGHT / 2;
    const deskH = 16;
    const color = c(f.color ?? ISO_COLORS.woodDark);
    const colorTop = c(ISO_COLORS.wood);
    // 主台面顶面
    g.poly([-wIso, 0, 0, -hIso, wIso, 0, 0, hIso]);
    g.fill({ color: colorTop });
    // 右面
    g.poly([wIso, 0, 0, hIso, 0, hIso + deskH, wIso, deskH]);
    g.fill({ color });
    // 左面
    g.poly([-wIso, 0, 0, hIso, 0, hIso + deskH, -wIso, deskH]);
    g.fill({ color: color, alpha: 0.7 });
    // 中央 OpenClaw 标志 (小圆)
    g.circle(0, 0, 5);
    g.fill({ color: 0x1677ff });
    g.circle(-1.5, -1, 1.5);
    g.fill({ color: 0xffffff });
    g.circle(1.5, -1, 1.5);
    g.fill({ color: 0xffffff });
    // 标签
    if (f.label) {
      const label = new Text({
        text: f.label,
        style: new TextStyle({
          fontFamily: 'sans-serif',
          fontSize: 10,
          fill: 0xffffff,
          align: 'center',
        }),
        resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
      });
      label.anchor.set(0.5, 1);
      label.position.set(0, deskH + 2);
      g.addChild(label);
    }
  }

  // ============================================================
  // 渲染: 每帧重绘动态层 (员工 / 气泡 / 选中高亮)
  // ============================================================

  /**
   * 主渲染方法 (每帧调用)
   * @param employees 当前员工列表
   * @param bubbles 当前气泡列表
   * @param selectedId 选中员工 ID (可选)
   * @param ts 当前时间戳 (ms)
   */
  render(employees: AIEmployee[], bubbles: OfficeChatBubble[], selectedId: string | undefined, ts: number): void {
    if (this.destroyed) return;
    if (!this.staticInitialized) this.init();

    // 1. 渲染员工
    this.renderEmployees(employees, selectedId, ts);
    // 2. 渲染气泡
    this.renderBubbles(bubbles, employees, ts);
  }

  /** 渲染所有员工 (复用 Container, 按深度排序) */
  private renderEmployees(employees: AIEmployee[], selectedId: string | undefined, ts: number): void {
    const activeIds = new Set(employees.map((e) => e.id));
    // 移除已不存在的员工 Container
    for (const [id, container] of this.employeeContainers) {
      if (!activeIds.has(id)) {
        this.employeeLayer.removeChild(container);
        container.destroy({ children: true });
        this.employeeContainers.delete(id);
      }
    }
    // 重绘/创建员工
    for (const emp of employees) {
      let container = this.employeeContainers.get(emp.id);
      if (!container) {
        container = new Container();
        container.label = `employee-${emp.id}`;
        const underlayG = new Graphics();
        const bodySprite = new Sprite(Texture.EMPTY);
        bodySprite.anchor.set(0.5, 0.8); // 锚点底部中心偏上 (角色脚底)
        const overlayG = new Graphics();
        container.addChild(underlayG, bodySprite, overlayG);

        // 点击交互挂在 container 上
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.hitArea = new Circle(0, 0, 22);
        container.on('pointerdown', (e: FederatedPointerEvent) => {
          e.stopPropagation();
          if (this.onEmployeeClick) this.onEmployeeClick(emp.id);
        });
        this.employeeLayer.addChild(container);
        this.employeeContainers.set(emp.id, container);
      }

      const underlayG = container.children[0] as Graphics;
      const bodySprite = container.children[1] as Sprite;
      const overlayG = container.children[2] as Graphics;
      underlayG.clear();
      overlayG.clear();

      const isSelected = emp.id === selectedId;
      // 定位 container 到员工等距屏幕坐标
      const screen = pixelToIso(emp.currentPos.x, emp.currentPos.y);
      container.position.set(screen.x, screen.y);
      // 深度排序
      container.zIndex = emp.currentPos.x + emp.currentPos.y;

      // 绘制 underlay (光晕/选中/阴影/状态环/方向箭头)
      this.drawEmployeeUnderlay(underlayG, emp, isSelected, ts);
      // 绘制 body (PNG 精灵图或矢量 fallback)
      this.drawEmployeeBodySprite(bodySprite, underlayG, emp, ts);
      // 绘制 overlay (状态灯/名牌)
      this.drawEmployeeOverlay(overlayG, emp);
    }
    this.employeeLayer.sortChildren();
  }

  /**
   * 绘制员工 underlay (绘制在角色脚下/背后的元素)。
   * 包含原 drawEmployee 的步骤 1-5: 状态光晕、选中高亮、阴影、状态环、方向箭头。
   */
  private drawEmployeeUnderlay(
    g: Graphics,
    emp: AIEmployee,
    isSelected: boolean,
    ts: number,
  ): void {
    const statusColor = getStatusVisualColor(emp.status);
    const halo = getStatusHaloColor(emp.status);

    // 1. 状态光晕 (WORKING_DEEP 红色光晕, 呼吸动画)
    if (emp.status === 'WORKING_DEEP') {
      const breathe = (Math.sin(ts / 600) + 1) / 2; // 0~1
      const r = 24 + 4 * breathe;
      const haloInfo = ca(halo);
      g.circle(0, -8, r);
      g.fill({ color: 0xff4040, alpha: 0.3 + 0.3 * breathe });
      g.circle(0, -8, r * 0.6);
      g.fill({ color: haloInfo.color, alpha: haloInfo.alpha * 0.5 });
    } else if (emp.status === 'IN_MEETING' || emp.status === 'RESTING') {
      const haloInfo = ca(halo);
      g.circle(0, 0, 22);
      g.fill({ color: haloInfo.color, alpha: haloInfo.alpha });
    }

    // 2. 选中高亮 (金色光环, pulse)
    if (isSelected) {
      const pulse = (Math.sin(ts / 250) + 1) / 2; // 0~1
      const r = 22 + 4 * pulse;
      g.circle(0, 0, r);
      g.setStrokeStyle({ width: 2, color: 0xffd700, alpha: 0.7 + 0.3 * pulse });
      g.stroke();
    }

    // 3. 阴影 (脚下椭圆)
    g.ellipse(0, 8, 12, 4);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // 4. 状态环 (脚下圆环)
    g.circle(0, 8, 14);
    g.setStrokeStyle({ width: 2, color: c(statusColor), alpha: 0.8 });
    g.stroke();

    // 5. 8 方向朝向指示 (根据 emp.direction 计算)
    const dir: Direction = emp.direction ?? directionFromDelta(
      emp.path[0] ? emp.path[0].x - emp.currentPos.x : 0,
      emp.path[0] ? emp.path[0].y - emp.currentPos.y : 0,
    );
    this.drawDirectionArrow(g, dir, ts);
  }

  /**
   * 绘制员工 body: 优先使用 PNG 精灵图, 未加载时走矢量 fallback。
   * - PNG 模式: 通过 getEmployeeSprite 取当前帧纹理, 设置到 bodySprite.texture 并可见,
   *   缩放到约 64px 高; 同时确保矢量 body 不绘制 (underlayG 已 clear)。
   * - fallback 模式: 隐藏 bodySprite, 在 underlayG 上绘制矢量身体 (drawEmployeeBody)。
   */
  private drawEmployeeBodySprite(
    bodySprite: Sprite,
    underlayG: Graphics,
    emp: AIEmployee,
    ts: number,
  ): void {
    const templateDir = emp.charTemplateDir;
    const dir: Direction = emp.direction ?? directionFromDelta(
      emp.path[0] ? emp.path[0].x - emp.currentPos.x : 0,
      emp.path[0] ? emp.path[0].y - emp.currentPos.y : 0,
    );

    if (templateDir) {
      const tex = getEmployeeSprite(templateDir, emp.status, dir, ts, emp.statusStartTime);
      if (tex) {
        bodySprite.texture = tex;
        bodySprite.visible = true;
        // 缩放: 精灵图原始尺寸可能较大, 缩放到合适高度 (约 64px)
        const targetH = 64;
        bodySprite.scale.set(targetH / tex.height);
        return;
      }
    }
    // PNG 精灵图未加载 → 矢量 fallback: 隐藏 sprite, 在 underlayG 上绘制矢量身体
    bodySprite.visible = false;
    const pose = getPose(emp.status);
    const themeColor = c(emp.themeColor);
    const skin = 0xffd7a0;
    this.drawEmployeeBody(underlayG, emp, pose, ts, themeColor, c(emp.themeColorLight), skin);
  }

  /**
   * 绘制员工 overlay (绘制在角色头顶/前方的元素)。
   * 包含原 drawEmployee 的步骤 7-8: 头顶状态灯、名牌。
   */
  private drawEmployeeOverlay(g: Graphics, emp: AIEmployee): void {
    const statusColor = getStatusVisualColor(emp.status);
    // 头顶状态灯
    g.circle(0, -28, 3);
    g.fill({ color: c(statusColor) });
    // 名牌
    this.drawNamePlate(g, emp);
  }

  /** 8 方向朝向箭头 (在脚下绘制小三角箭头) */
  private drawDirectionArrow(g: Graphics, dir: Direction, ts: number): void {
    // 箭头位置: 脚下圆环外缘
    const r = 18;
    // 8 方向角度 (顺时针, 0° = 右)
    const angleMap: Record<Direction, number> = {
      'right': 0,
      'down-right': Math.PI / 4,
      'down': Math.PI / 2,
      'down-left': Math.PI * 3 / 4,
      'left': Math.PI,
      'up-left': -Math.PI * 3 / 4,
      'up': -Math.PI / 2,
      'up-right': -Math.PI / 4,
    };
    const angle = angleMap[dir];
    const ax = Math.cos(angle) * r;
    const ay = Math.sin(angle) * r * 0.5; // 等距 Y 压扁
    // 小三角箭头
    const arrowSize = 3;
    g.poly([
      ax + Math.cos(angle) * arrowSize, ay + Math.sin(angle) * arrowSize * 0.5,
      ax + Math.cos(angle + Math.PI * 0.8) * arrowSize, ay + Math.sin(angle + Math.PI * 0.8) * arrowSize * 0.5,
      ax + Math.cos(angle - Math.PI * 0.8) * arrowSize, ay + Math.sin(angle - Math.PI * 0.8) * arrowSize * 0.5,
    ]);
    g.fill({ color: 0xffd700, alpha: 0.85 });
    void ts;
  }

  /**
   * 绘制员工身体 (按姿态分支)
   * 简化的等距人物: 椭圆身体 + 圆头
   */
  private drawEmployeeBody(
    g: Graphics,
    emp: AIEmployee,
    pose: ReturnType<typeof getPose>,
    ts: number,
    themeColor: number,
    _themeColorLight: number,
    skin: number,
  ): void {
    const sway = Math.sin(ts / 200 + emp.id.charCodeAt(0)) * 1.2;
    const stepPhase = Math.sin(ts / 125); // 走路步态
    void sway;

    switch (pose) {
      case 'sit_idle': {
        // 坐着: 椭圆身体 + 圆头
        g.ellipse(0, 0, 8, 10);
        g.fill({ color: themeColor });
        g.circle(0, -12, 6);
        g.fill({ color: skin });
        // 眼睛
        g.rect(-2, -14, 1, 1);
        g.fill({ color: 0x222222 });
        g.rect(1, -14, 1, 1);
        g.fill({ color: 0x222222 });
        break;
      }
      case 'sit_working': {
        // 前倾打字
        g.ellipse(0, 0, 8, 10);
        g.fill({ color: themeColor });
        g.circle(0, -14, 6);
        g.fill({ color: skin });
        g.rect(-2, -16, 1, 1);
        g.fill({ color: 0x222222 });
        g.rect(1, -16, 1, 1);
        g.fill({ color: 0x222222 });
        // 手 (伸向桌面)
        g.moveTo(-6, 0);
        g.lineTo(-10, 6);
        g.setStrokeStyle({ width: 2, color: skin });
        g.stroke();
        g.moveTo(6, 0);
        g.lineTo(10, 6);
        g.setStrokeStyle({ width: 2, color: skin });
        g.stroke();
        break;
      }
      case 'sit_deep': {
        // 深度工作: 头更前倾
        g.ellipse(0, 0, 8, 10);
        g.fill({ color: themeColor });
        g.circle(0, -16, 6);
        g.fill({ color: skin });
        g.rect(-2, -17, 1, 1);
        g.fill({ color: 0x222222 });
        g.rect(1, -17, 1, 1);
        g.fill({ color: 0x222222 });
        break;
      }
      case 'stand_move': {
        // 站立移动: 步态
        const stepY = stepPhase * 1.5;
        g.ellipse(0, 0, 8, 12);
        g.fill({ color: themeColor });
        // 双腿
        g.rect(-5, 8, 3, 6 + stepY);
        g.fill({ color: 0x2a2d34 });
        g.rect(2, 8, 3, 6 - stepY);
        g.fill({ color: 0x2a2d34 });
        g.circle(0, -12, 6);
        g.fill({ color: skin });
        g.rect(-2, -13, 1, 1);
        g.fill({ color: 0x222222 });
        g.rect(1, -13, 1, 1);
        g.fill({ color: 0x222222 });
        break;
      }
      case 'stand_visit': {
        // 拜访 (招手)
        g.ellipse(0, 0, 8, 12);
        g.fill({ color: themeColor });
        g.circle(0, -12, 6);
        g.fill({ color: skin });
        g.rect(-2, -13, 1, 1);
        g.fill({ color: 0x222222 });
        g.rect(1, -13, 1, 1);
        g.fill({ color: 0x222222 });
        // 招手
        const waveX = 12 + Math.sin(ts / 200) * 2;
        g.moveTo(6, 0);
        g.lineTo(waveX, -8);
        g.setStrokeStyle({ width: 2, color: skin });
        g.stroke();
        break;
      }
      case 'sit_meeting': {
        // 会议室就坐
        g.ellipse(0, 0, 8, 10);
        g.fill({ color: themeColor });
        g.circle(0, -12, 6);
        g.fill({ color: skin });
        g.rect(-2, -14, 1, 1);
        g.fill({ color: 0x222222 });
        g.rect(1, -14, 1, 1);
        g.fill({ color: 0x222222 });
        // 笔记本
        g.rect(-6, 6, 12, 4);
        g.fill({ color: 0xffffff });
        break;
      }
      case 'stand_resource': {
        // 查阅资源
        g.ellipse(0, 0, 8, 12);
        g.fill({ color: themeColor });
        g.circle(0, -12, 6);
        g.fill({ color: skin });
        g.rect(-2, -13, 1, 1);
        g.fill({ color: 0x222222 });
        g.rect(1, -13, 1, 1);
        g.fill({ color: 0x222222 });
        // 手伸向书架
        g.moveTo(8, 0);
        g.lineTo(14, -4);
        g.setStrokeStyle({ width: 2, color: skin });
        g.stroke();
        break;
      }
      case 'sit_rest': {
        // 休息 (沙发喝咖啡)
        g.ellipse(0, 0, 8, 8);
        g.fill({ color: themeColor });
        g.circle(0, -10, 6);
        g.fill({ color: skin });
        g.rect(-2, -11, 1, 1);
        g.fill({ color: 0x222222 });
        g.rect(1, -11, 1, 1);
        g.fill({ color: 0x222222 });
        // 咖啡杯
        g.rect(8, 2, 5, 5);
        g.fill({ color: 0xffffff });
        g.rect(9, 3, 3, 2);
        g.fill({ color: 0x6b4226 });
        break;
      }
      case 'lie_offline': {
        // 离线 (趴下)
        g.ellipse(0, 4, 10, 4);
        g.fill({ color: themeColor });
        g.circle(-8, 4, 5);
        g.fill({ color: skin });
        break;
      }
    }
  }

  /** 名牌 (员工名 + 状态) */
  private drawNamePlate(g: Graphics, emp: AIEmployee): void {
    const plateW = 60;
    const plateH = 18;
    // 背景
    g.roundRect(-plateW / 2, 18, plateW, plateH, 4);
    g.fill({ color: 0xffffff, alpha: 0.92 });
    g.setStrokeStyle({ width: 1, color: c(emp.themeColor) });
    g.stroke();
    // 名字
    const nameText = new Text({
      text: emp.name,
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontSize: 9,
        fontWeight: 'bold',
        fill: c(emp.themeColor),
        align: 'center',
      }),
      resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    });
    nameText.anchor.set(0.5, 0);
    nameText.position.set(0, 20);
    g.addChild(nameText);
    // 状态
    const statusText = new Text({
      text: STATE_LABELS[emp.status],
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontSize: 8,
        fill: 0x666666,
        align: 'center',
      }),
      resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    });
    statusText.anchor.set(0.5, 0);
    statusText.position.set(0, 30);
    g.addChild(statusText);
  }

  // ============================================================
  // 对话气泡渲染 (5 种类型)
  // ============================================================

  /** 渲染所有气泡 (按 bubble.id 复用 Container) */
  private renderBubbles(bubbles: OfficeChatBubble[], employees: AIEmployee[], ts: number): void {
    const activeIds = new Set(bubbles.map((b) => b.id));
    // 移除过期气泡
    for (const [id, container] of this.bubbleContainers) {
      if (!activeIds.has(id)) {
        this.uiLayer.removeChild(container);
        container.destroy({ children: true });
        this.bubbleContainers.delete(id);
      }
    }
    const empMap = new Map(employees.map((e) => [e.id, e] as const));
    for (const bubble of bubbles) {
      const emp = empMap.get(bubble.employeeId);
      if (!emp) continue;
      let container = this.bubbleContainers.get(bubble.id);
      if (!container) {
        container = new Container();
        this.uiLayer.addChild(container);
        this.bubbleContainers.set(bubble.id, container);
      }
      // 清空 container 子节点 (每帧重绘)
      container.removeChildren().forEach((child) => child.destroy({ children: true }));
      this.drawBubble(container, bubble, emp, ts);
    }
  }

  /**
   * 绘制单个对话气泡 (5 种类型)
   *  - text: 圆角矩形 + 文字 + 小三角指向人物
   *  - icon: 圆形 + 图标 + 文字
   *  - thinking: 云朵形 (多圆组合) + 文字
   *  - emotion: 圆形 + emoji
   *  - voice: 圆角矩形 + 声波动画 + 字幕
   */
  private drawBubble(container: Container, bubble: OfficeChatBubble, emp: AIEmployee, ts: number): void {
    // 入场动画 (200ms 内 scale 0.8→1, alpha 0→1)
    const elapsed = ts - bubble.createdAt;
    const enterT = Math.max(0, Math.min(1, elapsed / 200));
    const scale = 0.8 + 0.2 * enterT;
    const alpha = enterT;

    // 员工头顶位置
    const screen = pixelToIso(emp.currentPos.x, emp.currentPos.y);
    container.position.set(screen.x, screen.y - 40);
    container.scale.set(scale);
    container.alpha = alpha;

    const themeColor = c(emp.themeColor);

    switch (bubble.type) {
      case 'text':
        this.drawTextBubble(container, bubble, themeColor);
        break;
      case 'icon':
        this.drawIconBubble(container, bubble, themeColor);
        break;
      case 'thinking':
        this.drawThinkingBubble(container, bubble, themeColor);
        break;
      case 'emotion':
        this.drawEmotionBubble(container, bubble, themeColor);
        break;
      case 'voice':
        this.drawVoiceBubble(container, bubble, themeColor, ts);
        break;
    }
  }

  /** 文字气泡: 圆角矩形 + 文字 + 三角尾巴 */
  private drawTextBubble(container: Container, bubble: OfficeChatBubble, themeColor: number): void {
    const text = (bubble.content ?? '').slice(0, 20);
    const w = Math.max(60, Math.min(200, text.length * 8 + 16));
    const h = 28;
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, 12);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    g.setStrokeStyle({ width: 1, color: themeColor });
    g.stroke();
    // 三角尾巴
    g.poly([-5, h / 2, 5, h / 2, 0, h / 2 + 6]);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    container.addChild(g);
    // 文字
    const textObj = new Text({
      text,
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontSize: 12,
        fill: 0x333333,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: w - 12,
      }),
      resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    });
    textObj.anchor.set(0.5, 0.5);
    container.addChild(textObj);
  }

  /** 图标气泡: 圆形 + 图标 + 文字 */
  private drawIconBubble(container: Container, bubble: OfficeChatBubble, themeColor: number): void {
    const text = (bubble.content ?? '').slice(0, 5);
    const icon = bubble.emoji ?? '💬';
    const r = 24;
    const g = new Graphics();
    g.circle(0, 0, r);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    g.setStrokeStyle({ width: 1, color: themeColor });
    g.stroke();
    container.addChild(g);
    // 图标
    const iconText = new Text({
      text: icon,
      style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 14, align: 'center' }),
      resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    });
    iconText.anchor.set(0.5, 0.5);
    iconText.position.set(0, -6);
    container.addChild(iconText);
    // 文字
    const textObj = new Text({
      text,
      style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x333333, align: 'center' }),
      resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    });
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 8);
    container.addChild(textObj);
  }

  /** 思考气泡: 云朵形 (多圆组合) + 文字 */
  private drawThinkingBubble(container: Container, bubble: OfficeChatBubble, themeColor: number): void {
    const text = (bubble.content ?? '').slice(0, 15);
    const g = new Graphics();
    // 主云朵: 3 个圆形组合
    g.circle(-14, -2, 12);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    g.setStrokeStyle({ width: 1, color: themeColor });
    g.stroke();
    g.circle(14, -2, 12);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    g.setStrokeStyle({ width: 1, color: themeColor });
    g.stroke();
    g.circle(0, 0, 18);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    g.setStrokeStyle({ width: 1, color: themeColor });
    g.stroke();
    // 小尾巴 (递减圆)
    g.circle(8, 14, 4);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    g.circle(12, 20, 2.5);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    container.addChild(g);
    // 文字
    const textObj = new Text({
      text,
      style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x333333, align: 'center' }),
      resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    });
    textObj.anchor.set(0.5, 0.5);
    container.addChild(textObj);
  }

  /** 情绪气泡: 圆形 + emoji */
  private drawEmotionBubble(container: Container, bubble: OfficeChatBubble, themeColor: number): void {
    const emoji = bubble.emoji ?? bubble.content ?? '😄';
    const r = 20;
    const g = new Graphics();
    g.circle(0, 0, r);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    g.setStrokeStyle({ width: 1, color: themeColor });
    g.stroke();
    container.addChild(g);
    const emojiText = new Text({
      text: emoji,
      style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 18, align: 'center' }),
      resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    });
    emojiText.anchor.set(0.5, 0.5);
    container.addChild(emojiText);
  }

  /** 语音气泡: 圆角矩形 + 声波动画 + 字幕 */
  private drawVoiceBubble(container: Container, bubble: OfficeChatBubble, themeColor: number, ts: number): void {
    const text = (bubble.content ?? '').slice(0, 10);
    const w = 100;
    const h = 36;
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, 12);
    g.fill({ color: 0xffffff, alpha: 0.95 });
    g.setStrokeStyle({ width: 1, color: themeColor });
    g.stroke();
    // 声波动画: 3 个圆形从小到大循环
    const baseX = -w / 2 + 18;
    for (let i = 0; i < 3; i++) {
      const phase = (ts / 300 + i * 0.5) % 1;
      const r = 2 + 3 * phase;
      const alpha = 1 - phase;
      g.circle(baseX + i * 10, 0, r);
      g.fill({ color: 0x1677ff, alpha });
    }
    container.addChild(g);
    // 字幕
    const textObj = new Text({
      text,
      style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x333333, align: 'left' }),
      resolution: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    });
    textObj.anchor.set(0, 0.5);
    textObj.position.set(baseX + 18, 0);
    container.addChild(textObj);
  }

  // ============================================================
  // 销毁
  // ============================================================

  /** 销毁渲染器 (释放所有 Graphics 和 Container) */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.employeeContainers.clear();
    this.bubbleContainers.clear();
    if (this.sceneRoot) {
      this.sceneRoot.destroy({ children: true });
    }
  }
}
