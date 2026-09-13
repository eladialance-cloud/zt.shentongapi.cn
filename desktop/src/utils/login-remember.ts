// 登录页「记住账号」本地存储（安全审计 S-53b）
//
// 背景：原实现把 { account, password } 明文写进 localStorage，且复选框默认勾选 ——
// 密码属于长期凭据，落在与渲染层同源的 localStorage 里，任意被注入脚本或同机进程都能读走。
// 现改为：只记住账号（非凭据），密码永不落盘；旧版本残留的 password 字段在首次读取时清除。
//
// 需要「密码自动填充」时应走主进程加密存储（userData/renderer-store 的凭据命名空间），
// 而不是回到 localStorage。

export const LOGIN_REMEMBER_KEY = 'shentong.login.remember'

/** 解析存储内容：只接受字符串 account，其余字段一律忽略 */
export function parseRememberedAccount(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || !raw) return ''
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return ''
  }
  if (!data || typeof data !== 'object') return ''
  const account = (data as { account?: unknown }).account
  return typeof account === 'string' ? account : ''
}

/** 是否含有旧版本遗留的 password 字段（读取命中即触发重写清除） */
export function hasLegacyPassword(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string' || !raw) return false
  try {
    const data = JSON.parse(raw) as unknown
    return Boolean(data) && typeof data === 'object' && 'password' in (data as object)
  } catch {
    return false
  }
}

/** 序列化为仅含账号的载荷（永不包含密码） */
export function serializeRememberedAccount(account: string): string {
  return JSON.stringify({ account })
}

/** 读取已记住的账号；命中旧版本密码残留时立即重写为仅账号 */
export function readRememberedAccount(): string {
  try {
    const raw = window.localStorage.getItem(LOGIN_REMEMBER_KEY)
    const account = parseRememberedAccount(raw)
    if (account && hasLegacyPassword(raw)) writeRememberedAccount(account)
    return account
  } catch {
    return ''
  }
}

/** 保存/清除记住的账号（account 为空即清除） */
export function writeRememberedAccount(account: string | null): void {
  try {
    if (account) {
      window.localStorage.setItem(LOGIN_REMEMBER_KEY, serializeRememberedAccount(account))
    } else {
      window.localStorage.removeItem(LOGIN_REMEMBER_KEY)
    }
  } catch {
    // 本地存储失败不阻塞登录
  }
}
