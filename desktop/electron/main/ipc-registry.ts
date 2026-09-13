// IPC 通道注册审计：主进程启动时挂钩 ipcMain，
// 记录所有被注册的通道，并与 shared/ipc-channels.ts 清单比对，
// 未登记的通道注册时输出错误日志（防拼写错误/未收口通道）。
//
// 用法：main/index.ts 顶部（首个 ipcMain 注册前）调用 installIpcRegistry()。

import { ipcMain } from 'electron'
import { isRegisteredIpcChannel } from '../shared/ipc-channels'
import { isHighRiskChannel, riskCategoryOf } from '../shared/ipc-risk'
import log from 'electron-log'

const registered = new Set<string>()
const highRiskRegistered = new Set<string>()
let installed = false

function track(channel: string, kind: string): void {
  if (typeof channel !== 'string' || !channel) return
  registered.add(channel)
  if (!isRegisteredIpcChannel(channel)) {
    log.error(`[ipc-registry] 未登记的 IPC 通道被注册: ${channel} (${kind}) —— 请将其加入 shared/ipc-channels.ts`)
  }
  // S-26：高风险通道（文件/命令/网络/凭据/安装）在注册时显式打点，
  // 便于在运行日志里核对「这些通道的参数是否真的过了 policy 层」。
  if (isHighRiskChannel(channel)) {
    highRiskRegistered.add(channel)
    log.warn(`[ipc-registry] 高风险通道已注册: ${channel} (${kind}, 类别=${riskCategoryOf(channel)})`)
  }
}

/**
 * 挂钩 ipcMain.handle / ipcMain.on，记录并校验通道清单。
 * 幂等：重复调用安全。挂钩失败不影响业务（try/catch 降级）。
 */
export function installIpcRegistry(): void {
  if (installed) return
  installed = true
  try {
    const origHandle = ipcMain.handle.bind(ipcMain)
    const origOn = ipcMain.on.bind(ipcMain)
    ;(ipcMain as any).handle = (channel: string, listener: (...args: any[]) => any) => {
      track(channel, 'handle')
      return origHandle(channel, listener)
    }
    ;(ipcMain as any).on = (channel: string, listener: (...args: any[]) => void) => {
      track(channel, 'on')
      return origOn(channel, listener)
    }
    log.info('[ipc-registry] IPC 通道审计挂钩已安装')
  } catch (err) {
    log.warn('[ipc-registry] 挂钩失败（不影响业务）: ' + (err as Error).message)
  }
}

/** 审计结果（供开发/CI 用） */
export function getIpcAudit(): {
  registered: number
  unknown: string[]
  highRisk: string[]
} {
  const unknown = [...registered].filter((c) => !isRegisteredIpcChannel(c))
  return {
    registered: registered.size,
    unknown,
    highRisk: [...highRiskRegistered].sort(),
  }
}
