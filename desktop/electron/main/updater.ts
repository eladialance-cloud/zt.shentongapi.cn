// 自动更新模块 - 基于 electron-updater
// 生产环境启用，开发环境跳过（autoUpdater 在未打包时会抛错）
// 支持：强制更新拦截 / 灰度命中判断 / 下载进度推送 / 自动安装重启

import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { UpdateStatusPayload } from '../shared/types'

const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://update.shentong.ai/desktop/'

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

    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_SERVER_URL, channel: 'latest' })
    } catch (err) {
      console.error('[updater] setFeedURL failed:', err)
    }

    this.sendStatus({ status: 'checking', forceUpdate: false, grayscaleHit: false, progress: 0 })
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
      // Task 9.2：更新下载完成后清理旧的 userData/runtime/ 补丁
      // 新版本应用自带新的 resources/runtime/，下次启动 loadManifest() 会自动读取新的内置 manifest
      // 清理旧补丁避免使用过期的下载补丁
      try {
        const userDataPath = app.getPath('userData')
        const userDataRuntime = path.join(userDataPath, 'runtime')
        if (fs.existsSync(userDataRuntime)) {
          fs.rmSync(userDataRuntime, { recursive: true, force: true })
          console.log('[updater] Cleaned up old userData runtime patches after update')
        }
      } catch (err) {
        console.warn('[updater] Failed to clean up userData runtime:', err)
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
   */
  private isHitGrayscale(percent: number): boolean {
    if (percent <= 0) return true
    if (percent >= 100) return true
    const random = Math.floor(Math.random() * 100) + 1 // 1-100
    return random <= percent
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
