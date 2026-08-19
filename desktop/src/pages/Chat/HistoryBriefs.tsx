// 历史简报 Modal：列表（GET /briefs/history）+ 类型/状态筛选 Tab
// → 点击进详情（GET /briefs/:id）→「使用此简报」回填向导（只问差异点）。
// 注意：云端 briefs 暂无 type 字段，类型 Tab 按标题关键词启发式归类（与原型筛选对齐）。

import { useCallback, useEffect, useState } from 'react'
import { Button, Descriptions, Empty, Modal, Spin, Tabs, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import { getBrief, getBriefHistory } from '@/api/brief-api'
import type { BriefItem, BriefStatus } from '@/api/brief-api'
import styles from './styles.module.css'

/** 状态筛选 Tab（与后端 BriefStatus 对齐） */
const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'confirmed', label: '已确认' },
  { key: 'executing', label: '执行中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

/** 类型筛选 Tab（云端暂无 type 字段，按标题启发式归类） */
const TYPE_TABS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'content', label: '内容生产' },
  { key: 'client', label: '客户方案' },
  { key: 'ecommerce', label: '电商' },
  { key: 'ops', label: '运营发布' },
]

/** 状态 → 文案 */
const STATUS_LABEL: Record<BriefStatus, string> = {
  draft: '草稿',
  confirmed: '已确认',
  executing: '执行中',
  completed: '已完成',
  cancelled: '已取消',
}

/** 类型推断（启发式）：客户方案 / 电商 / 运营发布 / 内容生产 */
function inferBriefType(b: BriefItem): string {
  const t = b.title || b.goal || ''
  if (/方案|客户|代运营|合作/.test(t)) return 'client'
  if (/电商|商品|带货|618|双11|大促/.test(t)) return 'ecommerce'
  if (/发布|排期|运营|日报|周报|复盘/.test(t)) return 'ops'
  return 'content'
}

/** 格式化时间（纯日期直接展示，避免时区偏移） */
function formatTime(v?: string | null): string {
  if (!v) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('zh-CN', { hour12: false })
}

interface HistoryBriefsProps {
  open: boolean
  onClose: () => void
  /** 点击「使用此简报」：父组件关闭 Modal 并以该简报预填向导 */
  onUseBrief: (brief: BriefItem) => void
}

export function HistoryBriefs({ open, onClose, onUseBrief }: HistoryBriefsProps) {
  const [list, setList] = useState<BriefItem[]>([])
  const [loading, setLoading] = useState(false)
  const [statusKey, setStatusKey] = useState('all')
  const [typeKey, setTypeKey] = useState('all')
  const [detail, setDetail] = useState<BriefItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  /** 打开时加载历史简报并重置筛选 */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getBriefHistory({ limit: 50 })
      setList(rows || [])
    } catch (err) {
      console.error('[HistoryBriefs] load history failed:', err)
      setList([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setDetail(null)
    setStatusKey('all')
    setTypeKey('all')
    void load()
  }, [open, load])

  /** 点击列表项 → 拉详情 */
  const openDetail = async (brief: BriefItem) => {
    setDetail(brief)
    setDetailLoading(true)
    try {
      setDetail(await getBrief(brief.id))
    } catch (err) {
      console.error('[HistoryBriefs] getBrief failed:', err)
      message.warning('加载详情失败，已展示列表数据')
    } finally {
      setDetailLoading(false)
    }
  }

  const filtered = list.filter((b) => {
    if (statusKey !== 'all' && b.status !== statusKey) return false
    if (typeKey !== 'all' && inferBriefType(b) !== typeKey) return false
    return true
  })

  return (
    <Modal
      title="📚 历史简报"
      open={open}
      onCancel={onClose}
      width={760}
      footer={
        detail ? (
          [
            <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => setDetail(null)}>
              返回列表
            </Button>,
            <Button
              key="use"
              type="primary"
              disabled={detailLoading}
              onClick={() => detail && onUseBrief(detail)}
            >
              使用此简报 → 继续对话
            </Button>,
          ]
        ) : (
          [
            <Button key="refresh" icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>,
            <Button key="close" onClick={onClose}>
              关闭
            </Button>,
          ]
        )
      }
      destroyOnClose
    >
      {detail ? (
        <Spin spinning={detailLoading}>
          <div className={styles.historyBriefDetail}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              {detail.title}
            </Typography.Title>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="状态">
                <Tag color="blue">{STATUS_LABEL[detail.status] || detail.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="目标">{detail.goal || '-'}</Descriptions.Item>
              <Descriptions.Item label="目标受众">{detail.targetAudience || '-'}</Descriptions.Item>
              <Descriptions.Item label="平台">
                {(detail.platforms || []).join('、') || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="风格">{detail.style || '-'}</Descriptions.Item>
              <Descriptions.Item label="截止">{formatTime(detail.deadline)}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatTime(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="来源会话">
                {detail.sourceChatSessionId ? `#${detail.sourceChatSessionId}` : '-'}
              </Descriptions.Item>
            </Descriptions>
          </div>
        </Spin>
      ) : (
        <>
          <Tabs
            size="small"
            activeKey={typeKey}
            onChange={setTypeKey}
            items={TYPE_TABS.map((t) => ({ key: t.key, label: t.label }))}
            tabBarStyle={{ marginBottom: 8 }}
          />
          <Tabs
            size="small"
            activeKey={statusKey}
            onChange={setStatusKey}
            items={STATUS_TABS.map((t) => ({ key: t.key, label: t.label }))}
            tabBarStyle={{ marginBottom: 12 }}
          />
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
          ) : filtered.length === 0 ? (
            <Empty description="暂无历史简报" />
          ) : (
            <div className={styles.historyBriefList}>
              {filtered.map((b) => (
                <div
                  key={b.id}
                  className={styles.historyBriefItem}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openDetail(b)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void openDetail(b)
                    }
                  }}
                >
                  <div className={styles.historyBriefItemTitle}>
                    <span>{b.title}</span>
                    <Tag color="blue">{STATUS_LABEL[b.status] || b.status}</Tag>
                  </div>
                  <div className={styles.historyBriefItemMeta}>
                    <FileTextOutlined style={{ marginRight: 4 }} />
                    {b.goal || '（无目标描述）'} · {formatTime(b.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

export default HistoryBriefs
