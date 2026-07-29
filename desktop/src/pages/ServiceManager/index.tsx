// 客户端本地服务管理 - 服务状态面板（Task 16）
// SubTask 16.1: 四个服务状态卡片（OpenClaw/N8N/MCP/Hermes）
// SubTask 16.3: 监听 service:error 弹窗通知
// 通过 IPC 实时更新状态 + 轮询 CPU/内存
// 支持一键修复全部 & 单服务修复 + 安装进度展示

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Spin,
  Empty,
  Tooltip,
  Popconfirm,
  notification,
  message
} from 'antd'
import {
  RollbackOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  CloudServerOutlined,
  ApartmentOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  ToolOutlined
} from '@ant-design/icons'
import {
  listServices,
  startService,
  stopService,
  restartService,
  installService,
  onServiceStatusChanged,
  onServiceError,
  onInstallProgress
} from '@/api/service-manager-api'
import type {
  ServiceName,
  ServiceInfo,
  ServiceStatus
} from '@/types/service-manager'
import type { InstallProgressPayload } from '@shared/types'
import styles from './styles.module.css'

/** 服务图标映射 */
const SERVICE_ICONS: Record<ServiceName, React.ReactNode> = {
  openclaw: <CloudServerOutlined style={{ color: '#6366f1' }} />,
  n8n: <ApartmentOutlined style={{ color: '#8b5cf6' }} />,
  mcp: <ApiOutlined style={{ color: '#06b6d4' }} />,
  hermes: <ThunderboltOutlined style={{ color: '#f59e0b' }} />
}

/** 状态展示配置 */
const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; className: string }
> = {
  running: { label: '运行中', className: styles.statusRunning },
  stopped: { label: '已停止', className: styles.statusStopped },
  starting: { label: '启动中', className: styles.statusStarting },
  error: { label: '错误', className: styles.statusError },
  unknown: { label: '未知', className: styles.statusUnknown }
}

/** 需要显示修复按钮的状态 */
const REPAIRABLE_STATUSES: ServiceStatus[] = ['error', 'unknown', 'stopped']

/** 格式化时间 */
function formatTime(value: string | undefined | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function ServiceManager() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<ServiceInfo[]>([])
  /** 正在执行操作的服务（防止重复点击） */
  const [busy, setBusy] = useState<Set<ServiceName>>(new Set())
  /** 安装进度（按服务名） */
  const [installProgress, setInstallProgress] = useState<
    Partial<Record<ServiceName, InstallProgressPayload>>
  >({})
  /** 正在修复中的服务集合 */
  const [repairing, setRepairing] = useState<Set<ServiceName>>(new Set())

  const loadData = useCallback(async () => {
    try {
      const list = await listServices()
      setServices(list || [])
    } catch (err) {
      console.error('[ServiceManager] load failed:', err)
      setServices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 监听状态变更事件，实时更新对应服务
  useEffect(() => {
    const unsub = onServiceStatusChanged((payload) => {
      setServices((prev) => {
        const idx = prev.findIndex((s) => s.name === payload.name)
        if (idx < 0) return prev
        const next = [...prev]
        next[idx] = payload.info
        return next
      })
    })
    return () => {
      unsub()
    }
  }, [])

  // 监听服务错误事件，弹窗通知
  useEffect(() => {
    const unsub = onServiceError((payload) => {
      notification.error({
        key: `service-error-${payload.name}`,
        message: `服务异常：${payload.name}`,
        description: `${payload.message}（已重试 ${payload.retryCount} 次）`,
        duration: 0
      })
    })
    return () => {
      unsub()
    }
  }, [])

  // 监听安装进度推送
  useEffect(() => {
    const unsub = onInstallProgress((payload) => {
      setInstallProgress((prev) => ({
        ...prev,
        [payload.name]: payload
      }))
    })
    return () => {
      unsub()
    }
  }, [])

  // 轮询刷新 CPU/内存（2s 一次）
  useEffect(() => {
    const timer = setInterval(() => {
      void loadData()
    }, 2000)
    return () => clearInterval(timer)
  }, [loadData])

  const setBusyFor = (name: ServiceName, value: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev)
      if (value) next.add(name)
      else next.delete(name)
      return next
    })
  }

  const setRepairingFor = (name: ServiceName, value: boolean) => {
    setRepairing((prev) => {
      const next = new Set(prev)
      if (value) next.add(name)
      else next.delete(name)
      return next
    })
  }

  const handleStart = async (name: ServiceName) => {
    setBusyFor(name, true)
    try {
      const ok = await startService(name)
      if (ok) message.success(`${name} 已启动`)
      else message.warning(`${name} 启动中，请稍候`)
      void loadData()
    } catch (err) {
      console.error('[ServiceManager] start failed:', err)
      message.error(`启动失败: ${(err as Error).message}`)
    } finally {
      setBusyFor(name, false)
    }
  }

  const handleStop = async (name: ServiceName) => {
    setBusyFor(name, true)
    try {
      await stopService(name)
      message.success(`${name} 已停止`)
      void loadData()
    } catch (err) {
      console.error('[ServiceManager] stop failed:', err)
      message.error(`停止失败: ${(err as Error).message}`)
    } finally {
      setBusyFor(name, false)
    }
  }

  const handleRestart = async (name: ServiceName) => {
    setBusyFor(name, true)
    try {
      const ok = await restartService(name)
      if (ok) message.success(`${name} 已重启`)
      else message.warning(`${name} 重启中，请稍候`)
      void loadData()
    } catch (err) {
      console.error('[ServiceManager] restart failed:', err)
      message.error(`重启失败: ${(err as Error).message}`)
    } finally {
      setBusyFor(name, false)
    }
  }

  /** 修复单个服务（重新安装运行时） */
  const handleRepair = async (name: ServiceName) => {
    setRepairingFor(name, true)
    setInstallProgress((prev) => ({
      ...prev,
      [name]: { name, percent: 0 }
    }))
    try {
      const ok = await installService(name)
      if (ok) {
        message.success(`${name} 修复完成`)
        // 修复后刷新服务列表
        void loadData()
      } else {
        message.warning(`${name} 修复未成功`)
      }
    } catch (err) {
      console.error('[ServiceManager] repair failed:', err)
      message.error(`修复失败: ${(err as Error).message}`)
    } finally {
      setRepairingFor(name, false)
      // 清除进度（延迟，让用户看到 100%）
      setTimeout(() => {
        setInstallProgress((prev) => {
          const next = { ...prev }
          delete next[name]
          return next
        })
      }, 1500)
    }
  }

  /** 一键修复全部（修复所有非 running 的服务） */
  const handleRepairAll = async () => {
    const needRepair = services.filter(
      (s) => !REPAIRABLE_STATUSES.includes(s.status) ? false : true
    )
    // 更精确：error/unknown/stopped 都需要修复
    const toRepair = services.filter((s) =>
      REPAIRABLE_STATUSES.includes(s.status)
    )
    if (toRepair.length === 0) {
      message.info('所有服务运行正常，无需修复')
      return
    }
    message.info(`开始修复 ${toRepair.length} 个服务...`)
    // 串行修复，避免下载冲突
    for (const svc of toRepair) {
      await handleRepair(svc.name)
    }
  }

  /** 检查是否有需要修复的服务 */
  const hasRepairableServices = services.some((s) =>
    REPAIRABLE_STATUSES.includes(s.status)
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ApartmentOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>本地服务管理</h1>
            <div className={styles.subtitle}>
              管理 OpenClaw / N8N / MCP Gateway / Hermes Agent 四个本地服务进程
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          {hasRepairableServices && (
            <Button
              className={styles.repairAllBtn}
              icon={<ToolOutlined />}
              loading={repairing.size > 0}
              onClick={() => void handleRepairAll()}
            >
              一键修复全部
            </Button>
          )}
          <Button
            icon={<RollbackOutlined />}
            onClick={() => navigate('/dashboard')}
            className={styles.backBtn}
          >
            返回主页
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {services.length === 0 && !loading ? (
          <div className={styles.emptyWrap}>
            <Empty description="暂无服务信息（electronAPI 不可用）" />
          </div>
        ) : (
          <div className={styles.grid}>
            {services.map((svc) => {
              const cfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.unknown
              const isRunning = svc.status === 'running'
              const isBusy = busy.has(svc.name)
              const isRepairing = repairing.has(svc.name)
              const progress = installProgress[svc.name]
              const canRepair =
                REPAIRABLE_STATUSES.includes(svc.status) && !isRunning && !isBusy
              return (
                <Card key={svc.name} className={styles.card} bordered={false}>
                  {/* 头部：服务名 + 状态 */}
                  <div className={styles.cardHeader}>
                    <div className={styles.serviceName}>
                      {SERVICE_ICONS[svc.name] ?? <CloudServerOutlined />}
                      {svc.displayName}
                    </div>
                    <span className={`${styles.statusBadge} ${cfg.className}`}>
                      <span className={styles.statusDot} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* 错误信息 */}
                  {svc.status === 'error' && svc.error && (
                    <div className={styles.errorMsg}>
                      ⚠️ {svc.error}
                      <div className={styles.errorHint}>
                        可点击修复重新安装运行时
                      </div>
                    </div>
                  )}

                  {/* 修复进度条 */}
                  {isRepairing && progress && (
                    <div className={styles.progressContainer}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${progress.percent ?? 0}%` }}
                        />
                      </div>
                      <div className={styles.progressText}>
                        <span className={styles.progressPercent}>
                          {(progress.percent ?? 0).toFixed(1)}%
                        </span>
                        {progress.speedKBs != null && (
                          <span className={styles.progressMeta}>
                            {progress.speedKBs.toFixed(0)} KB/s
                            {progress.etaSec != null
                              ? ` · ETA ${progress.etaSec}s`
                              : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 指标 */}
                  <div className={styles.metrics}>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>端口</span>
                      <span className={styles.metricValue}>{svc.port}</span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>PID</span>
                      <span className={styles.metricValue}>
                        {svc.pid ?? '-'}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>启动时间</span>
                      <span className={styles.metricValue}>
                        {formatTime(svc.startTime)}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>CPU / 内存</span>
                      <span className={styles.metricValue}>
                        {isRunning
                          ? `${svc.cpuUsage != null ? svc.cpuUsage.toFixed(1) : '-'}% / ${svc.memoryUsage != null ? svc.memoryUsage + ' MB' : '-'}`
                          : '-'}
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className={styles.actions}>
                    <Tooltip title="启动">
                      <Button
                        className={styles.primaryBtn}
                        icon={<PlayCircleOutlined />}
                        loading={isBusy}
                        disabled={isRunning || isRepairing}
                        onClick={() => handleStart(svc.name)}
                      >
                        启动
                      </Button>
                    </Tooltip>
                    <Popconfirm
                      title={`确定停止 ${svc.displayName} 吗？`}
                      onConfirm={() => handleStop(svc.name)}
                      okText="停止"
                      cancelText="取消"
                      disabled={!isRunning}
                    >
                      <Tooltip title="停止">
                        <Button
                          className={styles.dangerBtn}
                          icon={<StopOutlined />}
                          loading={isBusy}
                          disabled={!isRunning || isRepairing}
                        >
                          停止
                        </Button>
                      </Tooltip>
                    </Popconfirm>
                    <Button
                      className={styles.ghostBtn}
                      icon={<ReloadOutlined />}
                      loading={isBusy}
                      disabled={isRepairing}
                      onClick={() => handleRestart(svc.name)}
                    >
                      重启
                    </Button>
                    {canRepair && (
                      <Button
                        className={styles.repairBtn}
                        icon={<ToolOutlined />}
                        loading={isRepairing}
                        disabled={isRepairing}
                        onClick={() => void handleRepair(svc.name)}
                      >
                        {isRepairing && progress
                          ? `修复中 ${(progress.percent ?? 0).toFixed(0)}%`
                          : '修复'}
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </Spin>
    </div>
  )
}
