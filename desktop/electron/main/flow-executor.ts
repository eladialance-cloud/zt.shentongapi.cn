/** @file 业务流直跑执行器（主进程）
 *
 * 背景（对标 RRClaw 的「确定型定时任务」）：
 * 深瞳原本的定时任务触发后一律走 Hermes 逐步编排（每次现场"想"，慢、贵、不确定）。
 * 本执行器让定时任务可选择「直接跑业务流」——把请求转到随包分发的 Python 业务流引擎
 * （resources/service-registry/modules/flows），以独立子进程运行：
 *
 *     python tool_box.py <flow-id> --params '<json>' --timeout <n>
 *
 * 与 RRClaw `python tool_box.py <workflow> --params JSON` 形态一致：
 * - 结果确定、耗时短、可控；
 * - 独立进程，业务流异常不会击穿主进程；
 * - 高风险业务流（加好友/群发/多轮私信）由引擎内风控闸门把关（默认拒绝）。
 *
 * 纯调用层：不写业务逻辑，业务实现全在 Python 侧；本文件只负责起进程、收 JSON、超时兜底。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  resolveFlowsModuleDir,
  resolveBundledPython,
  buildFlowsEnv,
  flowsStateRoot,
} from './service-registry/whitelist'
import { getFlowsLlmIntegration } from './service-manager'

/** 业务流元数据（对应 Python 侧 list_flows 的 _META_FIELDS） */
export interface FlowMeta {
  id: string
  title?: string
  role?: string
  risk?: 'low' | 'high' | string
  trigger?: string
  params?: Record<string, string>
  steps?: string[]
  produces?: string
}

/** 业务流执行结果（统一结构，永不抛异常） */
export interface FlowRunResult {
  ok: boolean
  flow: string
  /** 失败错误码（FLOW_NOT_FOUND / PARAM_MISSING / RISK_DISABLED / LLM_NOT_CONFIGURED / PYTHON_MISSING ...） */
  code?: string
  error?: string
  /** 业务结果数据（成功时） */
  data?: unknown
  steps?: unknown
  /** 实际耗时（毫秒） */
  durationMs: number
}

export interface RunFlowOptions {
  params?: Record<string, unknown>
  /** 超时毫秒（默认 600s，与 RRClaw 的 timeout 600 对齐） */
  timeoutMs?: number
}

/** 默认超时：10 分钟（长任务如采集/生成文案足够，避免僵尸进程） */
const DEFAULT_TIMEOUT_MS = 600_000

/** 解析 CLI 运行所需的 Python 与工具脚本路径 */
function resolveCliPaths(): {
  python: string
  toolBox: string
  moduleRoot: string
  bundled: boolean
  /** 启动垫片（嵌入式 Python isolated 模式下必需）；缺失时为空串，回退直跑 */
  bootstrap: string
} {
  const moduleRoot = resolveFlowsModuleDir()
  const toolBox = join(moduleRoot, 'tool_box.py')
  const bundledPython = resolveBundledPython()
  const python = process.env.FLOWS_PYTHON ?? bundledPython ?? 'python'
  const bootstrapPath = join(moduleRoot, '_bootstrap.py')
  const bootstrap = existsSync(bootstrapPath) ? bootstrapPath : ''
  return { python, toolBox, moduleRoot, bundled: !!bundledPython, bootstrap }
}

/** 构造 flows CLI 子进程环境（含 LLM 通道与状态目录，避免装到只读安装目录） */
function buildCliEnv(moduleRoot: string): NodeJS.ProcessEnv {
  const stateRoot = flowsStateRoot(app.getPath('userData'))
  const llm = getFlowsLlmIntegration()
  const base = buildFlowsEnv(moduleRoot, { stateRoot })
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...base,
    // Python 侧输出统一 UTF-8（Windows 下避免中文乱码）
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  }
  // 注入平台 llm-proxy 通道（业务流需要 LLM 时用；未登录时留空，引擎会返回 LLM_NOT_CONFIGURED）
  if (llm.apiKey) {
    env.FLOWS_LLM_BASE_URL = llm.baseUrl
    env.FLOWS_LLM_API_KEY = llm.apiKey
  }
  return env
}

/** 解析子进程 stdout 里最后一段合法 JSON（业务流只打印一个 JSON 对象） */
function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    // 兜底：从末尾大括号回溯，截取最外层 JSON 对象（容忍 Python 侧额外日志）
    const end = trimmed.lastIndexOf('}')
    if (end < 0) return null
    for (let start = trimmed.indexOf('{'); start < end; start = trimmed.indexOf('{', start + 1)) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        /* 继续尝试下一个起点 */
      }
    }
    return null
  }
}

/**
 * 直跑一个业务流（独立子进程）。永远 resolve，不抛异常——
 * 失败信息通过返回值传递，调用方（定时任务）据此回执。
 */
export async function runFlow(flowId: string, options: RunFlowOptions = {}): Promise<FlowRunResult> {
  const started = Date.now()
  const id = String(flowId || '').trim()
  if (!id) {
    return { ok: false, flow: '', code: 'PARAM_MISSING', error: '缺少业务流 id', durationMs: 0 }
  }

  const { python, toolBox, moduleRoot, bundled, bootstrap } = resolveCliPaths()
  if (!existsSync(toolBox)) {
    return {
      ok: false,
      flow: id,
      code: 'DEPENDENCY_MISSING',
      error: `业务流引擎未就绪（缺少 ${toolBox}）`,
      durationMs: Date.now() - started,
    }
  }
  if (!bundled && !process.env.FLOWS_PYTHON) {
    // 内置 Python 缺失：仍尝试系统 python，但显式记录，便于排障
    console.warn('[flow-executor] 未找到内置 Python，回退宿主机 python 命令')
  }

  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const paramsJson = JSON.stringify(options.params ?? {})
  // 嵌入式 Python 为 isolated/safe_path 模式，必须经 _bootstrap.py 注入模块目录，否则 import 失败
  const args = bootstrap
    ? [bootstrap, toolBox, id, '--params', paramsJson, '--timeout', String(Math.floor(timeoutMs / 1000))]
    : [toolBox, id, '--params', paramsJson, '--timeout', String(Math.floor(timeoutMs / 1000))]

  return new Promise<FlowRunResult>((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let child: ReturnType<typeof spawn>

    const finish = (result: FlowRunResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    try {
      child = spawn(python, args, {
        cwd: moduleRoot,
        env: buildCliEnv(moduleRoot),
        windowsHide: true,
      })
    } catch (err) {
      finish({
        ok: false,
        flow: id,
        code: 'PYTHON_MISSING',
        error: `无法启动 Python（${python}）: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - started,
      })
      return
    }

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* 忽略 */
      }
      finish({
        ok: false,
        flow: id,
        code: 'FLOW_TIMEOUT',
        error: `业务流执行超时（${Math.round(timeoutMs / 1000)}s）`,
        durationMs: Date.now() - started,
      })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
      if (stdout.length > 8 * 1024 * 1024) {
        try {
          child.kill()
        } catch {
          /* 忽略 */
        }
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    child.on('error', (err: Error) => {
      finish({
        ok: false,
        flow: id,
        code: 'PYTHON_MISSING',
        error: `Python 进程错误: ${err.message}`,
        durationMs: Date.now() - started,
      })
    })
    child.on('close', () => {
      const parsed = parseJsonOutput(stdout)
      const durationMs = Date.now() - started
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>
        const ok = obj.ok === true
        finish({
          ok,
          flow: typeof obj.flow === 'string' ? obj.flow : id,
          code: typeof obj.code === 'string' ? obj.code : undefined,
          error: ok ? undefined : typeof obj.error === 'string' ? obj.error : '业务流执行失败',
          data: obj.data ?? obj.result ?? undefined,
          steps: obj.steps,
          durationMs,
        })
        return
      }
      // 无结构化输出：把 stderr 摘要带回去
      const detail = (stderr || stdout).trim().slice(0, 500)
      finish({
        ok: false,
        flow: id,
        code: 'FLOW_FAILED',
        error: detail ? `业务流无有效输出: ${detail}` : '业务流无有效输出',
        durationMs,
      })
    })
  })
}

/**
 * 列出全部业务流元数据（CLI 方式，供定时任务「执行方式=业务流」下拉选择）。
 * 失败返回空数组（渲染层降级为只显示「AI 编排」）。
 */
export async function listFlows(): Promise<FlowMeta[]> {
  const { python, toolBox, moduleRoot, bootstrap } = resolveCliPaths()
  if (!existsSync(toolBox)) return []
  return new Promise<FlowMeta[]>((resolve) => {
    let stdout = ''
    let settled = false
    const finish = (rows: FlowMeta[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(rows)
    }
    let child: ReturnType<typeof spawn>
    try {
      const listArgs = bootstrap ? [bootstrap, toolBox, '--list'] : [toolBox, '--list']
      child = spawn(python, listArgs, {
        cwd: moduleRoot,
        env: buildCliEnv(moduleRoot),
        windowsHide: true,
      })
    } catch {
      finish([])
      return
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* 忽略 */
      }
      finish([])
    }, 30_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.on('error', () => finish([]))
    child.on('close', () => {
      const parsed = parseJsonOutput(stdout)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rows = Object.entries(parsed as Record<string, Record<string, unknown>>).map(([id, meta]) => ({
          id,
          title: typeof meta.title === 'string' ? meta.title : id,
          role: typeof meta.role === 'string' ? meta.role : undefined,
          risk: typeof meta.risk === 'string' ? meta.risk : undefined,
          trigger: typeof meta.trigger === 'string' ? meta.trigger : undefined,
          params: (meta.params as Record<string, string>) ?? undefined,
          steps: (meta.steps as string[]) ?? undefined,
          produces: typeof meta.produces === 'string' ? meta.produces : undefined,
        }))
        finish(rows)
        return
      }
      finish([])
    })
  })
}
