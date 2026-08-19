// 待审核操作流卡片：展示待审核发布计划（最多 5 条），支持 查看/通过/打回
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Modal, Tag, message } from 'antd'
import type { PublishPlan } from '@/types/channel'
import { reviewPlan } from '@/api/channel-api'
import { filterPendingReview } from './cards'
import styles from './styles.module.css'

const MODE_META: Record<string, { label: string; color: string }> = {
  manual: { label: '手动', color: 'default' },
  scheduled: { label: '定时', color: 'blue' },
  auto: { label: '自动', color: 'purple' },
}

function formatSubmitTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const m = d.getMonth() + 1
  const day = d.getDate()
  const h = d.getHours()
  const min = d.getMinutes()
  return m + '月' + day + '日 ' + (h < 10 ? '0' + h : String(h)) + ':' + (min < 10 ? '0' + min : String(min))
}

interface ReviewQueueProps {
  plans: PublishPlan[]
  onChanged: () => void
}

export default function ReviewQueue({ plans, onChanged }: ReviewQueueProps) {
  const navigate = useNavigate()
  const [rejectTarget, setRejectTarget] = useState<PublishPlan | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const list = filterPendingReview(plans, 5)

  const approve = async (plan: PublishPlan) => {
    try {
      await reviewPlan(plan.id, { approved: true })
      message.success('审核已通过')
      onChanged()
    } catch (err) {
      message.error('操作失败: ' + (err as Error).message)
    }
  }

  const openReject = (plan: PublishPlan) => {
    setRejectTarget(plan)
    setComment('')
  }

  const reject = async () => {
    if (!rejectTarget) return
    setSubmitting(true)
    try {
      await reviewPlan(rejectTarget.id, {
        approved: false,
        comment: comment.trim() || '审核不通过',
      })
      message.success('已打回')
      setRejectTarget(null)
      onChanged()
    } catch (err) {
      message.error('操作失败: ' + (err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>
        <span>待审核</span>
        <span
          className={styles.cardMore}
          onClick={() => navigate('/publish')}
          role="button"
          tabIndex={0}
        >
          查看全部
        </span>
      </h3>
      {list.length === 0 ? (
        <div className={styles.emptyHint}>暂无待审核发布，去发起需求对话吧</div>
      ) : (
        <div className={styles.reviewList}>
          {list.map((plan) => {
            const mode = MODE_META[plan.mode] ?? { label: plan.mode, color: 'default' }
            return (
              <div key={plan.id} className={styles.reviewRow}>
                <div className={styles.reviewInfo}>
                  <div className={styles.reviewTitle}>{plan.title}</div>
                  <div className={styles.reviewMeta}>
                    <Tag color={mode.color}>{mode.label}</Tag>
                    <span className={styles.reviewTime}>{formatSubmitTime(plan.createdAt)}</span>
                  </div>
                </div>
                <div className={styles.reviewActions}>
                  <Button size="small" onClick={() => navigate('/publish')}>
                    查看
                  </Button>
                  <Button size="small" type="primary" onClick={() => void approve(plan)}>
                    通过
                  </Button>
                  <Button size="small" danger onClick={() => openReject(plan)}>
                    打回
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <Modal
        title="打回发布计划"
        open={rejectTarget != null}
        onOk={() => void reject()}
        onCancel={() => setRejectTarget(null)}
        confirmLoading={submitting}
        okButtonProps={{ disabled: comment.trim() === '' }}
        okText="打回"
        cancelText="取消"
        destroyOnClose
      >
        <p style={{ marginBottom: 12 }}>
          打回「{rejectTarget?.title ?? ''}」，请输入评语：
        </p>
        <Input.TextArea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="评语将随计划退回给提交人（必填）"
          maxLength={500}
          showCount
        />
      </Modal>
    </section>
  )
}
