// 本地加密库降级提示（安全审计 S-45）
//
// 背景：local-db 在缺 sqlcipher 原生模块（Windows 生产构建即如此）时会静默降级为「全部走云端」，
// 而渲染层既没读 db.initialize() 的返回值，也没监听 db:degraded —— 用户会以为数据存在本地加密库里。
// 本模块只做「接线」（读状态 + 弹提示）；判定交给 @shared/local-db-status 的纯函数，便于单测。
import { message } from 'antd'
import { localDbDegradedNotice, type LocalDbStatus } from '@shared/local-db-status'

/** 同一次会话只提示一次：登录后又走一遍 initialize 不再重复打扰 */
let notified = false

/** 读取主进程的本地库状态（非 Electron / 老版本 preload 一律返回 null） */
async function readLocalDbStatus(): Promise<LocalDbStatus | null> {
  try {
    const api = window.electronAPI?.db?.status
    if (typeof api !== 'function') return null
    return (await api()) ?? null
  } catch {
    return null
  }
}

/**
 * 本地加密库不可用时提示用户（每个会话至多一次）；返回本次是否真的提示了。
 * 调用点：应用启动自检、登录/注册后 db.initialize() 返回 false 时。
 */
export async function notifyLocalDbDegraded(): Promise<boolean> {
  if (notified) return false
  const status = await readLocalDbStatus()
  const notice = localDbDegradedNotice(status)
  if (!notice) return false
  notified = true
  message.warning(notice, 8)
  console.warn('[local-db] ' + notice + ' code=' + String(status?.code ?? ''))
  return true
}
