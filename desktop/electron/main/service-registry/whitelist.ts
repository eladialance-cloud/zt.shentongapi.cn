import type { ResolvedRuntime } from '../../shared/types'
import type { ResolvedModelDefaults } from '../model-defaults'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { load } from 'js-yaml'

/**
 * 行实现白名单：patch 是声明，env/preStart/postInstall/configSync/launch 的“实现”
 * 只能在底座侧白名单注册（行 key 索引），patch 文件禁止带任意 JS/代码（安全边界）。
 * Task 5 将 service-manager.ts 中的专属实现搬进本文件。
 */
export interface ServiceHookCtx {
  rowId: string
  runtimeKey: string
  /** 用户数据根目录（<userData>）；需要写运行期文件的钩子用它定位可写目录 */
  userDataDir?: string
  /** spawn 前解析到的运行时（未安装时为 null/undefined） */
  resolved?: ResolvedRuntime | null
  /** configSync 触发事件（对应行 restartOn 的触发源） */
  event?: 'proxyKey' | 'modelDefaults'
  /** llm-proxy 静态 Key（setLlmProxyKey 注入） */
  proxyKey?: string
  /** modelDefaults 同步结果（event=modelDefaults 时注入） */
  modelSync?: ResolvedModelDefaults | null
  /** 平台启用模型列表（llm-proxy /v1/models 快照，event=modelDefaults 时注入） */
  platformModels?: Array<{ id: string; type?: string; name?: string; supportsVision?: boolean }> | null
}

export type EnvBuilder = (ctx: ServiceHookCtx) => NodeJS.ProcessEnv
export type PreStartHandler = (ctx: ServiceHookCtx) => Promise<void>
export type PostInstallHandler = (ctx: ServiceHookCtx) => Promise<boolean>
export type ConfigSyncHandler = (ctx: ServiceHookCtx) => Promise<boolean>

export const ENV_BUILDERS: Record<string, EnvBuilder> = {}
export const PRE_START_HANDLERS: Record<string, PreStartHandler> = {}
export const POST_INSTALL_HANDLERS: Record<string, PostInstallHandler> = {}
export const CONFIG_SYNC_HANDLERS: Record<string, ConfigSyncHandler> = {}

export function hasHookKey(kind: 'env' | 'preStart' | 'postInstall' | 'configSync', key: string | undefined): boolean {
  if (!key) return false
  const table =
    kind === 'env' ? ENV_BUILDERS
      : kind === 'preStart' ? PRE_START_HANDLERS
        : kind === 'postInstall' ? POST_INSTALL_HANDLERS
          : CONFIG_SYNC_HANDLERS
  return Object.prototype.hasOwnProperty.call(table, key)
}

const UNIFIED_TOOLBOX_MODULE = 'unified-toolbox'
const UNIFIED_TOOLBOX_HOOK = 'unifiedToolbox'

/** 最小合规注册表：postInstall 缺省时写入（loadToolRegistry/validateRegistry 可解析并通过）。 */
const MINIMAL_TOOLBOX_REGISTRY =
  'tools:\n' +
  '  - name: feishu.create_table\n' +
  '    capability: feishu\n' +
  '    params: [table_name]\n' +
  '    description: 在飞书多维表格（bitable）中创建数据表\n' +
  '  - name: mysql.query\n' +
  '    capability: mysql\n' +
  '    params: [sql]\n' +
  '    description: 执行 MySQL 查询并返回结果集\n'

/**
 * 解析 unified-toolbox 模块目录的绝对路径：
 * 打包后资源在 process.resourcesPath/service-registry，开发环境在 process.cwd()/resources/service-registry；
 * 传 base 时优先（单测可注入临时目录模拟 registry 缺失/生成场景）。
 */
export function resolveUnifiedToolboxModuleDir(base?: string): string {
  if (base) return path.resolve(base)
  const cwd = process.cwd()
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
      ? process.resourcesPath
      : ''
  const candidates: string[] = []
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'service-registry', 'modules', UNIFIED_TOOLBOX_MODULE))
  }
  candidates.push(path.join(cwd, 'resources', 'service-registry', 'modules', UNIFIED_TOOLBOX_MODULE))
  const existing = candidates.find((dir) => fs.existsSync(path.join(dir, 'patch.yaml')))
  return path.resolve(existing ?? candidates[candidates.length - 1])
}

/** MCP 进程入口：优先已编译 js，缺省指向 ts 源（与资源同目录）。 */
function pickUnifiedToolboxMcp(moduleRoot: string): string {
  const js = path.join(moduleRoot, 'mcp-server.js')
  if (fs.existsSync(js)) return js
  return path.join(moduleRoot, 'mcp-server.ts')
}

/** 生成 unified-toolbox 的环境变量：模块根、MCP 入口、工具注册表（均绝对路径）。 */
export function buildUnifiedToolboxEnv(moduleRoot: string): NodeJS.ProcessEnv {
  return {
    ST_TOOLBOX_MODULE: moduleRoot,
    ST_TOOLBOX_MCP: pickUnifiedToolboxMcp(moduleRoot),
    ST_TOOLBOX_REGISTRY: path.join(moduleRoot, 'registry.yaml'),
  }
}

/** 找到已编译的 MCP 入口（mcp-server.js）；未编译返回 null。 */
export function findUnifiedToolboxMcpJs(moduleRoot: string): string | null {
  const p = path.join(moduleRoot, 'mcp-server.js')
  return fs.existsSync(p) ? p : null
}

/**
 * 构建 unified-toolbox 启动规格（Electron-as-Node 运行打包的 MCP server）。
 * 纯函数：除 fs.existsSync 检查编译产物外不依赖运行时状态，可单测（注入 execPath/baseEnv）。
 * 无 runtime manifest / 无需 resolve()；直接以 process.execPath（Electron 主进程二进制）作为 Node 运行。
 */
export function buildUnifiedToolboxSpawnSpec(opts: {
  port: number
  moduleRoot: string
  execPath?: string
  baseEnv?: NodeJS.ProcessEnv
  extraEnv?: NodeJS.ProcessEnv
}): { command: string; args: string[]; env: NodeJS.ProcessEnv; useShell: boolean } {
  const moduleEnv = buildUnifiedToolboxEnv(opts.moduleRoot)
  const mcp = moduleEnv.ST_TOOLBOX_MCP as string
  if (!mcp.endsWith('.js') || !fs.existsSync(mcp)) {
    throw new Error(`unified-toolbox MCP 未编译（缺少 ${mcp}），请先运行 npm run build:toolbox`)
  }
  const env: NodeJS.ProcessEnv = {
    ...(opts.baseEnv ?? process.env),
    ...(opts.extraEnv ?? {}),
    ...moduleEnv,
    ELECTRON_RUN_AS_NODE: '1',
  }
  return {
    command: opts.execPath ?? process.execPath,
    args: [
      mcp,
      '--port',
      String(opts.port),
      '--registry',
      moduleEnv.ST_TOOLBOX_REGISTRY as string,
    ],
    env,
    useShell: false,
  }
}

/** preStart：registry.yaml 必须存在且为可解析的工具注册表，否则抛错阻断启动。 */
export function assertUnifiedToolboxRegistry(moduleRoot: string): void {
  const registryPath = path.join(moduleRoot, 'registry.yaml')
  if (!fs.existsSync(registryPath)) {
    throw new Error('unified-toolbox 注册表缺失，无法启动: ' + registryPath)
  }
  const raw = fs.readFileSync(registryPath, 'utf-8')
  const doc = load(raw)
  if (!doc || typeof doc !== 'object' || !Array.isArray((doc as Record<string, unknown>).tools)) {
    throw new Error('unified-toolbox 注册表结构非法（需含 tools 数组）: ' + registryPath)
  }
}

/** postInstall：registry.yaml 缺失时写入最小合规注册表；返回是否发生写入。 */
export async function ensureUnifiedToolboxRegistry(moduleRoot: string): Promise<boolean> {
  const registryPath = path.join(moduleRoot, 'registry.yaml')
  if (fs.existsSync(registryPath)) return false
  await fs.promises.mkdir(moduleRoot, { recursive: true })
  await fs.promises.writeFile(registryPath, MINIMAL_TOOLBOX_REGISTRY, 'utf-8')
  return true
}

ENV_BUILDERS[UNIFIED_TOOLBOX_HOOK] = (ctx) =>
  buildUnifiedToolboxEnv(resolveUnifiedToolboxModuleDir())

PRE_START_HANDLERS[UNIFIED_TOOLBOX_HOOK] = async (ctx) => {
  assertUnifiedToolboxRegistry(resolveUnifiedToolboxModuleDir())
}

POST_INSTALL_HANDLERS[UNIFIED_TOOLBOX_HOOK] = async (ctx) =>
  ensureUnifiedToolboxRegistry(resolveUnifiedToolboxModuleDir())
// ———————————————————————— wx-gateway（微信域桥）白名单 ————————————————————————
const WX_GATEWAY_MODULE = 'wx-gateway'
const WX_GATEWAY_HOOK = 'wxGateway'
const WX_GATEWAY_PORT_DEFAULT = 9020

/** 解析 wx-gateway 模块目录绝对路径（打包后 resourcesPath，开发环境 cwd/resources；传 base 优先供单测注入）。 */
export function resolveWxGatewayModuleDir(base?: string): string {
  if (base) return path.resolve(base)
  const cwd = process.cwd()
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
      ? process.resourcesPath
      : ''
  const candidates: string[] = []
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'service-registry', 'modules', WX_GATEWAY_MODULE))
  }
  candidates.push(path.join(cwd, 'resources', 'service-registry', 'modules', WX_GATEWAY_MODULE))
  const existing = candidates.find((dir) => fs.existsSync(path.join(dir, 'app.py')))
  return path.resolve(existing ?? candidates[candidates.length - 1])
}

/**
 * wx-gateway 运行期状态根目录：`<userData>/service-registry/wx-gateway`。
 * 模块目录随包分发在 resources 内（macOS / Program Files 下只读），配置必须放用户数据目录。
 */
export function wxGatewayStateRoot(userDataDir: string): string {
  return path.join(userDataDir, 'service-registry', 'wx-gateway')
}

/** 生成 wx-gateway 环境变量：模块根、app 入口、端口、配置路径、自动登录主目录、AppID。 */
export function buildWxGatewayEnv(moduleRoot: string, options: { stateRoot?: string } = {}): NodeJS.ProcessEnv {
  const stateRoot = options.stateRoot ?? moduleRoot
  return {
    WX_GATEWAY_MODULE: moduleRoot,
    WX_APP: path.join(moduleRoot, 'app.py'),
    WX_PORT: String(Number(process.env.WX_PORT) || WX_GATEWAY_PORT_DEFAULT),
    WX_CONFIG: process.env.WX_CONFIG ?? path.join(stateRoot, 'config.json'),
    WX_AUTO_HOME: process.env.WX_AUTO_HOME ?? '',
    WX_APPID: process.env.WX_APPID ?? '',
  }
}

/** preStart：app.py 必须存在，否则抛错阻断启动（后端未装不在 preStart 拦截，由 core 运行时返回 BACKEND_MISSING）。 */
export function assertWxGatewayReady(moduleRoot: string): void {
  const app = path.join(moduleRoot, 'app.py')
  if (!fs.existsSync(app)) {
    throw new Error(`wx-gateway 未就绪（缺少 ${app}）`)
  }
}

/** postInstall：config.json 缺失时写入最小默认配置（写在状态目录）；返回是否发生写入。授权密钥不落源码。 */
export async function ensureWxGatewayConfig(moduleRoot: string, stateRoot?: string): Promise<boolean> {
  const target = stateRoot ?? moduleRoot
  const cfgPath = path.join(target, 'config.json')
  if (fs.existsSync(cfgPath)) return false
  await fs.promises.mkdir(target, { recursive: true })
  const defaults = {
    wx_port: WX_GATEWAY_PORT_DEFAULT,
    // 后端为开源 wxauto（MIT），不需要授权密钥（决策记录见模块内 SDK_INFO.template.md）
    backend: 'wxauto',
    wx_auto_home: '',
    wx_appid: '',
  }
  await fs.promises.writeFile(cfgPath, JSON.stringify(defaults, null, 2), 'utf-8')
  return true
}

/**
 * 构建 wx-gateway 启动规格：spawn 外部 Python（WX_PYTHON 或 'python'）运行 app.py --port <port>。
 * 纯函数：除 fs.existsSync 校验 app.py 外不依赖运行时状态，可单测（注入 python/baseEnv）。
 * 无 runtime manifest / 无需 resolve()。
 */
export function buildWxGatewaySpawnSpec(opts: {
  port: number
  moduleRoot: string
  stateRoot?: string
  python?: string
  baseEnv?: NodeJS.ProcessEnv
  extraEnv?: NodeJS.ProcessEnv
}): { command: string; args: string[]; env: NodeJS.ProcessEnv; useShell: boolean } {
  const moduleEnv = buildWxGatewayEnv(opts.moduleRoot, { stateRoot: opts.stateRoot })
  const app = moduleEnv.WX_APP as string
  if (!fs.existsSync(app)) {
    throw new Error(`wx-gateway 未就绪（缺少 ${app}）`)
  }
  // 优先内置 Python（随包携带），其次 WX_PYTHON，最后回退宿主机 python 命令
  const python = opts.python ?? process.env.WX_PYTHON ?? resolveBundledPython() ?? 'python'
  const env: NodeJS.ProcessEnv = {
    ...(opts.baseEnv ?? process.env),
    ...(opts.extraEnv ?? {}),
    ...moduleEnv,
    WX_PORT: String(opts.port),
  }
  return {
    command: python,
    args: [app, '--port', String(opts.port)],
    env,
    useShell: false,
  }
}

ENV_BUILDERS[WX_GATEWAY_HOOK] = (ctx) =>
  buildWxGatewayEnv(resolveWxGatewayModuleDir(), {
    stateRoot: ctx.userDataDir ? wxGatewayStateRoot(ctx.userDataDir) : undefined,
  })

PRE_START_HANDLERS[WX_GATEWAY_HOOK] = async (ctx) => {
  assertWxGatewayReady(resolveWxGatewayModuleDir())
}

POST_INSTALL_HANDLERS[WX_GATEWAY_HOOK] = async (ctx) =>
  ensureWxGatewayConfig(resolveWxGatewayModuleDir(), ctx.userDataDir ? wxGatewayStateRoot(ctx.userDataDir) : undefined)

// ———————————————————————— douyin（抖音采集/转写）白名单 ————————————————————————
const DOUYIN_MODULE = 'douyin'
const DOUYIN_HOOK = 'douyin'
const DOUYIN_PORT_DEFAULT = 9030

/** 解析 douyin 模块目录绝对路径（打包后 resourcesPath，开发环境 cwd/resources；传 base 供单测注入）。 */
export function resolveDouyinModuleDir(base?: string): string {
  if (base) return path.resolve(base)
  const cwd = process.cwd()
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
      ? process.resourcesPath
      : ''
  const candidates: string[] = []
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'service-registry', 'modules', DOUYIN_MODULE))
  }
  candidates.push(path.join(cwd, 'resources', 'service-registry', 'modules', DOUYIN_MODULE))
  const existing = candidates.find((dir) => fs.existsSync(path.join(dir, 'app.py')))
  return path.resolve(existing ?? candidates[candidates.length - 1])
}

/**
 * douyin 运行期状态根目录：`<userData>/service-registry/douyin`。
 * 模块目录随包分发在 resources 内（macOS / Program Files 下只读），配置必须放用户数据目录。
 */
export function douyinStateRoot(userDataDir: string): string {
  return path.join(userDataDir, 'service-registry', 'douyin')
}

/** 生成 douyin 环境变量：模块根、app 入口、端口、配置路径、转写引擎、每日上限。 */
export function buildDouyinEnv(moduleRoot: string, options: { stateRoot?: string } = {}): NodeJS.ProcessEnv {
  const stateRoot = options.stateRoot ?? moduleRoot
  return {
    DOUYIN_MODULE: moduleRoot,
    DOUYIN_APP: path.join(moduleRoot, 'app.py'),
    DOUYIN_PORT: String(Number(process.env.DOUYIN_PORT) || DOUYIN_PORT_DEFAULT),
    DOUYIN_CONFIG: process.env.DOUYIN_CONFIG ?? path.join(stateRoot, 'config.json'),
    DOUYIN_TRANSCRIBE_ENGINE: process.env.DOUYIN_TRANSCRIBE_ENGINE ?? 'video-claw',
    DOUYIN_DAILY_LIMIT: process.env.DOUYIN_DAILY_LIMIT ?? '50',
  }
}

/** preStart：app.py 必须存在，否则抛错阻断启动。 */
export function assertDouyinReady(moduleRoot: string): void {
  const app = path.join(moduleRoot, 'app.py')
  if (!fs.existsSync(app)) {
    throw new Error(`douyin 未就绪（缺少 ${app}）`)
  }
}

/** postInstall：config.json 缺失时写入最小默认配置（写在状态目录）；返回是否发生写入。 */
export async function ensureDouyinConfig(moduleRoot: string, stateRoot?: string): Promise<boolean> {
  const target = stateRoot ?? moduleRoot
  const cfgPath = path.join(target, 'config.json')
  if (fs.existsSync(cfgPath)) return false
  await fs.promises.mkdir(target, { recursive: true })
  const defaults = {
    douyin_port: DOUYIN_PORT_DEFAULT,
    douyin_browser: 'computer-control',
    douyin_transcribe_engine: 'video-claw',
    douyin_daily_limit: 50,
  }
  await fs.promises.writeFile(cfgPath, JSON.stringify(defaults, null, 2), 'utf-8')
  return true
}

/**
 * 构建 douyin 启动规格：spawn 外部 Python（DOUYIN_PYTHON 或 'python'）运行 app.py --port <port>。
 * 纯函数：除 fs.existsSync 校验 app.py 外不依赖运行时状态，可单测。无 runtime manifest / 无需 resolve()。
 */
export function buildDouyinSpawnSpec(opts: {
  port: number
  moduleRoot: string
  stateRoot?: string
  python?: string
  baseEnv?: NodeJS.ProcessEnv
  extraEnv?: NodeJS.ProcessEnv
}): { command: string; args: string[]; env: NodeJS.ProcessEnv; useShell: boolean } {
  const moduleEnv = buildDouyinEnv(opts.moduleRoot, { stateRoot: opts.stateRoot })
  const app = moduleEnv.DOUYIN_APP as string
  if (!fs.existsSync(app)) {
    throw new Error(`douyin 未就绪（缺少 ${app}）`)
  }
  // 优先内置 Python（随包携带），其次 DOUYIN_PYTHON，最后回退宿主机 python 命令
  const python = opts.python ?? process.env.DOUYIN_PYTHON ?? resolveBundledPython() ?? 'python'
  const env: NodeJS.ProcessEnv = {
    ...(opts.baseEnv ?? process.env),
    ...(opts.extraEnv ?? {}),
    ...moduleEnv,
    DOUYIN_PORT: String(opts.port),
  }
  return {
    command: python,
    args: [app, '--port', String(opts.port)],
    env,
    useShell: false,
  }
}

ENV_BUILDERS[DOUYIN_HOOK] = (ctx) =>
  buildDouyinEnv(resolveDouyinModuleDir(), {
    stateRoot: ctx.userDataDir ? douyinStateRoot(ctx.userDataDir) : undefined,
  })

PRE_START_HANDLERS[DOUYIN_HOOK] = async (ctx) => {
  assertDouyinReady(resolveDouyinModuleDir())
}

POST_INSTALL_HANDLERS[DOUYIN_HOOK] = async (ctx) =>
  ensureDouyinConfig(resolveDouyinModuleDir(), ctx.userDataDir ? douyinStateRoot(ctx.userDataDir) : undefined)

// ———————————————————————— flows（业务流引擎）白名单 ————————————————————————
const FLOWS_MODULE = 'flows'
const FLOWS_HOOK = 'flows'
const FLOWS_PORT_DEFAULT = 9040

/** 解析 flows 模块目录绝对路径（打包后 resourcesPath，开发环境 cwd/resources；传 base 供单测注入）。 */
/**
 * 解析随包内置的 Python 可执行文件。
 *
 * Hermes / VideoClaw 运行时各自带一份嵌入式 Python（Windows 为 python.exe），
 * 打包后位于 <resources>/runtime/<svc>/python/...，开发环境位于 <cwd>/runtime/<svc>/python/...。
 * 业务流引擎（flows）/微信域桥（wx-gateway）/抖音服务（douyin）统一优先使用内置 Python，
 * 避免依赖用户宿主机是否安装 python（RRClaw 即内置 Python，本工程运行时也已随包携带）。
 *
 * 返回 null 表示未找到内置 Python，调用方应回退到宿主机 "python" 命令。
 * 传 base 供单测注入（直接视为 python 可执行文件绝对路径）。
 */
export function resolveBundledPython(base?: string): string | null {
  if (base) {
    const p = path.resolve(base)
    return fs.existsSync(p) ? p : null
  }
  const roots: string[] = []
  const resourcesPath =
    typeof process.resourcesPath === "string" && process.resourcesPath.length > 0
      ? process.resourcesPath
      : ""
  if (resourcesPath) roots.push(path.join(resourcesPath, "runtime"))
  roots.push(path.join(process.cwd(), "runtime"))
  const relCandidates =
    process.platform === "win32"
      ? [path.join("python", "python.exe"), "python.exe"]
      : [path.join("python", "bin", "python3"), path.join("python", "python3"), "python3"]
  for (const root of roots) {
    for (const svc of ["hermes", "video-claw"]) {
      for (const rel of relCandidates) {
        const candidate = path.join(root, svc, rel)
        if (fs.existsSync(candidate)) return candidate
      }
    }
  }
  return null
}

export function resolveFlowsModuleDir(base?: string): string {
  if (base) return path.resolve(base)
  const cwd = process.cwd()
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
      ? process.resourcesPath
      : ''
  const candidates: string[] = []
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'service-registry', 'modules', FLOWS_MODULE))
  }
  candidates.push(path.join(cwd, 'resources', 'service-registry', 'modules', FLOWS_MODULE))
  const existing = candidates.find((dir) => fs.existsSync(path.join(dir, 'app.py')))
  return path.resolve(existing ?? candidates[candidates.length - 1])
}

/**
 * flows 运行期状态根目录：`<userData>/service-registry/flows`。
 * 模块目录随包分发（resources 内，macOS / Program Files 下不可写），因此配置与数据必须放用户数据目录，
 * 否则安装目录只读会直接失败、应用更新也会把数据冲掉。
 */
export function flowsStateRoot(userDataDir: string): string {
  return path.join(userDataDir, 'service-registry', 'flows')
}

/**
 * 生成 flows 环境变量：模块根、app/CLI 入口、端口、状态目录、依赖服务地址。
 * stateRoot 缺省回退到模块目录（仅开发/单测用）。
 */
export function buildFlowsEnv(moduleRoot: string, options: { stateRoot?: string } = {}): NodeJS.ProcessEnv {
  const stateRoot = options.stateRoot ?? moduleRoot
  return {
    FLOWS_MODULE: moduleRoot,
    FLOWS_APP: path.join(moduleRoot, 'app.py'),
    FLOWS_TOOLBOX: path.join(moduleRoot, 'tool_box.py'),
    FLOWS_PORT: String(Number(process.env.FLOWS_PORT) || FLOWS_PORT_DEFAULT),
    FLOWS_STORAGE_ROOT: process.env.FLOWS_STORAGE_ROOT ?? path.join(stateRoot, 'data'),
    FLOWS_CONFIG: process.env.FLOWS_CONFIG ?? path.join(stateRoot, 'config.json'),
    FLOWS_WX_BASE_URL: process.env.FLOWS_WX_BASE_URL ?? 'http://127.0.0.1:9020',
    FLOWS_DOUYIN_BASE_URL: process.env.FLOWS_DOUYIN_BASE_URL ?? 'http://127.0.0.1:9030',
  }
}

/** preStart：app.py 必须存在，否则抛错阻断启动。 */
export function assertFlowsReady(moduleRoot: string): void {
  const app = path.join(moduleRoot, 'app.py')
  if (!fs.existsSync(app)) {
    throw new Error(`flows 未就绪（缺少 ${app}）`)
  }
}

/** postInstall：config.json 缺失时写入最小默认配置（写在状态目录）；高风险闸门默认关闭。 */
export async function ensureFlowsConfig(moduleRoot: string, stateRoot?: string): Promise<boolean> {
  const target = stateRoot ?? moduleRoot
  const cfgPath = path.join(target, 'config.json')
  if (fs.existsSync(cfgPath)) return false
  await fs.promises.mkdir(target, { recursive: true })
  const defaults = {
    flows_port: FLOWS_PORT_DEFAULT,
    storage_backend: 'local',
    // 高风险业务流（加好友 / 内容推送 / 私域群发 / 多轮私信）默认关闭，确认合规后再置 true
    enable_high_risk: false,
    wx_base_url: 'http://127.0.0.1:9020',
    douyin_base_url: 'http://127.0.0.1:9030',
  }
  await fs.promises.writeFile(cfgPath, JSON.stringify(defaults, null, 2), 'utf-8')
  return true
}

/**
 * 构建 flows 启动规格：spawn 外部 Python（FLOWS_PYTHON 或 'python'）运行 app.py --port <port>。
 * 纯函数：除 fs.existsSync 校验 app.py 外不依赖运行时状态，可单测。无 runtime manifest。
 */
export function buildFlowsSpawnSpec(opts: {
  port: number
  moduleRoot: string
  stateRoot?: string
  python?: string
  baseEnv?: NodeJS.ProcessEnv
  extraEnv?: NodeJS.ProcessEnv
}): { command: string; args: string[]; env: NodeJS.ProcessEnv; useShell: boolean } {
  const moduleEnv = buildFlowsEnv(opts.moduleRoot, { stateRoot: opts.stateRoot })
  const app = moduleEnv.FLOWS_APP as string
  if (!fs.existsSync(app)) {
    throw new Error(`flows 未就绪（缺少 ${app}）`)
  }
  // 优先内置 Python（随包携带），其次 FLOWS_PYTHON，最后回退宿主机 python 命令
  const python = opts.python ?? process.env.FLOWS_PYTHON ?? resolveBundledPython() ?? 'python'
  // 嵌入式 Python 处于 isolated/safe_path 模式，直接跑 app.py 会因 sys.path 不含模块目录而
  // ModuleNotFoundError；统一经 _bootstrap.py 启动（系统 Python 亦兼容）。缺失时回退直跑。
  const bootstrap = path.join(opts.moduleRoot, '_bootstrap.py')
  const args = fs.existsSync(bootstrap)
    ? [bootstrap, app, '--port', String(opts.port)]
    : [app, '--port', String(opts.port)]
  const env: NodeJS.ProcessEnv = {
    ...(opts.baseEnv ?? process.env),
    ...(opts.extraEnv ?? {}),
    ...moduleEnv,
    FLOWS_PORT: String(opts.port),
  }
  return {
    command: python,
    args,
    env,
    useShell: false,
  }
}

ENV_BUILDERS[FLOWS_HOOK] = (ctx) =>
  buildFlowsEnv(resolveFlowsModuleDir(), {
    stateRoot: ctx.userDataDir ? flowsStateRoot(ctx.userDataDir) : undefined,
  })

PRE_START_HANDLERS[FLOWS_HOOK] = async (ctx) => {
  assertFlowsReady(resolveFlowsModuleDir())
}

POST_INSTALL_HANDLERS[FLOWS_HOOK] = async (ctx) =>
  ensureFlowsConfig(resolveFlowsModuleDir(), ctx.userDataDir ? flowsStateRoot(ctx.userDataDir) : undefined)
