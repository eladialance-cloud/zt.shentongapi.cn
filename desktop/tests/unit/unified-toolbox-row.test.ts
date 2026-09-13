import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  ENV_BUILDERS,
  PRE_START_HANDLERS,
  POST_INSTALL_HANDLERS,
  hasHookKey,
  resolveUnifiedToolboxModuleDir,
  buildUnifiedToolboxEnv,
  assertUnifiedToolboxRegistry,
  ensureUnifiedToolboxRegistry,
  findUnifiedToolboxMcpJs,
  buildUnifiedToolboxSpawnSpec,
} from '../../electron/main/service-registry/whitelist'

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'utbox-row-'))
}

describe('unified-toolbox-row', () => {
  const ctx = { rowId: 'unified-toolbox', runtimeKey: 'unified-toolbox' }

  it('注册 env/preStart/postInstall 钩子', () => {
    expect(hasHookKey('env', 'unifiedToolbox')).toBe(true)
    expect(hasHookKey('preStart', 'unifiedToolbox')).toBe(true)
    expect(hasHookKey('postInstall', 'unifiedToolbox')).toBe(true)
  })

  it('env builder 注入 ST_TOOLBOX_MODULE/ST_TOOLBOX_MCP/ST_TOOLBOX_REGISTRY', () => {
    const env = ENV_BUILDERS['unifiedToolbox'](ctx)
    expect(env.ST_TOOLBOX_MODULE).toBeTruthy()
    expect(env.ST_TOOLBOX_MCP).toBeTruthy()
    expect(env.ST_TOOLBOX_REGISTRY).toBeTruthy()
    expect(env.ST_TOOLBOX_MODULE).toBe(resolveUnifiedToolboxModuleDir())
    expect(path.isAbsolute(env.ST_TOOLBOX_MODULE as string)).toBe(true)
    expect(env.ST_TOOLBOX_REGISTRY).toBe(path.join(env.ST_TOOLBOX_MODULE as string, 'registry.yaml'))
  })

  it('preStart 时 registry.yaml 缺失导致抛错', async () => {
    const dir = tempDir()
    const prev = process.cwd()
    process.chdir(dir)
    try {
      await expect(PRE_START_HANDLERS['unifiedToolbox'](ctx)).rejects.toThrow(/registry|注册表|缺失/i)
    } finally {
      process.chdir(prev)
    }
  })

  it('assertUnifiedToolboxRegistry 在空目录抛错', () => {
    const dir = tempDir()
    expect(() => assertUnifiedToolboxRegistry(dir)).toThrow(/registry|注册表|缺失/i)
  })

  it('buildUnifiedToolboxEnv 输出 mcp/registry 绝对路径', () => {
    const dir = tempDir()
    const env = buildUnifiedToolboxEnv(dir)
    expect(env.ST_TOOLBOX_MODULE).toBe(dir)
    expect(env.ST_TOOLBOX_MCP).toBe(path.join(dir, 'mcp-server.ts'))
    expect(env.ST_TOOLBOX_REGISTRY).toBe(path.join(dir, 'registry.yaml'))
  })

  it('postInstall 缺省时写入最小合规注册表并返回 true', async () => {
    const dir = tempDir()
    expect(await ensureUnifiedToolboxRegistry(dir)).toBe(true)
    expect(fs.existsSync(path.join(dir, 'registry.yaml'))).toBe(true)
  })
})

describe('unified-toolbox 启动规格（Electron-as-Node）', () => {
  it('构建 Electron-as-Node 启动命令与 ST_TOOLBOX 环境', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'mcp-server.js'), 'module.exports = {}')
    const spec = buildUnifiedToolboxSpawnSpec({
      port: 9010,
      moduleRoot: dir,
      execPath: 'C:/app/electron.exe',
      baseEnv: { PATH: '/usr/bin' },
    })
    expect(spec.command).toBe('C:/app/electron.exe')
    expect(spec.args).toEqual([
      path.join(dir, 'mcp-server.js'),
      '--port',
      '9010',
      '--registry',
      path.join(dir, 'registry.yaml'),
    ])
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(spec.env.ST_TOOLBOX_MODULE).toBe(dir)
    expect(spec.env.ST_TOOLBOX_MCP).toBe(path.join(dir, 'mcp-server.js'))
    expect(spec.env.ST_TOOLBOX_REGISTRY).toBe(path.join(dir, 'registry.yaml'))
    expect(spec.env.PATH).toBe('/usr/bin')
    expect(spec.useShell).toBe(false)
  })

  it('extraEnv 覆盖 baseEnv / 模块环境', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'mcp-server.js'), 'module.exports = {}')
    const spec = buildUnifiedToolboxSpawnSpec({
      port: 9010,
      moduleRoot: dir,
      execPath: '/app/electron',
      baseEnv: { FOO: 'base' },
      extraEnv: { FOO: 'extra', BAR: 'baz' },
    })
    expect(spec.env.FOO).toBe('extra')
    expect(spec.env.BAR).toBe('baz')
  })

  it('mcp-server.js 未编译时报错', () => {
    const dir = tempDir()
    expect(() => buildUnifiedToolboxSpawnSpec({ port: 9010, moduleRoot: dir })).toThrow(/未编译|build:toolbox/)
  })

  it('findUnifiedToolboxMcpJs 缺省返回 null，编译后返回路径', () => {
    const dir = tempDir()
    expect(findUnifiedToolboxMcpJs(dir)).toBeNull()
    fs.writeFileSync(path.join(dir, 'mcp-server.js'), 'x')
    expect(findUnifiedToolboxMcpJs(dir)).toBe(path.join(dir, 'mcp-server.js'))
  })
})