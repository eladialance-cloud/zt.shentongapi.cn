// Windows PATH 修复模块
//
// 问题：Electron 打包后，主进程的 process.env.PATH 可能不包含用户级 PATH
// （如 nvm4w 的 C:\nvm4w\nodejs），导致 where npm / where n8n 等命令失败。
//
// 解决方案：
// 1. 从注册表读取完整的系统级 + 用户级 PATH
// 2. 直接遍历常见安装路径，确认目录存在后再加入 PATH
// 3. 动态发现 QClaw 内置 Node 路径（不硬编码版本号）
// 4. 检测 npm 全局安装目录并加入 PATH

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

/** 动态发现 QClaw 内置 Node 路径 */
function findQClawNodePaths(): string[] {
  const results: string[] = []
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const qclawRoot = path.join(programFiles, 'QClaw')
  try {
    if (fs.existsSync(qclawRoot)) {
      const versions = fs.readdirSync(qclawRoot).filter(dir => dir.startsWith('v'))
      for (const ver of versions) {
        const nodePath = path.join(qclawRoot, ver, 'resources', 'node')
        if (fs.existsSync(nodePath)) results.push(nodePath)
        const openclawNodePath = path.join(qclawRoot, ver, 'resources', 'openclaw', 'config', 'bin', 'node', 'node')
        if (fs.existsSync(openclawNodePath)) results.push(openclawNodePath)
        const openclawNpmPath = path.join(qclawRoot, ver, 'resources', 'openclaw', 'config', 'npm-tools')
        if (fs.existsSync(openclawNpmPath)) results.push(openclawNpmPath)
      }
    }
  } catch {
    // ignore
  }
  return results
}

/** Windows 上常见的 Node.js / npm 安装路径 */
function getCommonNodePaths(): string[] {
  const paths: string[] = [
    // nvm for Windows (nvm4w)
    'C:\\nvm4w\\nodejs',
    'C:\\nvm\\nodejs',
    // Node.js 官方安装
    'C:\\Program Files\\nodejs',
    'C:\\Program Files (x86)\\nodejs',
    // Scoop
    process.env.USERPROFILE ? `${process.env.USERPROFILE}\\scoop\\apps\\nodejs\\current` : '',
    process.env.USERPROFILE ? `${process.env.USERPROFILE}\\scoop\\shims` : '',
    // Chocolatey
    'C:\\ProgramData\\chocolatey\\bin',
    // nvm-windows npm global
    process.env.APPDATA ? `${process.env.APPDATA}\\npm` : '',
    // volta
    process.env.USERPROFILE ? `${process.env.USERPROFILE}\\volta\\bin` : '',
    // fnm
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\fnm_multishells` : '',
  ].filter(Boolean)

  // 动态发现 QClaw 内置 Node
  paths.push(...findQClawNodePaths())

  return paths
}

/** 检查目录是否真实存在 */
function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 检查文件是否存在（包括 .cmd / .exe / .ps1 变体） */
function commandExistsInDir(dir: string, cmd: string): boolean {
  const variants = process.platform === 'win32'
    ? [`${cmd}.exe`, `${cmd}.cmd`, `${cmd}.bat`, `${cmd}.ps1`]
    : [cmd]
  return variants.some(v => {
    try {
      return fs.statSync(path.join(dir, v)).isFile()
    } catch {
      return false
    }
  })
}

/**
 * 在已知目录中搜索命令，返回所在目录
 */
function findCommandDir(cmd: string): string | null {
  const searchDirs = getCommonNodePaths()
  for (const dir of searchDirs) {
    if (commandExistsInDir(dir, cmd)) {
      return dir
    }
  }
  return null
}

/**
 * 修复 Windows 上的 PATH 环境变量
 * 在 Electron 主进程启动最早阶段调用
 */
export function fixWindowsPath(): void {
  if (process.platform !== 'win32') return

  // 1. 从注册表读取完整的系统级 + 用户级 PATH
  try {
    const systemPathRaw = execFileSync(
      'reg',
      ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', '/v', 'Path'],
      { encoding: 'utf-8', timeout: 3000, windowsHide: true }
    )
    const systemMatch = systemPathRaw.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i)
    let sysPath = ''
    let userPath = ''

    if (systemMatch) {
      sysPath = systemMatch[1].trim()
    }

    try {
      const userPathRaw = execFileSync(
        'reg',
        ['query', 'HKCU\\Environment', '/v', 'Path'],
        { encoding: 'utf-8', timeout: 3000, windowsHide: true }
      )
      const userMatch = userPathRaw.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i)
      if (userMatch) {
        userPath = userMatch[1].trim()
      }
    } catch {
      // 用户级 PATH 读取失败（可能不存在），忽略
    }

    if (sysPath || userPath) {
      const currentPath = process.env.PATH || ''
      const allPaths = [
        ...currentPath.split(';').filter(Boolean),
        ...userPath.split(';').filter(Boolean),
        ...sysPath.split(';').filter(Boolean)
      ]
      // 去重（大小写不敏感）
      const seen = new Set<string>()
      const uniquePaths: string[] = []
      for (const p of allPaths) {
        const lower = p.toLowerCase()
        if (!seen.has(lower)) {
          seen.add(lower)
          uniquePaths.push(p)
        }
      }
      process.env.PATH = uniquePaths.join(';')
    }
  } catch {
    // 注册表读取失败，继续用硬编码路径
  }

  // 2. 补充常见 Node.js / npm 路径（仅添加真实存在的目录）
  const pathParts = (process.env.PATH || '').split(';').filter(Boolean)
  const seenLower = new Set(pathParts.map(p => p.toLowerCase()))
  let added = false

  for (const p of getCommonNodePaths()) {
    if (p && !seenLower.has(p.toLowerCase()) && dirExists(p)) {
      pathParts.push(p)
      seenLower.add(p.toLowerCase())
      added = true
    }
  }
  if (added) {
    process.env.PATH = pathParts.join(';')
  }

  // 3. 动态查找 npm 全局安装目录并加入 PATH
  //    不依赖 npm config get prefix（因为 npm 可能还不在 PATH 中）
  //    直接检查常见全局安装路径
  const npmGlobalCandidates = [
    process.env.APPDATA ? `${process.env.APPDATA}\\npm` : '',        // nvm-windows / Node.js 官方安装
    process.env.APPDATA ? `${process.env.APPDATA}\\Roaming\\npm` : '',
    process.env.APPDATA ? `${process.env.APPDATA}\\QClaw\\npm-global` : '', // QClaw 自带 npm 全局目录
    'C:\\nvm4w\\nodejs',                                              // nvm4w（npm 全局包通常装在这里）
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\npm` : '',
  ].filter(Boolean)

  for (const candidate of npmGlobalCandidates) {
    if (dirExists(candidate) && !seenLower.has(candidate.toLowerCase())) {
      pathParts.push(candidate)
      seenLower.add(candidate.toLowerCase())
      process.env.PATH = pathParts.join(';')
    }
  }

  // 4. 如果 npm 仍不在 PATH 中，尝试直接查找并添加
  const npmDir = findCommandDir('npm')
  if (npmDir && !seenLower.has(npmDir.toLowerCase())) {
    pathParts.push(npmDir)
    seenLower.add(npmDir.toLowerCase())
    process.env.PATH = pathParts.join(';')
  }

  // 5. 如果 node 仍不在 PATH 中，尝试直接查找并添加
  const nodeDir = findCommandDir('node')
  if (nodeDir && !seenLower.has(nodeDir.toLowerCase())) {
    pathParts.push(nodeDir)
    seenLower.add(nodeDir.toLowerCase())
    process.env.PATH = pathParts.join(';')
  }
}
