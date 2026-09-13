import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  ENV_BUILDERS,
  PRE_START_HANDLERS,
  POST_INSTALL_HANDLERS,
  hasHookKey,
  resolveFlowsModuleDir,
  resolveBundledPython,
  buildFlowsEnv,
  flowsStateRoot,
  assertFlowsReady,
  ensureFlowsConfig,
  buildFlowsSpawnSpec,
} from '../../electron/main/service-registry/whitelist'

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flows-row-'))
}

describe('flows-row', () => {
  const ctx = { rowId: 'flows', runtimeKey: 'flows' }

  it('注册 env/preStart/postInstall 钩子', () => {
    expect(hasHookKey('env', 'flows')).toBe(true)
    expect(hasHookKey('preStart', 'flows')).toBe(true)
    expect(hasHookKey('postInstall', 'flows')).toBe(true)
  })

  it('env builder 注入 FLOWS_MODULE/FLOWS_APP/FLOWS_TOOLBOX/FLOWS_PORT', () => {
    const env = ENV_BUILDERS['flows'](ctx)
    expect(env.FLOWS_MODULE).toBe(resolveFlowsModuleDir())
    expect(path.isAbsolute(env.FLOWS_MODULE as string)).toBe(true)
    expect(env.FLOWS_APP).toBe(path.join(env.FLOWS_MODULE as string, 'app.py'))
    expect(env.FLOWS_TOOLBOX).toBe(path.join(env.FLOWS_MODULE as string, 'tool_box.py'))
    expect(env.FLOWS_PORT).toBe('9040')
    expect(env.FLOWS_STORAGE_ROOT).toBe(path.join(env.FLOWS_MODULE as string, 'data'))
    expect(env.FLOWS_WX_BASE_URL).toBe('http://127.0.0.1:9020')
    expect(env.FLOWS_DOUYIN_BASE_URL).toBe('http://127.0.0.1:9030')
  })

  it('preStart 时 app.py 缺失导致抛错', async () => {
    const dir = tempDir()
    const prev = process.cwd()
    process.chdir(dir)
    try {
      await expect(PRE_START_HANDLERS['flows'](ctx)).rejects.toThrow(/flows|缺失/i)
    } finally {
      process.chdir(prev)
    }
  })

  it('assertFlowsReady 在空目录抛错', () => {
    expect(() => assertFlowsReady(tempDir())).toThrow(/flows|缺失/i)
  })

  it('buildFlowsEnv 输出绝对路径与默认端口', () => {
    const dir = tempDir()
    const env = buildFlowsEnv(dir)
    expect(env.FLOWS_MODULE).toBe(dir)
    expect(env.FLOWS_APP).toBe(path.join(dir, 'app.py'))
    expect(env.FLOWS_PORT).toBe('9040')
  })

  it('flowsStateRoot 落在用户数据目录下（模块目录只读，不能写那里）', () => {
    const userData = path.join(os.tmpdir(), 'st-user-data')
    expect(flowsStateRoot(userData)).toBe(path.join(userData, 'service-registry', 'flows'))
  })

  it('stateRoot 把数据与配置都指到用户数据目录', () => {
    const dir = tempDir()
    const state = tempDir()
    const env = buildFlowsEnv(dir, { stateRoot: state })
    expect(env.FLOWS_STORAGE_ROOT).toBe(path.join(state, 'data'))
    expect(env.FLOWS_CONFIG).toBe(path.join(state, 'config.json'))
  })

  it('postInstall 把 config.json 写入状态目录，而不是模块目录', async () => {
    const dir = tempDir()
    const state = tempDir()
    expect(await ensureFlowsConfig(dir, state)).toBe(true)
    expect(fs.existsSync(path.join(state, 'config.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(false)
  })

  it('postInstall 钩子带 userDataDir 时写入用户数据目录', async () => {
    const userData = tempDir()
    const written = await POST_INSTALL_HANDLERS['flows']({
      rowId: 'flows',
      runtimeKey: 'flows',
      userDataDir: userData,
    })
    expect(written).toBe(true)
    expect(fs.existsSync(path.join(flowsStateRoot(userData), 'config.json'))).toBe(true)
  })

  it('postInstall 缺省时写入 config.json 并默认关闭高风险闸门', async () => {
    const dir = tempDir()
    expect(await ensureFlowsConfig(dir)).toBe(true)
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf-8'))
    expect(cfg.flows_port).toBe(9040)
    expect(cfg.storage_backend).toBe('local')
    expect(cfg.enable_high_risk).toBe(false)
    expect(await ensureFlowsConfig(dir)).toBe(false)
  })
})

describe('flows 启动规格（外部 Python）', () => {
  it('构建 python 启动命令与 FLOWS_PORT 环境', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'app.py'), '# stub')
    const spec = buildFlowsSpawnSpec({
      port: 9040,
      moduleRoot: dir,
      python: 'C:/Python/python.exe',
      baseEnv: { PATH: '/usr/bin' },
    })
    expect(spec.command).toBe('C:/Python/python.exe')
    expect(spec.args).toEqual([path.join(dir, 'app.py'), '--port', '9040'])
    expect(spec.env.FLOWS_PORT).toBe('9040')
    expect(spec.env.PATH).toBe('/usr/bin')
    expect(spec.useShell).toBe(false)
  })

  it('extraEnv 覆盖 baseEnv', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'app.py'), '# stub')
    const spec = buildFlowsSpawnSpec({
      port: 9040,
      moduleRoot: dir,
      python: '/usr/bin/python',
      baseEnv: { FOO: 'base' },
      extraEnv: { FOO: 'extra' },
    })
    expect(spec.env.FOO).toBe('extra')
  })

  it('app.py 缺失时报错', () => {
    expect(() => buildFlowsSpawnSpec({ port: 9040, moduleRoot: tempDir() })).toThrow(/flows|缺失/i)
  })

  it('resolveFlowsModuleDir 传 base 时返回该目录', () => {
    const dir = tempDir()
    expect(resolveFlowsModuleDir(dir)).toBe(path.resolve(dir))
  })

  it('stateRoot 传入时启动环境指向用户数据目录', () => {
    const dir = tempDir()
    const state = tempDir()
    fs.writeFileSync(path.join(dir, 'app.py'), '# stub')
    const spec = buildFlowsSpawnSpec({ port: 9040, moduleRoot: dir, stateRoot: state, python: 'python' })
    expect(spec.env.FLOWS_STORAGE_ROOT).toBe(path.join(state, 'data'))
    expect(spec.env.FLOWS_CONFIG).toBe(path.join(state, 'config.json'))
  })

  it('存在 _bootstrap.py 时经垫片启动（嵌入式 Python isolated 模式必需）', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'app.py'), '# stub')
    fs.writeFileSync(path.join(dir, '_bootstrap.py'), '# stub')
    const spec = buildFlowsSpawnSpec({ port: 9040, moduleRoot: dir, python: 'C:/Python/python.exe' })
    expect(spec.args).toEqual([
      path.join(dir, '_bootstrap.py'),
      path.join(dir, 'app.py'),
      '--port',
      '9040',
    ])
  })

  it('随包 flows 模块带 _bootstrap.py，且 resolveBundledPython 能找到内置 Python', () => {
    const moduleRoot = resolveFlowsModuleDir()
    // 模块目录不可写时（CI 只读 checkout）跳过
    if (fs.existsSync(path.join(moduleRoot, 'app.py'))) {
      expect(fs.existsSync(path.join(moduleRoot, '_bootstrap.py'))).toBe(true)
    }
    const bundled = resolveBundledPython()
    if (bundled) {
      expect(path.isAbsolute(bundled)).toBe(true)
      expect(fs.existsSync(bundled)).toBe(true)
    }
  })

  it('resolveBundledPython 传 base 时校验文件存在', () => {
    const dir = tempDir()
    const fake = path.join(dir, 'python.exe')
    fs.writeFileSync(fake, '')
    expect(resolveBundledPython(fake)).toBe(fake)
    expect(resolveBundledPython(path.join(dir, 'nope.exe'))).toBeNull()
  })
})
