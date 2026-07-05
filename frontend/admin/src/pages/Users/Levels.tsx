// 用户等级管理页 - SubTask 18.2
//
// 表格:等级/名称/最低积分/最大并发/日调用上限/月积分上限/操作
// 编辑模态框:调整各项配额
// API: GET /admin/user-levels、PUT /admin/user-levels/:level

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Spin,
  Table,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import { EditOutlined, ReloadOutlined, CrownOutlined } from '@ant-design/icons'
import {
  listUserLevels,
  updateUserLevelConfig
} from '@/api/admin-user-api'
import type { UpdateUserLevelDto, UserLevel } from '@/types/admin-user'
import styles from './styles.module.css'

interface LevelFormValues {
  name: string
  minCredits: number
  maxConcurrency: number
  dailyCallLimit: number
  monthlyCreditsLimit: number
}

export default function AdminUserLevels() {
  const [loading, setLoading] = useState(true)
  const [levels, setLevels] = useState<UserLevel[]>([])
  const [editing, setEditing] = useState<UserLevel | null>(null)
  const [form] = Form.useForm<LevelFormValues>()
  const [saving, setSaving] = useState(false)

  const loadLevels = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listUserLevels()
      setLevels(list || [])
    } catch (err) {
      console.error('[UserLevels] load failed:', err)
      message.error('加载等级配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLevels()
  }, [loadLevels])

  const handleEdit = (lv: UserLevel) => {
    setEditing(lv)
    form.setFieldsValue({
      name: lv.name,
      minCredits: lv.minCredits,
      maxConcurrency: lv.maxConcurrency,
      dailyCallLimit: lv.dailyCallLimit,
      monthlyCreditsLimit: lv.monthlyCreditsLimit
    })
  }

  const handleSave = async () => {
    if (!editing) return
    try {
      const values = await form.validateFields()
      const dto: UpdateUserLevelDto = {
        name: values.name,
        minCredits: values.minCredits,
        maxConcurrency: values.maxConcurrency,
        dailyCallLimit: values.dailyCallLimit,
        monthlyCreditsLimit: values.monthlyCreditsLimit
      }
      setSaving(true)
      await updateUserLevelConfig(editing.level, dto)
      message.success('等级配置已更新')
      setEditing(null)
      setLevels((prev) =>
        prev.map((l) => (l.level === editing.level ? { ...l, ...dto } : l))
      )
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[UserLevels] update failed:', err)
      message.error('更新失败')
    } finally {
      setSaving(false)
    }
  }

  const columns: TableColumnsType<UserLevel> = [
    {
      title: '等级',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (lv: number) => (
        <span style={{ color: '#c7d2fe', fontWeight: 600 }}>
          <CrownOutlined style={{ marginRight: 4 }} />Lv{lv}
        </span>
      )
    },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '最低积分',
      dataIndex: 'minCredits',
      key: 'minCredits',
      render: (v: number) => v.toLocaleString()
    },
    {
      title: '最大并发',
      dataIndex: 'maxConcurrency',
      key: 'maxConcurrency'
    },
    {
      title: '日调用上限',
      dataIndex: 'dailyCallLimit',
      key: 'dailyCallLimit',
      render: (v: number) => v.toLocaleString()
    },
    {
      title: '月积分上限',
      dataIndex: 'monthlyCreditsLimit',
      key: 'monthlyCreditsLimit',
      render: (v: number) => v.toLocaleString()
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: UserLevel) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          className={styles.ghostBtn}
          onClick={() => handleEdit(record)}
        >
          编辑
        </Button>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <CrownOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>用户等级管理</h1>
            <div className={styles.subtitle}>配置各等级配额阈值</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadLevels}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {levels.length === 0 && !loading ? (
          <Empty description="暂无等级配置" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<UserLevel>
              rowKey="level"
              columns={columns}
              dataSource={levels}
              pagination={false}
              size="middle"
            />
          </div>
        )}
      </Spin>

      <Modal
        title={`编辑等级 - Lv${editing?.level ?? ''}`}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form<LevelFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="等级名称"
            rules={[{ required: true, message: '请输入等级名称' }]}
          >
            <Input placeholder="如:免费版/基础版/专业版" maxLength={32} />
          </Form.Item>
          <Form.Item
            name="minCredits"
            label="最低积分门槛"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="maxConcurrency"
            label="最大并发数"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="dailyCallLimit"
            label="日调用上限"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="monthlyCreditsLimit"
            label="月积分上限"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
