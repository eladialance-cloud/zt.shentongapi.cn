// 充值档位管理页
//
// 功能：Table + Modal Form
// 列：排序 / 名称 / 价格 / 积分 / 赠送积分 / 币种 / 推荐 / 状态 / 操作
// 操作：编辑 / 删除
// API: GET/POST/PATCH/DELETE /admin/recharge-plans

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  WalletOutlined
} from '@ant-design/icons'
import {
  listRechargePlans,
  createRechargePlan,
  updateRechargePlan,
  deleteRechargePlan
} from '@/api/admin-payment-api'
import type { RechargePlan, CreateRechargePlanDto } from '@/types/admin-payment'
import styles from './styles.module.css'

export default function RechargePlansPage() {
  const [plans, setPlans] = useState<RechargePlan[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form] = Form.useForm<CreateRechargePlanDto>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listRechargePlans()
      setPlans(data)
    } catch (err) {
      message.error('加载充值档位失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdd = () => {
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue({
      currency: 'CNY',
      bonusCredits: 0,
      isRecommended: false,
      isActive: true,
      sortOrder: 0
    })
    setModalOpen(true)
  }

  const handleEdit = (record: RechargePlan) => {
    setEditingId(record.id)
    form.setFieldsValue({
      name: record.name,
      price: record.price,
      credits: record.credits,
      bonusCredits: record.bonusCredits,
      currency: record.currency,
      isRecommended: record.isRecommended,
      isActive: record.isActive,
      sortOrder: record.sortOrder
    })
    setModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteRechargePlan(id)
      message.success('删除成功')
      loadData()
    } catch (err) {
      message.error('删除失败')
      console.error(err)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingId) {
        await updateRechargePlan(editingId, values)
        message.success('更新成功')
      } else {
        await createRechargePlan(values)
        message.success('创建成功')
      }
      setModalOpen(false)
      loadData()
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error('操作失败')
      console.error(err)
    }
  }

  const columns: TableColumnsType<RechargePlan> = [
    {
      title: '排序',
      dataIndex: 'sortOrder',
      width: 70,
      render: (v: number) => <span style={{ color: '#94a3b8' }}>{v}</span>
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 140,
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>
    },
    {
      title: '价格(元)',
      dataIndex: 'price',
      width: 100,
      render: (price: number) => <span style={{ color: '#7C3AED', fontWeight: 600 }}>¥{Number(price).toFixed(2)}</span>
    },
    {
      title: '积分',
      dataIndex: 'credits',
      width: 100,
      render: (credits: number) => credits.toLocaleString()
    },
    {
      title: '赠送积分',
      dataIndex: 'bonusCredits',
      width: 100,
      render: (v: number) => (v > 0 ? <Tag color="green">+{v.toLocaleString()}</Tag> : '-')
    },
    {
      title: '币种',
      dataIndex: 'currency',
      width: 80
    },
    {
      title: '推荐',
      dataIndex: 'isRecommended',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="gold">推荐</Tag> : '-')
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>)
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除此充值档位？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </div>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <WalletOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>充值档位</h1>
            <div className={styles.subtitle}>设置充值金额与对应积分，用户端充值页将展示启用中的档位</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增档位
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {plans.length === 0 && !loading ? (
          <Empty description="暂无充值档位" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table
              columns={columns}
              dataSource={plans}
              rowKey="id"
              pagination={false}
              size="middle"
            />
          </div>
        )}
      </Spin>

      <Modal
        title={editingId ? '编辑充值档位' : '新增充值档位'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={560}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="name"
              label="档位名称"
              rules={[{ required: true, message: '请输入名称' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="如：标准包" maxLength={64} />
            </Form.Item>
            <Form.Item
              name="price"
              label="价格(元)"
              rules={[{ required: true, message: '请输入价格' }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="credits"
              label="到账积分"
              rules={[{ required: true, message: '请输入积分' }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="bonusCredits"
              label="赠送积分"
              style={{ flex: 1 }}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="currency" label="币种" style={{ flex: 1 }}>
              <Select
                options={[
                  { value: 'CNY', label: 'CNY 人民币' },
                  { value: 'USD', label: 'USD 美元' }
                ]}
              />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 32 }}>
            <Form.Item name="isRecommended" label="推荐" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isActive" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
