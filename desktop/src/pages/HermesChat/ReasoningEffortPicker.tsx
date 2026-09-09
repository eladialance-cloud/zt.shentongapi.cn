// 推理强度选择器（对齐上游 Chat/ReasoningEffortPicker.tsx：滑块版 Faster→Smarter）
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Brain, ChevronDown, HelpCircle } from 'lucide-react'
import { REASONING_EFFORTS, type ReasoningEffort } from './reasoningEffort'
import styles from './reasoningEffort.module.css'

export interface ReasoningEffortPickerProps {
  value: ReasoningEffort
  onChange: (value: ReasoningEffort) => void | Promise<void>
}

const OPTIONS = REASONING_EFFORTS

export const ReasoningEffortPicker = memo(function ReasoningEffortPicker({
  value,
  onChange,
}: ReasoningEffortPickerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const selectedIndex = useMemo(() => {
    const idx = OPTIONS.findIndex((option) => option.value === value)
    return idx === -1 ? 0 : idx
  }, [value])
  const selected = OPTIONS[selectedIndex]
  const fraction = OPTIONS.length > 1 ? selectedIndex / (OPTIONS.length - 1) : 0

  const lastIndexRef = useRef(selectedIndex)
  useEffect(() => {
    lastIndexRef.current = selectedIndex
  }, [selectedIndex])

  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(e: MouseEvent): void {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  async function select(next: ReasoningEffort): Promise<void> {
    try {
      await onChange(next)
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }

  function commit(index: number): void {
    const clamped = Math.min(OPTIONS.length - 1, Math.max(0, index))
    if (clamped === lastIndexRef.current) return
    lastIndexRef.current = clamped
    void select(OPTIONS[clamped].value)
  }

  function indexFromClientX(clientX: number): number {
    const track = trackRef.current
    if (!track) return selectedIndex
    const rect = track.getBoundingClientRect()
    const span = Math.max(1, rect.width - 18)
    const frac = Math.min(1, Math.max(0, (clientX - (rect.left + 9)) / span))
    return Math.round(frac * (OPTIONS.length - 1))
  }

  function handleTrackPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return
    e.preventDefault()
    trackRef.current?.focus()
    commit(indexFromClientX(e.clientX))
    const onMove = (ev: PointerEvent): void => commit(indexFromClientX(ev.clientX))
    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  function handleTrackKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    let next: number
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = selectedIndex - 1
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = selectedIndex + 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = OPTIONS.length - 1
    else return
    e.preventDefault()
    commit(next)
  }

  return (
    <div className={styles.bar} ref={pickerRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setSaveError(false)
          setIsOpen((open) => !open)
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="推理强度（reasoning effort）"
      >
        <Brain size={12} />
        <span className={styles.name}>{selected.label}</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <div
          className={styles.dropdown}
          aria-label="推理强度"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsOpen(false)
              setSaveError(false)
            }
          }}
        >
          <div className={styles.head}>
            <div className={styles.heading}>
              <span className={styles.label}>推理强度</span>
              <span className={styles.value}>{selected.label}</span>
            </div>
            <span className={styles.help} role="img" aria-label="拖动滑块，Faster → Smarter" title="拖动滑块，Faster → Smarter">
              <HelpCircle size={13} />
            </span>
          </div>

          <div
            ref={trackRef}
            className={styles.track}
            role="slider"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={OPTIONS.length - 1}
            aria-valuenow={selectedIndex}
            onPointerDown={handleTrackPointerDown}
            onKeyDown={handleTrackKeyDown}
            style={{ ['--effort-frac' as string]: String(fraction) }}
          >
            <span className={styles.rail} aria-hidden="true" />
            <span className={styles.railFill} aria-hidden="true" />
            {OPTIONS.map((option, index) => {
              const active = option.value === value
              return (
                <button
                  key={option.value}
                  className={[
                    styles.stop,
                    active ? styles.active : '',
                    index <= selectedIndex ? styles.passed : '',
                    index === OPTIONS.length - 1 ? styles.apex : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => commit(index)}
                  tabIndex={-1}
                  aria-hidden="true"
                  title={option.label}
                  type="button"
                >
                  <span className={styles.dot} aria-hidden="true" />
                </button>
              )
            })}
          </div>

          <div className={styles.ends} aria-hidden="true">
            <span>更快</span>
            <span>更聪明</span>
          </div>

          {saveError && (
            <div className={styles.error} role="alert">
              推理强度保存失败
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default ReasoningEffortPicker