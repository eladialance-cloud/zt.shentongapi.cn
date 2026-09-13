// 工具策略层回归测试（安全审计 S-07 / S-55）
// 覆盖：默认启用集合、高风险默认关闭、路径/参数校验、高危工具确认链路（fail-closed）。
import {
  COMPUTER_CONTROL_TOOLS,
  evaluateToolCall,
  getToolPolicy,
  listEnabledTools,
  type ToolContext,
} from '../../electron/main/policy/tool-policy'

const winCtx = (roots: readonly string[] = []): ToolContext => ({ allowedRoots: roots, platform: 'win32' })
const yes = async (): Promise<boolean> => true
const no = async (): Promise<boolean> => false

describe('默认启用集合', () => {
  it('默认只暴露低风险工具，高危工具默认关闭', () => {
    const names = listEnabledTools().map((t) => t.name)
    expect(names).toEqual(['app_open', 'app_close', 'file_read', 'clipboard_get', 'browser_open', 'screenshot'])
    for (const high of ['system_exec', 'keyboard_type', 'mouse_click', 'clipboard_set', 'file_write']) {
      expect(names).not.toContain(high)
    }
  })

  it('显式 opt-in 后才暴露高危工具', () => {
    const names = listEnabledTools({ enabled: ['system_exec', 'file_write'] }).map((t) => t.name)
    expect(names).toContain('system_exec')
    expect(names).toContain('file_write')
    expect(names).not.toContain('keyboard_type')
  })

  it('未知工具名不报错也不启用', () => {
    const names = listEnabledTools({ enabled: ['nope', 'system_exec'] }).map((t) => t.name)
    expect(names).toContain('system_exec')
    expect(names).not.toContain('nope')
  })

  it('策略表内工具名唯一', () => {
    const names = COMPUTER_CONTROL_TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('getToolPolicy 对未知工具返回 null', () => {
    expect(getToolPolicy('nope')).toBe(null)
    expect(getToolPolicy('')).toBe(null)
    expect(getToolPolicy('app_open')?.name).toBe('app_open')
  })
})

describe('app_open / app_close', () => {
  it('app_open 拒绝可执行/脚本/快捷方式文件', async () => {
    for (const p of ['C:\\Windows\\System32\\calc.exe', 'C:\\x\\run.bat', 'C:\\x\\a.ps1', 'C:\\x\\s.lnk']) {
      const d = await evaluateToolCall('app_open', { path: p }, winCtx())
      expect(d.ok).toBe(false)
      if (!d.ok) expect(d.code).toBe('INVALID_ARGS')
    }
  })

  it('app_open 放行普通文档，拒绝相对路径与 UNC', async () => {
    expect((await evaluateToolCall('app_open', { path: 'C:\\docs\\a.pdf' }, winCtx())).ok).toBe(true)
    expect((await evaluateToolCall('app_open', { path: 'a.txt' }, winCtx())).ok).toBe(false)
    expect((await evaluateToolCall('app_open', { path: '\\\\srv\\share\\a.txt' }, winCtx())).ok).toBe(false)
    expect((await evaluateToolCall('app_open', {}, winCtx())).ok).toBe(false)
  })

  it('app_close 只接受规整进程名（防命令注入）', async () => {
    expect((await evaluateToolCall('app_close', { name: 'notepad.exe' }, winCtx())).ok).toBe(true)
    const backtick = 'a' + String.fromCharCode(96) + 'b'
    for (const bad of ["a'; calc.exe; '", 'a|b', 'a&b', backtick, 'a$(b)', 'a\nb', '']) {
      expect((await evaluateToolCall('app_close', { name: bad }, winCtx())).ok).toBe(false)
    }
  })
})


describe('file_read / file_write', () => {
  it('file_read 要求绝对路径且非 UNC', async () => {
    expect((await evaluateToolCall('file_read', { path: 'C:\\a\\b.txt' }, winCtx())).ok).toBe(true)
    expect((await evaluateToolCall('file_read', { path: 'b.txt' }, winCtx())).ok).toBe(false)
    expect((await evaluateToolCall('file_read', { path: '\\\\srv\\share\\b.txt' }, winCtx())).ok).toBe(false)
  })

  it('file_write 必须落在已授权目录内（未授权则 fail-closed）', async () => {
    const ctx = winCtx(['C:\\work'])
    const ok = await evaluateToolCall('file_write', { path: 'C:\\work\\a.txt', content: 'hi' }, { ...ctx, confirm: yes }, { enabled: ['file_write'] })
    expect(ok.ok).toBe(true)

    const outside = await evaluateToolCall('file_write', { path: 'C:\\other\\a.txt', content: 'hi' }, { ...ctx, confirm: yes }, { enabled: ['file_write'] })
    expect(outside.ok).toBe(false)

    const noRoots = await evaluateToolCall('file_write', { path: 'C:\\work\\a.txt', content: 'hi' }, { ...winCtx([]), confirm: yes }, { enabled: ['file_write'] })
    expect(noRoots.ok).toBe(false)
  })

  it('file_write 拒绝可执行扩展名与缺失 content', async () => {
    const ctx = { ...winCtx(['C:\\work']), confirm: yes }
    expect((await evaluateToolCall('file_write', { path: 'C:\\work\\a.bat', content: 'x' }, ctx, { enabled: ['file_write'] })).ok).toBe(false)
    expect((await evaluateToolCall('file_write', { path: 'C:\\work\\a.txt' }, ctx, { enabled: ['file_write'] })).ok).toBe(false)
  })
})

describe('高危工具确认链路（fail-closed）', () => {
  it('未启用 → DISABLED', async () => {
    const d = await evaluateToolCall('system_exec', { command: 'whoami' }, winCtx())
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.code).toBe('DISABLED')
  })

  it('已启用但缺确认通道 → CONFIRM_UNAVAILABLE', async () => {
    const d = await evaluateToolCall('system_exec', { command: 'whoami' }, winCtx(), { enabled: ['system_exec'] })
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.code).toBe('CONFIRM_UNAVAILABLE')
  })

  it('用户拒绝 → CONFIRM_DENIED；确认回调抛错也按拒绝处理', async () => {
    const denied = await evaluateToolCall('system_exec', { command: 'whoami' }, { ...winCtx(), confirm: no }, { enabled: ['system_exec'] })
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.code).toBe('CONFIRM_DENIED')

    const throwing = await evaluateToolCall('system_exec', { command: 'whoami' }, { ...winCtx(), confirm: async () => { throw new Error('x') } }, { enabled: ['system_exec'] })
    expect(throwing.ok).toBe(false)
    if (!throwing.ok) expect(throwing.code).toBe('CONFIRM_DENIED')
  })

  it('用户确认且参数合法 → 放行', async () => {
    const d = await evaluateToolCall('system_exec', { command: 'whoami' }, { ...winCtx(), confirm: yes }, { enabled: ['system_exec'] })
    expect(d.ok).toBe(true)
  })

  it('参数非法时不得触发确认（先校验后确认）', async () => {
    let called = false
    const confirm = async (): Promise<boolean> => {
      called = true
      return true
    }
    const d = await evaluateToolCall('system_exec', { command: 'x'.repeat(5000) }, { ...winCtx(), confirm }, { enabled: ['system_exec'] })
    expect(d.ok).toBe(false)
    expect(called).toBe(false)
  })
})


describe('键鼠 / 剪贴板 / 浏览器 / 截图', () => {
  it('mouse_click 坐标必须是有限数且在范围内', async () => {
    const ctx = { ...winCtx(), confirm: yes }
    const enabled = { enabled: ['mouse_click'] }
    expect((await evaluateToolCall('mouse_click', { x: 10, y: 20 }, ctx, enabled)).ok).toBe(true)
    expect((await evaluateToolCall('mouse_click', { x: -1, y: 20 }, ctx, enabled)).ok).toBe(false)
    expect((await evaluateToolCall('mouse_click', { x: 10, y: 40000 }, ctx, enabled)).ok).toBe(false)
    expect((await evaluateToolCall('mouse_click', { x: 'a', y: 20 }, ctx, enabled)).ok).toBe(false)
    expect((await evaluateToolCall('mouse_click', { x: 1, y: 2, button: 'top' }, ctx, enabled)).ok).toBe(false)
  })

  it('keyboard_type 拒绝超长文本与非字符串', async () => {
    const ctx = { ...winCtx(), confirm: yes }
    const enabled = { enabled: ['keyboard_type'] }
    expect((await evaluateToolCall('keyboard_type', { text: 'hi' }, ctx, enabled)).ok).toBe(true)
    expect((await evaluateToolCall('keyboard_type', { text: 'x'.repeat(10001) }, ctx, enabled)).ok).toBe(false)
    expect((await evaluateToolCall('keyboard_type', { text: 123 }, ctx, enabled)).ok).toBe(false)
  })

  it('clipboard_set 拒绝超 1MB 文本', async () => {
    const ctx = { ...winCtx(), confirm: yes }
    const enabled = { enabled: ['clipboard_set'] }
    expect((await evaluateToolCall('clipboard_set', { text: 'hi' }, ctx, enabled)).ok).toBe(true)
    expect((await evaluateToolCall('clipboard_set', { text: 'x'.repeat(1024 * 1024 + 1) }, ctx, enabled)).ok).toBe(false)
  })

  it('browser_open 只放行 http(s)', async () => {
    expect((await evaluateToolCall('browser_open', { url: 'https://a.com' }, winCtx())).ok).toBe(true)
    expect((await evaluateToolCall('browser_open', { url: 'http://a.com' }, winCtx())).ok).toBe(true)
    for (const bad of ['file:///C:/x.exe', 'javascript:alert(1)', 'ms-msdt:/id', '']) {
      expect((await evaluateToolCall('browser_open', { url: bad }, winCtx())).ok).toBe(false)
    }
  })

  it('screenshot 不传路径放行；传路径必须在授权目录内', async () => {
    expect((await evaluateToolCall('screenshot', {}, winCtx())).ok).toBe(true)
    expect((await evaluateToolCall('screenshot', { path: 'C:\\work\\s.png' }, winCtx(['C:\\work']))).ok).toBe(true)
    expect((await evaluateToolCall('screenshot', { path: 'C:\\other\\s.png' }, winCtx(['C:\\work']))).ok).toBe(false)
  })

  it('未知工具 → UNKNOWN_TOOL', async () => {
    const d = await evaluateToolCall('nope', {}, winCtx())
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.code).toBe('UNKNOWN_TOOL')
  })
})
