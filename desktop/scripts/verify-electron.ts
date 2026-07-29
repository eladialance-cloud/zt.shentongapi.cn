// 校验并修复 Electron 二进制安装
//
// 背景:
//   本项目在 devDependencies 中使用 Electron 41.7.1。在中国大陆执行 npm install 时,
//   Electron 的 postinstall 脚本可能因网络问题下载二进制失败,导致
//   node_modules/electron/path.txt 缺失。运行 npm run dev 时会报错:
//     "Electron failed to install correctly, please delete node_modules/electron
//      and try installing again"
//   本脚本用于校验安装是否完整,并在 --repair 模式下通过 npmmirror 镜像自动修复。
//
// 用法:
//   tsx scripts/verify-electron.ts --check   # 仅校验(默认),失败时退出码 1
//   tsx scripts/verify-electron.ts --repair  # 校验并尝试自动修复,始终退出码 0
//
// 退出码:
//   --check  模式: 完整=0, 不完整=1
//   --repair 模式: 始终=0(即使修复失败也不阻断 npm install)

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as https from 'node:https'
import * as http from 'node:http'
import { URL } from 'node:url'
import { execFile } from 'node:child_process'

// ANSI 颜色码
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
}

// npm 脚本运行时 CWD 为 package.json 所在目录；手动运行时可能不在该目录，
// 因此优先使用 process.cwd()，若不存在 electron 则回退到脚本所在目录的上级
const DESKTOP_ROOT = (() => {
  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, 'node_modules', 'electron', 'package.json'))) {
    return cwd
  }
  // 回退：脚本位于 <root>/scripts/，上级即为项目根目录
  return path.resolve(__dirname, '..')
})()
const ELECTRON_DIR = path.join(DESKTOP_ROOT, 'node_modules', 'electron')
const ELECTRON_PKG = path.join(ELECTRON_DIR, 'package.json')
const PATH_TXT = path.join(ELECTRON_DIR, 'path.txt')
const DIST_DIR = path.join(ELECTRON_DIR, 'dist')
const NPMRC_PATH = path.join(DESKTOP_ROOT, '.npmrc')
const DEFAULT_MIRROR = 'https://npmmirror.com/mirrors/electron/'

const IS_WIN = process.platform === 'win32'
const BINARY_NAME = IS_WIN ? 'electron.exe' : 'electron'
const BINARY_PATH = path.join(DIST_DIR, BINARY_NAME)
const DOWNLOAD_TIMEOUT_MS = 60_000
const MANUAL_FIX_CMD = 'npm run setup:electron'

interface VerifyResult {
  ok: boolean
  pathTxtExists: boolean
  binaryExists: boolean
}

interface RepairResult {
  ok: boolean
  error?: string
}

/**
 * 校验 Electron 安装是否完整。
 * 检查 node_modules/electron/path.txt 是否存在,
 * 以及 node_modules/electron/dist/electron(.exe) 是否存在。
 */
function verifyElectronInstall(): VerifyResult {
  let pathTxtExists = false
  let binaryExists = false
  try {
    pathTxtExists = fs.statSync(PATH_TXT).isFile()
  } catch {
    pathTxtExists = false
  }
  try {
    binaryExists = fs.statSync(BINARY_PATH).isFile()
  } catch {
    binaryExists = false
  }
  return { ok: pathTxtExists && binaryExists, pathTxtExists, binaryExists }
}

/** 从 .npmrc 读取 electron_mirror,缺失时回退到默认镜像。 */
function readMirrorFromNpmrc(): string {
  try {
    const content = fs.readFileSync(NPMRC_PATH, 'utf-8')
    for (const rawLine of content.split(/\r?\n/)) {
      const trimmed = rawLine.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = trimmed.match(/^electron_mirror\s*=\s*(.+)$/)
      if (match) {
        let url = match[1].trim()
        // 去掉可能的引号
        if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
          url = url.slice(1, -1)
        }
        if (!url.endsWith('/')) url += '/'
        return url
      }
    }
  } catch {
    // .npmrc 不存在或读取失败,使用默认镜像
  }
  return DEFAULT_MIRROR
}

/** 读取 node_modules/electron/package.json 中的 version 字段。 */
function readElectronVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(ELECTRON_PKG, 'utf-8')) as { version?: string }
  if (!pkg.version) {
    throw new Error('node_modules/electron/package.json 中缺少 version 字段')
  }
  return pkg.version
}

/** 将 process.platform / process.arch 映射为 Electron 下载命名。 */
function getPlatformArch(): { platform: string; arch: string } {
  const platformMap: Record<string, string> = {
    win32: 'win32',
    darwin: 'darwin',
    linux: 'linux'
  }
  const archMap: Record<string, string> = {
    x64: 'x64',
    arm64: 'arm64',
    ia32: 'ia32',
    arm: 'armv7l'
  }
  const platform = platformMap[process.platform] ?? process.platform
  const arch = archMap[process.arch] ?? process.arch
  return { platform, arch }
}

/**
 * 下载文件到指定路径,自动跟随 3xx 重定向(镜像站点常见 302)。
 * 使用 AbortController 实现 60s 超时;失败时清理已写入的半成品文件。
 */
function downloadFile(url: string, destPath: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      fail(new Error(`下载超时(${timeoutMs / 1000}s): ${url}`))
    }, timeoutMs)

    const fail = (err: Error): void => {
      clearTimeout(timer)
      try {
        fs.rmSync(destPath, { force: true })
      } catch {
        // 忽略清理失败
      }
      reject(err)
    }

    const doRequest = (targetUrl: string, redirectCount: number): void => {
      if (redirectCount > 5) {
        fail(new Error(`重定向次数过多(>5): ${targetUrl}`))
        return
      }
      let parsed: URL
      try {
        parsed = new URL(targetUrl)
      } catch (err) {
        fail(new Error(`无效的下载地址: ${targetUrl} (${err instanceof Error ? err.message : String(err)})`))
        return
      }
      // 镜像主链路为 https,重定向可能落到 http CDN,按协议选择模块
      const lib = parsed.protocol === 'https:' ? https : (http as unknown as typeof https)

      const req = lib.get(targetUrl, { signal: controller.signal }, (res) => {
        const status = res.statusCode ?? 0

        // 处理重定向
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume() // 排空当前响应,避免内存泄漏
          const loc = res.headers.location
          const locStr = Array.isArray(loc) ? (loc[0] ?? '') : loc
          if (!locStr) {
            fail(new Error(`重定向缺少 location 头(HTTP ${status})`))
            return
          }
          const nextUrl = new URL(locStr, targetUrl).toString()
          doRequest(nextUrl, redirectCount + 1)
          return
        }

        if (status !== 200) {
          res.resume()
          fail(new Error(`下载失败,HTTP ${status}: ${targetUrl}`))
          return
        }

        const stream = fs.createWriteStream(destPath)
        res.pipe(stream)
        stream.on('finish', () => {
          stream.close((err) => {
            if (err) {
              fail(err)
            } else {
              clearTimeout(timer)
              resolve()
            }
          })
        })
        stream.on('error', (err) => fail(err))
        res.on('error', (err) => fail(err))
      })

      req.on('error', (err) => {
        // 超时已通过 controller.abort 触发,此处避免重复 reject
        if (controller.signal.aborted) return
        fail(err)
      })
    }

    doRequest(url, 0)
  })
}

/**
 * 解压 zip 到目标目录。
 * Windows 使用 PowerShell 的 Expand-Archive;Mac/Linux 使用 unzip。
 */
function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (IS_WIN) {
      const cmd = `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', cmd],
        (err, _stdout, stderr) => {
          if (err) {
            reject(new Error(`解压失败(Expand-Archive): ${err.message}${stderr ? `\n${stderr}` : ''}`))
          } else {
            resolve()
          }
        }
      )
    } else {
      execFile('unzip', ['-o', zipPath, '-d', destDir], (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`解压失败(unzip): ${err.message}${stderr ? `\n${stderr}` : ''}`))
        } else {
          resolve()
        }
      })
    }
  })
}

/**
 * 修复 Electron 安装:
 *   1. 从 .npmrc 读取镜像 URL(回退默认镜像)
 *   2. 从 node_modules/electron/package.json 读取版本号
 *   3. 下载 ${mirror}/${version}/electron-v${version}-${platform}-${arch}.zip
 *   4. 解压到 node_modules/electron/dist/
 *   5. 写入 path.txt(Windows=electron.exe, 其他=electron)
 *   6. 再次校验完整性
 */
async function repairElectronInstall(): Promise<RepairResult> {
  try {
    const mirror = readMirrorFromNpmrc()

    let version: string
    try {
      version = readElectronVersion()
    } catch (err) {
      return {
        ok: false,
        error: `无法读取 Electron 版本(${ELECTRON_PKG}): ${err instanceof Error ? err.message : String(err)}`
      }
    }

    const { platform, arch } = getPlatformArch()
    const zipName = `electron-v${version}-${platform}-${arch}.zip`
    const downloadUrl = `${mirror}${version}/${zipName}`

    console.log(`${COLORS.cyan}ℹ️  开始修复 Electron 安装${COLORS.reset}`)
    console.log(`${COLORS.dim}     版本: ${version}${COLORS.reset}`)
    console.log(`${COLORS.dim}     平台: ${platform}-${arch}${COLORS.reset}`)
    console.log(`${COLORS.dim}     镜像: ${mirror}${COLORS.reset}`)
    console.log(`${COLORS.dim}     下载: ${downloadUrl}${COLORS.reset}`)

    const tmpZip = path.join(ELECTRON_DIR, zipName)

    // 清理旧的 dist 目录(可能残留损坏文件)
    try {
      fs.rmSync(DIST_DIR, { recursive: true, force: true })
    } catch {
      // 忽略
    }
    fs.mkdirSync(DIST_DIR, { recursive: true })

    // 下载
    console.log(`${COLORS.cyan}⬇️  正在下载 Electron 二进制包...${COLORS.reset}`)
    await downloadFile(downloadUrl, tmpZip, DOWNLOAD_TIMEOUT_MS)
    console.log(`${COLORS.green}  ✓ 下载完成${COLORS.reset}`)

    // 解压
    console.log(`${COLORS.cyan}📦 正在解压到 dist/ ...${COLORS.reset}`)
    await extractZip(tmpZip, DIST_DIR)
    console.log(`${COLORS.green}  ✓ 解压完成${COLORS.reset}`)

    // 写入 path.txt
    fs.writeFileSync(PATH_TXT, BINARY_NAME, 'utf-8')
    console.log(`${COLORS.green}  ✓ 已写入 path.txt (${BINARY_NAME})${COLORS.reset}`)

    // 清理临时 zip
    try {
      fs.rmSync(tmpZip, { force: true })
    } catch {
      // 忽略
    }

    // 再次校验
    const verify = verifyElectronInstall()
    if (!verify.ok) {
      return {
        ok: false,
        error: '修复后校验仍不通过(path.txt 或二进制仍缺失)'
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 打印校验详情。 */
function printVerifyResult(result: VerifyResult): void {
  if (result.pathTxtExists) {
    console.log(`${COLORS.green}  ✓ path.txt 存在${COLORS.reset}`)
  } else {
    console.log(`${COLORS.red}  ✗ path.txt 缺失${COLORS.reset}`)
  }
  if (result.binaryExists) {
    console.log(`${COLORS.green}  ✓ 二进制存在 (${BINARY_NAME})${COLORS.reset}`)
  } else {
    console.log(`${COLORS.red}  ✗ 二进制缺失 (${BINARY_PATH})${COLORS.reset}`)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const isRepair = args.includes('--repair')
  const isCheck = !isRepair // 默认 --check

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Electron 安装校验')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const result = verifyElectronInstall()

  if (result.ok) {
    console.log(`${COLORS.green}✓ Electron 安装完整${COLORS.reset}`)
    printVerifyResult(result)
    process.exit(0)
  }

  // 校验失败
  console.log(`${COLORS.red}✗ Electron 安装不完整${COLORS.reset}`)
  printVerifyResult(result)

  if (isCheck) {
    console.log(`\n${COLORS.red}✗ 校验失败,请手动修复:${COLORS.reset}`)
    console.log(`${COLORS.dim}     ${MANUAL_FIX_CMD}${COLORS.reset}`)
    process.exit(1)
  }

  if (isRepair) {
    console.log(`\n${COLORS.yellow}⚠ 检测到安装不完整,正在尝试自动修复...${COLORS.reset}`)
    const repair = await repairElectronInstall()
    if (repair.ok) {
      console.log(`\n${COLORS.green}✓ Electron 修复成功${COLORS.reset}`)
      printVerifyResult(verifyElectronInstall())
      process.exit(0)
    } else {
      console.log(`\n${COLORS.red}✗ 自动修复失败:${COLORS.reset}`)
      console.log(`${COLORS.dim}     ${repair.error ?? '未知错误'}${COLORS.reset}`)
      console.log(`\n${COLORS.yellow}⚠ 请手动执行修复:${COLORS.reset}`)
      console.log(`${COLORS.dim}     ${MANUAL_FIX_CMD}${COLORS.reset}`)
      process.exit(0) // 修复模式始终退出码 0,不阻断 npm install
    }
  }
}

main().catch((err) => {
  const isRepair = process.argv.slice(2).includes('--repair')
  console.error(
    `${COLORS.red}✗ 校验脚本异常: ${err instanceof Error ? err.message : String(err)}${COLORS.reset}`
  )
  // 修复模式不抛出非零退出码,避免阻断 npm install
  process.exit(isRepair ? 0 : 1)
})
