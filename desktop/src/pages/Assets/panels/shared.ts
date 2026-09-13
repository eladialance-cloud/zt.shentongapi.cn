/** 素材库页面板共用工具（2026-09-13 由原「素材管理」页并入，逻辑保持原样） */
export function fmtTime(v?: string | Date | null): string {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('zh-CN', { hour12: false })
}
