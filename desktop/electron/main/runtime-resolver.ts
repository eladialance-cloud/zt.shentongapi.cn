// 跨平台运行时路径解析器（Task 2 + Task 9.1）
//
// 职责：
// - 解析 N8N / OpenClaw / MCP Gateway 三个本地服务运行时的入口绝对路径
// - 解析优先级：内置 extraResources → userData 补丁 → 宿主机命令回退
// - 校验运行时文件完整性（SHA-256，流式处理大文件）
// - 读取 manifest.json（Task 9.1：比对 builtin 与 userData 的 version 字段，返回较新者）
//
// 说明：
// - 服务 key 即目录名：n8n → runtime/n8n/，mcp → runtime/mcp/（非 mcp-gateway）
// - 入口文件名在 manifest 的 entry 字段中（如 mcp 服务的 win32 入口是 mcp-gateway.exe）
// - 开发环境下 process.resourcesPath 指向 electron 自身目录，需用 process.cwd() 兜底

import { app } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import type { ServiceName, RuntimeManifest, ResolvedRuntime } from '../shared/types'

/** 宿主机回退命令映射（服务 key -> 命令名 + 默认参数） */
const HOST_COMMANDS: Record<ServiceName, { cmd: string; args: string[] }> = {
  n8n: { cmd: 'n8n', args: ['start'] },
  openclaw: { cmd: 'openclaw', args: [] },
  mcp: { cmd: 'mcp-gateway', args: [] }
}

/** 内置运行时根目录：打包后为 process.resourcesPath/runtime，开发环境为 cwd/runtime */
function getBuiltinRuntimePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'runtime')
  }
  return path.join(process.cwd(), 'runtime')
}

/** userData 运行时根目录：用于 CDN 下载的补丁版本 */
function getUserDataRuntimePath(): string {
  return path.join(app.getPath('userData'), 'runtime')
}

/** 检测宿主机命令是否存在：Windows 用 where，Linux/Mac 用 which */
function findHostCommand(cmd: string): boolean {
  try {
    const tool = process.platform === 'win32' ? 'where' : 'which'
    execSync(`${tool} ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** 流式计算文件 SHA-256（兼容大文件） */
function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * 读取单个 manifest.json 文件
 * 解析失败或格式不合法返回 null
 */
function readManifestFile(filePath: string): RuntimeManifest | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as RuntimeManifest
    if (parsed && parsed.services) {
      return parsed
    }
    return null
  } catch {
    // 读取/解析失败
    return null
  }
}

/**
 * 比较两个语义化版本字符串（major.minor.patch）
 * 返回值 > 0 表示 a 较新，< 0 表示 b 较新，0 表示相等
 * 非法版本按 0.0.0 处理
 */
function compareSemver(a: string, b: string): number {
  const parseSemver = (v: string): [number, number, number] => {
    if (!v || typeof v !== 'string') return [0, 0, 0]
    const parts = v.split('.').map((s) => {
      const n = parseInt(s, 10)
      return Number.isNaN(n) ? 0 : n
    })
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }
  const [aMaj, aMin, aPatch] = parseSemver(a)
  const [bMaj, bMin, bPatch] = parseSemver(b)
  if (aMaj !== bMaj) return aMaj - bMaj
  if (aMin !== bMin) return aMin - bMin
  return aPatch - bPatch
}

/**
 * 比较两个 manifest 的服务版本，返回较新者（Task 9.1）
 *
 * - 两者都为 null → null
 * - 其中一个为 null → 返回另一个
 * - 两者都存在 → 比较 manifest.version 字段（语义化版本比较），返回较大者
 * - 版本相等时优先返回 userData（保留补丁优先语义）
 */
export function pickNewerManifest(
  builtin: RuntimeManifest | null,
  userData: RuntimeManifest | null
): RuntimeManifest | null {
  if (!builtin && !userData) return null
  if (!builtin) return userData
  if (!userData) return builtin

  const cmp = compareSemver(builtin.version, userData.version)
  // userData 版本 >= builtin → 用 userData（补丁优先）
  if (cmp >= 0) return userData
  // builtin 更新（例如 electron-updater 更新后自带新 runtime）
  return builtin
}

/**
 * 读取 manifest.json
 * 优先级：比对 builtin 与 userData manifest 的 version 字段，返回较新者（Task 9.1）
 * 解析失败返回 null
 */
export function loadManifest(): RuntimeManifest | null {
  const builtin = readManifestFile(
    path.join(getBuiltinRuntimePath(), 'manifest.json')
  )
  const userData = readManifestFile(
    path.join(getUserDataRuntimePath(), 'manifest.json')
  )
  return pickNewerManifest(builtin, userData)
}

/**
 * 解析服务入口路径，返回启动命令组合
 *
 * 解析优先级链路（依次检查，返回首个存在路径的）：
 * 1. 内置 extraResources: resourcesPath/runtime/<service>/<entry>
 * 2. userData 补丁: userData/runtime/<service>/<entry>
 * 3. 宿主机命令回退: 通过 which/where 检测命令是否存在
 *
 * 内置/userData 来源：cmd = 入口文件绝对路径，args = []
 * 宿主机来源：cmd = 命令名，args = 服务特定参数（n8n 用 ['start']，其他为 []）
 */
export function resolve(name: ServiceName): ResolvedRuntime | null {
  const manifest = loadManifest()

  // 从 manifest 获取当前平台的入口文件名
  let entryFile: string | null = null
  if (manifest) {
    const serviceEntry = manifest.services[name]
    if (serviceEntry) {
      entryFile = serviceEntry.entry[process.platform] ?? null
    }
  }

  // 1. 内置 extraResources
  if (entryFile) {
    const builtinPath = path.join(getBuiltinRuntimePath(), name, entryFile)
    if (fs.existsSync(builtinPath)) {
      return {
        cmd: builtinPath,
        args: [],
        env: { ...process.env },
        source: 'builtin'
      }
    }

    // 2. userData 补丁
    const userDataPath = path.join(getUserDataRuntimePath(), name, entryFile)
    if (fs.existsSync(userDataPath)) {
      return {
        cmd: userDataPath,
        args: [],
        env: { ...process.env },
        source: 'userData'
      }
    }
  }

  // 3. 宿主机命令回退
  const hostCmd = HOST_COMMANDS[name]
  if (findHostCommand(hostCmd.cmd)) {
    return {
      cmd: hostCmd.cmd,
      args: hostCmd.args,
      env: { ...process.env },
      source: 'host'
    }
  }

  return null
}

/**
 * 校验服务运行时完整性（SHA-256）
 *
 * - 读取 manifest 中该服务的 sha256[platform-arch]
 * - 空字符串（构建期未填充）→ 返回 true（开发环境兼容，跳过校验）
 * - 否则计算入口文件 SHA-256 并比对
 * - 仅校验 builtin/userData 来源的文件，host 来源无可校验文件
 */
export async function verifyIntegrity(name: ServiceName): Promise<boolean> {
  const manifest = loadManifest()
  if (!manifest) return false

  const serviceEntry = manifest.services[name]
  if (!serviceEntry) return false

  const platformKey = `${process.platform}-${process.arch}`
  const expectedHash = serviceEntry.sha256[platformKey]

  // 构建期未填充：跳过校验
  if (!expectedHash) return true

  // 解析入口文件路径（仅 builtin / userData 来源有效）
  const resolved = resolve(name)
  if (!resolved || resolved.source === 'host') {
    // 期望有内置文件但未找到
    return false
  }

  try {
    const actualHash = await computeFileSha256(resolved.cmd)
    return actualHash === expectedHash
  } catch {
    return false
  }
}

/** 校验所有服务，返回各服务完整性 */
export async function verifyAll(): Promise<Record<ServiceName, boolean>> {
  const [n8n, openclaw, mcp] = await Promise.all([
    verifyIntegrity('n8n'),
    verifyIntegrity('openclaw'),
    verifyIntegrity('mcp')
  ])
  return { n8n, openclaw, mcp }
}
