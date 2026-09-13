import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  ENV_BUILDERS,
  PRE_START_HANDLERS,
  POST_INSTALL_HANDLERS,
  hasHookKey,
  resolveDouyinModuleDir,
  buildDouyinEnv,
  douyinStateRoot,
  assertDouyinReady,
  ensureDouyinConfig,
  buildDouyinSpawnSpec,
} from '../../electron/main/service-registry/whitelist'

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-row-'))
}

describe('douyin-row', () => {
  const ctx = { rowId: 'douyin', runtimeKey: 'douyin' }

  it('注册 env/preStart/postInstall 钩子', () => {
    expect(hasHookKey('env', 'douyin')).toBe(true)
    expect(hasHookKey('preStart', 'douyin')).toBe(true)
    expect(hasHookKey('postInstall', 'douyin')).toBe(true)
  })

  it('env builder 注入 DOUYIN_MODULE/DOUYIN_APP/DOUYIN_PORT', () => {
    const env = ENV_BUILDERS['douyin'](ctx)
    expect(env.DOUYIN_MODULE).toBeTruthy()
    expect(env.DOUYIN_APP).toBeTruthy()
    expect(env.DOUYIN_PORT).toBe('9030')
    expect(env.DOUYIN_MODULE).toBe(resolveDouyinModuleDir())
    expect(path.isAbsolute(env.DOUYIN_MODULE as string)).toBe(true)
    expect(env.DOUYIN_APP).toBe(path.join(env.DOUYIN_MODULE as string, 'app.py'))
  })

  it('preStart 时 app.py 缺失导致抛错', async () => {
    const dir = tempDir()
    const prev = process.cwd()
    process.chdir(dir)
    try {
      await expect(PRE_START_HANDLERS['douyin'](ctx)).rejects.toThrow(/douyin|缺失/i)
    } finally {
      process.chdir(prev)
    }
  })

  it('assertDouyinReady 在空目录抛错', () => {
    expect(() => assertDouyinReady(tempDir())).toThrow(/douyin|缺失/i)
  })

  it('buildDouyinEnv 输出 app 绝对路径与默认端口', () => {
    const dir = tempDir()
    const env = buildDouyinEnv(dir)
    expect(env.DOUYIN_MODULE).toBe(dir)
    expect(env.DOUYIN_APP).toBe(path.join(dir, 'app.py'))
    expect(env.DOUYIN_PORT).toBe('9030')
    expect(env.DOUYIN_TRANSCRIBE_ENGINE).toBe('video-claw')
  })

  it('postInstall 缺省时写入 config.json 并返回 true', async () => {
    const dir = tempDir()
    expect(await ensureDouyinConfig(dir)).toBe(true)
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf-8'))
    expect(cfg.douyin_port).toBe(9030)
    expect(cfg.douyin_daily_limit).toBe(50)
    expect(await ensureDouyinConfig(dir)).toBe(false)
  })
})

describe('douyin 启动规格（外部 Python）', () => {
  it('构建 python 启动命令与 DOUYIN_PORT 环境', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'app.py'), '# stub')
    const spec = buildDouyinSpawnSpec({
      port: 9030,
      moduleRoot: dir,
      python: 'C:/Python/python.exe',
      baseEnv: { PATH: '/usr/bin' },
    })
    expect(spec.command).toBe('C:/Python/python.exe')
    expect(spec.args).toEqual([path.join(dir, 'app.py'), '--port', '9030'])
    expect(spec.env.DOUYIN_PORT).toBe('9030')
    expect(spec.env.PATH).toBe('/usr/bin')
    expect(spec.useShell).toBe(false)
  })

  it('extraEnv 覆盖 baseEnv', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'app.py'), '# stub')
    const spec = buildDouyinSpawnSpec({
      port: 9030,
      moduleRoot: dir,
      python: '/usr/bin/python',
      baseEnv: { FOO: 'base' },
      extraEnv: { FOO: 'extra' },
    })
    expect(spec.env.FOO).toBe('extra')
  })

  it('app.py 缺失时报错', () => {
    expect(() => buildDouyinSpawnSpec({ port: 9030, moduleRoot: tempDir() })).toThrow(/douyin|缺失/i)
  })

  it('resolveDouyinModuleDir 传 base 时返回该目录', () => {
    const dir = tempDir()
    expect(resolveDouyinModuleDir(dir)).toBe(path.resolve(dir))
  })

  it('douyinStateRoot 落在用户数据目录下（模块目录打包后只读）', () => {
    const userData = path.join(os.tmpdir(), 'st-user-data')
    expect(douyinStateRoot(userData)).toBe(path.join(userData, 'service-registry', 'douyin'))
  })

  it('stateRoot 把 DOUYIN_CONFIG 指到用户数据目录', () => {
    const dir = tempDir()
    const state = tempDir()
    expect(buildDouyinEnv(dir, { stateRoot: state }).DOUYIN_CONFIG).toBe(path.join(state, 'config.json'))
  })

  it('postInstall 把 config.json 写入状态目录而不是模块目录', async () => {
    const dir = tempDir()
    const state = tempDir()
    expect(await ensureDouyinConfig(dir, state)).toBe(true)
    expect(fs.existsSync(path.join(state, 'config.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(false)
  })

  it('postInstall 钩子带 userDataDir 时写入用户数据目录', async () => {
    const userData = tempDir()
    const written = await POST_INSTALL_HANDLERS['douyin']({
      rowId: 'douyin',
      runtimeKey: 'douyin',
      userDataDir: userData,
    })
    expect(written).toBe(true)
    expect(fs.existsSync(path.join(douyinStateRoot(userData), 'config.json'))).toBe(true)
  })
})
