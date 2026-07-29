// Electron 涓昏繘绋嬪叆鍙?
// 淇 Windows PATH锛堝繀椤诲湪浠讳綍鍏朵粬妯″潡涔嬪墠鎵ц锛?import { fixWindowsPath } from './fix-path'
fixWindowsPath()

import { app, BrowserWindow, ipcMain, session, dialog } from 'electron'
import log from 'electron-log'

// ========== ELECTRON_RUN_AS_NODE 鐜鍙橀噺妫€娴?==========
// 褰撶郴缁熺幆澧冨彉閲忎腑娈嬬暀 ELECTRON_RUN_AS_NODE=1 鏃讹紝Electron 浠ョ函 Node.js 妯″紡杩愯锛?// require('electron') 灏嗗洖閫€鍒版枃浠剁郴缁熸煡鎵?node_modules/electron锛?// 瀵艰嚧 "Electron failed to install correctly" 閿欒銆?// 姝ゅ鍦ㄦ渶鏃╂湡妫€娴嬪苟缁欏嚭涓枃鎻愮ず锛岄伩鍏嶇敤鎴风湅鍒伴毦浠ョ悊瑙ｇ殑鑻辨枃鎶ラ敊銆?if (process.env.ELECTRON_RUN_AS_NODE) {
  try {
    log.error('[main] ELECTRON_RUN_AS_NODE environment variable detected, exiting')
  } catch {
    // log 鍙兘灏氭湭鍒濆鍖栵紝蹇界暐
  }
  dialog.showErrorBox(
    '鍚姩澶辫触',
    '妫€娴嬪埌 ELECTRON_RUN_AS_NODE 鐜鍙橀噺锛屽簲鐢ㄦ棤娉曟甯稿惎鍔ㄣ€俓n\n璇峰垹闄よ鐜鍙橀噺鍚庨噸璇曘€俓n璁剧疆浣嶇疆锛氱郴缁熷睘鎬?鈫?鐜鍙橀噺'
  )
  app.exit(1)
}
// ========== ELECTRON_RUN_AS_NODE 妫€娴嬬粨鏉?==========

import { createMainWindow, getMainWindow, setQuitting } from './windows/main-window'
import { createTray, destroyTray } from './tray'
import { ServiceManager, setHermesLlmProxyKey } from './service-manager'
import { AppUpdater } from './updater'
import { getDeviceFingerprint } from './device'
import { localDb } from './local-db'
import { getOrCreateSalt, deriveDbKey } from './local-db/crypto'
import { verifyAll, verifyIntegrity, loadManifest } from './runtime-resolver'
import { download as downloadRuntime, cancelDownload } from './runtime-downloader'
import { getRemoteControlManager } from './remote-control'
import { setCredential, getCredential, deleteCredential } from './services/credential-store'
import type {
  ServiceName,
  SyncQueueItem,
  SyncQueueRow,
  RuntimeUpdateInfo,
  RuntimeUpdateResult,
  RemoteControlPlatform,
  RemoteControlSettings,
  RemoteControlStatus
} from '../shared/types'

const serviceManager = new ServiceManager()
const isDev = !app.isPackaged
let appUpdater: AppUpdater | null = null
// 閫€鍑烘祦绋嬫爣璁帮細闃叉 before-quit 閲嶅叆锛坅pp.quit() 浼氬啀娆¤Е鍙?before-quit锛?let isQuitting = false

// ========== 鍏ㄥ眬閿欒澶勭悊锛圚-01 淇锛?=========
function setupGlobalErrorHandler(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    log.error('[unhandledRejection]', reason)
  })

  process.on('uncaughtException', (err: Error) => {
    log.error('[uncaughtException]', err.stack || err.message)
    if (app.isReady()) {
      dialog.showErrorBox('搴旂敤鍙戠敓涓ラ噸閿欒', `${err.message}\n\n鏃ュ織宸茶褰曪紝搴旂敤灏嗛€€鍑恒€俙)
    }
    app.exit(1)
  })
}
setupGlobalErrorHandler()
// ========== 鍏ㄥ眬閿欒澶勭悊缁撴潫 ==========

// 鍗曞疄渚嬮攣 - 闃叉澶氬紑
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.shentong.ai')

    // Content-Security-Policy锛氶檺鍒舵覆鏌撹繘绋嬭祫婧愬姞杞芥潵婧愶紝闃?XSS/娉ㄥ叆
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // H-15 淇锛歝onnect-src / media-src 鏀剁揣鍒扮敓浜х櫧鍚嶅崟锛屽紑鍙戞ā寮忎繚鐣欐湰鍦扮鍙?      // K11 fix: 鐢熶骇鐜鍏佽鎵€鏈?https/wss 杩炴帴锛岄伩鍏嶅悗绔煙鍚嶅彉鏇村鑷?WebSocket/API 琚樆鏂?      const connectSrc = isDev
        ? "'self' http://localhost:* ws://localhost:*"
        : "'self' https: wss:"
      const mediaSrc = isDev
        ? "'self' https:"
        : "'self' https:"
      // dev 妯″紡鏀惧 script-src锛氬厑璁?React HMR preamble inline script 鎵ц
      //锛堜笌 electron.vite.config.ts 鐨?dev-csp-unsafe-inline 鎻掍欢淇濇寔涓€鑷达級
      // production 淇濇寔 'self' 涓ユ牸绛栫暐
      const scriptSrc = isDev
        ? "'self' 'unsafe-inline'"
        : "'self'"
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            `script-src ${scriptSrc}; ` +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https:; " +
            `connect-src ${connectSrc}; ` +
            "font-src 'self' data:; " +
            `media-src ${mediaSrc}; ` +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self'; " +
            "frame-ancestors 'none'"
          ]
        }
      })
    })

    const mainWindow = createMainWindow(serviceManager, isDev)
    createTray(mainWindow, serviceManager)
    // 鑷姩鏇存柊锛氬惎鍔ㄦ椂瀹炰緥鍖栧苟妫€鏌ユ洿鏂帮紙Task 35.3锛?    appUpdater = new AppUpdater(mainWindow)
    appUpdater.checkForUpdates()
    registerIpcHandlers()

    // 鍒濆鍖栬繙绋嬫帶鍒剁鐞嗗櫒锛堝崟渚嬶紝Task 14锛?    // 娉ㄥ叆鏈湴鐘舵€佹煡璇㈡彁渚涜€?+ 杩炴帴閰嶇疆锛坉eviceId 鏉ヨ嚜璁惧鎸囩汗锛?    // 娉ㄦ剰锛氭澶勪笉涓诲姩杩炴帴锛屼粎鍦ㄧ敤鎴峰惎鐢ㄦ€诲紑鍏冲悗鎵嶈繛鎺?WebSocket
    const remoteControlManager = getRemoteControlManager()
    remoteControlManager.setStatusProvider(() => serviceManager.getAllStatus())

    // 娉ㄥ叆 authToken / apiBase 鎻愪緵鑰咃紝渚?executeRunWorkflow / executeStopTask 璋冪敤鐪熷疄鍚庣 API
    // token 浠?SafeStorage 鍔犲瘑瀛樺偍璇诲彇锛堜笌妗岄潰绔?auth.ts credential:set('accessToken', ...) 鍐欏叆浣嶇疆涓€鑷达級
    // 鏈櫥褰曟垨鏈寔涔呭寲鏃惰繑鍥?null锛孯emoteControl 鑷姩闄嶇骇鍒?simulated 妯″紡
    remoteControlManager.setAuthTokenProvider(async () => {
      try {
        return getCredential('accessToken')
      } catch (err) {
        log.error('[main] authTokenProvider read failed:', err)
        return null
      }
    })
    remoteControlManager.setApiBaseProvider(async () => getApiBase())

    void getDeviceFingerprint()
      .then((fp) => {
        remoteControlManager.setConfig({
          serverUrl: getRemoteControlServerUrl(),
          // TODO: 浜戠缃戝叧閴存潈鏂规纭畾鍚庯紝鐢辩櫥褰曟祦绋嬫敞鍏ョ湡瀹?token
          //       鐩墠璇诲彇鐜鍙橀噺 VITE_REMOTE_CONTROL_TOKEN锛屾湭閰嶇疆鍒欎负绌?          token: process.env.VITE_REMOTE_CONTROL_TOKEN || '',
          deviceId: fp.fingerprint
        })
      })
      .catch((err) => {
        console.error('[main] init remote control config failed:', err)
      })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(serviceManager, isDev)
      }
    })
  })

  // 搴旂敤閫€鍑哄墠鏍囪锛屽厑璁哥獥鍙ｇ湡姝ｅ叧闂?  // 淇锛氱瓑寰?stopAll() 瀹屾垚鍚庡啀閫€鍑猴紝閬垮厤涓㈠純 Promise 瀵艰嚧瀛愯繘绋嬫畫鐣?绔彛鍗犵敤
  // stopAll 鈫?stop 鍐呴儴鏈?5s SIGKILL 鍏滃簳锛屼笉浼氬崱姝?  // 浣跨敤 isQuitting 闃叉閲嶅叆锛歛pp.quit() 浼氬啀娆¤Е鍙?before-quit
  app.on('before-quit', async (event) => {
    if (!isQuitting) {
      event.preventDefault()
      isQuitting = true
      setQuitting(true)
      try {
        await serviceManager.stopAll()
      } catch (e) {
        console.error('stopAll error:', e)
      }
      // 娓呯悊杩滅▼鎺у埗 WebSocket 闀胯繛鎺ワ紙Task 14锛?      try {
        getRemoteControlManager().destroy()
      } catch (e) {
        console.error('remote control destroy error:', e)
      }
      app.quit()
    }
  })

  app.on('will-quit', () => {
    destroyTray()
  })
}

// 涓荤獥鍙ｅ叏閮ㄥ叧闂椂涓嶉€€鍑猴紙鏈€灏忓寲鍒版墭鐩橈級锛宮acOS 鏍囧噯琛屼负
app.on('window-all-closed', () => {
  // 鐢辨墭鐩?+ close 鎷︽埅澶勭悊锛岃繖閲屼笉鍋氶€€鍑?})

/** 娉ㄥ唽 IPC 澶勭悊鍣?*/
function registerIpcHandlers(): void {
  // 鏈嶅姟绠＄悊
  ipcMain.handle('service:getStatus', () => serviceManager.getAllStatus())
  ipcMain.handle('service:status', (_event, name: ServiceName) =>
    serviceManager.getInfo(name)
  )
  ipcMain.handle('service:list', () => serviceManager.getAllInfo())
  ipcMain.handle('service:start', (event, name: ServiceName) => {
    if (event.sender !== getMainWindow()?.webContents) return
    return serviceManager.start(name)
  })
  ipcMain.handle('service:stop', (event, name: ServiceName) => {
    if (event.sender !== getMainWindow()?.webContents) return
    return serviceManager.stop(name)
  })
  ipcMain.handle('service:restart', (_event, name: ServiceName) => serviceManager.restart(name))
  ipcMain.handle('service:checkEnv', () => serviceManager.checkEnvironment())
  ipcMain.handle('service:install', (event, name: ServiceName) => {
    if (event.sender !== getMainWindow()?.webContents) return
    return serviceManager.install(name)
  })

  // 鏈嶅姟鐘舵€佸彉鏇?鈫?杞彂鍒版覆鏌撹繘绋?  serviceManager.on('status-changed', (name: ServiceName, status: string, info: unknown) => {
    const payload = { name, status, info }
    getMainWindow()?.webContents.send('service:status-changed', payload)
  })
  // 鏈嶅姟閿欒浜嬩欢 鈫?杞彂鍒版覆鏌撹繘绋?  serviceManager.on('service-error', (payload: unknown) => {
    getMainWindow()?.webContents.send('service:error', payload)
  })

  // 搴旂敤淇℃伅涓庢洿鏂?  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:checkUpdate', () => {
    appUpdater?.checkForUpdates()
    return Promise.resolve()
  })
  ipcMain.handle('app:quitAndInstall', () => {
    appUpdater?.installUpdate()
    return Promise.resolve()
  })

  // 鑷姩鏇存柊锛圱ask 35.3锛? update:status 涓轰富杩涚▼涓诲姩鎺ㄩ€侊紝鏃犻渶 handle
  ipcMain.handle('update:check', () => {
    appUpdater?.checkForUpdates()
    return Promise.resolve()
  })
  ipcMain.handle('update:download', () => {
    appUpdater?.downloadUpdate()
    return Promise.resolve()
  })
  ipcMain.handle('update:install', () => {
    appUpdater?.installUpdate()
    return Promise.resolve()
  })

  // 璁惧鎸囩汗锛堣繑鍥炴寚绾瑰搱甯屽瓧绗︿覆锛屼繚鎸?preload 濂戠害 Promise<string>锛?  ipcMain.handle('device:getFingerprint', async () => (await getDeviceFingerprint()).fingerprint)

  // 绐楀彛鎺у埗
  ipcMain.on('window:minimize', () => getMainWindow()?.minimize())
  ipcMain.on('window:maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => getMainWindow()?.close())

  // 鏈湴鏁版嵁搴擄紙SQLCipher 鍔犲瘑锛?  // 鐧诲綍鍚庤皟鐢細浣跨敤 userId + dbSecret锛堢ǔ瀹氫笉鍙橀噺锛? salt 娲剧敓瀵嗛挜
  // userId/dbSecret 鍧囦笉闅?token 鍒锋柊鍙樺寲锛岀‘淇濇棫鏁版嵁濮嬬粓鍙В瀵?  // TODO: 鍚庣 /auth/login 涓?/auth/register 鍝嶅簲闇€杩斿洖 dbSecret 瀛楁锛堥暱鏈熺敤鎴风骇瀵嗛挜锛夛紱
  //       鍦ㄥ悗绔湭涓嬪彂鍓嶏紝dbSecret 涓虹┖灏嗗湪姝ゆ姤閿欏苟杩涘叆闄嶇骇妯″紡
  ipcMain.handle('db:initialize', async (event, userId: string, dbSecret: string): Promise<boolean> => {
    if (event.sender !== getMainWindow()?.webContents) return false
    try {
      if (!userId) {
        console.error('[ipc] db:initialize: userId 涓虹┖')
        return false
      }
      if (!dbSecret) {
        // 鍚庣灏氭湭涓嬪彂 dbSecret 鏃剁粰鍑烘竻鏅伴敊璇紝杩涘叆闄嶇骇妯″紡
        console.error('[ipc] db:initialize: dbSecret 涓虹┖ 鈥?鍚庣闇€鍦ㄧ櫥褰?娉ㄥ唽鍝嶅簲涓繑鍥?dbSecret')
        return false
      }
      const salt = getOrCreateSalt()
      const key = deriveDbKey(userId, dbSecret, salt)
      await localDb.initialize(key)
      return !localDb.isDegraded()
    } catch (err) {
      console.error('[ipc] db:initialize failed:', err)
      return false
    }
  })

  // 鍚屾鏌ヨ闄嶇骇鐘舵€侊紙娓叉煋杩涚▼閫氳繃 sendSync 璋冪敤锛?  ipcMain.on('db:isDegraded', (event) => {
    event.returnValue = localDb.isDegraded()
  })

  // 鐧诲嚭鏃跺叧闂暟鎹簱锛坒ire-and-forget锛?  ipcMain.on('db:close', () => {
    localDb.close()
  })

  // 闄嶇骇浜嬩欢杞彂鍒版覆鏌撹繘绋嬶紝鐢卞叾鏄剧ず鎻愮ず骞跺洖閫€鍒颁簯绔?API
  localDb.on('db:degraded', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[ipc] db:degraded forwarded to renderer:', message)
    getMainWindow()?.webContents.send('db:degraded', { message })
  })

  // ===== 鍚屾闃熷垪鎿嶄綔锛堢绾胯皟鐢ㄩ槦鍒?+ 涓婅鍚屾锛?=====
  // 闄嶇骇妯″紡涓嬭繑鍥炵┖缁撴灉锛屾覆鏌撹繘绋嬫嵁姝よ蛋浜戠 API

  ipcMain.handle('syncQueue:enqueue', async (_event, item: SyncQueueItem): Promise<number> => {
    if (localDb.isDegraded()) return -1
    try {
      const result = await localDb.run(
        `INSERT INTO local_sync_queue (client_txn_id, entity_type, entity_id, operation, payload, status, retry_count)
         VALUES (?, ?, ?, ?, ?, 'pending', 0)`,
        [item.client_txn_id, item.entity_type, item.entity_id, item.operation, JSON.stringify(item.payload)]
      )
      return result.lastID
    } catch (err) {
      console.error('[ipc] syncQueue:enqueue failed:', err)
      return -1
    }
  })

  ipcMain.handle('syncQueue:getPending', async (_event, limit: number): Promise<SyncQueueRow[]> => {
    if (localDb.isDegraded()) return []
    try {
      const rows = await localDb.all<SyncQueueRow>(
        `SELECT * FROM local_sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
        [limit]
      )
      // payload 瀛楁鍙嶅簭鍒楀寲
      return rows.map((row) => ({
        ...row,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
      }))
    } catch (err) {
      console.error('[ipc] syncQueue:getPending failed:', err)
      return []
    }
  })

  ipcMain.handle(
    'syncQueue:getByStatus',
    async (_event, status: 'pending' | 'synced' | 'failed'): Promise<SyncQueueRow[]> => {
      if (localDb.isDegraded()) return []
      try {
        const rows = await localDb.all<SyncQueueRow>(
          `SELECT * FROM local_sync_queue WHERE status = ? ORDER BY created_at ASC`,
          [status]
        )
        // payload 瀛楁鍙嶅簭鍒楀寲
        return rows.map((row) => ({
          ...row,
          payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
        }))
      } catch (err) {
        console.error('[ipc] syncQueue:getByStatus failed:', err)
        return []
      }
    }
  )

  ipcMain.handle(
    'syncQueue:updateStatus',
    async (_event, id: number, status: 'synced' | 'failed' | 'pending', retryCount: number, errorMessage?: string): Promise<void> => {
      if (localDb.isDegraded()) return
      try {
        const syncedAt = status === 'synced' ? new Date().toISOString() : null
        await localDb.run(
          `UPDATE local_sync_queue SET status = ?, retry_count = ?, error_message = ?, synced_at = COALESCE(?, synced_at) WHERE id = ?`,
          [status, retryCount, errorMessage ?? null, syncedAt, id]
        )
      } catch (err) {
        console.error('[ipc] syncQueue:updateStatus failed:', err)
      }
    }
  )

  ipcMain.handle('syncQueue:exists', async (_event, client_txn_id: string): Promise<boolean> => {
    if (localDb.isDegraded()) return false
    try {
      const row = await localDb.get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM local_sync_queue WHERE client_txn_id = ?`,
        [client_txn_id]
      )
      return (row?.c ?? 0) > 0
    } catch (err) {
      console.error('[ipc] syncQueue:exists failed:', err)
      return false
    }
  })

  // ===== 杩愯鏃舵牎楠屼笌涓嬭浇锛圱ask 8 - 鍐呯疆鏈湴鏈嶅姟杩愯鏃讹級 =====

  // 鏍￠獙鎵€鏈夋湇鍔¤繍琛屾椂瀹屾暣鎬э紙SHA-256锛?  ipcMain.handle('runtime:verify', async () => {
    const results = await verifyAll()
    return { results, allPassed: Object.values(results).every(Boolean) }
  })

  // 鏍￠獙鍗曚釜鏈嶅姟杩愯鏃跺畬鏁存€?  ipcMain.handle('runtime:verify-one', async (_event, name: ServiceName) => {
    return await verifyIntegrity(name)
  })

  // 閫氳繃 npm 鍏ㄥ眬瀹夎鏈嶅姟杩愯鏃讹紙鍚繘搴︽帹閫侊級
  ipcMain.handle('runtime:download', async (event, name: ServiceName) => {
    if (event.sender !== getMainWindow()?.webContents) return
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await downloadRuntime(name, (progress) => {
      win?.webContents.send('runtime:download-progress', {
        name,
        ...progress
      })
    })
    return result
  })

  // 鍙栨秷姝ｅ湪杩涜鐨?npm 瀹夎锛坘ill 瀛愯繘绋嬶級
  ipcMain.handle('runtime:cancel-download', async (_event, name: ServiceName) => {
    cancelDownload(name)
    return true
  })

  // runtime:check-update 鈥?妫€鏌ュ紩鎿庣儹鏇存柊锛圱ask 3.2锛?  // 璋冪敤鍚庣 /api/runtime/check-update 鑾峰彇鍚勫紩鎿庢渶鏂扮増鏈紝涓庢湰鍦?manifest 姣斿锛岃繑鍥為渶鏇存柊鐨勫紩鎿庡垪琛?  ipcMain.handle('runtime:check-update', async (event): Promise<RuntimeUpdateResult> => {
    if (event.sender !== getMainWindow()?.webContents) return { updates: {}, upToDate: true }
    const emptyResult: RuntimeUpdateResult = { updates: {}, upToDate: true }
    try {
      // 1. 璇诲彇鏈湴 manifest锛坲serData 琛ヤ竵浼樺厛锛屽洖閫€鍐呯疆锛夆€斺€?澶嶇敤 runtime-resolver.loadManifest
      const localManifest = loadManifest()
      if (!localManifest) {
        // 鏈湴 manifest 璇诲彇澶辫触锛屾棤娉曟瘮瀵癸紝杩斿洖绌虹粨鏋?        return { ...emptyResult, error: '鏈湴 manifest 涓嶅彲璇? }
      }

      // 2. 璋冪敤鍚庣鎺ュ彛鑾峰彇杩滅▼鐗堟湰
      const platform = getPlatformKey()
      const apiBase = getApiBase()
      const response = await fetch(
        `${apiBase}/api/runtime/check-update?platform=${encodeURIComponent(platform)}`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!response.ok) {
        return { ...emptyResult, error: `鍚庣杩斿洖 ${response.status}` }
      }
      const remoteVersions = (await response.json()) as Record<string, RuntimeUpdateInfo | null>

      // 3. 姣斿鐗堟湰锛岃繑鍥為渶鏇存柊鐨勫紩鎿庡垪琛?      const updates: Record<string, RuntimeUpdateInfo> = {}
      let upToDate = true
      for (const [service, remote] of Object.entries(remoteVersions)) {
        if (!remote) continue
        const localVersion = localManifest.services[service as ServiceName]?.version
        if (!localVersion || compareVersion(localVersion, remote.version) < 0) {
          updates[service] = remote
          upToDate = false
        }
      }
      return { updates, upToDate }
    } catch (err) {
      // 缃戠粶澶辫触/瓒呮椂/瑙ｆ瀽閿欒 鈫?杩斿洖绌虹粨鏋?+ error锛屼笉鎶涘紓甯?      return { ...emptyResult, error: (err as Error).message }
    }
  })

  // ===== 杩滅▼鎺у埗锛圱ask 14 - Feishu/WeCom IM 杩滅▼浠诲姟娲惧彂锛?=====
  const remoteControl = getRemoteControlManager()

  // 鑾峰彇杩炴帴鐘舵€?  ipcMain.handle('remoteControl:getStatus', async (): Promise<RemoteControlStatus> => {
    return remoteControl.getStatus()
  })

  // 缁戝畾 IM 骞冲彴锛堜繚瀛?webhook URL锛?  ipcMain.handle(
    'remoteControl:bind',
    async (
      event,
      platform: RemoteControlPlatform,
      config: { webhookUrl: string }
    ): Promise<boolean> => {
      if (event.sender !== getMainWindow()?.webContents) return false
      return remoteControl.bind(platform, config.webhookUrl)
    }
  )

  // 瑙ｇ粦 IM 骞冲彴
  ipcMain.handle(
    'remoteControl:unbind',
    async (event, platform: RemoteControlPlatform): Promise<void> => {
      if (event.sender !== getMainWindow()?.webContents) return
      remoteControl.unbind(platform)
    }
  )

  // 鍚敤杩滅▼鎺у埗锛堣繛鎺?WebSocket锛?  ipcMain.handle('remoteControl:enable', async (event): Promise<void> => {
    if (event.sender !== getMainWindow()?.webContents) return
    remoteControl.updateSettings({ enabled: true })
  })

  // 绂佺敤杩滅▼鎺у埗锛堟柇寮€ WebSocket锛?  ipcMain.handle('remoteControl:disable', async (event): Promise<void> => {
    if (event.sender !== getMainWindow()?.webContents) return
    remoteControl.updateSettings({ enabled: false })
  })

  // 鏇存柊杩滅▼鎺у埗璁剧疆锛堝畨鍏ㄧ瓑绾?/ 鐧藉悕鍗?/ 缁戝畾绛夛級
  ipcMain.handle(
    'remoteControl:updateSettings',
    async (event, settings: RemoteControlSettings): Promise<void> => {
      if (event.sender !== getMainWindow()?.webContents) return
      remoteControl.updateSettings(settings)
    }
  )

  // 璇诲彇褰撳墠杩滅▼鎺у埗璁剧疆
  ipcMain.handle('remoteControl:getSettings', async (): Promise<RemoteControlSettings> => {
    return remoteControl.getSettings()
  })

  // 鍛戒护鎵ц缁撴灉杞彂鐢?RemoteControlManager 鐩存帴 webContents.send锛?  // 杩欓噷鏃犻渶娉ㄥ唽 handler锛坥nCommandResult 鍦?preload 涓洃鍚?'remoteControl:command-result'锛?
  // ========== H-03 鍑嵁鍔犲瘑瀛樺偍 IPC ==========
  ipcMain.handle('credential:set', (_e, key: string, value: string) => {
    setCredential(key, value)
  })

  ipcMain.handle('credential:get', (_e, key: string) => {
    return getCredential(key)
  })

  ipcMain.handle('credential:delete', (_e, key: string) => {
    deleteCredential(key)
  })

  // ========== 璁よ瘉淇℃伅鏌ヨ IPC锛堜緵 RemoteControl 璋冪敤鐪熷疄鍚庣 API锛?==========
  // token 浼樺厛浠?SafeStorage 鍔犲瘑瀛樺偍璇诲彇锛堜笌妗岄潰绔?auth.ts 閫氳繃 credential:set 鎸佷箙鍖栫殑 key 涓€鑷达級
  // 娓叉煋杩涚▼鐧诲綍鍚庤皟鐢?window.electronAPI.credential.set('accessToken', token) 鍗冲彲璁╀富杩涚▼鎷垮埌 token
  ipcMain.handle('auth:getToken', async (): Promise<string | null> => {
    try {
      return getCredential('accessToken')
    } catch (err) {
      log.error('[ipc] auth:getToken failed:', err)
      return null
    }
  })

  ipcMain.handle('auth:getApiBase', async (): Promise<string> => {
    return getApiBase()
  })

  // ========== Hermes Agent LLM Proxy Key IPC锛圱ask 5.3锛?=========
  // 娓叉煋杩涚▼娉ㄥ叆 LLM 浠ｇ悊瀵嗛挜锛屼富杩涚▼鍐呭瓨鎸佷箙鍖栵紝渚涙湰鍦?Hermes Agent锛?27.0.0.1:8642锛変唬鐞嗚浆鍙?LLM 璇锋眰
  ipcMain.handle('hermes:set-llm-proxy-key', (_e, key: string) => {
    setHermesLlmProxyKey(key)
    return true
  })
}

/** 鑾峰彇褰撳墠骞冲彴鏍囪瘑锛坵in32-x64 / darwin-arm64 绛夛級 */
function getPlatformKey(): string {
  return `${process.platform}-${process.arch}`
}

/** 鑾峰彇鍚庣 API base URL锛堜紭鍏?VITE_API_BASE_URL 鐜鍙橀噺锛屽洖閫€榛樿鐢熶骇鍦板潃锛? *  杩斿洖鍊间笉鍚?/api 鍚庣紑锛岃皟鐢ㄦ柟闇€鑷鎷兼帴 ${apiBase}/api/... 璺緞
 */
function getApiBase(): string {
  return process.env.VITE_API_BASE_URL || 'https://zt.shentongapi.cn'
}

/** 鑾峰彇杩滅▼鎺у埗浜戠缃戝叧 WebSocket URL锛坵ss:// 鎴?ws://锛? *  浼樺厛璇诲彇 VITE_REMOTE_CONTROL_WS_URL锛屽惁鍒欏熀浜?API base 娲剧敓 /ws/remote
 */
function getRemoteControlServerUrl(): string {
  if (process.env.VITE_REMOTE_CONTROL_WS_URL) {
    return process.env.VITE_REMOTE_CONTROL_WS_URL
  }
  // 鍩轰簬 API base 娲剧敓榛樿 WebSocket 鍦板潃
  const apiBase = getApiBase()
  return apiBase.replace(/^http/u, 'ws') + '/ws/remote'
}

/** 绠€鍗?semver 姣旇緝锛歛 < b 杩斿洖 -1锛岀浉绛夎繑鍥?0锛宎 > b 杩斿洖 1 */
function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0
    const vb = pb[i] || 0
    if (va < vb) return -1
    if (va > vb) return 1
  }
  return 0
}
