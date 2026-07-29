// 快捷键解析与匹配工具（Task 11）
// 提供 parseShortcut / formatShortcut / matchShortcut / loadShortcutsConfig 等工具
// 跨平台 Ctrl：ctrlKey（Win/Linux）或 metaKey（Mac）均视为 Ctrl

const STORAGE_KEY = 'shortcuts-config'

/** 纯修饰键集合（按下这些键时不算完成捕获） */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

/** KeyboardEvent.key → 显示名映射 */
const KEY_DISPLAY_MAP: Record<string, string> = {
  ' ': 'Space',
  Escape: 'Esc',
  Delete: 'Del',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Control: 'Ctrl',
  Meta: 'Meta'
}

/** 快捷键结构化配置 */
export interface ShortcutConfig {
  /** Ctrl（跨平台，匹配 ctrlKey 或 metaKey） */
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  /** 主键名（已规范化，单字符大写） */
  key: string
}

/** 默认快捷键配置 */
export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'global-search': 'Ctrl+K',
  'new-item': 'Ctrl+N',
  save: 'Ctrl+S',
  'command-palette': 'Ctrl+Shift+P',
  settings: 'Ctrl+,',
  delete: 'Ctrl+D'
}

/**
 * 将事件中的 key 规范化为展示形式
 * 单字符转大写，特殊键映射为友好名称
 */
function normalizeKey(key: string): string {
  if (KEY_DISPLAY_MAP[key]) return KEY_DISPLAY_MAP[key]
  if (key.length === 1) return key.toUpperCase()
  return key
}

/**
 * 解析快捷键字符串为结构化配置
 * 例如 "Ctrl+Shift+K" → { ctrl:true, shift:true, alt:false, meta:false, key:"K" }
 * 解析失败返回 null
 */
export function parseShortcut(s: string): ShortcutConfig | null {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed) return null

  const parts = trimmed
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  const config: ShortcutConfig = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: ''
  }

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') {
      config.ctrl = true
    } else if (lower === 'shift') {
      config.shift = true
    } else if (lower === 'alt') {
      config.alt = true
    } else if (lower === 'meta' || lower === 'cmd' || lower === 'command') {
      config.meta = true
    } else {
      // 已存在主键时忽略后续
      if (!config.key) {
        config.key = normalizeKey(part)
      }
    }
  }

  if (!config.key) return null
  return config
}

/**
 * 将结构化配置格式化为字符串
 * 例如 { ctrl:true, shift:true, key:"K" } → "Ctrl+Shift+K"
 */
export function formatShortcut(config: ShortcutConfig): string {
  const parts: string[] = []
  if (config.ctrl) parts.push('Ctrl')
  if (config.shift) parts.push('Shift')
  if (config.alt) parts.push('Alt')
  if (config.meta) parts.push('Meta')
  if (config.key) parts.push(config.key)
  return parts.join('+')
}

/**
 * 判断 KeyboardEvent 是否匹配指定快捷键配置
 * 跨平台 Ctrl：config.ctrl=true 时接受 ctrlKey 或 metaKey
 * 严格匹配 shift / alt；meta 仅在 config.meta=true 时强制要求
 */
export function matchShortcut(e: KeyboardEvent, config: ShortcutConfig): boolean {
  const ctrlPressed = e.ctrlKey || e.metaKey

  // ctrl=true: 至少一个 ctrl/meta 被按下；ctrl=false: 都未按下
  const ctrlMatch = config.ctrl ? ctrlPressed : !ctrlPressed
  if (!ctrlMatch) return false

  // shift 严格匹配
  const shiftMatch = config.shift ? e.shiftKey : !e.shiftKey
  if (!shiftMatch) return false

  // alt 严格匹配
  const altMatch = config.alt ? e.altKey : !e.altKey
  if (!altMatch) return false

  // meta 仅在 config.meta=true 时强制要求（且不允许 ctrlKey）
  // 当 config.ctrl=true 时 meta 视为 ctrl 一部分，不再单独检查
  if (config.meta) {
    if (!e.metaKey || e.ctrlKey) return false
  }

  // 主键匹配（大小写不敏感）
  const eventKey = normalizeKey(e.key)
  return eventKey.toLowerCase() === config.key.toLowerCase()
}

/**
 * 判断事件是否为纯修饰键按下（用于捕获时忽略）
 */
export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key)
}

/**
 * 从 KeyboardEvent 直接构造快捷键字符串（用于捕获时填入 Input）
 * 跨平台 Ctrl：将 ctrlKey 或 metaKey 统一展示为 "Ctrl"
 * 纯修饰键按下返回 null
 */
export function formatFromKeyboardEvent(e: KeyboardEvent): string | null {
  if (isModifierKey(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')

  const key = normalizeKey(e.key)
  parts.push(key)
  return parts.join('+')
}

/**
 * 从 localStorage 加载快捷键配置
 * 与 DEFAULT_SHORTCUTS 合并，保证所有 key 存在
 * SSR / 异常情况下返回默认配置
 */
export function loadShortcutsConfig(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SHORTCUTS }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SHORTCUTS }
    const parsed = JSON.parse(raw) as Record<string, string>
    return { ...DEFAULT_SHORTCUTS, ...parsed }
  } catch {
    return { ...DEFAULT_SHORTCUTS }
  }
}

/**
 * 将快捷键配置写入 localStorage
 */
export function saveShortcutsConfig(config: Record<string, string>): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // 忽略写入失败（隐私模式 / 配额超限）
  }
}

/**
 * 获取某个 action 的当前快捷键字符串
 * 未配置时返回默认值，仍无则返回 null
 */
export function getShortcutFor(actionKey: string): string | null {
  const config = loadShortcutsConfig()
  if (config[actionKey]) return config[actionKey]
  return DEFAULT_SHORTCUTS[actionKey] || null
}
