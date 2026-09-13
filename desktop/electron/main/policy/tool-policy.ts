/**
 * computer-control MCP 工具策略层（安全审计 S-07 / S-55）。
 *
 * 背景：工具参数由 LLM 生成 —— 等价于「外部可控输入直达本机能力」。
 * 因此把「工具名 → 风险级 / 是否默认启用 / 是否需确认 / 参数校验」集中到这里，
 * MCP handler 只负责「取参 → evaluateToolCall → 执行 → 回执」。
 *
 * 设计约束：
 * - 纯函数，零 electron 依赖（路径判定复用批次 1 的 policy/path-policy）；
 * - fail-closed：根目录未授权、确认回调缺失、参数异常一律拒绝；
 * - 高危工具（写文件 / 键鼠 / 剪贴板写入 / 执行命令）默认不启用，需显式 opt-in。
 */
import { posix, win32 } from 'node:path'
import { EXECUTABLE_EXTENSIONS, evaluateReadPath, isUncPath } from './path-policy'

export type ToolRisk = 'low' | 'high'

export interface ToolContext {
  /** 允许读写的根目录（来自 services/allowed-roots，用户显式授权） */
  allowedRoots: readonly string[]
  /** 高危工具的用户确认回调；缺失时高危工具一律拒绝（CONFIRM_UNAVAILABLE） */
  confirm?: (name: string, args: Record<string, unknown>) => Promise<boolean>
  platform?: NodeJS.Platform
}

export interface ToolPolicy {
  name: string
  risk: ToolRisk
  enabledByDefault: boolean
  requiresConfirmation: boolean
  /** 返回 null 表示参数合法；返回字符串表示拒绝原因 */
  validate: (args: Record<string, unknown>, ctx: ToolContext) => string | null
}

export type ToolDenyCode =
  | 'UNKNOWN_TOOL'
  | 'DISABLED'
  | 'INVALID_ARGS'
  | 'CONFIRM_UNAVAILABLE'
  | 'CONFIRM_DENIED'

export type ToolDecision =
  | { ok: true; policy: ToolPolicy }
  | { ok: false; code: ToolDenyCode; reason: string }

// ===== 内部工具函数 =====

/** 取非空字符串参数（trim 后）；不是字符串或为空返回 null */
function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return s ? s : null
}

function pathModule(platform: NodeJS.Platform = process.platform) {
  return platform === 'win32' ? win32 : posix
}

function extensionOf(absPath: string): string {
  const base = absPath.replace(/[\\/]+$/, '')
  const slash = Math.max(base.lastIndexOf('\\'), base.lastIndexOf('/'))
  const name = base.slice(slash + 1)
  const idx = name.lastIndexOf('.')
  if (idx < 0) return ""
  const ext = name.slice(idx).toLowerCase()
  return ext === "." ? "" : ext
}

function isExecutablePath(absPath: string): boolean {
  return EXECUTABLE_EXTENSIONS.has(extensionOf(absPath))
}

/** 绝对路径（含 UNC 判定由调用方另行处理） */
function isAbsolutePath(raw: string, platform: NodeJS.Platform): boolean {
  return pathModule(platform).isAbsolute(raw)
}

function isAbsoluteSafePath(raw: string, ctx: ToolContext): string | null {
  if (isUncPath(raw)) return "不支持 UNC 路径"
  const platform = ctx.platform ?? process.platform
  if (!isAbsolutePath(raw, platform)) return "仅支持绝对路径"
  return null
}

/** 进程名：只允许字母数字与 . _ - 空格，禁止 shell 元字符（防命令注入） */
const PROCESS_NAME_RE = /^[A-Za-z0-9._\- ]{1,180}$/

const MAX_KEYBOARD_TEXT = 10_000
const MAX_CLIPBOARD_TEXT = 1024 * 1024
const MAX_COMMAND_LENGTH = 2_000
const MAX_COORDINATE = 32_767

function positiveInt(value: unknown, max: number): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  const n = Math.round(value)
  return n >= 0 && n <= max
}

// ===== 工具策略表 =====

export const COMPUTER_CONTROL_TOOLS: readonly ToolPolicy[] = [
  {
    name: 'app_open',
    risk: 'low',
    enabledByDefault: true,
    requiresConfirmation: false,
    validate(args, ctx) {
      const p = asString(args.path)
      if (!p) return 'path 不能为空'
      const pathIssue = isAbsoluteSafePath(p, ctx)
      if (pathIssue) return pathIssue
      if (isExecutablePath(p)) return '默认禁止打开可执行/脚本/快捷方式文件'
      return null
    },
  },
  {
    name: 'app_close',
    risk: 'low',
    enabledByDefault: true,
    requiresConfirmation: false,
    validate(args) {
      const name = asString(args.name)
      if (!name) return 'name 不能为空'
      if (!PROCESS_NAME_RE.test(name)) return '进程名含非法字符'
      return null
    },
  },
  {
    name: 'file_read',
    risk: 'low',
    enabledByDefault: true,
    requiresConfirmation: false,
    validate(args, ctx) {
      const p = asString(args.path)
      if (!p) return 'path 不能为空'
      const pathIssue = isAbsoluteSafePath(p, ctx)
      if (pathIssue) return pathIssue
      return null
    },
  },
  {
    name: 'file_write',
    risk: 'high',
    enabledByDefault: false,
    requiresConfirmation: true,
    validate(args, ctx) {
      const p = asString(args.path)
      if (!p) return 'path 不能为空'
      if (typeof args.content !== "string") return "content 必须是字符串"
      const decision = evaluateReadPath(p, ctx.allowedRoots, ctx.platform ?? process.platform)
      if (!decision.ok) {
        return decision.reason === 'OUTSIDE_ROOTS'
          ? '目标路径不在已授权目录内（请先在会话中授权目录）'
          : '非法路径: ' + decision.reason
      }
      if (isExecutablePath(decision.path)) return '禁止写入可执行/脚本文件'
      return null
    },
  },
  {
    name: 'clipboard_get',
    risk: 'low',
    enabledByDefault: true,
    requiresConfirmation: false,
    validate() {
      return null
    },
  },
  {
    name: 'clipboard_set',
    risk: 'high',
    enabledByDefault: false,
    requiresConfirmation: true,
    validate(args) {
      const text = args.text
      if (typeof text !== "string") return "text 必须是字符串"
      if (text.length > MAX_CLIPBOARD_TEXT) return "text 超过 1MB 上限"
      return null
    },
  },
  {
    name: 'keyboard_type',
    risk: 'high',
    enabledByDefault: false,
    requiresConfirmation: true,
    validate(args) {
      const text = asString(args.text)
      if (text === null && typeof args.text !== 'string') return 'text 必须是字符串'
      if ((args.text as string).length > MAX_KEYBOARD_TEXT) return 'text 超过 10000 字符上限'
      return null
    },
  },
  {
    name: 'mouse_click',
    risk: 'high',
    enabledByDefault: false,
    requiresConfirmation: true,
    validate(args) {
      if (!positiveInt(args.x, MAX_COORDINATE)) return 'x 必须是 0..32767 的有限数'
      if (!positiveInt(args.y, MAX_COORDINATE)) return 'y 必须是 0..32767 的有限数'
      const button = args.button
      if (button !== undefined && !['left', 'right', 'middle'].includes(String(button))) {
        return 'button 只能是 left/right/middle'
      }
      return null
    },
  },
  {
    name: 'browser_open',
    risk: 'low',
    enabledByDefault: true,
    requiresConfirmation: false,
    validate(args) {
      const url = asString(args.url)
      if (!url) return 'url 不能为空'
      if (!/^https?:\/\//i.test(url)) return '仅允许 http/https 网址'
      return null
    },
  },
  {
    name: 'screenshot',
    risk: 'low',
    enabledByDefault: true,
    requiresConfirmation: false,
    validate(args, ctx) {
      const target = asString(args.path)
      if (!target) return null
      const decision = evaluateReadPath(target, ctx.allowedRoots, ctx.platform ?? process.platform)
      if (!decision.ok) {
        return decision.reason === 'OUTSIDE_ROOTS'
          ? '截图保存路径必须在已授权目录内'
          : '非法路径: ' + decision.reason
      }
      return null
    },
  },
  {
    name: 'system_exec',
    risk: 'high',
    enabledByDefault: false,
    requiresConfirmation: true,
    validate(args) {
      const command = asString(args.command)
      if (!command) return 'command 不能为空'
      if (command.length > MAX_COMMAND_LENGTH) return "command 超过 2000 字符上限"
      return null
    },
  },
]

export function getToolPolicy(name: string): ToolPolicy | null {
  if (typeof name !== 'string' || !name) return null
  return COMPUTER_CONTROL_TOOLS.find((t) => t.name === name) ?? null
}

/**
 * 当前可暴露给 LLM 的工具集合：
 * - 默认只含低风险工具；
 * - settings.enabled 里显式列出的工具额外启用（用于用户 opt-in 高危工具）；
 * - 未知名字忽略（不报错，避免设置项写错导致整个工具集不可用）。
 */
export function listEnabledTools(settings: { enabled?: readonly string[] } = {}): readonly ToolPolicy[] {
  const extra = new Set(settings.enabled ?? [])
  return COMPUTER_CONTROL_TOOLS.filter((t) => t.enabledByDefault || extra.has(t.name))
}

/**
 * 执行前判定：未知工具 → 拒绝；未启用 → 拒绝；参数非法 → 拒绝；高危需确认（缺回调或用户拒绝 → 拒绝）。
 * 注意：本函数是唯一入口，任何绕过它的直接调用都属于缺陷。
 */
export async function evaluateToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  settings: { enabled?: readonly string[] } = {},
): Promise<ToolDecision> {
  const policy = getToolPolicy(name)
  if (!policy) return { ok: false, code: 'UNKNOWN_TOOL', reason: '未知工具: ' + String(name) }
  const enabled = listEnabledTools(settings).some((t) => t.name === policy.name)
  if (!enabled) {
    return { ok: false, code: 'DISABLED', reason: '工具未启用（默认关闭的高危工具需显式开启）: ' + policy.name }
  }
  const safeArgs = args && typeof args === "object" ? args : {}
  const issue = policy.validate(safeArgs, ctx)
  if (issue) return { ok: false, code: 'INVALID_ARGS', reason: issue }
  if (policy.requiresConfirmation) {
    if (typeof ctx.confirm !== 'function') {
      return { ok: false, code: 'CONFIRM_UNAVAILABLE', reason: '高危工具缺少确认通道，已拒绝: ' + policy.name }
    }
    let approved = false
    try {
      approved = (await ctx.confirm(policy.name, safeArgs)) === true
    } catch {
      approved = false
    }
    if (!approved) return { ok: false, code: 'CONFIRM_DENIED', reason: '用户未确认: ' + policy.name }
  }
  return { ok: true, policy }
}
