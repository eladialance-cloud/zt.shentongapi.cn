// 自动更新模块 - 基于 electron-updater
// 生产环境启用，开发环境跳过（autoUpdater 在未打包时会抛错）
// 支持：强制更新拦截 / 灰度命中判断 / 下载进度推送 / 自动安装重启

import { app, BrowserWindow, dialog, session } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { isStrictUpdateMode, verifyLatestYml } from './policy/update-manifest'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { UpdateStatusPayload } from '../shared/types'

const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://zt.shentongapi.cn/desktop/'

/**
 * electron-updater 6.x 使用独立 session（partition 名固定为 "electron-updater"，
 * 见其 out/electronHttpExecutor.js 的 NET_SESSION_NAME）—— 更新请求本来就不走 defaultSession。
 * 因此代理只在更新 session 上设置（S-01 问题 2：原实现在 defaultSession 上设 direct://，会全局生效，
 * 把渲染层 fetch / 本地 Hermes 调用的代理与 TLS 检测一起绕掉）。
 */
const UPDATER_SESSION_PARTITION = 'electron-updater'
/** 平台对应的发布清单名（electron-builder generic provider 约定） */
const UPDATE_MANIFEST_NAME =
  process.platform === 'darwin' ? 'latest-mac.yml' : process.platform === 'linux' ? 'latest-linux.yml' : 'latest.yml'

/** UpdateInfo 扩展字段（服务端通过 latest.yml 下发） */
interface UpdateInfoExtension extends UpdateInfo {
  forceUpdate?: boolean
  grayscalePercent?: number
}

/**
 * 自动更新管理器
 *
 * - autoDownload = false，需用户确认后下载（强制更新除外）
 * - autoInstallOnAppQuit = false，仅通过显式 installUpdate() 安装
 * - 强制更新：模态对话框阻断用户操作，单按钮"立即更新"，下载完成后自动安装重启
 * - 灰度发布：从 UpdateInfo.grayscalePercent 字段判断当前客户端是否命中灰度
 */
export class AppUpdater {
  private mainWindow: BrowserWindow | null = null
  private forceUpdateFlag = false
  private lastUpdateInfo: UpdateInfoExtension | null = null
  /** 更新专用 session（代理只在这里生效，不污染 defaultSession） */
  private readonly updaterSession = session.fromPartition(UPDATER_SESSION_PARTITION, { cache: false })

  constructor(window: BrowserWindow) {
    this.mainWindow = window
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    this.setupEvents()
  }

  /** 检查更新（启动时 / 手动触发） */
  checkForUpdates(): void {
    if (!app.isPackaged) {
      this.sendStatus({
        status: 'not-available',
        forceUpdate: false,
        grayscaleHit: false,
        progress: 0,
        message: '开发环境不检查更新'
      })
      return
    }
    void this.runCheckForUpdates()
  }

  /**
   * 真实检查流程：配置更新 session → 校验发布清单签名 → 交给 electron-updater。
   * 验签不通过直接停下（S-01）：宁可不更新，也不装来源不明的包。
   */
  private async runCheckForUpdates(): Promise<void> {
    await this.configureUpdaterSession()

    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_SERVER_URL, channel: 'latest' })
    } catch (err) {
      console.error('[updater] setFeedURL failed:', err)
    }

    this.sendStatus({ status: 'checking', forceUpdate: false, grayscaleHit: false, progress: 0 })

    const signature = await this.verifyReleaseSignature()
    if (!signature.ok) {
      this.sendStatus({
        status: 'error',
        forceUpdate: false,
        grayscaleHit: false,
        progress: 0,
        message: signature.message
      })
      return
    }

    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] checkForUpdates failed:', err)
      this.sendStatus({
        status: 'error',
        forceUpdate: false,
        grayscaleHit: false,
        progress: 0,
        message: err instanceof Error ? err.message : String(err)
      })
    })
  }

  /** 代理只作用于更新 session；默认直连（沿用旧行为，但不再全局生效） */
  private async configureUpdaterSession(): Promise<void> {
    try {
      if (process.env.UPDATE_USE_SYSTEM_PROXY === '1') {
        await this.updaterSession.setProxy({ mode: 'system' })
      } else {
        await this.updaterSession.setProxy({ proxyRules: 'direct://' })
      }
    } catch (err) {
      console.warn('[updater] updater session setProxy failed:', err)
    }
  }

  /**
   * 校验 latest.yml 的 Ed25519 签名（S-01）。
   * - 严格模式（默认）且配置了 ST_UPDATE_PUBKEY：验签失败 → 拒绝更新；
   * - 显式 ST_UPDATE_ALLOW_UNSIGNED=1：跳过验签并告警（灰度过渡态）；
   * - 未配置公钥：按「签名尚未启用」放行并打 error 级日志（否则会直接断掉全部更新）。
   */
  private async verifyReleaseSignature(): Promise<{ ok: boolean; message?: string }> {
    const publicKey = (process.env.ST_UPDATE_PUBKEY || '').trim()
    if (!isStrictUpdateMode(process.env)) {
      console.warn('[updater] ST_UPDATE_ALLOW_UNSIGNED=1：跳过 latest.yml 验签（过渡态，请尽快配置发布签名）')
      return { ok: true }
    }
    if (!publicKey) {
      console.error('[updater] 未配置 ST_UPDATE_PUBKEY，无法校验发布清单签名；本次按「签名未启用」放行，请尽快配置发布公钥')
      return { ok: true }
    }
    const base = UPDATE_SERVER_URL.endsWith('/') ? UPDATE_SERVER_URL : UPDATE_SERVER_URL + '/'
    try {
      // 用更新 session 自己的 fetch：代理设置只作用于这条请求链（Electron 41 起 session.fetch 可用）
      const manifestRes = await this.updaterSession.fetch(base + UPDATE_MANIFEST_NAME)
      if (!manifestRes.ok) {
        return { ok: false, message: '获取 ' + UPDATE_MANIFEST_NAME + ' 失败（HTTP ' + manifestRes.status + '）' }
      }
      const payload = Buffer.from(await manifestRes.arrayBuffer())
      const sigRes = await this.updaterSession.fetch(base + UPDATE_MANIFEST_NAME + '.sig')
      if (!sigRes.ok) {
        return { ok: false, message: '获取 ' + UPDATE_MANIFEST_NAME + '.sig 失败（HTTP ' + sigRes.status + '）；请在服务端先产出签名清单' }
      }
      const signature = await sigRes.text()
      const result = verifyLatestYml(payload, signature, publicKey)
      if (!result.ok) {
        console.error('[updater] latest.yml 验签失败: ' + result.reason)
        return { ok: false, message: '发布清单验签失败（' + result.reason + '），已中止更新检查' }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, message: '验签请求异常: ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  /** 触发下载更新 */
  downloadUpdate(): void {
    if (!this.lastUpdateInfo) return
    autoUpdater
      .downloadUpdate()
      .catch((err) => {
        console.error('[updater] downloadUpdate failed:', err)
        this.sendStatus({
          status: 'error',
          forceUpdate: this.forceUpdateFlag,
          grayscaleHit: true,
          progress: 0,
          message: err instanceof Error ? err.message : String(err)
        })
      })
  }

  /** 退出并安装更新 */
  installUpdate(): void {
    autoUpdater.quitAndInstall()
  }

  /** 是否处于强制更新拦截状态 */
  isForceUpdate(): boolean {
    return this.forceUpdateFlag
  }

  // ===== 内部方法 =====

  private setupEvents(): void {
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      const ext = info as UpdateInfoExtension
      this.lastUpdateInfo = ext

      const force = ext.forceUpdate === true
      const percent = typeof ext.grayscalePercent === 'number' ? ext.grayscalePercent : 0
      const hit = this.isHitGrayscale(percent)
      this.forceUpdateFlag = force

      const releaseNotes = typeof ext.releaseNotes === 'string' ? ext.releaseNotes : ''

      // 强制更新：无视灰度，必须更新，模态对话框拦截
      if (force) {
        this.sendStatus({
          status: 'available',
          version: ext.version,
          releaseNotes,
          forceUpdate: true,
          grayscaleHit: true,
          grayscalePercent: percent,
          progress: 0
        })
        this.showForceUpdateDialog()
        return
      }

      // 灰度未命中：不展示更新，仅通知渲染进程
      if (percent > 0 && !hit) {
        this.sendStatus({
          status: 'not-available',
          version: ext.version,
          forceUpdate: false,
          grayscaleHit: false,
          grayscalePercent: percent,
          progress: 0,
          message: '未命中灰度发布，暂不提供更新'
        })
        return
      }

      // 命中灰度或无灰度：正常提示
      this.sendStatus({
        status: 'available',
        version: ext.version,
        releaseNotes,
        forceUpdate: false,
        grayscaleHit: hit,
        grayscalePercent: percent,
        progress: 0
      })
      this.showNormalUpdateDialog(ext)
    })

    autoUpdater.on('update-not-available', () => {
      this.sendStatus({ status: 'not-available', forceUpdate: false, grayscaleHit: false, progress: 0 })
    })

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.floor(progress.percent ?? 0)
      // 任务栏进度条
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setProgressBar(percent / 100)
      }
      this.sendStatus({
        status: 'downloading',
        version: this.lastUpdateInfo?.version,
        forceUpdate: this.forceUpdateFlag,
        grayscaleHit: true,
        progress: percent
      })
    })

    autoUpdater.on('update-downloaded', () => {
      // Task 9.2：更新后仅清理运行时下载残留（.tmp 断点续传临时文件）
      // 已下载安装的服务运行时（hermes/n8n/video-claw）保留，
      // 避免用户每次升级后都需要重新下载数百 MB 运行时。
      try {
        const userDataPath = app.getPath('userData')
        const userDataRuntime = path.join(userDataPath, 'runtime')
        const tmpDir = path.join(userDataRuntime, '.tmp')
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true })
          console.log('[updater] Cleaned up runtime download temp files after update')
        }
      } catch (err) {
        console.warn('[updater] Failed to clean up runtime temp files:', err)
      }

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setProgressBar(-1)
      }
      this.sendStatus({
        status: 'downloaded',
        version: this.lastUpdateInfo?.version,
        forceUpdate: this.forceUpdateFlag,
        grayscaleHit: true,
        progress: 100
      })

      // 强制更新：自动安装重启，不再询问
      if (this.forceUpdateFlag) {
        autoUpdater.quitAndInstall()
        return
      }
      // 非强制：询问是否立即安装
      this.showInstallDialog()
    })

    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err)
      this.sendStatus({
        status: 'error',
        forceUpdate: this.forceUpdateFlag,
        grayscaleHit: true,
        progress: 0,
        message: err instanceof Error ? err.message : String(err)
      })
    })
  }

  /**
   * 灰度命中判断：客户端生成 0-100 随机数，<= grayscalePercent 则命中
   * - percent <= 0：无灰度，全员可更新
   * - percent >= 100：全量发布
   * - 结果持久化到 userData/update-grayscale.json，避免每次检查更新时重新随机
   */
  private getGrayscaleFile(): string {
    return path.join(app.getPath('userData'), 'update-grayscale.json')
  }

  /** 读取持久化的灰度命中记录 */
  private loadGrayscaleResult(): {
    version?: string
    percent?: number
    hit?: boolean
  } | null {
    try {
      const filePath = this.getGrayscaleFile()
      if (!fs.existsSync(filePath)) return null
      const raw = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      console.warn('[updater] loadGrayscaleResult failed:', err)
      return null
    }
  }

  /** 持久化灰度命中结果 */
  private saveGrayscaleResult(version: string, percent: number, hit: boolean): void {
    try {
      const filePath = this.getGrayscaleFile()
      fs.writeFileSync(filePath, JSON.stringify({ version, percent, hit }, null, 2), {
        mode: 0o600
      })
    } catch (err) {
      console.warn('[updater] saveGrayscaleResult failed:', err)
    }
  }

  private isHitGrayscale(percent: number): boolean {
    if (percent <= 0) return true
    if (percent >= 100) return true

    // 先读取持久化的灰度结果
    const persisted = this.loadGrayscaleResult()
    const currentVersion = this.lastUpdateInfo?.version || ''

    // 如果持久化记录的 version 和 percent 与当前一致，直接复用已有结果
    if (
      persisted &&
      persisted.version === currentVersion &&
      persisted.percent === percent &&
      typeof persisted.hit === 'boolean'
    ) {
      console.log(`[updater] Reusing persisted grayscale result: hit=${persisted.hit}`)
      return persisted.hit
    }

    // 无持久化记录或版本/灰度比例已变更：重新随机并持久化
    const random = Math.floor(Math.random() * 100) + 1 // 1-100
    const hit = random <= percent
    this.saveGrayscaleResult(currentVersion, percent, hit)
    console.log(`[updater] New grayscale result: random=${random}, percent=${percent}, hit=${hit}`)
    return hit
  }

  /** 强制更新对话框（模态、不可关闭、单按钮，阻断用户操作） */
  private showForceUpdateDialog(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    dialog
      .showMessageBox(this.mainWindow, {
        type: 'warning',
        title: '必须更新',
        message: '检测到强制更新版本，必须更新才能继续使用。',
        buttons: ['立即更新'],
        noLink: true,
        cancelId: 0
      })
      .then(() => {
        this.downloadUpdate()
      })
  }

  /** 普通更新对话框 */
  private showNormalUpdateDialog(info: UpdateInfoExtension): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    dialog
      .showMessageBox(this.mainWindow, {
        type: 'info',
        title: '发现新版本',
        message: `发现新版本 ${info.version}，是否立即下载更新？`,
        buttons: ['立即下载', '稍后'],
        noLink: true,
        cancelId: 1
      })
      .then((result) => {
        if (result.response === 0) {
          this.downloadUpdate()
        }
      })
  }

  /** 下载完成后的安装询问对话框 */
  private showInstallDialog(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    dialog
      .showMessageBox(this.mainWindow, {
        type: 'info',
        title: '更新已下载',
        message: '更新已下载完成，是否立即重启应用以应用更新？',
        buttons: ['立即重启', '稍后'],
        noLink: true,
        cancelId: 1
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  }

  /** 推送更新状态到渲染进程 */
  private sendStatus(payload: UpdateStatusPayload): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update:status', payload)
    }
  }
}
