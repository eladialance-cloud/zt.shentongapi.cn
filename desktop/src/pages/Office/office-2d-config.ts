/**
 * AI 办公室 2D 画布 — 场景配置 (v0.3.1 Task 7)
 *
 * 60x40 网格 / cell 20x20px / canvas 1200x800
 */

import type { CellType, GridCell, OfficeArea, Furniture, PixelPoint } from './types';

/** 网格规格 */
export const GRID_COLS = 60;
export const GRID_ROWS = 40;
export const CELL_SIZE = 20;

/** 画布尺寸 */
export const CANVAS_WIDTH = GRID_COLS * CELL_SIZE;  // 1200
export const CANVAS_HEIGHT = GRID_ROWS * CELL_SIZE; // 800

/** v0.3.1 调色板 */
export const COLORS = {
  floor: '#F0EBE3',
  floorLine: '#E5DDC9',
  wall: '#E8E0D5',
  wallBaseboard: '#C4B5A0',
  loungeStart: '#6B5B95',
  loungeEnd: '#8B7DAB',
  glass: 'rgba(120, 180, 220, 0.18)',
  glassBorder: 'rgba(80, 140, 180, 0.45)',
  wood: '#A6815A',
  woodDark: '#7E5E3F',
  metal: '#9CA3AF',
  metalDark: '#4B5563',
  bookSpine1: '#A0522D',
  bookSpine2: '#4682B4',
  bookSpine3: '#6B8E23',
  bookSpine4: '#8B4513',
  plant: '#4A8B3B',
  plantDark: '#2E6B1E',
  screenOff: '#1F2937',
  screenOn: '#60A5FA',
  ink: '#2A2D34',
  paper: '#FAFAF5',
  /** AI 主题色 */
  business: '#1677FF',
  businessLight: '#E6F4FF',
  content: '#722ED1',
  contentLight: '#F4EBFE',
  delivery: '#13C2C2',
  deliveryLight: '#E6FFFB',
  finance: '#52C41A',
  financeLight: '#F6FFED',
  service: '#FA8C16',
  serviceLight: '#FFF7E6',
  /** 状态色 */
  statusIdle: '#52C41A',
  statusWorking: '#FA8C16',
  statusMoving: '#1677FF',
  statusOffline: '#9CA3AF',
  statusDeep: '#FF4D4F',
} as const;

/** 7 个区域定义 (像素坐标) */
export const AREAS: OfficeArea[] = [
  {
    id: 'reception',
    label: '前台接待区',
    x: 500,
    y: 720,
    width: 200,
    height: 60,
    color: 'rgba(22, 119, 255, 0.06)',
    entrance: { x: 30, y: 36 },
    cellType: 'FLOOR',
  },
  {
    id: 'openOffice',
    label: '开放式办公区',
    x: 240,
    y: 360,
    width: 720,
    height: 280,
    color: 'rgba(82, 196, 26, 0.05)',
    entrance: { x: 36, y: 24 },
    cellType: 'FLOOR',
  },
  {
    id: 'meetingRoom',
    label: '会议室',
    x: 40,
    y: 540,
    width: 200,
    height: 200,
    color: 'rgba(114, 46, 209, 0.07)',
    entrance: { x: 12, y: 30 },
    cellType: 'MEETING_ROOM',
  },
  {
    id: 'library',
    label: '资料室',
    x: 40,
    y: 60,
    width: 200,
    height: 180,
    color: 'rgba(19, 194, 194, 0.06)',
    entrance: { x: 12, y: 14 },
    cellType: 'RESOURCE_LIBRARY',
  },
  {
    id: 'skillWall',
    label: '技能墙',
    x: 960,
    y: 60,
    width: 200,
    height: 180,
    color: 'rgba(250, 140, 22, 0.07)',
    entrance: { x: 48, y: 14 },
    cellType: 'RESOURCE_SKILL',
  },
  {
    id: 'equipmentRoom',
    label: '设备间',
    x: 960,
    y: 540,
    width: 200,
    height: 200,
    color: 'rgba(102, 109, 122, 0.10)',
    entrance: { x: 48, y: 30 },
    cellType: 'RESOURCE_DEVICE',
  },
  {
    id: 'lounge',
    label: '中央休息区',
    x: 460,
    y: 180,
    width: 280,
    height: 140,
    color: 'rgba(107, 91, 149, 0.08)',
    entrance: { x: 30, y: 14 },
    cellType: 'FLOOR',
  },
];

/** 家具列表 (像素坐标) */
export const FURNITURE: Furniture[] = [
  // ===== 前台 =====
  { type: 'receptionDesk', x: 540, y: 740, width: 120, height: 30, color: COLORS.woodDark, label: 'OpenClaw 接待' },
  // ===== 5 个工位 (开放办公区, x:300/440/580/720/860, y:400) =====
  { type: 'desk', x: 240, y: 380, width: 120, height: 80, color: COLORS.wood },
  { type: 'monitor', x: 264, y: 380, width: 72, height: 18, color: COLORS.business },
  { type: 'chair', x: 285, y: 470, width: 30, height: 30, color: COLORS.businessLight },

  { type: 'desk', x: 380, y: 380, width: 120, height: 80, color: COLORS.wood },
  { type: 'monitor', x: 404, y: 380, width: 72, height: 18, color: COLORS.content },
  { type: 'chair', x: 425, y: 470, width: 30, height: 30, color: COLORS.contentLight },

  { type: 'desk', x: 520, y: 380, width: 120, height: 80, color: COLORS.wood },
  { type: 'monitor', x: 544, y: 380, width: 72, height: 18, color: COLORS.delivery },
  { type: 'chair', x: 565, y: 470, width: 30, height: 30, color: COLORS.deliveryLight },

  { type: 'desk', x: 660, y: 380, width: 120, height: 80, color: COLORS.wood },
  { type: 'monitor', x: 684, y: 380, width: 72, height: 18, color: COLORS.finance },
  { type: 'chair', x: 705, y: 470, width: 30, height: 30, color: COLORS.financeLight },

  { type: 'desk', x: 800, y: 380, width: 120, height: 80, color: COLORS.wood },
  { type: 'monitor', x: 824, y: 380, width: 72, height: 18, color: COLORS.service },
  { type: 'chair', x: 845, y: 470, width: 30, height: 30, color: COLORS.serviceLight },

  // ===== 会议室 (圆桌 + 6 椅) =====
  { type: 'roundTable', x: 90, y: 615, width: 100, height: 50, color: COLORS.woodDark },
  { type: 'meetingChair', x: 95,  y: 595, width: 22, height: 22, color: '#6B5B95' },
  { type: 'meetingChair', x: 129, y: 595, width: 22, height: 22, color: '#6B5B95' },
  { type: 'meetingChair', x: 163, y: 595, width: 22, height: 22, color: '#6B5B95' },
  { type: 'meetingChair', x: 95,  y: 668, width: 22, height: 22, color: '#6B5B95' },
  { type: 'meetingChair', x: 129, y: 668, width: 22, height: 22, color: '#6B5B95' },
  { type: 'meetingChair', x: 163, y: 668, width: 22, height: 22, color: '#6B5B95' },

  // ===== 资料室 (4 书架) =====
  { type: 'bookshelf', x: 60,  y: 80,  width: 40, height: 140, label: '资料 A' },
  { type: 'bookshelf', x: 110, y: 80,  width: 40, height: 140, label: '资料 B' },
  { type: 'bookshelf', x: 160, y: 80,  width: 40, height: 140, label: '资料 C' },
  { type: 'bookshelf', x: 210, y: 80,  width: 30, height: 140, label: '资料 D' },

  // ===== 技能墙 =====
  { type: 'toolWall', x: 980, y: 90,  width: 170, height: 130, label: '技能墙' },

  // ===== 设备间 (3 机柜) =====
  { type: 'serverCabinet', x: 980,  y: 560, width: 50, height: 160, label: 'GPU-A' },
  { type: 'serverCabinet', x: 1040, y: 560, width: 50, height: 160, label: 'GPU-B' },
  { type: 'serverCabinet', x: 1100, y: 560, width: 50, height: 160, label: 'STORAGE' },

  // ===== 休息区 (沙发+咖啡机+植物) =====
  { type: 'sofa', x: 480, y: 200, width: 110, height: 40, color: '#8B7DAB' },
  { type: 'sofa', x: 620, y: 200, width: 110, height: 40, color: '#8B7DAB' },
  { type: 'coffeeMachine', x: 700, y: 260, width: 30, height: 40, color: COLORS.metalDark },
  { type: 'plant', x: 470, y: 260, width: 24, height: 32 },
  { type: 'plant', x: 740, y: 260, width: 24, height: 32 },
  { type: 'plant', x: 230, y: 350, width: 24, height: 32 },
  { type: 'plant', x: 950, y: 350, width: 24, height: 32 },
];

/** 工位 x 坐标列表 (像素) — 对应 5 个 AI 员工 */
export const WORKSTATION_XS: number[] = [300, 440, 580, 720, 860];
export const WORKSTATION_Y: number = 400;

/** 7 个可点击热点 */
export const HOTSPOTS = [
  { id: 'ws-business', x: 300, y: 400, radius: 28, label: '商务AI 工位', employeeId: 'business' },
  { id: 'ws-content',  x: 440, y: 400, radius: 28, label: '内容AI 工位', employeeId: 'content' },
  { id: 'ws-delivery', x: 580, y: 400, radius: 28, label: '交付AI 工位', employeeId: 'delivery' },
  { id: 'ws-finance',  x: 720, y: 400, radius: 28, label: '财务AI 工位', employeeId: 'finance' },
  { id: 'ws-service',  x: 860, y: 400, radius: 28, label: '客服AI 工位', employeeId: 'service' },
  { id: 'meeting',     x: 140, y: 640, radius: 36, label: '会议室' },
  { id: 'lounge',      x: 600, y: 250, radius: 36, label: '休息区' },
] as const;

/**
 * 构建 60x40 网格。
 * 默认 FLOOR；椅子位置 CHAIR；会议室/资料室/技能墙/设备间内部为对应资源类型 (除入口);
 * 4 周外墙为 OBSTACLE。
 */
export function buildGrid(): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      let type: CellType = 'FLOOR';
      // 外墙
      if (x === 0 || y === 0 || x === GRID_COLS - 1 || y === GRID_ROWS - 1) {
        type = 'OBSTACLE';
      }
      // 5 个工位椅子位置 (x: 300/440/580/720/860, y: 470 = chair 中心)
      // chair 30x30, 中心 (300, 485) -> grid (15, 24)
      const chairCenters = [
        { x: 300, y: 485 }, { x: 440, y: 485 }, { x: 580, y: 485 },
        { x: 720, y: 485 }, { x: 860, y: 485 },
      ];
      if (chairCenters.some((c) => Math.floor(c.x / CELL_SIZE) === x && Math.floor(c.y / CELL_SIZE) === y)) {
        type = 'CHAIR';
      }
      // 会议室内部 (除入口)
      const meeting = AREAS.find((a) => a.id === 'meetingRoom')!;
      if (insideArea(x, y, meeting, CELL_SIZE) && !(meeting.entrance && meeting.entrance.x === x && meeting.entrance.y === y)) {
        type = 'MEETING_ROOM';
      }
      // 资料室
      const library = AREAS.find((a) => a.id === 'library')!;
      if (insideArea(x, y, library, CELL_SIZE) && !(library.entrance && library.entrance.x === x && library.entrance.y === y)) {
        type = 'RESOURCE_LIBRARY';
      }
      // 技能墙
      const skill = AREAS.find((a) => a.id === 'skillWall')!;
      if (insideArea(x, y, skill, CELL_SIZE) && !(skill.entrance && skill.entrance.x === x && skill.entrance.y === y)) {
        type = 'RESOURCE_SKILL';
      }
      // 设备间
      const equip = AREAS.find((a) => a.id === 'equipmentRoom')!;
      if (insideArea(x, y, equip, CELL_SIZE) && !(equip.entrance && equip.entrance.x === x && equip.entrance.y === y)) {
        type = 'RESOURCE_DEVICE';
      }
      // 服务柜台 (前台)
      const reception = AREAS.find((a) => a.id === 'reception')!;
      if (insideArea(x, y, reception, CELL_SIZE)) {
        // 前台桌面为 OBSTACLE
        if (y >= Math.floor(740 / CELL_SIZE)) {
          type = 'OBSTACLE';
        }
      }
      // 家具中固定障碍 (圆桌, 书架, 机柜, 技能墙, 沙发)
      // 这里在 buildGrid 中处理简化: 由 astar.getNeighbors 动态跳过即可
      row.push({ x, y, type });
    }
    grid.push(row);
  }
  return grid;
}

/** 判断网格单元 是否在区域像素范围内 (含边界) */
function insideArea(gx: number, gy: number, area: OfficeArea, cellSize: number): boolean {
  const px = gx * cellSize;
  const py = gy * cellSize;
  return px >= area.x && px < area.x + area.width &&
         py >= area.y && py < area.y + area.height;
}

/** 由像素坐标查找所属区域 */
export function findAreaAtPixel(px: number, py: number): OfficeArea | null {
  for (const area of AREAS) {
    if (px >= area.x && px < area.x + area.width &&
        py >= area.y && py < area.y + area.height) {
      return area;
    }
  }
  return null;
}

/** 各区域资源目标点 (像素中心) */
export const RESOURCE_TARGETS: Record<string, PixelPoint> = {
  meetingRoom: { x: 140, y: 640 },
  library: { x: 140, y: 150 },
  skillWall: { x: 1065, y: 155 },
  equipmentRoom: { x: 1065, y: 640 },
  lounge: { x: 600, y: 250 },
  reception: { x: 600, y: 745 },
};
