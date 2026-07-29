// 积分余额显示 - v0.3.1 共享组件 Task 3
// 带数字滚动动画 + 低余额闪烁
import { useEffect, useRef, useState } from 'react'
import styles from './styles.module.css'

export interface CreditDisplayProps {
  value: number
  lowThreshold?: number
  size?: 'default' | 'large'
  showUnit?: boolean
}

const ANIMATION_DURATION = 500

export default function CreditDisplay({
  value,
  lowThreshold = 100,
  size = 'default',
  showUnit = true
}: CreditDisplayProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const displayedRef = useRef(value)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const from = displayedRef.current
    const to = value
    if (from === to) {
      return () => {}
    }
    startRef.current = null
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = from + (to - from) * eased
      setDisplayValue(current)
      displayedRef.current = current
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setDisplayValue(to)
        displayedRef.current = to
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [value])

  const isLow = value < lowThreshold
  const sizeClass = size === 'large' ? styles.large : styles.default
  const lowClass = isLow ? 'animate-low-balance' : ''
  const color = isLow ? 'var(--color-error)' : 'var(--color-primary)'
  const rounded = Math.round(displayValue)

  return (
    <span className={`${styles.wrap} ${sizeClass} ${lowClass}`}>
      <span className={styles.number} style={{ color }}>
        {rounded.toLocaleString()}
      </span>
      {showUnit && <span className={styles.unit}>积分</span>}
    </span>
  )
}
