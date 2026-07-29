// Hermes 实例列表（表格）
// SubTask 6.1: 表格展示实例 + 创建/启动/停止/删除/查看详情
// 调用 listInstances / createInstance / startInstance / stopInstance / deleteInstance / listInstalledSkills

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import * as hermesApi from '@/api/hermes-api'
import type {
  HermesInstance,
  HermesStatus,
  HermesSkill,
  CreateInstanceDto
} from '@/types/hermes'
import styles from './styles.module.css'

/** 状态中文标签 */
function statusLabel(status: HermesStatus): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'stopped':
      return '已停止'
    case 'error':
      return '错误'
    default:
      return status
  }
}

/** 状态 className */
function statusClass(status: HermesStatus): string {
  switch (status) {
    case 'running':
      return styles.statusRunning
    case 'stopped':
      return styles.statusStopped
    case 'error':
      return styles.statusError
    default:
      return ''
  }
}

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function InstanceList() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [instances, setInstances] = useState<HermesInstance[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<CreateInstanceDto>()
  const [creating, setCreating] = useState(false)
  const [skills, setSkills] = useState<HermesSkill[]>([])
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await hermesApi.listInstances()
      setInstances(list || [])
    } catch (err) {
      console.error('[InstanceList] load failed:', err)
      message.error('加载实例列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 加载已安装技能包供创建实例时选择 */
  const loadSkills = useCallback(async () => {
    try {
      const list = await hermesApi.listInstalledSkills()
      setSkills(list || [])
    } catch (err) {
      console.error('[InstanceList] load skills failed:', err)
    }
  }, [])

  const handleOpenCreate = () => {
    void loadSkills()
    createForm.resetFields()
    setCreateOpen(true)
  }

  /** 创建实例 */
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setCreating(true)
      const dto: CreateInstanceDto = {
        name: values.name,
        skillIds: values.skillIds || []
      }
      const inst = await hermesApi.createInstance(dto)
      message.success(`实例 "${inst.name}" 创建成功`)
      setCreateOpen(false)
      createForm.resetFields()
      setInstances((prev) => [inst, ...prev])
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[InstanceList] create failed:', err)
      message.error('创建实例失败: ' + (err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const setActionState = (id: number, isLoading: boolean) => {
    setActionLoading((prev) => ({ ...prev, [id]: isLoading }))
  }

  /** 启动 */
  const handleStart = async (inst: HermesInstance) => {
    setActionState(inst.id, true)
    try {
      const updated = await hermesApi.startInstance(inst.id)
      message.success(`实例 "${inst.name}" 已启动`)
      setInstances((prev) => prev.map((i) => (i.id === inst.id ? updated : i)))
    } catch (err) {
      console.error('[InstanceList] start failed:', err)
      message.error('启动失败: ' + (err as Error).message)
    } finally {
      setActionState(inst.id, false)
    }
  }

  /** 停止 */
  const handleStop = async (inst: HermesInstance) => {
    setActionState(inst.id, true)
    try {
      const updated = await hermesApi.stopInstance(inst.id)
      message.success(`实例 "${inst.name}" 已停止`)
      setInstances((prev) => prev.map((i) => (i.id === inst.id ? updated : i)))
    } catch (err) {
      console.error('[InstanceList] stop failed:', err)
      message.error('停止失败: ' + (err as Error).message)
    } finally {
      setActionState(inst.id, false)
    }
  }

  /** 删除 */
  const handleDelete = async (inst: HermesInstance) => {
    setActionState(inst.id, true)
    try {
      await hermesApi.deleteInstance(inst.id)
      message.success(`实例 "${inst.name}" 已删除`)
      setInstances((prev) => prev.filter((i) => i.id !== inst.id))
    } catch (err) {
      console.error('[InstanceList] delete failed:', err)
      message.error('删除失败: ' + (err as Error).message)
    } finally {
      setActionState(inst.id, false)
    }
  }

  const columns: TableColumnsType<HermesInstance> = [
    {
      title: '实例名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, inst: HermesInstance) => (
        <Button
          type="link"
          style={{ padding: 0, color: 'var(--color-primary)' }}
          onClick={() => navigate(`/hermes/${inst.id}`)}
        >
          {name}
        </Button>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: HermesStatus) => (
        <Tag className={statusClass(s)}>{statusLabel(s)}</Tag>
      )
    },
    {
      title: '技能包数量',
      dataIndex: 'skillCount',
      key: 'skillCount',
      width: 110,
      render: (v: number) => (
        <span style={{ color: 'var(--color-primary)' }}>{v}</span>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatTime(v)
    },
    {
      title: '操作',
      key: 'actions',
      width: 300,
      render: (_: unknown, inst: HermesInstance) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/hermes/${inst.id}`)}
          >
            详情
          </Button>
          {inst.status !== 'running' && (
            <Button
              size="small"
              type="primary"
              className={styles.primaryBtn}
              icon={<PlayCircleOutlined />}
              loading={!!actionLoading[inst.id]}
              onClick={() => handleStart(inst)}
            >
              启动
            </Button>
          )}
          {inst.status === 'running' && (
            <Button
              size="small"
              icon={<PoweroffOutlined />}
              loading={!!actionLoading[inst.id]}
              onClick={() => handleStop(inst)}
            >
              停止
            </Button>
          )}
          <Popconfirm
            title="确定删除该实例吗？"
            onConfirm={() => handleDelete(inst)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={!!actionLoading[inst.id]}
            >
              删除
            </Button>
          </Popconfirm>
        </div>
      )
    }
  ]

  return (
    <div>
      <div className={styles.tabToolbar}>
        <span className={styles.tabCount}>共 {instances.length} 个实例</span>
        <div className={styles.tabActions}>
          <Button
            className={styles.backBtn}
            icon={<ReloadOutlined />}
            onClick={() => void loadData()}
          >
            刷新
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
          >
            新建实例
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : (
        <Table<HermesInstance>
          columns={columns}
          dataSource={instances}
          rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '暂无实例，点击右上角"新建实例"创建' }}
        />
      )}

      {/* 创建实例弹窗 */}
      <Modal
        title="创建 Hermes 实例"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false)
          createForm.resetFields()
        }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            label="实例名称"
            name="name"
            rules={[
              { required: true, message: '请输入实例名称' },
              { max: 64, message: '名称最多 64 个字符' }
            ]}
          >
            <Input placeholder="如 my-hermes-01" />
          </Form.Item>
          <Form.Item
            label="初始技能包"
            name="skillIds"
            extra="可选，从已安装技能包中选择初始挂载项"
          >
            <Select
              mode="multiple"
              placeholder="选择已安装的技能包（可选）"
              options={skills.map((s) => ({ label: s.name, value: s.id }))}
              allowClear
              style={{ width: '100%' }}
              notFoundContent={
                skills.length === 0 ? '暂无已安装技能包，可创建后再挂载' : undefined
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
