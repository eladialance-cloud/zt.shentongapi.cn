// 计费徽标组件
// 显示积分消耗和余额：
//   助手消息底部：💎 本次消耗: X 积分 · 余额: Y
//   工具调用后：✅ 执行完成 (0.8s · 2积分)
// 流式过程中不显示，完成后显示

import { useEffect, useState } from 'react'
import { wsClient } from '@/api/ws-client'
import styles from '../styles.module.css'

interface CreditsBadgeProps {
  /** 本次消耗积分 */
  cost: number
  /** 当前余额（可选，未提供则从 ws 推送获取） */
  balance?: number
  /** 是否为低余额（用于样式切换） */
  variant?: 'default' | 'low'
}

/** 从 ws 推送维护的余额（模块级单例） */
let cachedBalance: number | null = null

/** 监听 ws credits:updated 事件，更新余额缓存 */
function subscribeBalanceUpdate(onUpdate: (balance: number) => void): () => void {
  const handler = (...args: unknown[]) => {
    const data = args[0] as { balance?: number } | undefined
    if (data && typeof data.balance === 'number') {
      cachedBalance = data.balance
      onUpdate(data.balance)
    }
  }
  wsClient.on('credits:updated', handler)
  return () => wsClient.off('credits:updated', handler)
}

export function CreditsBadge({ cost, balance, variant }: CreditsBadgeProps) {
  const [liveBalance, setLiveBalance] = useState<number | null>(
    balance ?? cachedBalance ?? null
  )

  useEffect(() => {
    if (balance != null) {
      setLiveBalance(balance)
      return
    }
    const unsubscribe = subscribeBalanceUpdate((b) => setLiveBalance(b))
    return unsubscribe
  }, [balance])

  const isLow = variant === 'low' || (liveBalance != null && liveBalance < 10)

  return (
    <span
      className={`${styles.creditsBadge} ${isLow ? styles.creditsBadgeLow : ''}`}
      title="本次对话积分消耗"
    >
      💎 本次消耗: {cost} 积分
      {liveBalance != null && <> · 余额: {liveBalance}</>}
    </span>
  )
}

export default CreditsBadge
