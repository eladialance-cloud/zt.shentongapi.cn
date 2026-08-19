// 进行中任务进度卡：GET /tasks/unified 进行中任务（最多 3 条）→ 点击跳任务中心
import { useNavigate } from 'react-router-dom'
import { Tag } from 'antd'
import type { UnifiedTaskItem } from '@/api/task-api'
import { filterInProgress } from './cards'
import styles from './styles.module.css'

const SOURCE_META: Record<string, { label: string; color: string }> = {
  team: { label: '团队', color: 'blue' },
  task: { label: '任务', color: 'gold' },
  hermes: { label: 'Hermes', color: 'purple' },
}

function formatStartTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '--'
  const h = d.getHours()
  const m = d.getMinutes()
  return (h < 10 ? '0' + h : String(h)) + ':' + (m < 10 ? '0' + m : String(m))
}

interface TaskProgressProps {
  tasks: UnifiedTaskItem[]
}

export default function TaskProgress({ tasks }: TaskProgressProps) {
  const navigate = useNavigate()
  const list = filterInProgress(tasks, 3)

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>
        <span>进行中任务</span>
        <span
          className={styles.cardMore}
          onClick={() => navigate('/task-center')}
          role="button"
          tabIndex={0}
        >
          查看全部
        </span>
      </h3>
      {list.length === 0 ? (
        <div className={styles.emptyHint}>暂无进行中任务，去发起新任务吧</div>
      ) : (
        <div className={styles.taskProgList}>
          {list.map((task) => {
            const src = SOURCE_META[task.source] ?? { label: task.source, color: 'default' }
            return (
              <div
                key={task.source + ':' + task.sourceId}
                className={styles.taskProgRow}
                onClick={() => navigate('/task-center')}
                role="button"
                tabIndex={0}
              >
                <div className={styles.taskProgHead}>
                  <span className={styles.taskProgTitle}>{task.title}</span>
                  <Tag color={src.color}>{src.label}</Tag>
                </div>
                <div className={styles.taskProgBar}>
                  <span className={styles.taskProgFill} />
                </div>
                <div className={styles.taskProgFoot}>
                  <span className={styles.taskProgTime}>开始于 {formatStartTime(task.createdAt)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
