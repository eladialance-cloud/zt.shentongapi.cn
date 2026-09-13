import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  ENV_BUILDERS,
  PRE_START_HANDLERS,
  POST_INSTALL_HANDLERS,
  hasHookKey,
  resolveWxGatewayModuleDir,
  buildWxGatewayEnv,
  wxGatewayStateRoot,
  assertWxGatewayReady,
  ensureWxGatewayConfig,
  buildWxGatewaySpawnSpec,
} from '../../electron/main/service-registry/whitelist'

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wxgw-row-'))
}

describe('wx-gateway-row', () => {
  const ctx = { rowId: 'wx-gateway', runtimeKey: 'wx-gateway' }

  it('注册 env/preStart/postInstall 钩子', () => {
    expect(hasHookKey('env', 'wxGateway')).toBe(true)
    expect(hasHookKey('preStart', 'wxGateway')).toBe(true)
    expect(hasHookKey('postInstall', 'wxGateway')).toBe(true)
  })

  it('env builder 注入 WX_GATEWAY_MODULE/WX_APP/WX_PORT', () => {
    const env = ENV_BUILDERS['wxGateway'](ctx)
    expect(env.WX_GATEWAY_MODULE).toBeTruthy()
    expect(env.WX_APP).toBeTruthy()
    expect(env.WX_PORT).toBe('9020')
    expect(env.WX_GATEWAY_MODULE).toBe(resolveWxGatewayModuleDir())
    expect(path.isAbsolute(env.WX_GATEWAY_MODULE as string)).toBe(true)
    expect(env.WX_APP).toBe(path.join(env.WX_GATEWAY_MODULE as string, 'app.py'))
  })

  it('preStart 时 app.py 缺失导致抛错', async () => {
    const dir = tempDir()
    const prev = process.cwd()
    process.chdir(dir)
    try {
      await expect(PRE_START_HANDLERS['wxGateway'](ctx)).rejects.toThrow(/wx-gateway|缺失/i)
    } finally {
      process.chdir(prev)
    }
  })

  it('assertWxGatewayReady 在空目录抛错', () => {
    const dir = tempDir()
    expect(() => assertWxGatewayReady(dir)).toThrow(/wx-gateway|缺失/i)
  })

  it('buildWxGatewayEnv 输出 app 绝对路径与默认端口', () => {
    const dir = tempDir()
    const env = buildWxGatewayEnv(dir)
    expect(env.WX_GATEWAY_MODULE).toBe(dir)
    expect(env.WX_APP).toBe(path.join(dir, 'app.py'))
    expect(env.WX_PORT).toBe('9020')
  })

  it('postInstall 缺省时写入最小合规配置并返回 true', async () => {
    const dir = tempDir()
    expect(await ensureWxGatewayConfig(dir)).toBe(true)
    const cfgPath = path.join(dir, 'config.json')
    expect(fs.existsSync(cfgPath)).toBe(true)
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    expect(cfg.wx_port).toBe(9020)
    // 后端为开源 wxauto（MIT）：不再写入授权密钥相关字段
    expect(cfg.backend).toBe('wxauto')
    expect(cfg.license_key).toBeUndefined()
  })

  it('postInstall 已存在 config.json 时不重复写入', async () => {
    const dir = tempDir()
    await ensureWxGatewayConfig(dir)
    expect(await ensureWxGatewayConfig(dir)).toBe(false)
  })

  it('wxGatewayStateRoot 落在用户数据目录下（模块目录打包后只读）', () => {
    const userData = path.join(os.tmpdir(), 'st-user-data')
    expect(wxGatewayStateRoot(userData)).toBe(path.join(userData, 'service-registry', 'wx-gateway'))
  })

  it('stateRoot 把 WX_CONFIG 指到用户数据目录', () => {
    const dir = tempDir()
    const state = tempDir()
    expect(buildWxGatewayEnv(dir, { stateRoot: state }).WX_CONFIG).toBe(path.join(state, 'config.json'))
  })

  it('postInstall 把 config.json 写入状态目录而不是模块目录', async () => {
    const dir = tempDir()
    const state = tempDir()
    expect(await ensureWxGatewayConfig(dir, state)).toBe(true)
    expect(fs.existsSync(path.join(state, 'config.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(false)
  })

  it('postInstall 钩子带 userDataDir 时写入用户数据目录', async () => {
    const userData = tempDir()
    const written = await POST_INSTALL_HANDLERS['wxGateway']({
      rowId: 'wx-gateway',
      runtimeKey: 'wx-gateway',
      userDataDir: userData,
    })
    expect(written).toBe(true)
    expect(fs.existsSync(path.join(wxGatewayStateRoot(userData), 'config.json'))).toBe(true)
  })
})

describe('wx-gateway 启动规格（外部 Python）', () => {
  it('构建 python 启动命令与 WX_PORT 环境', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'app.py'), '# stub')
    const spec = buildWxGatewaySpawnSpec({
      port: 9020,
      moduleRoot: dir,
      python: 'C:/Python/python.exe',
      baseEnv: { PATH: '/usr/bin' },
    })
    expect(spec.command).toBe('C:/Python/python.exe')
    expect(spec.args).toEqual([path.join(dir, 'app.py'), '--port', '9020'])
    expect(spec.env.WX_PORT).toBe('9020')
    expect(spec.env.WX_GATEWAY_MODULE).toBe(dir)
    expect(spec.env.PATH).toBe('/usr/bin')
    expect(spec.useShell).toBe(false)
  })

  it('extraEnv 覆盖 baseEnv / 模块环境', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'app.py'), '# stub')
    const spec = buildWxGatewaySpawnSpec({
      port: 9020,
      moduleRoot: dir,
      python: '/usr/bin/python',
      baseEnv: { FOO: 'base' },
      extraEnv: { FOO: 'extra', BAR: 'baz' },
    })
    expect(spec.env.FOO).toBe('extra')
    expect(spec.env.BAR).toBe('baz')
  })

  it('app.py 缺失时报错', () => {
    const dir = tempDir()
    expect(() => buildWxGatewaySpawnSpec({ port: 9020, moduleRoot: dir })).toThrow(/wx-gateway|缺失/i)
  })

  it('resolveWxGatewayModuleDir 传 base 时返回该目录', () => {
    const dir = tempDir()
    expect(resolveWxGatewayModuleDir(dir)).toBe(path.resolve(dir))
  })

  it('stateRoot 传入时启动环境指向用户数据目录', () => {
    const dir = tempDir()
    const state = tempDir()
    fs.writeFileSync(path.join(dir, 'app.py'), '# stub')
    const spec = buildWxGatewaySpawnSpec({ port: 9020, moduleRoot: dir, stateRoot: state, python: 'python' })
    expect(spec.env.WX_CONFIG).toBe(path.join(state, 'config.json'))
  })
})
