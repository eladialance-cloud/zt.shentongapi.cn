// 插件审核队列页 - SubTask 22.2
//
// 待审核列表 + 安全检查结果(漏洞扫描/XSS/SQL注入)+ 性能检查结果(平均耗时/内存占用)
// 通过/驳回 modal
// API: GET /admin/plugins/review, POST /admin/plugins/:id/approve, POST /admin/plugins/:id/reject

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
  SafetyCertificateOutlined,
  StopOutlined
} from '@ant-design/icons'
import {
  approvePlugin,
  listPluginReview,
  rejectPlugin
} from '@/api/admin-plugin-api'
import type {
  AdminPluginItem,
  AdminPluginType,
  PluginReviewStatus
} from '@/types/admin-plugin'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const TYPE_LABEL: Record<AdminPluginType, string> = {
  tool: '工具',
  connector: '连接器',
  knowledge_base: '知识库',
  workflow: '工作流'
}

const STATUS_TAG: Record<PluginReviewStatus, { color: string; text: string }> = {
  pending_review: { color: 'orange', text: '待审核' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已驳回' }
}

interface RejectFormValues {
  reason: string
}

export default function AdminPluginsReview() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminPluginItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<PluginReviewStatus>('pending_review')

  const [detailTarget, setDetailTarget] = useState<AdminPluginItem | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminPluginItem | null>(null)
  const [rejectForm] = Form.useForm<RejectFormValues>()
  const [rejectLoading, setRejectLoading] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE, status: activeTab }
      const result = await listPluginReview(query)
      const r = result as AdminPaginatedResult<AdminPluginItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[PluginReview] load failed:', err)
      message.error('加载审核队列失败')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setActiveTab(key as PluginReviewStatus)
    setPage(1)
  }

  const handleApprove = async (item: AdminPluginItem) => {
    try {
      await approvePlugin(item.id)
      message.success('已通过审核')
      setItems((prev) => prev.filter((p) => p.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[PluginReview] approve failed:', err)
      message.error('通过失败')
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectTarget) return
    try {
      const values = await rejectForm.validateFields()
      setRejectLoading(true)
      await rejectPlugin(rejectTarget.id, { reason: values.reason })
      message.success('已驳回')
      setRejectTarget(null)
      rejectForm.resetFields()
      setItems((prev) => prev.filter((p) => p.id !== rejectTarget.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[PluginReview] reject failed:', err)
      message.error('驳回失败')
    } finally {
      setRejectLoading(false)
    }
  }

  const renderSecurityCheck = (item: AdminPluginItem) => {
    if (!item.securityCheck) return <span style={{ color: '#8b949e' }}>-</span>
    const checks: Array<{ label: string; passed?: boolean }> = [
      { label: '漏洞', passed: item.securityCheck.vulnerabilityScan?.passed },
      { label: 'XSS', passed: item.securityCheck.xssCheck?.passed },
      { label: 'SQLi', passed: item.securityCheck.sqliCheck?.passed }
    ]
    return (
      <span>
        {checks.map((c) => (
          <Tag
            key={c.label}
            color={c.passed === undefined ? 'default' : c.passed ? 'green' : 'red'}
            style={{ marginRight: 4, fontSize: 11 }}
          >
            {c.label}
          </Tag>
        ))}
      </span>
    )
  }

  const renderPerformanceCheck = (item: AdminPluginItem) => {
    if (!item.performanceCheck) return <span style={{ color: '#8b949e' }}>-</span>
    return (
      <span style={{ fontSize: 12, color: '#c7d2fe' }}>
        {item.performanceCheck.avgDurationMs}ms / {item.performanceCheck.memoryUsageMb}MB
      </span>
    )
  }

  const columns: TableColumnsType<AdminPluginItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t: AdminPluginType) => <Tag color="blue">{TYPE_LABEL[t]}</Tag>
    },
    {
      title: '创作者',
      dataIndex: 'creatorName',
      key: 'creatorName',
      width: 140,
      render: (v?: string) => <span style={{ color: '#c7d2fe' }}>{v || '-'}</span>
    },
    {
      title: '安全检查',
      key: 'security',
      width: 180,
      render: (_: unknown, record: AdminPluginItem) => renderSecurityCheck(record)
    },
    {
      title: '性能(耗时/内存)',
      key: 'performance',
      width: 160,
      render: (_: unknown, record: AdminPluginItem) => renderPerformanceCheck(record)
    },
    {
      title: '状态',
      dataIndex: 'reviewStatus',
      key: 'reviewStatus',
      width: 100,
      render: (s: PluginReviewStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right',
      render: (_: unknown, record: AdminPluginItem) => (
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
          <SafetyCertificateOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>插件审核队列</h1>
            <div className={styles.subtitle}>含安全检查与性能检查结果</div>
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
            <Table<AdminPluginItem>
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
        title={`插件详情 - ${detailTarget?.name || ''}`}
        open={!!detailTarget}
        onCancel={() => setDetailTarget(null)}
        footer={null}
        width={640}
      >
        {detailTarget ? (
          <div>
            <div className={styles.detailSection}>
              <div className={styles.sectionTitle}>基本信息</div>
              <p><span style={{ color: '#8b949e' }}>类型:</span> {TYPE_LABEL[detailTarget.type]}</p>
              <p><span style={{ color: '#8b949e' }}>版本:</span> {detailTarget.version}</p>
              <p><span style={{ color: '#8b949e' }}>入口:</span> {detailTarget.entryPoint || '-'}</p>
              <p><span style={{ color: '#8b949e' }}>调用次数:</span> {detailTarget.callCount.toLocaleString()}</p>
            </div>
            <div className={styles.detailSection}>
              <div className={styles.sectionTitle}>描述</div>
              <p style={{ color: '#c7d2fe' }}>{detailTarget.description}</p>
            </div>
            {detailTarget.sandboxConfig ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>沙箱配置</div>
                <p>
                  <span style={{ color: '#8b949e' }}>内存上限:</span>{' '}
                  {detailTarget.sandboxConfig.memoryLimit} MB
                </p>
                <p>
                  <span style={{ color: '#8b949e' }}>超时:</span>{' '}
                  {detailTarget.sandboxConfig.timeout} ms
                </p>
                <p>
                  <span style={{ color: '#8b949e' }}>CPU 限制:</span>{' '}
                  {detailTarget.sandboxConfig.cpuLimit}%
                </p>
              </div>
            ) : null}
            {detailTarget.securityCheck ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>安全检查结果</div>
                <p>
                  <span style={{ color: '#8b949e' }}>漏洞扫描:</span>{' '}
                  <Tag color={detailTarget.securityCheck.vulnerabilityScan?.passed ? 'green' : 'red'}>
                    {detailTarget.securityCheck.vulnerabilityScan?.passed ? '通过' : '未通过'}
                  </Tag>
                </p>
                <p>
                  <span style={{ color: '#8b949e' }}>XSS 检测:</span>{' '}
                  <Tag color={detailTarget.securityCheck.xssCheck?.passed ? 'green' : 'red'}>
                    {detailTarget.securityCheck.xssCheck?.passed ? '通过' : '未通过'}
                  </Tag>
                </p>
                <p>
                  <span style={{ color: '#8b949e' }}>SQL 注入:</span>{' '}
                  <Tag color={detailTarget.securityCheck.sqliCheck?.passed ? 'green' : 'red'}>
                    {detailTarget.securityCheck.sqliCheck?.passed ? '通过' : '未通过'}
                  </Tag>
                </p>
              </div>
            ) : null}
            {detailTarget.performanceCheck ? (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>性能检查结果</div>
                <p>
                  <span style={{ color: '#8b949e' }}>平均耗时:</span>{' '}
                  {detailTarget.performanceCheck.avgDurationMs} ms
                </p>
                <p>
                  <span style={{ color: '#8b949e' }}>内存占用:</span>{' '}
                  {detailTarget.performanceCheck.memoryUsageMb} MB
                </p>
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
        title={`驳回插件 - ${rejectTarget?.name || ''}`}
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
