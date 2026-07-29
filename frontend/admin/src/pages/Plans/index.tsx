// 套餐管理页
//
// 功能：Table + Modal Form
// 列：名称 / 等级 / 价格 / 积分 / 周期天数 / 周期描述 / 权益 / 状态 / 操作
// 操作：编辑 / 删除
// API: GET/POST/PATCH/DELETE /admin/plans

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
  CrownOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { listPlans, createPlan, updatePlan, deletePlan } from '@/api/admin-plan-api'
import type { MembershipPlan, CreatePlanDto } from '@/types/admin-plan'
import styles from './styles.module.css'

export default function PlansPage() {
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form] = Form.useForm<CreatePlanDto>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listPlans()
      setPlans(data)
    } catch (err) {
      message.error('加载套餐列表失败')
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
      level: 0,
      period: '月',
      durationDays: 30,
      isActive: true
    })
    setModalOpen(true)
  }

  const handleEdit = (record: MembershipPlan) => {
    setEditingId(record.id)
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      price: record.price,
      credits: record.credits,
      durationDays: record.durationDays,
      level: record.level,
      period: record.period,
      benefits: record.benefits,
      isActive: record.isActive
    })
    setModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deletePlan(id)
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
      // benefits 是字符串数组，从 Input 处理
      const dto: CreatePlanDto = {
        ...values,
        benefits: values.benefits
          ? (values.benefits as unknown as string).split('\n').filter(Boolean)
          : undefined
      }
      if (editingId) {
        await updatePlan(editingId, dto)
        message.success('更新成功')
      } else {
        await createPlan(dto)
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

  const columns: TableColumnsType<MembershipPlan> = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 140,
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>
    },
    {
      title: '等级',
      dataIndex: 'level',
      width: 70,
      render: (level: number) => (
        <Tag color={level >= 3 ? 'gold' : level >= 1 ? 'blue' : 'default'}>
          Lv.{level}
        </Tag>
      )
    },
    {
      title: '价格(元)',
      dataIndex: 'price',
      width: 90,
      render: (price: number) => <span style={{ color: '#6366f1', fontWeight: 600 }}>¥{price}</span>
    },
    {
      title: '积分',
      dataIndex: 'credits',
      width: 90,
      render: (credits: number) => credits.toLocaleString()
    },
    {
      title: '周期',
      width: 120,
      render: (_, r) => `${r.durationDays}天 / ${r.period}`
    },
    {
      title: '权益',
      dataIndex: 'benefits',
      width: 200,
      render: (benefits?: string[]) =>
        benefits && benefits.length > 0 ? (
          <span style={{ fontSize: 12, color: '#888' }}>
            {benefits.slice(0, 3).join('、')}
            {benefits.length > 3 ? ` 等${benefits.length}项` : ''}
          </span>
        ) : (
          '-'
        )
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      width: 80,
      render: (active: boolean) =>
        active ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>
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
            title="确认删除此套餐？"
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
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <CrownOutlined style={{ marginRight: 8 }} />
          套餐管理
        </h2>
        <div className={styles.actions}>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增套餐
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {plans.length === 0 && !loading ? (
          <Empty description="暂无套餐" />
        ) : (
          <Table
            columns={columns}
            dataSource={plans}
            rowKey="id"
            pagination={false}
            size="middle"
          />
        )}
      </Spin>

      <Modal
        title={editingId ? '编辑套餐' : '新增套餐'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={560}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="套餐名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：月度会员" maxLength={64} />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="price"
              label="价格(元)"
              rules={[{ required: true, message: '请输入价格' }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="credits"
              label="积分数量"
              rules={[{ required: true, message: '请输入积分' }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="level"
              label="会员等级"
              rules={[{ required: true }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0} max={10} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="durationDays"
              label="周期天数"
              rules={[{ required: true, message: '请输入天数' }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="period" label="周期描述" style={{ flex: 1 }}>
              <Select
                options={[
                  { value: '月', label: '月' },
                  { value: '季', label: '季' },
                  { value: '年', label: '年' },
                  { value: '永久', label: '永久' }
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} maxLength={512} placeholder="套餐描述" />
          </Form.Item>

          <Form.Item name="benefits" label="权益（每行一条）">
            <Input.TextArea
              rows={4}
              placeholder={'如：\n每月1000积分\n优先客服支持\n专属模型访问'}
            />
          </Form.Item>

          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
