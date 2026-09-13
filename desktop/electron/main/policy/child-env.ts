/**
 * child-env —— 子进程环境变量白名单构造（安全审计 S-05 残留 / S-29 / S-28）。
 *
 * 背景：多处 spawn 直接 { ...process.env }，把主进程的**全部**环境变量交给子进程。
 * 这些子进程会执行外部内容（业务流 Python、Hermes 官署 CLI、服务行），一旦被投毒即可读到
 * 平台凭据（FLOWS_LLM_API_KEY、ST_AUTH_KEY…）与宿主机上的任意密钥。
 *
 * 修法：默认只透传「进程正常运行必需」的白名单键（PATH / TEMP / HOME / 语言 / 代理 …），
 * 需要额外变量一律由调用方通过 extra 显式注入（如 EDICT_HOME、PYTHONUTF8、ST_AUTH_FILE）。
 * 这样「凭据进子进程」从默认行为变成一次显式决定，且可在代码评审里被看见。
 *
 * 约定：
 * - 大小写不敏感（Windows 的 Path 与 PATH 视为同一个键），后写覆盖先写；
 * - base 中的 undefined / 空串一律丢弃（拷贝语义，避免把空凭据带进子进程）；
 *   extra 中的空串**保留**（调用方显式赋值，如 `VIDEO_CLAW_PROXY_KEY: key ?? ""`，
 *   丢键会让子进程从「空值」变成「未定义」，可能触发 KeyError）；非字符串值一律丢弃；
 * - 纯函数，不修改入参。
 */

/**
 * 默认放行键（大小写不敏感）。刻意按「用途」分组，便于评审判断新增键是否合理：
 * 白名单只放**非凭据**的运行必需品 —— 任何含 KEY / TOKEN / SECRET 语义的键都不在此列。
 */
export const BASE_ENV_KEYS: readonly string[] = [
  // 可执行文件查找与系统库解析
  'PATH',
  'PATHEXT',
  'COMSPEC',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'OS',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
  // 临时目录
  'TEMP',
  'TMP',
  'TMPDIR',
  // 用户目录（n8n / hermes / python 的缓存与配置默认落点）
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PROGRAMFILES',
  // 语言与编码
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  // 代理（企业网络下下载依赖必需；不含平台凭据）
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  // 运行模式
  'NODE_ENV',
  'PYTHONIOENCODING',
  'PYTHONUTF8',
]

const ALLOWED_LOWER = new Set(BASE_ENV_KEYS.map((k) => k.toLowerCase()))

/**
 * 构造子进程环境：白名单透传 + extra 显式覆盖。
 *
 * @param base 通常是 process.env（只取白名单键）
 * @param extra 调用方显式注入的键值（不受白名单限制，但仍是本函数唯一的凭据入口）
 */
export function buildChildEnv(
  base: Record<string, string | undefined> | null | undefined,
  extra?: Record<string, string | undefined> | null,
): Record<string, string> {
  const out: Record<string, string> = {}
  /** 小写键 → out 中的真实键名（用于大小写不敏感去重） */
  const actualKeys = new Map<string, string>()

  const put = (key: string, value: unknown, allowEmpty: boolean): void => {
    if (typeof key !== 'string' || !key) return
    if (typeof value !== 'string') return
    if (value === '' && !allowEmpty) return
    const lower = key.toLowerCase()
    const prev = actualKeys.get(lower)
    if (prev !== undefined && prev !== key) delete out[prev]
    actualKeys.set(lower, key)
    out[key] = value
  }

  for (const [key, value] of Object.entries(base ?? {})) {
    if (ALLOWED_LOWER.has(key.toLowerCase())) put(key, value, false)
  }
  for (const [key, value] of Object.entries(extra ?? {})) put(key, value, true)
  return out
}

/**
 * 该命令是否必须经 shell 启动。
 *
 * Windows 上 .cmd / .bat 无法被直接 CreateProcess，必须走 cmd.exe（Node 18+ 亦不再隐式兜底）；
 * 其余（.exe / 无扩展名 / 内置命令）一律直接 spawn —— 只要 shell: true，参数就会经 cmd.exe 展开，
 * 命令或参数里一旦混入外部可控内容即成为命令注入面（S-28）。
 *
 * 兼容 service-manager 传入的已加引号路径（如 "C:\\Program Files\\n8n.cmd"）。
 */
export function requiresShell(command: string, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== 'win32') return false
  if (typeof command !== 'string') return false
  const bare = command.trim().replace(/^"+/, '').replace(/"+$/, '')
  return /\.(cmd|bat)$/i.test(bare)
}
/** 子进程 argv 数量上限（防止把整块数据当参数塞进去） */
export const MAX_CHILD_ARGS = 50
/** 单个子进程参数长度上限 */
export const MAX_CHILD_ARG_CHARS = 2000

/**
 * 收敛传给子进程的 argv（安全审计 S-29）。
 *
 * 与 env 白名单同源：argv 也是「主进程 → 会执行外部内容的子进程」的输入面。
 * **保留位置**（不 drop 空项）—— 这些脚本按 sys.argv 位置解析，删项会让参数错位；
 * 非字符串一律降级为空串，清掉 NUL，并给单参长度与参数数量设上限。
 */
export function sanitizeChildArgs(
  args: readonly unknown[],
  maxArgs: number = MAX_CHILD_ARGS,
  maxChars: number = MAX_CHILD_ARG_CHARS,
): string[] {
  const limit = Number.isFinite(maxArgs) && maxArgs > 0 ? Math.floor(maxArgs) : MAX_CHILD_ARGS
  const charLimit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : MAX_CHILD_ARG_CHARS
  return args.slice(0, limit).map((raw) => {
    const text = typeof raw === 'string' ? raw : ''
    const cleaned = text.replace(/\u0000/g, '')
    return cleaned.length > charLimit ? cleaned.slice(0, charLimit) : cleaned
  })
}
