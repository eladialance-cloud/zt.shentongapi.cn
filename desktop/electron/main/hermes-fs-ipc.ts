// Hermes 对话 B/C 批：文件 / 目录 / 终端 / 最近上下文文件夹 的本地桌面 IPC
// 说明：深瞳侧主进程，供 HermesChat 的 WorktreePanel / FileViewer /
// RemoteFolderPicker / ContextFolderChip 使用。web 预览标注（inspect）暂为兜底。
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFile, readdir, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { spawn } from 'node:child_process'
import { getMainWindow } from './windows/main-window'
import { inspectWebPreview, cancelWebPreviewInspection } from './web-preview-inspector'
import { evaluateOpenPath, evaluateReadPath } from './policy/path-policy'
import { allowedRoots, grantRoot, pushRecentContextFolder, readContextFolders } from './services/allowed-roots'

// 允许根注册表见 services/allowed-roots.ts（与云端远程控制通道共用同一份事实，避免口径不一致被绕过）


function openTerminalInDirectory(dir: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (v: boolean): void => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const isWin = process.platform === 'win32'
    const cmd = isWin ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'x-terminal-emulator'
    const args = isWin
      ? ['/c', 'start', 'cmd.exe', '/K', `cd /d "${dir}"`]
      : process.platform === 'darwin'
        ? ['-a', 'Terminal', dir]
        : ['--working-directory', dir]
    try {
      const child = spawn(cmd, args, {
        cwd: dir,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      const timer = setTimeout(() => settle(true), 1000)
      timer.unref?.()
      child.once('error', () => settle(false))
      child.once('spawn', () => {
        child.unref()
        settle(true)
      })
    } catch {
      settle(false)
    }
  })
}

export function registerHermesFsIpc(): void {
  ipcMain.handle(
    'fs:read-file',
    async (
      _event,
      filePath: string,
      maxBytes?: number,
    ): Promise<{ content: string; truncated: boolean } | null> => {
      const decision = evaluateReadPath(filePath, allowedRoots())
      if (!decision.ok) {
        console.warn('[SECURITY] blocked fs:read-file (' + decision.reason + ')')
        return null
      }
      try {
        const limit = typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : 102400
        const buf = await readFile(decision.path)
        const truncated = buf.byteLength > limit
        return {
          content: truncated ? buf.subarray(0, limit).toString('utf-8') : buf.toString('utf-8'),
          truncated,
        }
      } catch {
        return null
      }
    },
  )

  ipcMain.handle(
    'fs:read-image-file',
    async (_event, filePath: string): Promise<string | null> => {
      const decision = evaluateReadPath(filePath, allowedRoots())
      if (!decision.ok) {
        console.warn('[SECURITY] blocked fs:read-image-file (' + decision.reason + ')')
        return null
      }
      try {
        const buf = await readFile(decision.path)
        const ext = extname(decision.path).toLowerCase().replace('.', '')
        const mime: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          webp: 'image/webp',
          svg: 'image/svg+xml',
          bmp: 'image/bmp',
          ico: 'image/x-icon',
        }
        return `data:${mime[ext] ?? 'application/octet-stream'};base64,${buf.toString('base64')}`
      } catch {
        return null
      }
    },
  )

  ipcMain.handle('fs:open-file-in-editor', async (_event, filePath: string): Promise<boolean> => {
    // S-03：修复前把渲染层传来的任意路径直接交给 shell.openPath ——
    // Windows 上打开 .exe/.bat/.lnk/.url 等价于本机代码执行，UNC 路径还会触发 SMB 认证外带。
    const decision = evaluateOpenPath(filePath, allowedRoots())
    if (!decision.ok) {
      console.warn('[SECURITY] blocked fs:open-file-in-editor (' + decision.reason + ')')
      return false
    }
    try {
      return (await shell.openPath(decision.path)) === ''
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:open-terminal', async (_event, dirPath: string): Promise<boolean> => {
    if (typeof dirPath !== 'string' || dirPath.trim().length === 0) return false
    // S-21：终端只允许在用户已授权的根目录内打开
    const decision = evaluateReadPath(dirPath, allowedRoots())
    if (!decision.ok) {
      console.warn('[SECURITY] blocked fs:open-terminal (' + decision.reason + ')')
      return false
    }
    try {
      const info = await stat(decision.path)
      if (!info.isDirectory()) return false
      return openTerminalInDirectory(decision.path)
    } catch {
      return false
    }
  })

  // 残留风险（已知并接受，见 spec 批次2）：目录**名称**列举仍不限定根目录 ——
  // RemoteFolderPicker 需要从 / 开始浏览整机以选择目录，该交互只暴露目录名、不暴露文件内容。
  // 内容类通道（read-file / read-image-file / open-file-in-editor / open-terminal）已全部限定允许根。
  ipcMain.handle(
    'fs:read-directory',
    async (
      _event,
      dirPath: string,
    ): Promise<{ name: string; isDirectory: boolean }[] | null> => {
      try {
        const entries = await readdir(dirPath, { withFileTypes: true })
        return entries
          .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
          .sort(
            (a, b) =>
              Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name),
          )
      } catch {
        return null
      }
    },
  )

  ipcMain.handle('fs:select-folder', async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    const opts: Electron.OpenDialogOptions = { properties: ['openDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return null
    // 通过原生对话框显式选择目录 = 最强授权信号，登记为本会话的允许根
    grantRoot(result.filePaths[0])
    return result.filePaths[0]
  })

  ipcMain.handle('fs:list-recent-context-folders', async (_event, limit?: number): Promise<string[]> => {
    const n = typeof limit === 'number' && limit > 0 ? limit : 20
    return readContextFolders().slice(0, n)
  })

  ipcMain.handle('fs:set-session-context-folder', async (_event, folder: string | null): Promise<boolean> => {
    if (folder) {
      grantRoot(folder)
      pushRecentContextFolder(folder)
    }
    return true
  })

  // Web 预览标注（inspect element）：向上游 guest webview 注入选择器取选区
  ipcMain.handle('web-preview-inspect', async (event, webContentsId: unknown) => {
    try {
      return await inspectWebPreview(event, webContentsId, getMainWindow)
    } catch (err) {
      console.warn('[web-preview] inspect 失败:', (err as Error).message)
      return null
    }
  })
  ipcMain.handle('web-preview-cancel-inspection', async (event, webContentsId: unknown) => {
    try {
      await cancelWebPreviewInspection(event, webContentsId, getMainWindow)
    } catch {
      /* ignore */
    }
  })
}