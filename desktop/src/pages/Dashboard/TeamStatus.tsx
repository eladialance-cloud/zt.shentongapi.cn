// AI 团队状态卡：成员忙闲聚合 + 本周任务数 → 点击跳团队
import { useNavigate } from 'react-router-dom'
import type { TeamStatusRow } from './cards'
import styles from './styles.module.css'

interface TeamStatusProps {
  rows: TeamStatusRow[]
}

export default function TeamStatus({ rows }: TeamStatusProps) {
  const navigate = useNavigate()

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>
        <span>AI 团队状态</span>
        <span
          className={styles.cardMore}
          onClick={() => navigate('/team')}
          role="button"
          tabIndex={0}
        >
          查看全部
        </span>
      </h3>
      {rows.length === 0 ? (
        <div className={styles.emptyHint}>暂无团队，去创建你的 AI 团队吧</div>
      ) : (
        <div className={styles.teamList}>
          {rows.map((row) => (
            <div
              key={row.id}
              className={styles.teamRow}
              onClick={() => navigate('/team')}
              role="button"
              tabIndex={0}
            >
              <div className={styles.teamHead}>
                <span className={styles.teamName}>{row.name}</span>
                <span className={styles.teamWeek}>本周任务 {row.weekCount}</span>
              </div>
              <div className={styles.teamMeters}>
                <span className={styles.teamMeterItem}>
                  <i className={[styles.teamMeterDot, styles.busy].join(' ')} />
                  忙 {row.busy}
                </span>
                <span className={styles.teamMeterItem}>
                  <i className={[styles.teamMeterDot, styles.idle].join(' ')} />
                  闲 {row.idle}
                </span>
                <span className={styles.teamTotal}>共 {row.total} 人</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
