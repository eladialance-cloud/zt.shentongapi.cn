// 系统状态 store — 管理后端可用性等全局状态
//
// http-client 在网络错误时调用 setBackendOffline()，
// 各页面组件可通过 useSystemStore 检查后端状态，
// 避免后端不可用时每个页面都弹出重复的 error toast。

import { create } from 'zustand'

interface SystemState {
  /** 后端是否可用 */
  backendAvailable: boolean
  /** 后端是否正在检查中 */
  checkingBackend: boolean
  /** 上次后端错误时间戳（用于去重 toast） */
  lastOfflineAt: number

  /** 标记后端离线 */
  setBackendOffline: () => void
  /** 标记后端在线 */
  setBackendOnline: () => void
  /** 设置检查中状态 */
  setChecking: (checking: boolean) => void
}

export const useSystemStore = create<SystemState>((set) => ({
  backendAvailable: true,
  checkingBackend: true,
  lastOfflineAt: 0,

  setBackendOffline: () =>
    set({ backendAvailable: false, lastOfflineAt: Date.now() }),
  setBackendOnline: () =>
    set({ backendAvailable: true }),
  setChecking: (checking) =>
    set({ checkingBackend: checking }),
}))
