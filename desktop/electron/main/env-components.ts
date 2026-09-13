// 环境组件检测与安装（对标 RRClaw「环境组件」）
//
// 深瞳的 Python 解释器来自两处（见 whitelist.listBundledPythons）：
//   1) 随包资源 <resources>/runtime/<svc>（含 Hermes 0.20.5 的 venv/cpython 嵌套布局）
//   2) 运行时下载目录（默认 userData/runtime，用户可自定义），如 video-claw 运行自带完整 Python
// 但业务流引擎（flows）/微信域桥（wx-gateway）/抖音服务所需的部分三方依赖并未内置，
// 首次使用需要在用户机器上补齐。本模块负责：
//   1) 检测各组件是否就绪（只读，纯 fs 探测，可单测）；
//   2) 对可安装项执行一键安装（走内置 Python 的 pip，尽力而为，失败原样返回错误）。
//
// 组件清单：
//   python      —— 内置 Python 解释器（随包，缺失说明安装包不完整）
//   flowsDeps  —— 业务流引擎 Python 依赖（flask 等，见 flows/requirements.txt）
//   playwright —— 浏览器自动化内核（video-claw 依赖 playwright 及其 Chromium 内核）
//   vosk        —— 中文语音识别模型（转写用，可选）
import { spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { listBundledPythons, pythonSearchRoots, resolveFlowsModuleDir } from './service-registry/whitelist'
import type { EnvComponentStatus } from '../shared/types'

/** 内置 Python 的 site-packages 目录（嵌入版路径固定） */
function sitePackagesOf(pythonExe: string): string | null {
  const dir = join(pythonExe, '..', 'Lib', 'site-packages')
  return existsSync(dir) ? dir : null
}

/** 判断某 Python 包是否已装在给定 site-packages（按 dist-info / 包目录前缀匹配） */
function hasPythonPackage(pythonExe: string, pkg: string): boolean {
  const sp = sitePackagesOf(pythonExe)
  if (!sp) return false
  try {
    const lower = pkg.toLowerCase()
    return readdirSync(sp).some((e) => {
      const n = e.toLowerCase()
      return n === lower || n.startsWith(lower + '-') || n.startsWith(lower + '.')
    })
  } catch {
    return false
  }
}

/** 查找 Playwright 浏览器内核目录（ms-playwright） */
function findPlaywrightBrowsers(): string | null {
  const candidates: string[] = []
  const local = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (local) candidates.push(local)
  const home = process.env.USERPROFILE || process.env.HOME || ''
  if (home) {
    candidates.push(join(home, 'AppData', 'Local', 'ms-playwright'))
    candidates.push(join(home, '.cache', 'ms-playwright'))
  }
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

/** 查找 Vosk 中文模型目录（vosk-model-small-cn-*） */
function findVoskModel(): string | null {
  const roots: string[] = []
  // 随包资源目录与已下载运行时目录下的 Hermes 运行/home 目录
  for (const root of pythonSearchRoots()) {
    roots.push(
      root,
      join(root, 'hermes'),
      join(root, 'hermes', 'node_modules', 'hermes-agent'),
      join(root, 'hermes-home')
    )
  }
  const home = process.env.USERPROFILE || process.env.HOME || ''
  if (home) roots.push(join(home, '.hermes'), join(home, '.openclaw'))
  for (const root of roots) {
    if (!existsSync(root)) continue
    try {
      for (const e of readdirSync(root)) {
        if (e.toLowerCase().startsWith('vosk-model')) return join(root, e)
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

/**
 * 检测全部环境组件。纯只读，可安全在启动时调用。
 */
export function checkEnvComponents(): EnvComponentStatus[] {
  const pythons = listBundledPythons()
  const pythonReady = pythons.length > 0

  const flowsDepsReady = pythons.some((p) => hasPythonPackage(p, 'flask'))
  const playwrightModule = pythons.some((p) => hasPythonPackage(p, 'playwright'))
  const playwrightBrowsers = findPlaywrightBrowsers()
  const playwrightReady = playwrightModule && !!playwrightBrowsers
  const voskModel = findVoskModel()

  return [
    {
      id: 'python',
      title: '内置 Python 运行时',
      ready: pythonReady,
      detail: pythonReady
        ? pythons[0]
        : '未找到内置 Python（安装包不完整，或运行时尚未下载）',
      installable: false,
    },
    {
      id: 'flowsDeps',
      title: '业务流引擎依赖',
      ready: flowsDepsReady,
      detail: flowsDepsReady ? 'flask 等已就绪' : '缺少 flask（业务流 HTTP 模式需要）',
      installable: pythonReady,
    },
    {
      id: 'playwright',
      title: '浏览器自动化内核',
      ready: playwrightReady,
      detail: playwrightReady
        ? 'playwright + Chromium 已就绪'
        : !playwrightModule
          ? '未安装 playwright Python 包'
          : '缺少 Chromium 内核（执行 playwright install 安装）',
      installable: pythonReady,
    },
    {
      id: 'vosk',
      title: '中文语音识别模型',
      ready: !!voskModel,
      detail: voskModel ?? '未安装 vosk 中文模型（语音转写可选）',
      installable: false,
    },
  ]
}

/** 某解释器是否真的装了 pip（site-packages 下存在 pip 包目录） */
function hasPip(pythonExe: string): boolean {
  const sp = sitePackagesOf(pythonExe)
  return sp !== null && existsSync(join(sp, 'pip'))
}

/**
 * 选一个"能跑 pip"的解释器，三级兜底：
 *   1) 真的装了 pip 的（随包嵌入式 Python、Hermes 内嵌 cpython、video-claw 自带 Python）
 *   2) 至少有 Lib/site-packages 的
 *   3) 优先级最高的那个（让安装流程给出真实的 pip 报错，而不是静默失败）
 * 注意：Hermes 0.20.5 的 venv python.exe 是 uv 跳板，`pip` 会直接报错，故被第 1 级排除。
 */
function pipCapablePython(): string | null {
  const all = listBundledPythons()
  return all.find(hasPip) ?? all.find((p) => sitePackagesOf(p) !== null) ?? all[0] ?? null
}

export interface EnvInstallResult {
  ok: boolean
  error?: string
  output?: string
}

/** 用内置 Python 执行 `python -m pip install <args>`（1 次调用，供安装组件复用） */
function pipInstall(pythonExe: string, args: string[], timeoutMs = 600_000): Promise<EnvInstallResult> {
  return new Promise((resolve) => {
    let out = ''
    let settled = false
    const done = (r: EnvInstallResult) => {
      if (settled) return
      settled = true
      resolve(r)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(pythonExe, ['-m', 'pip', 'install', ...args], {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      })
    } catch (err) {
      return done({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      done({ ok: false, error: '安装超时', output: out.slice(-2000) })
    }, timeoutMs)
    child.stdout?.on('data', (d) => (out += d))
    child.stderr?.on('data', (d) => (out += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      done({ ok: false, error: err.message, output: out.slice(-2000) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ ok: code === 0, error: code === 0 ? undefined : `pip 退出码 ${code}`, output: out.slice(-2000) })
    })
  })
}

/**
 * 安装指定环境组件（尽力而为）。
 * 只对可安装项执行；其它返回明确错误，不做假动作。
 */
export async function installEnvComponent(
  id: EnvComponentStatus['id'],
  opts: { flowsRequirements?: string } = {},
): Promise<EnvInstallResult> {
  const python = pipCapablePython()
  if (!python) return { ok: false, error: '未找到内置 Python，无法安装依赖' }

  switch (id) {
    case 'flowsDeps': {
      const req = opts.flowsRequirements ?? join(resolveFlowsModuleDir(), 'requirements.txt')
      if (!existsSync(req)) return { ok: false, error: '未找到业务流依赖清单 requirements.txt' }
      return pipInstall(python, ['-r', req])
    }
    case 'playwright': {
      // 先确保 playwright 包存在，再补内核
      if (!hasPythonPackage(python, 'playwright')) {
        const inst = await pipInstall(python, ['playwright'])
        if (!inst.ok) return inst
      }
      return pipInstall(python, ['-m', 'playwright', 'install', 'chromium'])
    }
    case 'python':
      return { ok: false, error: '内置 Python 随安装包分发，无需单独安装' }
    case 'vosk':
      return { ok: false, error: '语音模型需手动放置 vosk-model-small-cn 目录，暂不支持一键安装' }
    default:
      return { ok: false, error: `未知环境组件：${id}` }
  }
}
