// 会员管理页（M7-4）
//
// Tab1 兑换码管理：批量生成 / 列表筛选 / 作废
// Tab2 用户开通：直接开通/延期会员（level + durationDays）
// API: /admin/membership/*
import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Table,
  Tabs,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  GiftOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  generateRedeemCodes,
  listRedeemCodes,
  revokeRedeemCode,
  grantMembership
} from '@/api/admin-membership-api'
import type {
  RedeemCode,
  MembershipLevel
} from '@/types/admin-membership'
import styles from './styles.module.css'

const LEVEL_OPTIONS: { value: MembershipLevel; label: string }[] = [
  { value: 'pro', label: '专业版' },
  { value: 'enterprise', label: '企业版' }
]

const LEVEL_TAG_COLOR: Record<MembershipLevel, string> = {
  free: 'default',
  pro: 'blue',
  enterprise: 'gold'
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  unused: { color: 'green', label: '未使用' },
  used: { color: 'blue', label: '已使用' },
  revoked: { color: 'red', label: '已作废' }
}

export default function MembershipPage() {
  // ===== 兑换码 =====
  const [codes, setCodes] = useState<RedeemCode[]>([])
  const [loading, setLoading] = useState(false)
  const [filterBatchId, setFilterBatchId] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | undefined>()
  const [generated, setGenerated] = useState<string[] | null>(null)
  const [generating, setGenerating] = useState(false)

  const loadCodes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listRedeemCodes({
        batchId: filterBatchId || undefined,
        status: filterStatus || undefined
      })
      setCodes(data)
    } catch (err) {
      message.error('加载兑换码列表失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filterBatchId, filterStatus])

  useEffect(() => {
    loadCodes()
  }, [loadCodes])

  // ===== 用户开通 =====
  const [grantForm] = Form.useForm<{ userId: number; level: MembershipLevel; durationDays: number }>()
  const [granting, setGranting] = useState(false)

  const handleGenerate = async (values: {
    level: MembershipLevel
    durationDays: number
    count: number
    batchId?: string
  }) => {
    setGenerating(true)
    try {
      const list = await generateRedeemCodes({
        level: values.level,
        durationDays: values.durationDays,
        count: values.count,
        batchId: values.batchId?.trim() || undefined
      })
      setGenerated(list)
      message.success(`已生成 ${list.length} 个兑换码`)
      loadCodes()
    } catch (err) {
      message.error('生成兑换码失败')
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async (code: string) => {
    try {
      await revokeRedeemCode(code)
      message.success('已作废')
      loadCodes()
    } catch (err) {
      message.error('作废失败')
      console.error(err)
    }
  }

  const handleGrant = async (values: { userId: number; level: MembershipLevel; durationDays: number }) => {
    setGranting(true)
    try {
      await grantMembership(values)
      message.success('开通/延期成功')
      grantForm.resetFields()
    } catch (err) {
      message.error('开通失败')
      console.error(err)
    } finally {
      setGranting(false)
    }
  }

  const columns: TableColumnsType<RedeemCode> = [
    {
      title: '兑换码',
      dataIndex: 'code',
      width: 220,
      render: (code: string) => (
        <span style={{ fontFamily: 'Consolas, Menlo, monospace', fontWeight: 600 }}>{code}</span>
      )
    },
    {
      title: '等级',
      dataIndex: 'level',
      width: 90,
      render: (level: MembershipLevel) => <Tag color={LEVEL_TAG_COLOR[level]}>{level === 'pro' ? '专业版' : '企业版'}</Tag>
    },
    {
      title: '时长(天)',
      dataIndex: 'durationDays',
      width: 90
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: string) => {
        const tag = STATUS_TAG[status] ?? { color: 'default', label: status }
        return <Tag color={tag.color}>{tag.label}</Tag>
      }
    },
    {
      title: '批次',
      dataIndex: 'batchId',
      width: 120,
      render: (batchId?: string | null) => batchId || '-'
    },
    {
      title: '使用人',
      dataIndex: 'usedBy',
      width: 90,
      render: (usedBy?: number | null) => (usedBy ? `#${usedBy}` : '-')
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      width: 100,
      render: (_, record) =>
        record.status === 'unused' ? (
          <Popconfirm title="确认作废此兑换码？" onConfirm={() => handleRevoke(record.code)}>
            <Button type="link" size="small" danger>
              作废
            </Button>
          </Popconfirm>
        ) : (
          '-'
        )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>
            <SafetyCertificateOutlined style={{ marginRight: 8 }} />
            会员管理
          </h2>
          <div className={styles.subtitle}>兑换码批量发放 · 用户直接开通/延期</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadCodes} loading={loading}>
          刷新
        </Button>
      </div>

      <Tabs
        defaultActiveKey="redeem-codes"
        items={[
          {
            key: 'redeem-codes',
            label: '兑换码管理',
            children: (
              <>
                <Card className={styles.card} title="批量生成兑换码" style={{ marginBottom: 16 }}>
                  <Form
                    layout="inline"
                    onFinish={handleGenerate}
                    initialValues={{ level: 'pro', durationDays: 30, count: 10 }}
                    style={{ rowGap: 12 }}
                  >
                    <Form.Item name="level" label="等级" rules={[{ required: true }]}>
                      <Select options={LEVEL_OPTIONS} style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name="durationDays" label="时长(天)" rules={[{ required: true }]}>
                      <InputNumber min={1} max={3650} style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name="count" label="数量" rules={[{ required: true }]}>
                      <InputNumber min={1} max={1000} style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item name="batchId" label="批次号">
                      <Input placeholder="如 2026-08 线下发放" maxLength={64} style={{ width: 200 }} />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={generating}>
                        生成
                      </Button>
                    </Form.Item>
                  </Form>
                </Card>

                <div className={styles.toolbar}>
                  <div className={styles.toolbarLeft}>
                    <Input
                      className={styles.searchBox}
                      placeholder="批次号筛选"
                      allowClear
                      value={filterBatchId}
                      onChange={(e) => setFilterBatchId(e.target.value)}
                    />
                    <Select
                      className={styles.filterSelect}
                      placeholder="状态"
                      allowClear
                      value={filterStatus}
                      onChange={(v) => setFilterStatus(v)}
                      options={[
                        { value: 'unused', label: '未使用' },
                        { value: 'used', label: '已使用' },
                        { value: 'revoked', label: '已作废' }
                      ]}
                    />
                    <Button type="primary" icon={<ReloadOutlined />} onClick={loadCodes}>
                      查询
                    </Button>
                  </div>
                </div>

                <div className={styles.tableWrap}>
                  <Spin spinning={loading}>
                    <Table
                      columns={columns}
                      dataSource={codes}
                      rowKey="code"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                      size="middle"
                    />
                  </Spin>
                </div>
              </>
            )
          },
          {
            key: 'grant',
            label: '用户开通',
            children: (
              <Card className={styles.card} title="直接开通/延期会员" style={{ maxWidth: 560 }}>
                <Form
                  form={grantForm}
                  layout="vertical"
                  onFinish={handleGrant}
                  initialValues={{ level: 'pro', durationDays: 30 }}
                >
                  <Form.Item
                    name="userId"
                    label="用户 ID"
                    rules={[{ required: true, message: '请输入用户 ID' }]}
                  >
                    <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="用户数字 ID" />
                  </Form.Item>
                  <Form.Item name="level" label="会员等级" rules={[{ required: true }]}>
                    <Select options={LEVEL_OPTIONS} />
                  </Form.Item>
                  <Form.Item
                    name="durationDays"
                    label="时长(天)"
                    rules={[{ required: true, message: '请输入时长' }]}
                  >
                    <InputNumber min={1} max={3650} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<GiftOutlined />} loading={granting}>
                      开通/延期
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            )
          }
        ]}
      />

      <Modal
        title="生成结果（兑换码，每行一个）"
        open={!!generated}
        onOk={() => setGenerated(null)}
        onCancel={() => setGenerated(null)}
        okText="关闭"
        cancelButtonProps={{ style: { display: 'none' } }}
        width={520}
      >
        <Input.TextArea
          value={generated?.join('\n')}
          readOnly
          rows={Math.min(generated?.length ?? 10, 12)}
          style={{ fontFamily: 'Consolas, Menlo, monospace', fontSize: 13 }}
          onCopy={() => message.success('已复制')}
        />
        <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
          共 {generated?.length ?? 0} 个，请复制后线下分发；已使用的兑换码不可作废。
        </div>
      </Modal>
    </div>
  )
}
