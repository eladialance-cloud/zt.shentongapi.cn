// OPC 团队列表
// SubTask 14.1: 卡片网格展示团队 + 创建团队（模态框）+ 查看详情 + 删除
// 调用 GET /opc/teams、POST /opc/teams、DELETE /opc/teams/:id

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
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  TeamOutlined,
  UserOutlined,
  ApartmentOutlined
} from '@ant-design/icons'
import * as opcApi from '@/api/opc-api'
import type {
  OPCTeam,
  CreateTeamDto,
  SelectableAgent
} from '@/types/opc'
import styles from './styles.module.css'

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

interface CreateFormValues extends CreateTeamDto {
  memberAgentIds?: number[]
}

export default function OPCTeamList() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<OPCTeam[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<CreateFormValues>()
  const [creating, setCreating] = useState(false)
  const [agents, setAgents] = useState<SelectableAgent[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await opcApi.listTeams()
      setTeams(list || [])
    } catch (err) {
      console.error('[OPCTeamList] load failed:', err)
      message.error('加载团队列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  /** 加载可选 Agent 列表 */
  const loadAgents = useCallback(async () => {
    try {
      const list = await opcApi.listSelectableAgents()
      setAgents(list || [])
    } catch (err) {
      console.error('[OPCTeamList] load agents failed:', err)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 打开创建弹窗时加载 Agent */
  const handleOpenCreate = () => {
    void loadAgents()
    createForm.resetFields()
    setCreateOpen(true)
  }

  /** 创建团队 */
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setCreating(true)
      const dto: CreateTeamDto = {
        name: values.name,
        description: values.description,
        memberAgentIds: values.memberAgentIds || []
      }
      const team = await opcApi.createTeam(dto)
      message.success(`团队 "${team.name}" 创建成功`)
      setCreateOpen(false)
      createForm.resetFields()
      setTeams((prev) => [...prev, team])
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[OPCTeamList] create failed:', err)
      message.error('创建团队失败: ' + (err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  /** 删除团队 */
  const handleDelete = async (team: OPCTeam) => {
    try {
      await opcApi.deleteTeam(team.id)
      message.success(`团队 "${team.name}" 已删除`)
      setTeams((prev) => prev.filter((t) => t.id !== team.id))
    } catch (err) {
      console.error('[OPCTeamList] delete failed:', err)
      message.error('删除失败: ' + (err as Error).message)
    }
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <TeamOutlined />
          <span>OPC 虚拟团队</span>
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
            type="primary"
            className={styles.primaryBtn}
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
          >
            创建团队
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {teams.length === 0 && !loading ? (
          <Empty description="暂无团队，点击右上角创建" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.teamGrid}>
            {teams.map((team) => (
              <Card
                key={team.id}
                className={styles.teamCard}
                bordered={false}
                onClick={() => navigate(`/opc/${team.id}`)}
              >
                <div className={styles.teamCardTitle}>
                  <TeamOutlined style={{ marginRight: 6, color: '#a5b4fc' }} />
                  {team.name}
                </div>
                <div className={styles.teamCardDesc}>
                  {team.description || '暂无描述'}
                </div>
                <div className={styles.teamCardMeta}>
                  <span>
                    <UserOutlined style={{ marginRight: 4 }} />
                    {team.memberCount} 成员
                  </span>
                  <span>
                    <ApartmentOutlined style={{ marginRight: 4 }} />
                    {team.taskCount} 任务
                  </span>
                  <span>创建于 {formatTime(team.createdAt)}</span>
                </div>
                <div
                  className={styles.teamCardActions}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="small"
                    type="primary"
                    className={styles.primaryBtn}
                    icon={<EyeOutlined />}
                    onClick={() => navigate(`/opc/${team.id}`)}
                  >
                    查看详情
                  </Button>
                  <Popconfirm
                    title="确定删除该团队吗？"
                    description="将同步移除所有成员与任务关联"
                    onConfirm={() => handleDelete(team)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>

      {/* 创建团队弹窗 */}
      <Modal
        title="创建 OPC 团队"
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
            label="团队名称"
            name="name"
            rules={[
              { required: true, message: '请输入团队名称' },
              { max: 64, message: '名称最多 64 个字符' }
            ]}
          >
            <Input placeholder="如 营销内容生产团队" />
          </Form.Item>
          <Form.Item
            label="团队描述"
            name="description"
            rules={[{ max: 256, message: '描述最多 256 个字符' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="可选，团队职责描述"
              maxLength={256}
              showCount
            />
          </Form.Item>
          <Form.Item
            label="初始成员"
            name="memberAgentIds"
            extra="可选，从可用 Agent 中选择初始成员"
          >
            <Select
              mode="multiple"
              placeholder="选择 Agent 作为初始成员"
              options={agents.map((a) => ({
                label: a.name,
                value: a.id
              }))}
              allowClear
              style={{ width: '100%' }}
              notFoundContent={
                agents.length === 0 ? '暂无可用 Agent' : undefined
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
