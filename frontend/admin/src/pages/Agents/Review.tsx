// Agent 审核队列页 - SubTask 20.2
//
// Tab:待审核(pending_review)/已通过(published)/已驳回(rejected)/已下架(unpublished)
// 待审核列表展示:Agent 名/创作者/分类/提交时间/操作(查看详情/通过/驳回)
// 通过:POST /admin/agents/:id/approve
// 驳回:modal 输入原因,POST /admin/agents/:id/reject body: { reason }
// 强制下架:modal 输入原因,POST /admin/agents/:id/force-unpublish body: { reason }
// API: GET /admin/agents/review

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Spin,
  Table,
  Tabs,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
  StopOutlined,
  AuditOutlined
} from '@ant-design/icons'
import {
  approveAgent,
  forceUnpublishAgent,
  listAgentReview,
  rejectAgent
} from '@/api/admin-agent-api'
import type {
  AdminAgentItem,
  AgentCategory,
  AgentReviewStatus
} from '@/types/admin-agent'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const CATEGORY_LABEL: Record<AgentCategory, string> = {
  office: '办公',
  programming: '编程',
  copywriting: '文案',
  data_analysis: '数据分析',
  other: '其他'
}

const STATUS_TAG: Record<AgentReviewStatus, { color: string; text: string }> = {
  pending_review: { color: 'orange', text: '待审核' },
  published: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已驳回' },
  unpublished: { color: 'default', text: '已下架' }
}

interface RejectFormValues {
  reason: string
}

export default function AdminAgentsReview() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminAgentItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<AgentReviewStatus>('pending_review')

  // 详情 Modal
  const [detailTarget, setDetailTarget] = useState<AdminAgentItem | null>(null)

  // 驳回 Modal
  const [rejectTarget, setRejectTarget] = useState<AdminAgentItem | null>(null)
  const [rejectForm] = Form.useForm<RejectFormValues>()
  const [rejectLoading, setRejectLoading] = useState(false)

  // 强制下架 Modal
  const [forceTarget, setForceTarget] = useState<AdminAgentItem | null>(null)
  const [forceForm] = Form.useForm<RejectFormValues>()
  const [forceLoading, setForceLoading] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE, status: activeTab }
      const result = await listAgentReview(query)
      const r = result as AdminPaginatedResult<AdminAgentItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AgentReview] load failed:', err)
      message.error('加载审核队列失败')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setActiveTab(key as AgentReviewStatus)
    setPage(1)
  }

  const handleApprove = async (item: AdminAgentItem) => {
    try {
      await approveAgent(item.id)
      message.success('已通过审核')
      setItems((prev) => prev.filter((a) => a.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AgentReview] approve failed:', err)
      message.error('通过失败')
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectTarget) return
    try {
      const values = await rejectForm.validateFields()
      setRejectLoading(true)
      await rejectAgent(rejectTarget.id, { reason: values.reason })
      message.success('已驳回')
      setRejectTarget(null)
      rejectForm.resetFields()
      setItems((prev) => prev.filter((a) => a.id !== rejectTarget.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AgentReview] reject failed:', err)
      message.error('驳回失败')
    } finally {
      setRejectLoading(false)
    }
  }

  const handleConfirmForce = async () => {
    if (!forceTarget) return
    try {
      const values = await forceForm.validateFields()
      setForceLoading(true)
      await forceUnpublishAgent(forceTarget.id, { reason: values.reason })
      message.success('已强制下架')
      setForceTarget(null)
      forceForm.resetFields()
      setItems((prev) => prev.filter((a) => a.id !== forceTarget.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AgentReview] force-unpublish failed:', err)
      message.error('强制下架失败')
    } finally {
      setForceLoading(false)
    }
  }

  const columns: TableColumnsType<AdminAgentItem> = [
    {
      title: 'Agent 名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, record) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>
          {v}
          {record.displayName ? (
            <span style={{ color: '#8b949e', marginLeft: 6, fontSize: 12 }}>
              ({record.displayName})
            </span>
          ) : null}
        </span>
      )
    },
    {
      title: '创作者',
      key: 'creator',
      width: 180,
      render: (_: unknown, record: AdminAgentItem) => (
        <span>
          <Tag color={record.creatorType === 'official' ? 'gold' : 'cyan'}>
            {record.creatorType === 'official' ? '官方' : '用户'}
          </Tag>
          <span style={{ color: '#c7d2fe' }}>{record.creatorName || '-'}</span>
        </span>
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (c: AgentCategory) => <Tag color="blue">{CATEGORY_LABEL[c]}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: AgentReviewStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '提交时间',
      dataIndex: 'submittedAt',
      key: 'submittedAt',
      width: 170,
      render: (t?: string) => <span style={{ color: '#8b949e' }}>{t || '-'}</span>
    },
    {
      title: '原因',
      key: 'reason',
      width: 200,
      render: (_: unknown, record: AdminAgentItem) => {
        const reason = record.rejectReason || record.forceUnpublishReason
        if (!reason) return <span style={{ color: '#8b949e' }}>-</span>
        return (
          <span style={{ color: '#f87171', fontSize: 12 }} title={reason}>
            {reason.length > 30 ? reason.slice(0, 30) + '...' : reason}
          </span>
        )
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_: unknown, record: AdminAgentItem) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDetailTarget(record)}
          >
            详情
          </Button>
          {record.status === 'pending_review' ? (
            <>
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleApprove(record)}
              >
                通过
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => {
                  setRejectTarget(record)
                  rejectForm.resetFields()
                }}
              >
                驳回
              </Button>
            </>
          ) : null}
          {record.status === 'published' ? (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => {
                setForceTarget(record)
                forceForm.resetFields()
              }}
            >
              强制下架
            </Button>
          ) : null}
        </>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <AuditOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Agent 审核队列</h1>
            <div className={styles.subtitle}>审核用户提交的 Agent 上架申请</div>
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
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: 'pending_review', label: '待审核' },
          { key: 'published', label: '已通过' },
          { key: 'rejected', label: '已驳回' },
          { key: 'unpublished', label: '已下架' }
        ]}
      />

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无数据" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminAgentItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1300 }}
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

      {/* 详情 Modal */}
      <Modal
        title={`Agent 详情 - ${detailTarget?.name || ''}`}
        open={!!detailTarget}
        onCancel={() => setDetailTarget(null)}
        footer={null}
        width={640}
      >
        {detailTarget ? (
          <div>
            <div className={styles.detailSection}>
              <div className={styles.sectionTitle}>基本信息</div>
              <p><span style={{ color: '#8b949e' }}>显示名:</span> {detailTarget.displayName || '-'}</p>
              <p><span style={{ color: '#8b949e' }}>分类:</span> {CATEGORY_LABEL[detailTarget.category]}</p>
              <p><span style={{ color: '#8b949e' }}>创作者:</span> {detailTarget.creatorName || '-'}</p>
              <p><span style={{ color: '#8b949e' }}>调用次数:</span> {detailTarget.callCount.toLocaleString()}</p>
            </div>
            <div className={styles.detailSection}>
              <div className={styles.sectionTitle}>描述</div>
              <p style={{ color: '#c7d2fe' }}>{detailTarget.description}</p>
            </div>
            {detailTarget.systemPrompt ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>系统提示词</div>
                <pre style={{ whiteSpace: 'pre-wrap', color: '#c7d2fe', background: 'rgba(15,23,42,0.6)', padding: 12, borderRadius: 8 }}>
                  {detailTarget.systemPrompt}
                </pre>
              </div>
            ) : null}
            {detailTarget.usageExamples && detailTarget.usageExamples.length > 0 ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>使用示例</div>
                <ul>
                  {detailTarget.usageExamples.map((ex, i) => (
                    <li key={i} style={{ color: '#c7d2fe' }}>{ex}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {detailTarget.rejectReason ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>驳回原因</div>
                <p style={{ color: '#f87171' }}>{detailTarget.rejectReason}</p>
              </div>
            ) : null}
            {detailTarget.forceUnpublishReason ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>强制下架原因</div>
                <p style={{ color: '#f87171' }}>{detailTarget.forceUnpublishReason}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* 驳回 Modal */}
      <Modal
        title={`驳回 Agent - ${rejectTarget?.name || ''}`}
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
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 强制下架 Modal */}
      <Modal
        title={`强制下架 - ${forceTarget?.name || ''}`}
        open={!!forceTarget}
        onCancel={() => setForceTarget(null)}
        onOk={handleConfirmForce}
        confirmLoading={forceLoading}
        okText="确认下架"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <Form<RejectFormValues> form={forceForm} layout="vertical">
          <Form.Item
            name="reason"
            label="下架原因"
            rules={[{ required: true, message: '请输入下架原因' }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
