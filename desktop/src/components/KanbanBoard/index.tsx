// 看板 - v0.3.1 共享组件 Task 3
// 4 列看板：todo/doing/review/done，HTML5 拖拽
import { useMemo, useState } from 'react'
import styles from './styles.module.css'

export interface KanbanItem {
  id: string
  title: string
  description?: string
  assignee?: string
  priority?: 'low' | 'medium' | 'high'
}

export interface KanbanColumn {
  key: string
  title: string
}

export interface KanbanBoardProps {
  items: KanbanItem[]
  onDrop?: (itemId: string, fromColumn: string, toColumn: string) => void
  columns?: KanbanColumn[]
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { key: 'todo', title: '待办' },
  { key: 'doing', title: '进行中' },
  { key: 'review', title: '审核中' },
  { key: 'done', title: '已完成' }
]

const PRIORITY_BORDER: Record<'low' | 'medium' | 'high', string> = {
  low: 'var(--color-text-quaternary)',
  medium: 'var(--color-warning)',
  high: 'var(--color-error)'
}

const PRIORITY_STYLE: Record<'low' | 'medium' | 'high', string> = {
  low: styles.priorityLow,
  medium: styles.priorityMedium,
  high: styles.priorityHigh
}

const PRIORITY_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: '低',
  medium: '中',
  high: '高'
}

function inferColumn(id: string, fallback: string): string {
  const dashIndex = id.indexOf('-')
  if (dashIndex > 0) {
    return id.slice(0, dashIndex)
  }
  return fallback
}

export default function KanbanBoard({
  items,
  onDrop,
  columns = DEFAULT_COLUMNS
}: KanbanBoardProps) {
  const [localOverrides, setLocalOverrides] = useState<Record<string, string>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  const columnMap = useMemo<Record<string, string>>(() => {
    const defaultColumn = columns[0]?.key ?? 'todo'
    const map: Record<string, string> = {}
    for (const item of items) {
      map[item.id] = localOverrides[item.id] ?? inferColumn(item.id, defaultColumn)
    }
    return map
  }, [items, columns, localOverrides])

  const itemsByColumn = (columnKey: string): KanbanItem[] =>
    items.filter((it) => columnMap[it.id] === columnKey)

  return (
    <div className={styles.board}>
      {columns.map((col) => {
        const colItems = itemsByColumn(col.key)
        const isOver = dragOverColumn === col.key
        return (
          <div
            key={col.key}
            className={`${styles.column} ${isOver ? styles.columnOver : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragOverColumn !== col.key) setDragOverColumn(col.key)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOverColumn(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const itemId =
                e.dataTransfer.getData('text/plain') || draggingId
              if (!itemId) return
              const fromColumn = columnMap[itemId]
              if (fromColumn && fromColumn !== col.key) {
                setLocalOverrides((prev) => ({ ...prev, [itemId]: col.key }))
                onDrop?.(itemId, fromColumn, col.key)
              }
              setDraggingId(null)
              setDragOverColumn(null)
            }}
          >
            <div className={styles.columnHeader}>
              <span className={styles.columnTitle}>{col.title}</span>
              <span className={styles.columnCount}>{colItems.length}</span>
            </div>
            <div className={styles.cardList}>
              {colItems.map((item) => {
                const priority = item.priority
                const borderColor = priority
                  ? PRIORITY_BORDER[priority]
                  : 'transparent'
                const priorityClassName = priority
                  ? PRIORITY_STYLE[priority]
                  : ''
                return (
                  <div
                    key={item.id}
                    className={`${styles.card} ${
                      draggingId === item.id ? styles.dragging : ''
                    }`}
                    style={{ borderLeftColor: borderColor }}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(item.id)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', item.id)
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDragOverColumn(null)
                    }}
                  >
                    <div className={styles.cardTitle}>{item.title}</div>
                    {item.description && (
                      <div className={styles.cardDesc}>{item.description}</div>
                    )}
                    <div className={styles.cardFooter}>
                      {item.assignee && (
                        <span className={styles.assignee}>{item.assignee}</span>
                      )}
                      {priority && (
                        <span
                          className={`${styles.priority} ${priorityClassName}`}
                        >
                          {PRIORITY_LABEL[priority]}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
