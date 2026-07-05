// Hermes 实例详情
// SubTask 13.2 + 13.4: 基本信息 + 资源占用进度条 + 任务历史 + 技能包挂载列表 + 卸载
// 调用 GET /hermes/instances/:id、GET /hermes/instances/:id/call-logs、POST /hermes/instances/:id/skills/:skillId/unmount

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Empty,
  Pagination,
  Popconfirm,
  Progress,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  HistoryOutlined,
  DisconnectOutlined,
  ReloadOutlined,
  DatabaseOutlined
} from '@ant-design/icons'
import * as hermesApi from '@/api/hermes-api'
import type {
  HermesInstance,
  HermesStatus,
  InstalledSkill,
  CallLog,
  CallStatus,
  CallType
} from '@/types/hermes'
import styles from './styles.module.css'

const PAGE_SIZE = 20

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

/** 调用类型中文 */
function callTypeLabel(t: CallType): string {
  switch (t) {
    case 'skill_execute':
      return '技能执行'
    case 'tool_call':
      return '工具调用'
    case 'agent_invoke':
      return 'Agent 调用'
    case 'workflow_run':
      return '工作流运行'
    default:
      return t
  }
}

/** 调用状态中文 */
function callStatusLabel(s: CallStatus): string {
  switch (s) {
    case 'success':
      return '成功'
    case 'failed':
      return '失败'
    case 'timeout':
      return '超时'
    case 'running':
      return '运行中'
    default:
      return s
  }
}

function callStatusClass(s: CallStatus): string {
  switch (s) {
    case 'success':
      return styles.callStatusSuccess
    case 'failed':
      return styles.callStatusFailed
    case 'timeout':
      return styles.callStatusTimeout
    case 'running':
      return styles.callStatusRunning
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

/** 格式化时长（毫秒） */
function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '-'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60 * 1000) return `${(ms / 1000).toFixed(2)} s`
  return `${(ms / (60 * 1000)).toFixed(2)} min`
}

export default function HermesDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const instanceId = id ? Number(id) : NaN

  const [instance, setInstance] = useState<HermesInstance | null>(null)
  const [loading, setLoading] = useState(false)
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPage, setLogsPage] = useState(1)
  const [logsLoading, setLogsLoading] = useState(false)
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [unmounting, setUnmounting] = useState<Record<number, boolean>>({})

  /** 加载实例详情 */
  const loadInstance = useCallback(async () => {
    if (!Number.isFinite(instanceId)) return
    setLoading(true)
    try {
      const inst = await hermesApi.getInstance(instanceId)
      setInstance(inst)
      // 同时加载已安装技能包（用于挂载列表展示）
      const installed = await hermesApi.listInstalledSkills()
      // 仅显示已挂载到本实例的技能包（通过 skillIds 过滤）
      const mountedIds = inst.skillIds || []
      const mounted = installed.filter((s) => mountedIds.includes(s.id))
      setSkills(mounted.map((s) => ({ ...s, mounted: true })))
    } catch (err) {
      console.error('[HermesDetail] load instance failed:', err)
      message.error('加载实例详情失败')
    } finally {
      setLoading(false)
    }
  }, [instanceId])

  /** 加载任务历史 */
  const loadCallLogs = useCallback(async () => {
    if (!Number.isFinite(instanceId)) return
    setLogsLoading(true)
    try {
      const result = await hermesApi.getCallLogs(instanceId, {
        page: logsPage,
        pageSize: PAGE_SIZE
      })
      setCallLogs(result.list || [])
      setLogsTotal(result.total || 0)
    } catch (err) {
      console.error('[HermesDetail] load call logs failed:', err)
      message.error('加载任务历史失败')
    } finally {
      setLogsLoading(false)
    }
  }, [instanceId, logsPage])

  useEffect(() => {
    void loadInstance()
  }, [loadInstance])

  useEffect(() => {
    void loadCallLogs()
  }, [loadCallLogs])

  /** 卸载技能包 */
  const handleUnmount = async (skill: InstalledSkill) => {
    setUnmounting((prev) => ({ ...prev, [skill.id]: true }))
    try {
      const updated = await hermesApi.unmountSkill(instanceId, skill.id)
      message.success(`技能包 "${skill.name}" 已卸载`)
      setInstance(updated)
      setSkills((prev) => prev.filter((s) => s.id !== skill.id))
    } catch (err) {
      console.error('[HermesDetail] unmount failed:', err)
      message.error('卸载失败: ' + (err as Error).message)
    } finally {
      setUnmounting((prev) => ({ ...prev, [skill.id]: false }))
    }
  }

  /** 任务历史表格列 */
  const logColumns: TableColumnsType<CallLog> = [
    {
      title: '调用类型',
      dataIndex: 'callType',
      key: 'callType',
      width: 120,
      render: (t: CallType) => (
        <span style={{ color: '#a5b4fc' }}>{callTypeLabel(t)}</span>
      )
    },
    {
      title: '目标',
      dataIndex: 'target',
      key: 'target',
      render: (v?: string) => (
        <span style={{ color: '#e6edf3' }}>{v || '-'}</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: CallStatus) => (
        <Tag className={callStatusClass(s)}>{callStatusLabel(s)}</Tag>
      )
    },
    {
      title: '时长',
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 120,
      render: (v: number) => (
        <span style={{ color: '#94a3b8' }}>{formatDuration(v)}</span>
      )
    },
    {
      title: '消耗积分',
      dataIndex: 'creditsCost',
      key: 'creditsCost',
      width: 120,
      render: (v: number) => (
        <span style={{ color: '#22d3ee', fontWeight: 600 }}>
          {v.toLocaleString()}
        </span>
      )
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatTime(v)
    }
  ]

  if (loading && !instance) {
    return (
      <div className={styles.pageContainer}>
        <Spin
          fullscreen
          tip="加载中..."
          style={{ background: 'rgba(10, 14, 26, 0.85)' }}
        />
      </div>
    )
  }

  if (!instance) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.emptyState}>
          <AppstoreOutlined className={styles.emptyStateIcon} />
          <div className={styles.emptyStateText}>实例不存在或加载失败</div>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/hermes')}
          >
            返回列表
          </Button>
        </div>
      </div>
    )
  }

  const cpuPct = instance.resourceUsage?.cpuPercent ?? 0
  const memUsed = instance.resourceUsage?.memoryUsedMb ?? 0
  const memTotal = instance.resourceUsage?.memoryTotalMb ?? 0
  const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <AppstoreOutlined />
          <span>{instance.name}</span>
          <Tag className={statusClass(instance.status)}>
            {statusLabel(instance.status)}
          </Tag>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/hermes')}
          >
            返回列表
          </Button>
          <Button
            className={styles.backBtn}
            icon={<ReloadOutlined />}
            onClick={() => {
              void loadInstance()
              void loadCallLogs()
            }}
          >
            刷新
          </Button>
        </div>
      </div>

      <div className={styles.detailContainer}>
        {/* ===== 基本信息 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <DatabaseOutlined />
              基本信息
            </span>
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>实例 ID</span>
              <span className={styles.infoValue}>#{instance.id}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>名称</span>
              <span className={styles.infoValue}>{instance.name}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>技能包数量</span>
              <span className={styles.infoValue}>{instance.skillCount}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>创建时间</span>
              <span className={styles.infoValue}>{formatTime(instance.createdAt)}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>更新时间</span>
              <span className={styles.infoValue}>{formatTime(instance.updatedAt)}</span>
            </div>
            {instance.status === 'error' && instance.errorMessage && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>错误信息</span>
                <span style={{ color: '#fca5a5' }}>{instance.errorMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* ===== 资源占用 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <ThunderboltOutlined />
              资源占用
            </span>
          </div>
          {instance.status === 'running' ? (
            <div className={styles.resourceBar}>
              <div className={styles.resourceItem}>
                <div className={styles.resourceHeader}>
                  <span>CPU 使用率</span>
                  <span className={styles.resourceValue}>
                    {cpuPct.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  percent={Math.min(cpuPct, 100)}
                  strokeColor={{ from: '#6366f1', to: '#8b5cf6' }}
                  showInfo={false}
                />
              </div>
              <div className={styles.resourceItem}>
                <div className={styles.resourceHeader}>
                  <span>内存占用</span>
                  <span className={styles.resourceValue}>
                    {memUsed} / {memTotal} MB（{memPct.toFixed(1)}%）
                  </span>
                </div>
                <Progress
                  percent={Math.min(memPct, 100)}
                  strokeColor={{ from: '#22d3ee', to: '#34d399' }}
                  showInfo={false}
                />
              </div>
            </div>
          ) : (
            <div style={{ color: '#6e7681', fontSize: 12 }}>
              实例未运行，暂无资源占用数据
            </div>
          )}
        </div>

        {/* ===== 任务历史 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <HistoryOutlined />
              任务历史（最近 {PAGE_SIZE} 条）
            </span>
          </div>
          <Spin spinning={logsLoading}>
            {callLogs.length === 0 && !logsLoading ? (
              <Empty description="暂无任务历史" />
            ) : (
              <Table<CallLog>
                columns={logColumns}
                dataSource={callLogs}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 'max-content' }}
              />
            )}
            {logsTotal > PAGE_SIZE && (
              <div style={{ textAlign: 'right', marginTop: 16 }}>
                <Pagination
                  current={logsPage}
                  pageSize={PAGE_SIZE}
                  total={logsTotal}
                  showSizeChanger={false}
                  onChange={(p) => setLogsPage(p)}
                />
              </div>
            )}
          </Spin>
        </div>

        {/* ===== 技能包挂载列表 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <AppstoreOutlined />
              已挂载技能包（{skills.length}）
            </span>
            <Button
              className={styles.backBtn}
              size="small"
              onClick={() => navigate('/hermes/skills')}
            >
              进入技能包市场
            </Button>
          </div>
          {skills.length === 0 ? (
            <Empty description="暂无挂载的技能包" />
          ) : (
            <div className={styles.skillGrid}>
              {skills.map((skill) => (
                <div key={skill.id} className={styles.skillCard}>
                  <div className={styles.skillCardBody}>
                    <div className={styles.skillHeader}>
                      <div className={styles.skillName}>
                        <div className={styles.skillIcon}>
                          <ThunderboltOutlined />
                        </div>
                        <span>{skill.name}</span>
                      </div>
                      <Tag className={styles.installedTag}>已挂载</Tag>
                    </div>
                    <div className={styles.skillDesc}>
                      {skill.description || '暂无描述'}
                    </div>
                    <div className={styles.skillMeta}>
                      <span className={styles.skillAuthor}>
                        作者：{skill.author}
                      </span>
                      <span
                        className={
                          skill.pricePerMinute === 0
                            ? styles.skillPriceFree
                            : styles.skillPrice
                        }
                      >
                        {skill.pricePerMinute === 0
                          ? '免费'
                          : `${skill.pricePerMinute} 积分/分钟`}
                      </span>
                    </div>
                    <div className={styles.skillActions}>
                      <Popconfirm
                        title="确定卸载该技能包吗？"
                        description="卸载后该实例将无法调用此技能"
                        onConfirm={() => handleUnmount(skill)}
                        okText="卸载"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          size="small"
                          danger
                          icon={<DisconnectOutlined />}
                          loading={!!unmounting[skill.id]}
                        >
                          卸载
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
