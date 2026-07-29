/**
 * 等距 2.5D 场景配置 (Spec upgrade-office-to-isometric-25d Task 3.1)
 *
 * 世界坐标系约定:
 *   - 世界坐标 = 正交网格坐标 (worldX, worldY)，范围 [0..ISO_GRID_COLS, 0..ISO_GRID_ROWS]
 *   - astar.ts 在像素坐标系下寻路 (0..CANVAS_WIDTH × 0..CANVAS_HEIGHT)
 *   - 渲染层把像素坐标 → 网格坐标 (除以 CELL_SIZE) → 等距屏幕坐标 (worldToScreen)
 *
 * 现有 AREAS/FURNITURE/WORKSTATION_XS 使用像素坐标 (如 x:540, y:740)，
 * 通过 pixelToIso() 转换到等距屏幕坐标；员工 currentPos 同样使用像素坐标。
 */

import {
  AREAS,
  CELL_SIZE,
  COLORS,
  FURNITURE,
  GRID_COLS,
  GRID_ROWS,
  HOTSPOTS,
  RESOURCE_TARGETS,
  WORKSTATION_XS,
  WORKSTATION_Y,
} from './office-2d-config';
import type { Furniture, OfficeArea, PixelPoint } from './types';

/** 等距 tile 宽度 (px, 标准 2:1 比例) */
export const TILE_WIDTH = 64;
/** 等距 tile 高度 (px, TILE_WIDTH/2) */
export const TILE_HEIGHT = 32;
/** 等距网格列数 (沿用正交网格 60) */
export const ISO_GRID_COLS = GRID_COLS;
/** 等距网格行数 (沿用正交网格 40) */
export const ISO_GRID_ROWS = GRID_ROWS;

/** 墙壁高度 (px, 用于墙壁 3D 透视) */
export const WALL_HEIGHT = 48;
/** 画布 padding (px, 留给墙壁高度和 UI 浮层) */
export const CANVAS_PADDING = 120;

/** 复用 office-2d-config 的 COLORS 调色板 (不重复定义) */
export const ISO_COLORS = COLORS;

/** 复用 AREAS (像素坐标，渲染时通过 pixelToIso 转换) */
export const ISO_AREAS: OfficeArea[] = AREAS;
/** 复用 FURNITURE (像素坐标，渲染时通过 pixelToIso 转换) */
export const ISO_FURNITURE: Furniture[] = FURNITURE;
/** 复用 HOTSPOTS */
export const ISO_HOTSPOTS = HOTSPOTS;
/** 复用 RESOURCE_TARGETS */
export const ISO_RESOURCE_TARGETS = RESOURCE_TARGETS;

/** 工位 (像素坐标) — 5 个 AI 员工工位 */
export const ISO_WORKSTATIONS: PixelPoint[] = WORKSTATION_XS.map((x) => ({
  x,
  y: WORKSTATION_Y,
}));

/**
 * 世界坐标 (网格坐标) → 等距屏幕坐标
 * @param worldX 网格 X 坐标 [0..ISO_GRID_COLS]
 * @param worldY 网格 Y 坐标 [0..ISO_GRID_ROWS]
 * @returns 等距屏幕坐标 (未做原点偏移)
 */
export function worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: (worldX - worldY) * TILE_WIDTH / 2,
    y: (worldX + worldY) * TILE_HEIGHT / 2,
  };
}

/**
 * 等距屏幕坐标 → 世界坐标 (网格坐标)
 * @param screenX 等距屏幕 X
 * @param screenY 等距屏幕 Y
 * @returns 世界 (网格) 坐标
 */
export function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2,
    y: (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2,
  };
}

/**
 * 像素坐标 (现有 AREAS/FURNITURE/员工坐标) → 等距屏幕坐标
 * 内部: 先除以 CELL_SIZE 转网格坐标，再 worldToScreen
 * @param px 像素 X (0..CANVAS_WIDTH)
 * @param py 像素 Y (0..CANVAS_HEIGHT)
 * @returns 等距屏幕坐标 (未做原点偏移)
 */
export function pixelToIso(px: number, py: number): { x: number; y: number } {
  return worldToScreen(px / CELL_SIZE, py / CELL_SIZE);
}

/**
 * 等距屏幕坐标 → 像素坐标 (pixelToIso 的逆变换)
 * @param isoX 等距屏幕 X
 * @param isoY 等距屏幕 Y
 * @returns 像素坐标
 */
export function isoToPixel(isoX: number, isoY: number): PixelPoint {
  const world = screenToWorld(isoX, isoY);
  return { x: world.x * CELL_SIZE, y: world.y * CELL_SIZE };
}

/**
 * 计算等距画布的 bounding box 与最终尺寸
 * 4 个角的世界坐标 (0,0) / (COLS,0) / (0,ROWS) / (COLS,ROWS) 经 worldToScreen 投影:
 *   (0,0)              → (0, 0)
 *   (COLS,0)           → (COLS*TW/2, COLS*TH/2)
 *   (0,ROWS)           → (-ROWS*TW/2, ROWS*TH/2)
 *   (COLS,ROWS)        → ((COLS-ROWS)*TW/2, (COLS+ROWS)*TH/2)
 * 屏幕范围: x ∈ [-ROWS*TW/2, COLS*TW/2], y ∈ [0, (COLS+ROWS)*TH/2]
 */
export interface IsoCanvasLayout {
  /** 屏幕坐标中世界 bounding box 左上角 X (负值, 用于平移原点) */
  originX: number;
  /** 屏幕坐标中世界 bounding box 左上角 Y (0, 用于平移原点) */
  originY: number;
  /** 画布最终宽度 (bounding box 宽 + 2*PADDING) */
  canvasWidth: number;
  /** 画布最终高度 (bounding box 高 + 2*PADDING + WALL_HEIGHT) */
  canvasHeight: number;
  /** 渲染原点 X (画布左上角到 bounding box 左上角的偏移, 含 PADDING) */
  renderOffsetX: number;
  /** 渲染原点 Y (画布左上角到 bounding box 左上角的偏移, 含 PADDING) */
  renderOffsetY: number;
}

/** 惰性计算等距画布布局 */
let _layout: IsoCanvasLayout | null = null;
export function getIsoCanvasLayout(): IsoCanvasLayout {
  if (_layout) return _layout;
  const minX = -ISO_GRID_ROWS * TILE_WIDTH / 2;
  const maxX = ISO_GRID_COLS * TILE_WIDTH / 2;
  const minY = 0;
  const maxY = (ISO_GRID_COLS + ISO_GRID_ROWS) * TILE_HEIGHT / 2;
  const width = maxX - minX;
  const height = maxY - minY;
  _layout = {
    originX: minX,
    originY: minY,
    canvasWidth: Math.ceil(width + 2 * CANVAS_PADDING),
    canvasHeight: Math.ceil(height + 2 * CANVAS_PADDING + WALL_HEIGHT),
    renderOffsetX: CANVAS_PADDING - minX,
    renderOffsetY: CANVAS_PADDING + WALL_HEIGHT - minY,
  };
  return _layout;
}

/**
 * 把像素坐标转换为画布上最终的渲染坐标 (含 renderOffset 平移)
 * 用于直接放置对象到画布
 */
export function pixelToCanvas(px: number, py: number): { x: number; y: number } {
  const iso = pixelToIso(px, py);
  const layout = getIsoCanvasLayout();
  return { x: iso.x + layout.renderOffsetX, y: iso.y + layout.renderOffsetY };
}

/**
 * 把世界 (网格) 坐标转换为画布上最终的渲染坐标 (含 renderOffset 平移)
 */
export function worldToCanvas(worldX: number, worldY: number): { x: number; y: number } {
  const iso = worldToScreen(worldX, worldY);
  const layout = getIsoCanvasLayout();
  return { x: iso.x + layout.renderOffsetX, y: iso.y + layout.renderOffsetY };
}

/**
 * 把画布上的屏幕坐标转换回像素坐标 (用于点击事件)
 * @param canvasX 画布 X
 * @param canvasY 画布 Y
 * @returns 像素坐标 (与 astar.ts 坐标系一致)
 */
export function canvasToPixel(canvasX: number, canvasY: number): PixelPoint {
  const layout = getIsoCanvasLayout();
  const isoX = canvasX - layout.renderOffsetX;
  const isoY = canvasY - layout.renderOffsetY;
  return isoToPixel(isoX, isoY);
}

/**
 * 6 位 AI 员工初始等距位置 (从 employees.ts 的 workstation 字段映射)
 * 实际员工数据由 OfficeIsoCanvas.tsx 通过 createEmployees() 创建，
 * 这里仅提供工位 → 等距画布坐标的映射工具
 */
export function getEmployeeInitialCanvasPos(workstation: PixelPoint): { x: number; y: number } {
  return pixelToCanvas(workstation.x, workstation.y);
}

/** 工具: hex 颜色字符串转 0xRRGGBB 数字 (供 PixiJS Graphics 使用) */
export function hexToNumber(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 0xffffff;
  return parseInt(m[1], 16);
}

/** 工具: rgba 字符串转 { color: number, alpha: number } (供 PixiJS Graphics 使用) */
export function rgbaToPixi(rgba: string): { color: number; alpha: number } {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(rgba.trim());
  if (!m) {
    // 尝试 hex
    return { color: hexToNumber(rgba), alpha: 1 };
  }
  const r = parseInt(m[1], 10);
  const g = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  const color = (r << 16) | (g << 8) | b;
  return { color, alpha: a };
}
