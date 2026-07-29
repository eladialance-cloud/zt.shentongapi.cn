/**
 * A* 寻路算法 (v0.3.1 Task 10 / Task 4 加固)
 *
 * 60x40 网格, 4 方向移动 (无对角线)。
 * 成本: FLOOR=1, CHAIR=2, RESOURCE_x/MEETING_ROOM=1 (仅从入口), OBSTACLE=不可通行。
 *
 * Task 4 加固:
 *  - 障碍物策略: 静态墙体 + 家具 (桌/沙发/咖啡机/植物) + 动态人物 (圆形, 半径 16px, 由参数传入)
 *  - padding: 外墙膨胀 20px (1 格), 避免人物贴墙穿帮; 家具不膨胀, 保留工位间 20px 过道
 *  - 兜底: A* 失败时返回 [start, end] 直线, 由 tick 碰撞检测兜底
 *  - 统一 key 函数: pointKey(x, y) => `${x},${y}`
 */

import type { CellType, Furniture, GridCell, PixelPoint } from './types';
import {
  buildGrid,
  CELL_SIZE,
  FURNITURE,
  GRID_COLS,
  GRID_ROWS,
  WORKSTATION_XS,
  WORKSTATION_Y,
} from './office-2d-config';

/** 障碍物膨胀 padding (px). 20px = 1 格, 仅用于外墙, 避免贴墙穿帮。 */
export const OBSTACLE_PADDING_PX = 20;

/** 动态人物障碍物默认半径 (px) */
export const DYNAMIC_AGENT_RADIUS_PX = 16;

/** 动态圆形障碍物 (像素坐标) */
export interface DynamicObstacle {
  /** 圆心 x (px) */
  cx: number;
  /** 圆心 y (px) */
  cy: number;
  /** 半径 (px) */
  radius: number;
}

/** 统一 key 函数 (网格坐标) — 全模块唯一 key 生成入口, 格式 `${x},${y}` */
function pointKey(x: number, y: number): string {
  return `${x},${y}`;
}

interface Node {
  x: number;
  y: number;
  g: number; // 起点到当前成本
  h: number; // 启发式到目标距离
  f: number; // g + h
  parent: Node | null;
}

/** 简易二叉堆 (按 f 升序) */
class MinHeap {
  private items: Node[] = [];

  get size(): number { return this.items.length; }

  push(node: Node): void {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): Node | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.items[parent].f <= this.items[idx].f) break;
      [this.items[parent], this.items[idx]] = [this.items[idx], this.items[parent]];
      idx = parent;
    }
  }

  private bubbleDown(idx: number): void {
    const n = this.items.length;
    while (true) {
      const l = 2 * idx + 1;
      const r = 2 * idx + 2;
      let smallest = idx;
      if (l < n && this.items[l].f < this.items[smallest].f) smallest = l;
      if (r < n && this.items[r].f < this.items[smallest].f) smallest = r;
      if (smallest === idx) break;
      [this.items[smallest], this.items[idx]] = [this.items[idx], this.items[smallest]];
      idx = smallest;
    }
  }
}

/**
 * 家具中视为静态障碍物的类型。
 * - desk: 工位桌 (角色需绕行, 通过出口车道进出自身工位)
 * - sofa / coffeeMachine / plant: 休息区/走廊装饰, 角色不应穿过
 *
 * 资源类家具 (bookshelf/toolWall/serverCabinet/roundTable) 不在此列:
 * 它们位于封闭资源区内且为目标点本身, 角色进入区域后直达目标, 无需作为障碍。
 * chair/meetingChair 为坐席, 不作为障碍。receptionDesk 已由 buildGrid 标记为 OBSTACLE。
 */
const SOLID_FURNITURE_TYPES = new Set<Furniture['type']>([
  'desk',
  'sofa',
  'coffeeMachine',
  'plant',
]);

export class AStar {
  private grid: GridCell[][];
  private cols: number;
  private rows: number;
  /** 静态阻塞 mask (含 OBSTACLE + 外墙 padding + 家具), true = 不可通行 */
  private blocked: boolean[][];

  constructor(grid: GridCell[][]) {
    this.grid = grid;
    this.cols = grid[0]?.length ?? 0;
    this.rows = grid.length;
    this.blocked = this.buildStaticBlockedMask();
  }

  /**
   * 构建静态阻塞 mask:
   *  1. 基础 OBSTACLE 单元 (外墙 + 前台桌面)
   *  2. 外墙 padding 膨胀 (1 格, 保留入口/椅子)
   *  3. 家具障碍 (桌/沙发/咖啡机/植物, 不膨胀; 豁免工位出口车道/入口/椅子)
   */
  private buildStaticBlockedMask(): boolean[][] {
    const cols = this.cols;
    const rows = this.rows;
    const mask: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));

    // 1. 基础 OBSTACLE 单元 (外墙 + 前台桌面)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (this.grid[y][x].type === 'OBSTACLE') mask[y][x] = true;
      }
    }

    // 收集入口与椅子单元 (膨胀/家具标记时需保留)
    const entranceSet = this.collectEntranceKeys();
    const chairSet = this.collectChairKeys();
    const isProtected = (x: number, y: number): boolean =>
      entranceSet.has(pointKey(x, y)) || chairSet.has(pointKey(x, y));

    // 2. 外墙 padding 膨胀 (仅周边 OBSTACLE, 1 格)
    //    避免人物贴墙穿帮; 保留入口与椅子; 内部 OBSTACLE (前台桌面) 不膨胀
    const paddingCells = Math.max(1, Math.round(OBSTACLE_PADDING_PX / CELL_SIZE));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (this.grid[y][x].type !== 'OBSTACLE') continue;
        const isPerimeter = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
        if (!isPerimeter) continue; // 仅外墙膨胀, 前台桌面等内部 OBSTACLE 不膨胀
        for (let dy = -paddingCells; dy <= paddingCells; dy++) {
          for (let dx = -paddingCells; dx <= paddingCells; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            if (this.grid[ny][nx].type === 'OBSTACLE') continue;
            if (isProtected(nx, ny)) continue;
            mask[ny][nx] = true;
          }
        }
      }
    }

    // 3. 工位出口车道 (每个工位 x 列, 从工位行到椅子行豁免, 角色可进出工位)
    const exitLaneSet = this.collectExitLaneKeys();

    // 4. 家具障碍 (桌/沙发/咖啡机/植物)
    //    不做 padding, 保留工位间 20px 过道; 豁免出口车道/入口/椅子
    for (const f of FURNITURE) {
      if (!SOLID_FURNITURE_TYPES.has(f.type)) continue;
      const x0 = Math.floor(f.x / CELL_SIZE);
      const y0 = Math.floor(f.y / CELL_SIZE);
      const x1 = Math.ceil((f.x + f.width) / CELL_SIZE);
      const y1 = Math.ceil((f.y + f.height) / CELL_SIZE);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          if (isProtected(x, y)) continue;
          if (exitLaneSet.has(pointKey(x, y))) continue;
          mask[y][x] = true;
        }
      }
    }

    return mask;
  }

  /** 收集所有区域入口 key (资源类单元中可从 FLOOR/CHAIR 邻居进入的) */
  private collectEntranceKeys(): Set<string> {
    const set = new Set<string>();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const t = this.grid[y][x].type;
        if (
          t === 'MEETING_ROOM' ||
          t === 'RESOURCE_LIBRARY' ||
          t === 'RESOURCE_SKILL' ||
          t === 'RESOURCE_DEVICE'
        ) {
          if (this.isEntrance(x, y, t)) set.add(pointKey(x, y));
        }
      }
    }
    return set;
  }

  /** 收集所有 CHAIR 单元 key */
  private collectChairKeys(): Set<string> {
    const set = new Set<string>();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.grid[y][x].type === 'CHAIR') set.add(pointKey(x, y));
      }
    }
    return set;
  }

  /** 收集工位出口车道 key: 每个工位 x 列从工位行到椅子行 (含), 角色可沿此列进出工位 */
  private collectExitLaneKeys(): Set<string> {
    const set = new Set<string>();
    const wsRow = Math.floor(WORKSTATION_Y / CELL_SIZE); // 工位所在行
    // 工位椅子中心 y (从 FURNITURE 中 type='chair' 推导, 避免硬编码)
    const wsChair = FURNITURE.find((f) => f.type === 'chair');
    const chairRow = wsChair
      ? Math.floor((wsChair.y + wsChair.height / 2) / CELL_SIZE)
      : wsRow + 4; // 兜底: 工位行 + 4 格
    for (const wx of WORKSTATION_XS) {
      const col = Math.floor(wx / CELL_SIZE);
      for (let y = wsRow; y <= chairRow; y++) {
        set.add(pointKey(col, y));
      }
    }
    return set;
  }

  /** 曼哈顿距离启发式 */
  private heuristic(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  /** 判断 是否为对应资源类型区域的入口 (相对其所属区域) */
  private isEntrance(x: number, y: number, _type: CellType): boolean {
    // 入口约定: 区域内最靠走廊一侧的格子 (在 office-2d-config 中由 entrance 字段定义)
    // 简化: 同一类型区域内, 邻居中有 FLOOR 的视为可达
    const dirs = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    ];
    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
      const t = this.grid[ny][nx].type;
      if (t === 'FLOOR' || t === 'CHAIR') return true;
    }
    return false;
  }

  /** 判断 是否被动态圆形障碍物占据 (排除自身格) */
  private isDynamicBlocked(
    x: number,
    y: number,
    obstacles: DynamicObstacle[] | undefined,
    selfGrid: { x: number; y: number } | undefined,
  ): boolean {
    if (!obstacles || obstacles.length === 0) return false;
    // 单元中心像素
    const px = x * CELL_SIZE + CELL_SIZE / 2;
    const py = y * CELL_SIZE + CELL_SIZE / 2;
    for (const o of obstacles) {
      // 起点格不阻挡自身
      if (selfGrid && selfGrid.x === x && selfGrid.y === y) continue;
      const dx = px - o.cx;
      const dy = py - o.cy;
      if (dx * dx + dy * dy <= o.radius * o.radius) return true;
    }
    return false;
  }

  /** 4 方向邻居 + 移动成本 (综合考虑静态 mask + 动态障碍物, 目标格豁免) */
  private getNeighbors(
    cell: { x: number; y: number },
    goal: { x: number; y: number },
    dynamicObstacles: DynamicObstacle[] | undefined,
    selfGrid: { x: number; y: number } | undefined,
  ): Array<{ x: number; y: number; cost: number }> {
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];
    const out: Array<{ x: number; y: number; cost: number }> = [];
    for (const d of dirs) {
      const nx = cell.x + d.dx;
      const ny = cell.y + d.dy;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
      const t = this.grid[ny][nx].type;
      if (t === 'OBSTACLE') continue;
      // 资源类单元: 只能从对应区域入口进入 (相邻入口才可踏入)
      if (t === 'MEETING_ROOM' || t === 'RESOURCE_LIBRARY' || t === 'RESOURCE_SKILL' || t === 'RESOURCE_DEVICE') {
        if (!this.isEntrance(nx, ny, t)) continue;
      }
      const isGoal = nx === goal.x && ny === goal.y;
      // 静态 mask (目标格豁免, 允许进入目标所在单元)
      if (!isGoal && this.blocked[ny][nx]) continue;
      // 动态障碍物 (目标格豁免, 避免目标被占据时无解)
      if (!isGoal && this.isDynamicBlocked(nx, ny, dynamicObstacles, selfGrid)) continue;
      const cost = t === 'CHAIR' ? 2 : 1;
      out.push({ x: nx, y: ny, cost });
    }
    return out;
  }

  /**
   * 主寻路接口 (网格坐标)
   * @param start 起点格
   * @param goal 终点格
   * @param dynamicObstacles 动态圆形障碍物 (像素坐标), 可选; 不传则仅考虑静态障碍
   * @param selfGrid 寻路角色自身所在格 (用于排除自身阻挡), 可选, 默认 = start
   * @returns 网格路径; 起终点相同返回 [start]; 越界或目标为 OBSTACLE 返回 []
   */
  findPath(
    start: { x: number; y: number },
    goal: { x: number; y: number },
    dynamicObstacles?: DynamicObstacle[],
    selfGrid?: { x: number; y: number },
  ): Array<{ x: number; y: number }> {
    if (start.x === goal.x && start.y === goal.y) return [{ ...start }];
    if (
      start.x < 0 || start.y < 0 || start.x >= this.cols || start.y >= this.rows ||
      goal.x < 0 || goal.y < 0 || goal.x >= this.cols || goal.y >= this.rows
    ) {
      return [];
    }

    const goalType = this.grid[goal.y]?.[goal.x]?.type;
    if (goalType === 'OBSTACLE') return [];

    const self = selfGrid ?? start;
    const open = new MinHeap();
    const closed = new Set<string>();
    const gMap = new Map<string, number>();
    const startH = this.heuristic(start, goal);
    const startNode: Node = {
      x: start.x, y: start.y,
      g: 0,
      h: startH,
      f: startH,
      parent: null,
    };
    open.push(startNode);
    gMap.set(pointKey(start.x, start.y), 0);

    let iterations = 0;
    const MAX_ITER = this.cols * this.rows * 4;

    while (open.size > 0 && iterations < MAX_ITER) {
      iterations++;
      const cur = open.pop()!;
      const curKey = pointKey(cur.x, cur.y);
      if (closed.has(curKey)) continue;
      closed.add(curKey);

      if (cur.x === goal.x && cur.y === goal.y) {
        // 回溯路径
        const path: Array<{ x: number; y: number }> = [];
        let n: Node | null = cur;
        while (n) {
          path.push({ x: n.x, y: n.y });
          n = n.parent;
        }
        path.reverse();
        return path;
      }

      const neighbors = this.getNeighbors({ x: cur.x, y: cur.y }, goal, dynamicObstacles, self);
      for (const nb of neighbors) {
        const nbKey = pointKey(nb.x, nb.y);
        if (closed.has(nbKey)) continue;
        const tentativeG = cur.g + nb.cost;
        const prevG = gMap.get(nbKey);
        if (prevG !== undefined && tentativeG >= prevG) continue;
        gMap.set(nbKey, tentativeG);
        const h = this.heuristic({ x: nb.x, y: nb.y }, goal);
        const node: Node = {
          x: nb.x, y: nb.y,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: cur,
        };
        open.push(node);
      }
    }
    return [];
  }

  /**
   * 寻路接口 (像素坐标), 返回像素路径 (单元格中心)
   * @param startPx 起点像素
   * @param goalPx 终点像素
   * @param dynamicObstacles 动态圆形障碍物 (像素坐标), 可选
   * @returns 像素路径; A* 失败时返回 [startPx, goalPx] 直线兜底, 由 tick 碰撞检测兜底
   */
  findPathPixels(
    startPx: PixelPoint,
    goalPx: PixelPoint,
    dynamicObstacles?: DynamicObstacle[],
  ): PixelPoint[] {
    const s = pixelToGrid(startPx.x, startPx.y);
    const g = pixelToGrid(goalPx.x, goalPx.y);
    const gridPath = this.findPath(s, g, dynamicObstacles, s);
    if (gridPath.length === 0) {
      // 兜底: 直线路径, 由 tick 碰撞检测兜底
      return [startPx, goalPx];
    }
    return gridPath.map((c) => gridToPixel(c.x, c.y));
  }
}

/** 像素 -> 网格 */
export function pixelToGrid(px: number, py: number, cellSize: number = CELL_SIZE): { x: number; y: number } {
  return { x: Math.floor(px / cellSize), y: Math.floor(py / cellSize) };
}

/** 网格 -> 像素 (单元格中心) */
export function gridToPixel(gx: number, gy: number, cellSize: number = CELL_SIZE): PixelPoint {
  return { x: gx * cellSize + cellSize / 2, y: gy * cellSize + cellSize / 2 };
}

/** 移动速度档位 (px/s) */
export const MOVE_SPEED = {
  slow: 40,
  normal: 60,
  fast: 90,
} as const;

/** 重新规划间隔 (ms) */
export const REPATH_INTERVAL_MS = 500;

/** 门队列间隔 (ms) */
export const DOOR_QUEUE_INTERVAL_MS = 500;

/** 默认网格 (惰性创建) */
let _defaultGrid: GridCell[][] | null = null;
export function getDefaultGrid(): GridCell[][] {
  if (!_defaultGrid) {
    _defaultGrid = buildGrid();
  }
  return _defaultGrid!;
}

/** 默认 A* 实例 (惰性创建) */
let _defaultAStar: AStar | null = null;
export function getDefaultAStar(): AStar {
  if (!_defaultAStar) {
    _defaultAStar = new AStar(getDefaultGrid());
  }
  return _defaultAStar!;
}

export { GRID_COLS, GRID_ROWS, CELL_SIZE };
