import type { OfficeLayoutConfig, OfficeDesk } from './types'

/**
 * 根据配置计算工位位置
 * 纯2D网格：自动居中排列
 */
export function computeDeskPositions(
  config: OfficeLayoutConfig,
  agentCount: number,
  sceneWidth: number,
  sceneHeight: number,
): OfficeDesk[] {
  const cols = config.cols
  const rows = config.rows > 0 ? config.rows : Math.ceil(agentCount / cols)
  const { colGap, rowGap, seatOffsetY } = config

  const blockWidth = (cols - 1) * colGap
  const blockHeight = (rows - 1) * rowGap
  const originX = (sceneWidth - blockWidth) / 2
  const originY = (sceneHeight - blockHeight) / 2

  const desks: OfficeDesk[] = []
  let n = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (n >= agentCount) break
      const x = originX + col * colGap
      const y = originY + row * rowGap
      desks.push({
        id: `desk-${n}`,
        x,
        y,
        seatX: x,
        seatY: y + seatOffsetY,
      })
      n++
    }
  }
  return desks
}

/**
 * 解析十六进制颜色为RGB数字
 */
export function hexToNumber(hex: string): number {
  const cleaned = hex.replace('#', '')
  return parseInt(cleaned, 16)
}

/**
 * 将配置中的颜色字符串转为PixiJS颜色数值
 */
export function resolveColorMap(config: { floor: string; wall: string; background: string; deskTop: string; chairColor: string }) {
  return {
    floor: hexToNumber(config.floor),
    wall: hexToNumber(config.wall),
    background: hexToNumber(config.background),
    deskTop: hexToNumber(config.deskTop),
    chairColor: hexToNumber(config.chairColor),
  }
}
