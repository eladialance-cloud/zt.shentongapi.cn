/** 工具名是否属于 ST-Claw 视频/图像生成（收窄：不再匹配任意含 task 的工具名） */
export function isVideoClawTool(name: string): boolean {
  const n = (name || '').toLowerCase()
  return /(^|[-_/])(video[-_]?claw|st[-_]?claw|video|image|picture|t2i|i2i)([-_/]|$)/.test(n)
}
