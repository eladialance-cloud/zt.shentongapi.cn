// 积分 store - 本地缓存积分余额
//
// 设计依据：Task 6.5
// - 状态：balance / frozenBalance / totalRecharged / totalConsumed
// - 方法：fetchBalance() / updateBalance(partial)
// - 监听 wsClient 'credits:updated' 事件，自动更新余额
// - persist 到 localStorage（只读缓存，便于离线展示）

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { wsClient } from '@/api/ws-client'
import { getBalance } from '@/api/credits-api'
import type { CreditAccount } from '@/types/credits'

interface CreditsState extends CreditAccount {
  /** 是否已加载过余额 */
  loaded: boolean
  /** 拉取余额（GET /credits/balance） */
  fetchBalance: () => Promise<void>
  /** 局部更新余额（来自 WS 推送） */
  updateBalance: (partial: Partial<CreditAccount>) => void
  /** 重置（登出时调用） */
  reset: () => void
}

const INITIAL: CreditAccount = {
  balance: 0,
  frozenBalance: 0,
  totalRecharged: 0,
  totalConsumed: 0
}

export const useCreditsStore = create<CreditsState>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      loaded: false,

      fetchBalance: async () => {
        try {
          const data = await getBalance()
          set({
            balance: data.balance,
            frozenBalance: data.frozenBalance,
            totalRecharged: data.totalRecharged,
            totalConsumed: data.totalConsumed,
            loaded: true
          })
        } catch (err) {
          console.error('[credits-store] fetch balance failed:', err)
        }
      },

      updateBalance: (partial) => {
        set((state) => ({ ...state, ...partial, loaded: true }))
      },

      reset: () => set({ ...INITIAL, loaded: false })
    }),
    {
      name: 'credits-cache',
      // 只读缓存余额字段，不持久化方法
      partialize: (state) => ({
        balance: state.balance,
        frozenBalance: state.frozenBalance,
        totalRecharged: state.totalRecharged,
        totalConsumed: state.totalConsumed,
        loaded: state.loaded
      })
    }
  )
)

/**
 * 监听 WebSocket 'credits:updated' 推送，自动更新本地余额缓存。
 * 推送负载预期为 Partial<CreditAccount>（至少包含 balance/frozenBalance 之一）。
 * 在模块加载时注册一次（幂等）。
 */
let wsListenerBound = false
export function bindCreditsWsListener(): void {
  if (wsListenerBound) return
  wsListenerBound = true
  const handler = (...args: unknown[]) => {
    const payload = args[0] as Partial<CreditAccount> | undefined
    if (payload && typeof payload === 'object') {
      useCreditsStore.getState().updateBalance(payload)
    } else {
      // 推送未携带详情，主动拉取一次
      void useCreditsStore.getState().fetchBalance()
    }
  }
  wsClient.on('credits:updated', handler)
}

// 模块加载即注册监听（确保 WS 推送始终被捕获）
bindCreditsWsListener()
