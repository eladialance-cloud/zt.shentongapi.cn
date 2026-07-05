// Hermes 实例列表
// SubTask 13.1: 卡片网格展示实例 + 创建/启动/停止/删除/查看详情
// 调用 GET /hermes/instances、POST /hermes/instances、POST /hermes/instances/:id/start|stop、DELETE /hermes/instances/:id

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Tag,
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  PoweroffOutlined,
  EyeOutlined,
  ThunderboltOutlined
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

export default function HermesList() {
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
      console.error('[HermesList] load failed:', err)
      message.error('加载实例列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  /** 加载已安装技能包供创建实例时选择 */
  const loadSkills = useCallback(async () => {
    try {
      const list = await hermesApi.listInstalledSkills()
      setSkills(list || [])
    } catch (err) {
      console.error('[HermesList] load skills failed:', err)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 打开创建弹窗时加载技能包 */
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
      setInstances((prev) => [...prev, inst])
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[HermesList] create failed:', err)
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
      console.error('[HermesList] start failed:', err)
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
      console.error('[HermesList] stop failed:', err)
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
      console.error('[HermesList] delete failed:', err)
      message.error('删除失败: ' + (err as Error).message)
    } finally {
      setActionState(inst.id, false)
    }
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <AppstoreOutlined />
          <span>Hermes 实例</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<ThunderboltOutlined />}
            onClick={() => navigate('/hermes/skills')}
          >
            技能包市场
          </Button>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/dashboard')}
          >
            返回
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
          >
            创建实例
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {instances.length === 0 && !loading ? (
          <Empty description="暂无实例，点击右上角创建" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.instanceGrid}>
            {instances.map((inst) => (
              <Card key={inst.id} className={styles.instanceCard} bordered={false}>
                <div className={styles.cardTitleRow}>
                  <span className={styles.cardName}>{inst.name}</span>
                  <Tag className={statusClass(inst.status)}>
                    {statusLabel(inst.status)}
                  </Tag>
                </div>

                <div className={styles.cardMeta}>
                  <div className={styles.cardMetaItem}>
                    <ThunderboltOutlined style={{ color: '#a5b4fc' }} />
                    <span>
                      CPU:{' '}
                      {inst.resourceUsage
                        ? `${inst.resourceUsage.cpuPercent.toFixed(1)}%`
                        : '-'}
                    </span>
                    <span style={{ marginLeft: 12 }}>
                      内存:{' '}
                      {inst.resourceUsage
                        ? `${inst.resourceUsage.memoryUsedMb}/${inst.resourceUsage.memoryTotalMb} MB`
                        : '-'}
                    </span>
                  </div>
                  <div className={styles.cardMetaItem}>
                    <span>技能包数量：{inst.skillCount}</span>
                  </div>
                  <div className={styles.cardMetaItem}>
                    <span>创建时间：{formatTime(inst.createdAt)}</span>
                  </div>
                  {inst.status === 'error' && inst.errorMessage && (
                    <div style={{ color: '#fca5a5', fontSize: 11 }}>
                      错误：{inst.errorMessage}
                    </div>
                  )}
                </div>

                <div className={styles.cardActions}>
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
              </Card>
            ))}
          </div>
        )}
      </Spin>

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
