/** @file 定时任务守护服务（Windows 计划任务）
 *
 * 对标 RRClaw：把「关客户端也能跑定时任务」做成独立于客户端的常驻进程。
 * 做法：注册一个 Windows 计划任务，登录时以 `--shentong-cron-daemon` 参数拉起主程序
 * （该模式不建窗口/托盘，只跑主进程定时引擎），客户端完全退出也继续执行。
 *
 * 说明：
 *  - 仅打包环境可用（开发环境 execPath 是 electron.exe，注册无意义）；
 *  - 计划任务默认 `/SC ONLOGON`（登录即起）+ `/RL LIMITED`（普通权限，不需要管理员）；
 *  - 任务名保持 ASCII，避免 schtasks 在不同代码页下中文乱码；
 *  - 依赖注入 exec：便于单测，不真正调用 schtasks。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Windows 计划任务名（ASCII，避免代码页问题） */
export const CRON_TASK_NAME = 'ShentongCronEngine'
/** 主程序识别该参数进入「静默定时守护」模式（不建窗口/托盘） */
export const CRON_DAEMON_FLAG = '--shentong-cron-daemon'

export interface CronServiceStatus {
  /** 平台是否支持（仅 win32） */
  supported: boolean
  /** 是否已注册计划任务 */
  installed: boolean
  /** 任务是否正在运行 */
  running: boolean
  /** 注册时使用的主程序路径 */
  command: string | null
  /** 失败原因（查询失败时） */
  error?: string
}

export type ExecLike = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

export interface CronServiceDeps {
  /** 主程序可执行文件路径（打包后 process.execPath） */
  execPath: string
  /** 是否打包环境（未打包不允许注册） */
  isPackaged: boolean
  /** 平台（默认 process.platform） */
  platform?: NodeJS.Platform
  /** 注入执行器（默认 child_process.execFile） */
  exec?: ExecLike
  /** 日志器 */
  logger?: { info: (m: string) => void; warn: (m: string) => void }
}

/** 构造计划任务的 /TR 命令行：`"<exe>" --shentong-cron-daemon` */
export function buildTaskCommand(execPath: string): string {
  return `"${execPath}" ${CRON_DAEMON_FLAG}`
}

/** 构造 `schtasks /Create` 参数 */
export function buildCreateArgs(name: string, execPath: string): string[] {
  return [
    '/Create',
    '/TN', name,
    '/TR', buildTaskCommand(execPath),
    '/SC', 'ONLOGON',
    '/RL', 'LIMITED',
    '/F',
  ]
}

/** 构造 `schtasks /Delete` 参数 */
export function buildDeleteArgs(name: string): string[] {
  return ['/Delete', '/TN', name, '/F']
}

/** 构造 `schtasks /Query` 参数 */
export function buildQueryArgs(name: string): string[] {
  return ['/Query', '/TN', name, '/FO', 'LIST', '/V']
}

/** 从 schtasks 查询输出解析「是否正在运行」（不依赖中文，容错英文/中文） */
export function parseTaskRunning(stdout: string): boolean {
  if (!stdout) return false
  // 英文 "Status: Running" / 中文 "状态: 正在运行"（GBK 环境下可能乱码，故双判）
  return /Running|正在运行/i.test(stdout)
}

function defaultExec(): ExecLike {
  return async (file, args) => {
    const r = await execFileAsync(file, args, { windowsHide: true, encoding: 'utf8', timeout: 20000 })
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }
}

export class CronService {
  private readonly exec: ExecLike
  private readonly platform: NodeJS.Platform
  private readonly log: NonNullable<CronServiceDeps['logger']>

  constructor(private readonly deps: CronServiceDeps) {
    this.exec = deps.exec ?? defaultExec()
    this.platform = deps.platform ?? process.platform
    this.log = deps.logger ?? { info: (m) => console.log('[cron-service] ' + m), warn: (m) => console.warn('[cron-service] ' + m) }
  }

  /** 查询计划任务状态 */
  async status(): Promise<CronServiceStatus> {
    if (this.platform !== 'win32') {
      return { supported: false, installed: false, running: false, command: null }
    }
    try {
      const { stdout } = await this.exec('schtasks', buildQueryArgs(CRON_TASK_NAME))
      return {
        supported: true,
        installed: true,
        running: parseTaskRunning(stdout),
        command: this.extractCommand(stdout),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 任务不存在 → schtasks 非 0 退出（正常情况，不算错误）
      if (/cannot find|找不到|ERROR: The system cannot find|no such/i.test(msg)) {
        return { supported: true, installed: false, running: false, command: null }
      }
      return { supported: true, installed: false, running: false, command: null, error: msg.slice(0, 300) }
    }
  }

  /** 注册计划任务（登录时以守护模式拉起主程序） */
  async install(): Promise<{ ok: boolean; error?: string; status?: CronServiceStatus }> {
    if (this.platform !== 'win32') {
      return { ok: false, error: '仅支持 Windows 平台' }
    }
    if (!this.deps.isPackaged) {
      return { ok: false, error: '开发环境不可注册计划任务（请使用安装版客户端）' }
    }
    try {
      await this.exec('schtasks', buildCreateArgs(CRON_TASK_NAME, this.deps.execPath))
      this.log.info('计划任务已注册：' + CRON_TASK_NAME)
      return { ok: true, status: await this.status() }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.log.warn('注册计划任务失败: ' + msg)
      return { ok: false, error: msg.slice(0, 300) }
    }
  }

  /** 删除计划任务 */
  async uninstall(): Promise<{ ok: boolean; error?: string; status?: CronServiceStatus }> {
    if (this.platform !== 'win32') {
      return { ok: false, error: '仅支持 Windows 平台' }
    }
    try {
      await this.exec('schtasks', buildDeleteArgs(CRON_TASK_NAME))
      this.log.info('计划任务已删除：' + CRON_TASK_NAME)
      return { ok: true, status: await this.status() }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 本就不存在 → 视为成功（幂等）
      if (/cannot find|找不到|no such/i.test(msg)) {
        return { ok: true, status: await this.status() }
      }
      this.log.warn('删除计划任务失败: ' + msg)
      return { ok: false, error: msg.slice(0, 300) }
    }
  }

  /** 解析查询输出中的「要运行的任务」命令行 */
  private extractCommand(stdout: string): string | null {
    const m = stdout.match(/(?:Task To Run|要运行的任务)\s*:\s*(.+)/i)
    return m ? m[1].trim() : null
  }
}

export function createCronService(deps: CronServiceDeps): CronService {
  return new CronService(deps)
}
