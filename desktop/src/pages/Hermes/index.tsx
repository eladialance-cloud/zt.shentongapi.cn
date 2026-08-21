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
  Radio,
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
  ThunderboltOutlined,
  RiseOutlined
} from '@ant-design/icons'
import * as hermesApi from '@/api/hermes-api'
import { listTeams } from '@/api/team-api'
import { listN8nWorkflows } from '@/api/task-api'
import { listKnowledgeBases } from '@/api/knowledge-api'
import type { Team } from '@/types/team'
import type { N8nWorkflowItem } from '@/api/task-api'
import type { KnowledgeBase } from '@/types/knowledge'
import type {
  HermesInstance,
  HermesStatus,
  HermesSkill,
  CreateInstanceDto
} from '@/types/hermes'
import { useSystemStore } from '@/store/system'
import { NetworkError } from '@/utils/errors'
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

/** 实例执行目标中文描述 */
function executionTargetLabel(
  inst: HermesInstance,
  teams: Team[],
  n8nWorkflows: N8nWorkflowItem[]
): string {
  if (inst.executionType === 'team') {
    const t = teams.find((x) => x.id === inst.teamId)
    return t ? `团队「${t.name}」` : `团队 #${inst.teamId ?? '-'}`
  }
  if (inst.executionType === 'workflow') {
    const w = n8nWorkflows.find((x) => x.workflowId === inst.workflowId)
    return w ? `N8N「${w.name}」` : `N8N #${inst.workflowId ?? '-'}`
  }
  return '未指定'
}

export default function HermesList() {
  const navigate = useNavigate()
  const backendAvailable = useSystemStore((s) => s.backendAvailable)
  const [loading, setLoading] = useState(true)
  const [instances, setInstances] = useState<HermesInstance[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<CreateInstanceDto>()
  const [creating, setCreating] = useState(false)
  const [skills, setSkills] = useState<HermesSkill[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [n8nWorkflows, setN8nWorkflows] = useState<N8nWorkflowItem[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({})
  const executionType = Form.useWatch('executionType', createForm)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await hermesApi.listInstances()
      setInstances(list || [])
    } catch (err) {
      console.error('[HermesList] load failed:', err)
      if (!(err instanceof NetworkError) || backendAvailable) {
        message.error('加载实例列表失败')
      }
    } finally {
      setLoading(false)
    }
  }, [backendAvailable])

  /** 加载已安装技能包供创建实例时选择 */
  const loadSkills = useCallback(async () => {
    try {
      const list = await hermesApi.listInstalledSkills()
      setSkills(list || [])
    } catch (err) {
      console.error('[HermesList] load skills failed:', err)
    }
  }, [])

  /** 加载创建实例时可选的执行目标（团队 / N8N 工作流 / 知识库） */
  const loadOptions = useCallback(async () => {
    try {
      const [teamList, wfList, kbList] = await Promise.all([
        listTeams(),
        listN8nWorkflows({ pageSize: 200 }).then((r) => r.list || []),
        listKnowledgeBases(),
      ])
      setTeams(teamList || [])
      setN8nWorkflows(wfList || [])
      setKnowledgeBases(kbList || [])
    } catch (err) {
      console.error('[HermesList] load options failed:', err)
    }
  }, [])

  useEffect(() => {
    void loadData()
    void loadOptions()
  }, [loadData, loadOptions])


  /** 打开创建弹窗时加载技能包 */
  const handleOpenCreate = () => {
    void loadSkills()
    void loadOptions()
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
        skillIds: values.skillIds || [],
        executionType: values.executionType,
        teamId: values.executionType === 'team' ? values.teamId : undefined,
        workflowId: values.executionType === 'workflow' ? values.workflowId : undefined,
        knowledgeBaseId: values.knowledgeBaseId
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
          <span className={styles.pageTitleIcon}>
            <AppstoreOutlined />
          </span>
          <span>Hermes 实例</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/dashboard')}
          >
            返回
          </Button>
          <Button
            icon={<RiseOutlined />}
            onClick={() => navigate("/hermes/evolution")}
          >
            进化
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
                    <ThunderboltOutlined style={{ color: 'var(--color-text-secondary)' }} />
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
                    <span>执行目标：{executionTargetLabel(inst, teams, n8nWorkflows)}</span>
                  </div>
                  <div className={styles.cardMetaItem}>
                    <span>技能包数量：{inst.skillCount}</span>
                  </div>
                  <div className={styles.cardMetaItem}>
                    <span>创建时间：{formatTime(inst.createdAt)}</span>
                  </div>
                  {inst.status === 'error' && inst.errorMessage && (
                    <div className={styles.errorText}>
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
            label="执行目标"
            name="executionType"
            extra="实例启动后，收到的任务会派给所选团队或 N8N 工作流执行（可不选，稍后在任务里指定）"
          >
            <Radio.Group>
              <Radio value="team">OPC 团队</Radio>
              <Radio value="workflow">N8N 工作流</Radio>
            </Radio.Group>
          </Form.Item>
          {executionType === 'team' && (
            <Form.Item
              label="选择团队"
              name="teamId"
              rules={[{ required: true, message: '请选择要调度的团队' }]}
            >
              <Select
                placeholder="选择要调度的 OPC 团队"
                options={teams.map((t) => ({ label: t.name, value: t.id }))}
                allowClear
                style={{ width: '100%' }}
                notFoundContent={teams.length === 0 ? '暂无团队，请先在「团队」页创建' : undefined}
              />
            </Form.Item>
          )}
          {executionType === 'workflow' && (
            <Form.Item
              label="选择 N8N 工作流"
              name="workflowId"
              rules={[{ required: true, message: '请选择 N8N 工作流' }]}
            >
              <Select
                placeholder="选择要调度的 N8N 工作流"
                options={n8nWorkflows.map((w) => ({ label: w.name, value: w.workflowId }))}
                allowClear
                style={{ width: '100%' }}
                notFoundContent={n8nWorkflows.length === 0 ? '暂无 N8N 工作流' : undefined}
              />
            </Form.Item>
          )}
          <Form.Item
            label="知识库（可选）"
            name="knowledgeBaseId"
            extra="任务执行时可参考该知识库"
          >
            <Select
              placeholder="选择知识库（可选）"
              options={knowledgeBases.map((k) => ({ label: k.name, value: k.id }))}
              allowClear
              style={{ width: '100%' }}
              notFoundContent={knowledgeBases.length === 0 ? '暂无知识库，可在「知识库」页创建' : undefined}
            />
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
