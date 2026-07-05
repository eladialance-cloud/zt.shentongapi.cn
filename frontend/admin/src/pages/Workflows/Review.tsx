// 工作流审核页 - SubTask 21.3
//
// 审核页:待审核列表 + 通过/驳回
// API: GET /admin/workflows/review, POST /admin/workflows/:id/approve, POST /admin/workflows/:id/reject

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
  approveWorkflow,
  listWorkflowReview,
  rejectWorkflow
} from '@/api/admin-workflow-api'
import type {
  AdminWorkflowCategory,
  AdminWorkflowItem,
  WorkflowEngineType,
  WorkflowReviewStatus
} from '@/types/admin-workflow'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const ENGINE_LABEL: Record<WorkflowEngineType, string> = {
  n8n: 'n8n',
  coze: 'Coze'
}

const CATEGORY_LABEL: Record<AdminWorkflowCategory, string> = {
  automation: '自动化',
  integration: '集成',
  data_processing: '数据处理',
  other: '其他'
}

const STATUS_TAG: Record<WorkflowReviewStatus, { color: string; text: string }> = {
  pending_review: { color: 'orange', text: '待审核' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已驳回' }
}

interface RejectFormValues {
  reason: string
}

export default function AdminWorkflowsReview() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminWorkflowItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<WorkflowReviewStatus>('pending_review')

  const [detailTarget, setDetailTarget] = useState<AdminWorkflowItem | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminWorkflowItem | null>(null)
  const [rejectForm] = Form.useForm<RejectFormValues>()
  const [rejectLoading, setRejectLoading] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE, status: activeTab }
      const result = await listWorkflowReview(query)
      const r = result as AdminPaginatedResult<AdminWorkflowItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[WorkflowReview] load failed:', err)
      message.error('加载审核队列失败')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setActiveTab(key as WorkflowReviewStatus)
    setPage(1)
  }

  const handleApprove = async (item: AdminWorkflowItem) => {
    try {
      await approveWorkflow(item.id)
      message.success('已通过审核')
      setItems((prev) => prev.filter((w) => w.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[WorkflowReview] approve failed:', err)
      message.error('通过失败')
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectTarget) return
    try {
      const values = await rejectForm.validateFields()
      setRejectLoading(true)
      await rejectWorkflow(rejectTarget.id, { reason: values.reason })
      message.success('已驳回')
      setRejectTarget(null)
      rejectForm.resetFields()
      setItems((prev) => prev.filter((w) => w.id !== rejectTarget.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[WorkflowReview] reject failed:', err)
      message.error('驳回失败')
    } finally {
      setRejectLoading(false)
    }
  }

  const columns: TableColumnsType<AdminWorkflowItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '引擎',
      dataIndex: 'engineType',
      key: 'engineType',
      width: 90,
      render: (e: WorkflowEngineType) => (
        <Tag color={e === 'n8n' ? 'purple' : 'magenta'}>{ENGINE_LABEL[e]}</Tag>
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (c: AdminWorkflowCategory) => <Tag color="blue">{CATEGORY_LABEL[c]}</Tag>
    },
    {
      title: '创作者',
      dataIndex: 'creatorName',
      key: 'creatorName',
      width: 140,
      render: (v?: string) => <span style={{ color: '#c7d2fe' }}>{v || '-'}</span>
    },
    {
      title: '状态',
      dataIndex: 'reviewStatus',
      key: 'reviewStatus',
      width: 100,
      render: (s: WorkflowReviewStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '执行次数',
      dataIndex: 'executionCount',
      key: 'executionCount',
      width: 100,
      render: (v: number) => <span style={{ color: '#c7d2fe' }}>{v.toLocaleString()}</span>
    },
    {
      title: '创建时间',
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
      render: (_: unknown, record: AdminWorkflowItem) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDetailTarget(record)}
          >
            详情
          </Button>
          {record.reviewStatus === 'pending_review' ? (
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
            <h1 className={styles.title}>工作流审核</h1>
            <div className={styles.subtitle}>审核工作流模板上架申请</div>
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
          { key: 'approved', label: '已通过' },
          { key: 'rejected', label: '已驳回' }
        ]}
      />

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无数据" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminWorkflowItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1200 }}
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
        title={`工作流详情 - ${detailTarget?.name || ''}`}
        open={!!detailTarget}
        onCancel={() => setDetailTarget(null)}
        footer={null}
        width={640}
      >
        {detailTarget ? (
          <div>
            <div className={styles.detailSection}>
              <div className={styles.sectionTitle}>基本信息</div>
              <p><span style={{ color: '#8b949e' }}>引擎:</span> {ENGINE_LABEL[detailTarget.engineType]}</p>
              <p><span style={{ color: '#8b949e' }}>分类:</span> {CATEGORY_LABEL[detailTarget.category]}</p>
              <p><span style={{ color: '#8b949e' }}>执行次数:</span> {detailTarget.executionCount.toLocaleString()}</p>
              <p><span style={{ color: '#8b949e' }}>单次价格:</span> {detailTarget.pricePerExecution} 积分</p>
              {detailTarget.n8nWorkflowId ? (
                <p><span style={{ color: '#8b949e' }}>n8n ID:</span> {detailTarget.n8nWorkflowId}</p>
              ) : null}
              {detailTarget.cozeWorkflowId ? (
                <p><span style={{ color: '#8b949e' }}>Coze ID:</span> {detailTarget.cozeWorkflowId}</p>
              ) : null}
            </div>
            <div className={styles.detailSection}>
              <div className={styles.sectionTitle}>描述</div>
              <p style={{ color: '#c7d2fe' }}>{detailTarget.description}</p>
            </div>
            {detailTarget.inputSchema ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>输入 Schema</div>
                <pre style={{ whiteSpace: 'pre-wrap', color: '#c7d2fe', background: 'rgba(15,23,42,0.6)', padding: 12, borderRadius: 8 }}>
                  {JSON.stringify(detailTarget.inputSchema, null, 2)}
                </pre>
              </div>
            ) : null}
            {detailTarget.outputSchema ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>输出 Schema</div>
                <pre style={{ whiteSpace: 'pre-wrap', color: '#c7d2fe', background: 'rgba(15,23,42,0.6)', padding: 12, borderRadius: 8 }}>
                  {JSON.stringify(detailTarget.outputSchema, null, 2)}
                </pre>
              </div>
            ) : null}
            {detailTarget.rejectReason ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>驳回原因</div>
                <p style={{ color: '#f87171' }}>{detailTarget.rejectReason}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* 驳回 Modal */}
      <Modal
        title={`驳回工作流 - ${rejectTarget?.name || ''}`}
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
    </div>
  )
}
