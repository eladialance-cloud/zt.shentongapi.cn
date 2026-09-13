// 子进程环境白名单回归测试（安全审计 S-05 残留 / S-29 / S-28）
//
// 背景：多处 spawn 直接用 { ...process.env } 把主进程全部环境变量交给子进程，
// 子进程（业务流 Python / Hermes 官署 CLI / 服务行）一旦被投毒即可读到平台凭据。
// 本测试锁定白名单构造的契约：默认只透传运行必需键，凭据一律要调用方显式 extra 注入。
import { BASE_ENV_KEYS, buildChildEnv, requiresShell, sanitizeChildArgs } from '../../electron/main/policy/child-env'

describe('BASE_ENV_KEYS', () => {
  it('含跨平台运行必需键，且不含凭据类键', () => {
    const upper = BASE_ENV_KEYS.map((k) => k.toUpperCase())
    expect(upper).toContain('PATH')
    expect(upper).toContain('TEMP')
    expect(upper).toContain('HOME')
    for (const k of upper) {
      expect(k).not.toContain('KEY')
      expect(k).not.toContain('TOKEN')
      expect(k).not.toContain('SECRET')
    }
  })
})

describe('buildChildEnv', () => {
  it('只透传白名单键，平台凭据与随机键被丢弃', () => {
    const env = buildChildEnv({
      Path: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      FLOWS_LLM_API_KEY: 'sk-flows',
      ST_AUTH_KEY: 'master-key',
      AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
      SHENTONG_CLOUD_TOKEN: 'jwt',
      RANDOM_HOST_VAR: 'x',
    })
    expect(env.Path).toBe('C:\\Windows\\System32')
    expect(env.SystemRoot).toBe('C:\\Windows')
    expect(env.TEMP).toBe('C:\\Temp')
    expect(Object.keys(env)).toHaveLength(3)
  })

  it('extra 显式注入，且大小写不敏感去重（extra 覆盖 base）', () => {
    const env = buildChildEnv({ Path: 'base-path' }, { PATH: 'extra-path', EDICT_HOME: '/edict' })
    const pathKeys = Object.keys(env).filter((k) => k.toLowerCase() === 'path')
    expect(pathKeys).toHaveLength(1)
    expect(env[pathKeys[0]]).toBe('extra-path')
    expect(env.EDICT_HOME).toBe('/edict')
  })

  it('undefined / 空串 / 非字符串值不产生键', () => {
    const env = buildChildEnv({
      PATH: 'p',
      TEMP: undefined,
      HOME: '',
      LANG: 42 as unknown as string,
      TZ: { evil: true } as unknown as string,
    })
    expect(Object.keys(env)).toEqual(['PATH'])
  })

  it('白名单外的 extra 键允许显式注入（调用方负责）', () => {
    const env = buildChildEnv({}, { ST_AUTH_FILE: '/tmp/auth.json', PYTHONUTF8: '1' })
    expect(env.ST_AUTH_FILE).toBe('/tmp/auth.json')
    expect(env.PYTHONUTF8).toBe('1')
  })

it('extra 显式传入的空串保留（区分「空值」与「未定义」，避免子进程 KeyError）', () => {
    const env = buildChildEnv({ PATH: 'p' }, { VIDEO_CLAW_PROXY_KEY: '', ST_AUTH_KEY: undefined })
    expect(Object.keys(env)).toContain('VIDEO_CLAW_PROXY_KEY')
    expect(env.VIDEO_CLAW_PROXY_KEY).toBe('')
    expect(Object.keys(env)).not.toContain('ST_AUTH_KEY')
  })

  it('不修改入参对象', () => {
    const base = { PATH: 'p', FLOWS_LLM_API_KEY: 'k' }
    const extra = { EDICT_HOME: '/e' }
    buildChildEnv(base, extra)
    expect(Object.keys(base)).toHaveLength(2)
    expect(Object.keys(extra)).toHaveLength(1)
  })

  it('null / undefined 入参安全（fail-closed 不抛错）', () => {
    expect(buildChildEnv(null as unknown as Record<string, string | undefined>)).toEqual({})
    expect(buildChildEnv({ PATH: 'p' }, null)).toEqual({ PATH: 'p' })
  })
})

describe('requiresShell', () => {
  it('Windows 下仅 .cmd / .bat 需要 shell（其余直接 spawn）', () => {
    expect(requiresShell('C:\\x\\n8n.cmd', 'win32')).toBe(true)
    expect(requiresShell('"C:\\Program Files\\n8n.cmd"', 'win32')).toBe(true)
    expect(requiresShell('C:\\Program Files\\nodejs\\node.exe', 'win32')).toBe(false)
    expect(requiresShell('hermes', 'win32')).toBe(false)
  })

  it('非 Windows 一律不走 shell', () => {
    expect(requiresShell('x.cmd', 'darwin')).toBe(false)
    expect(requiresShell('x.bat', 'linux')).toBe(false)
  })

  it('空值安全', () => {
    expect(requiresShell('', 'win32')).toBe(false)
    expect(requiresShell(undefined as unknown as string, 'win32')).toBe(false)
  })
})
describe('sanitizeChildArgs', () => {
  it('非字符串降级为空串且保留位置（位置解析不能错位）', () => {
    expect(sanitizeChildArgs(['create', 42, null, 'remark'])).toEqual(['create', '', '', 'remark'])
  })

  it('清掉 NUL 字节', () => {
    expect(sanitizeChildArgs(['a\u0000b'])).toEqual(['ab'])
  })

  it('单参长度与参数数量设上限', () => {
    const long = 'x'.repeat(50)
    expect(sanitizeChildArgs([long], 10, 10)[0]).toBe('x'.repeat(10))
    expect(sanitizeChildArgs(['a', 'b', 'c'], 2)).toEqual(['a', 'b'])
  })

  it('不修改入参数组', () => {
    const args = ['a\u0000b', 'c']
    sanitizeChildArgs(args)
    expect(args[0]).toBe('a\u0000b')
  })
})
