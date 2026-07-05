// 审核队列页 - SubTask 25.3
//
// Tab:对话/Agent/插件/工作流
// 每个 Tab 展示待审核内容列表:内容摘要/来源用户/触发原因(命中敏感词/AI 审核)/风险级别/时间/操作
// 操作:通过/驳回(modal 输入原因)/标记误报
// API: GET /admin/audit/queue、POST /admin/audit/:id/approve、POST /admin/audit/:id/reject、POST /admin/audit/:id/false-positive

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Spin,
  Table,
  Tabs,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApartmentOutlined,
  BlockOutlined,
  CheckOutlined,
  CloseOutlined,
  MessageOutlined,
  ReloadOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import {
  approveAudit,
  listAuditQueue,
  markAuditFalsePositive,
  rejectAudit
} from '@/api/admin-audit-api'
import type {
  AuditQueueItem,
  AuditQueueType,
  AuditRiskLevel,
  AuditTriggerReason
} from '@/types/admin-audit'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const TYPE_TABS: Array<{ key: AuditQueueType; label: string; icon: ReactNode }> = [
  { key: 'conversation', label: '对话', icon: <MessageOutlined /> },
  { key: 'agent', label: 'Agent', icon: <ThunderboltOutlined /> },
  { key: 'plugin', label: '插件', icon: <BlockOutlined /> },
  { key: 'workflow', label: '工作流', icon: <ApartmentOutlined /> }
]

const TRIGGER_LABEL: Record<AuditTriggerReason, string> = {
  sensitive_word: '命中敏感词',
  ai_audit: 'AI 审核'
}

const TRIGGER_COLOR: Record<AuditTriggerReason, string> = {
  sensitive_word: 'orange',
  ai_audit: 'purple'
}

const RISK_LABEL: Record<AuditRiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高'
}

const RISK_COLOR: Record<AuditRiskLevel, string> = {
  low: 'green',
  medium: 'orange',
  high: 'red'
}

interface RejectFormValues {
  reason: string
}

export default function AuditQueue() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AuditQueueItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<AuditQueueType>('conversation')

  const [rejectTarget, setRejectTarget] = useState<AuditQueueItem | null>(null)
  const [rejectForm] = Form.useForm<RejectFormValues>()
  const [rejectLoading, setRejectLoading] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listAuditQueue({
        type: tab,
        status: 'pending',
        page,
        pageSize: PAGE_SIZE
      })
      const r = result as AdminPaginatedResult<AuditQueueItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AuditQueue] load failed:', err)
      message.error('加载审核队列失败')
    } finally {
      setLoading(false)
    }
  }, [tab, page])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setTab(key as AuditQueueType)
    setPage(1)
  }

  const handleApprove = async (item: AuditQueueItem) => {
    try {
      await approveAudit(item.id)
      message.success('已通过')
      setItems((prev) => prev.filter((k) => k.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AuditQueue] approve failed:', err)
      message.error('操作失败')
    }
  }

  const handleFalsePositive = async (item: AuditQueueItem) => {
    try {
      await markAuditFalsePositive(item.id)
      message.success('已标记为误报')
      setItems((prev) => prev.filter((k) => k.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AuditQueue] false-positive failed:', err)
      message.error('操作失败')
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectTarget) return
    try {
      const values = await rejectForm.validateFields()
      setRejectLoading(true)
      await rejectAudit(rejectTarget.id, { reason: values.reason })
      message.success('已驳回')
      setItems((prev) => prev.filter((k) => k.id !== rejectTarget.id))
      setTotal((t) => Math.max(0, t - 1))
      setRejectTarget(null)
      rejectForm.resetFields()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AuditQueue] reject failed:', err)
      message.error('驳回失败')
    } finally {
      setRejectLoading(false)
    }
  }

  const columns: TableColumnsType<AuditQueueItem> = [
    {
      title: '内容摘要',
      dataIndex: 'contentSummary',
      key: 'contentSummary',
      ellipsis: true,
      render: (v: string) => <span style={{ color: '#f1f5f9' }}>{v}</span>
    },
    {
      title: '来源用户',
      key: 'user',
      width: 160,
      render: (_: unknown, r: AuditQueueItem) => (
        <span style={{ color: '#94a3b8' }}>
          {r.username || ''} #{r.userId}
        </span>
      )
    },
    {
      title: '触发原因',
      dataIndex: 'triggerReason',
      key: 'triggerReason',
      width: 130,
      render: (t: AuditTriggerReason, r: AuditQueueItem) => (
        <span>
          <Tag color={TRIGGER_COLOR[t]}>{TRIGGER_LABEL[t]}</Tag>
          {r.hitWords && r.hitWords.length > 0 && (
            <span style={{ color: '#8b949e', marginLeft: 4 }}>
              ({r.hitWords.length} 词)
            </span>
          )}
        </span>
      )
    },
    {
      title: '风险级别',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 100,
      render: (l: AuditRiskLevel) => (
        <Tag color={RISK_COLOR[l]}>{RISK_LABEL[l]}</Tag>
      )
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right',
      render: (_: unknown, record: AuditQueueItem) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => void handleApprove(record)}
          >
            通过
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={() => {
              setRejectTarget(record)
              rejectForm.resetFields()
            }}
          >
            驳回
          </Button>
          <Popconfirm
            title="确认标记为误报?"
            onConfirm={() => void handleFalsePositive(record)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small">
              误报
            </Button>
          </Popconfirm>
        </>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ApartmentOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>审核队列</h1>
            <div className={styles.subtitle}>处理待审核的用户内容</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadList}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <Tabs
        activeKey={tab}
        onChange={handleTabChange}
        items={TYPE_TABS.map((t) => ({
          key: t.key,
          label: (
            <span>
              {t.icon} {t.label}
            </span>
          )
        }))}
      />

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无待审核内容" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AuditQueueItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1080 }}
            />
          </div>
        )}
        <div className={styles.paginationWrap}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={(p) => setPage(p)}
            showSizeChanger={false}
            showTotal={(t) => `共 ${t} 条`}
          />
        </div>
      </Spin>

      {/* 驳回 Modal */}
      <Modal
        title={`驳回审核 - #${rejectTarget?.id ?? ''}`}
        open={!!rejectTarget}
        onCancel={() => setRejectTarget(null)}
        onOk={handleConfirmReject}
        confirmLoading={rejectLoading}
        okText="确认驳回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <Form<RejectFormValues> form={rejectForm} layout="vertical">
          <Form.Item
            name="reason"
            label="驳回原因"
            rules={[{ required: true, message: '请输入驳回原因' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="请输入驳回原因"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
