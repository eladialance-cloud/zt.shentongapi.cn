/**
 * StatusBar — v1.0 底部状态栏
 * 28px 高度，6 个指示器:
 *   OpenClaw(51096) / N8N(5678) / MCP(3100) / 网络 / 同步 / 版本
 * 服务状态优先读取 service-manager-api，失败时使用占位状态
 *
 * Task 5: 同步状态 Modal（当前使用占位日志）
 * Task 6: 版本号点击触发 updater.check()，按结果展示 Modal
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Empty,
  List,
  Modal,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import {
  listServices,
  onServiceStatusChanged
} from '@/api/service-manager-api'
import type { ServiceName, ServiceStatus, UpdateStatusPayload } from '@shared/types'
import styles from './StatusBar.module.css'

type IndicatorStatus = 'running' | 'warning' | 'stopped' | 'unknown'

interface ServiceIndicator {
  name: ServiceName
  label: string
  port: number
}

const SERVICES: ServiceIndicator[] = [
  { name: 'openclaw', label: 'OpenClaw', port: 51096 },
  { name: 'n8n', label: 'N8N', port: 5678 },
  { name: 'mcp', label: 'MCP', port: 3100 }
]

/** electronAPI 不可用时的占位状态 */
const PLACEHOLDER_STATUS: Record<ServiceName, IndicatorStatus> = {
  openclaw: 'running',
  n8n: 'stopped',
  mcp: 'warning',
  hermes: 'unknown'
}

const STATUS_COLOR: Record<IndicatorStatus, string> = {
  running: 'var(--color-success)',
  warning: 'var(--color-warning)',
  stopped: 'var(--color-error)',
  unknown: 'var(--color-text-quaternary)'
}

const STATUS_TEXT: Record<IndicatorStatus, string> = {
  running: '运行中',
  warning: '警告',
  stopped: '已停止',
  unknown: '未知'
}

/** 同步日志类型 */
type SyncLogType = 'push' | 'pull' | 'conflict'
type SyncLogStatus = 'success' | 'failed' | 'pending'

interface SyncLogEntry {
  id: string
  timestamp: string
  type: SyncLogType
  status: SyncLogStatus
  detail: string
}

/** 同步日志 type Tag 颜色（push 蓝 / pull 绿 / conflict 橙） */
const SYNC_LOG_TYPE_COLOR: Record<SyncLogType, string> = {
  push: 'blue',
  pull: 'green',
  conflict: 'orange'
}

const SYNC_LOG_TYPE_LABEL: Record<SyncLogType, string> = {
  push: '推送',
  pull: '拉取',
  conflict: '冲突'
}

/** 同步日志 status Tag 颜色（success 绿 / failed 红 / pending 黄） */
const SYNC_LOG_STATUS_COLOR: Record<SyncLogStatus, string> = {
  success: 'green',
  failed: 'red',
  pending: 'gold'
}

const SYNC_LOG_STATUS_LABEL: Record<SyncLogStatus, string> = {
  success: '成功',
  failed: '失败',
  pending: '进行中'
}

/** 将 ServiceStatus 映射为 IndicatorStatus */
function mapStatus(s: ServiceStatus | undefined): IndicatorStatus {
  if (!s) return 'unknown'
  if (s === 'running') return 'running'
  if (s === 'starting') return 'warning'
  if (s === 'error') return 'stopped'
  if (s === 'stopped') return 'stopped'
  return 'unknown'
}

/** 将 ISO 时间戳格式化为本地可读字符串 */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}

export default function StatusBar() {
  const navigate = useNavigate()
  const [statuses, setStatuses] = useState<Record<ServiceName, IndicatorStatus>>(
    PLACEHOLDER_STATUS
  )
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([])
  const [syncLoading, setSyncLoading] = useState(false)
  const [version, setVersion] = useState('0.3.1')
  const [versionChecking, setVersionChecking] = useState(false)

  /** Task 6: 持有 updater.onStatus 返回的取消订阅函数 */
  const unsubscribeUpdaterRef = useRef<(() => void) | null>(null)
  /** Task 6: 持有 modal 实例引用以便外部关闭 */
  const modalRef = useRef<{ destroy: () => void } | null>(null)

  // 加载服务状态（electronAPI 不可用时保留 placeholder）
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const list = await listServices()
        if (!mounted) return
        setStatuses((prev) => {
          const next = { ...prev }
          for (const svc of list) {
            next[svc.name] = mapStatus(svc.status)
          }
          return next
        })
      } catch {
        // 保留 placeholder
      }
    })()

    const unsub = onServiceStatusChanged((payload) => {
      if (!mounted) return
      setStatuses((prev) => ({
        ...prev,
        [payload.name]: mapStatus(payload.status)
      }))
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [])

  // 网络状态监听
  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // 加载真实版本号
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const v = await window.electronAPI?.app?.getVersion?.()
        if (mounted && v) setVersion(v)
      } catch {
        // 保留默认版本号
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // 组件卸载时清理 updater 订阅与 modal
  useEffect(() => {
    return () => {
      unsubscribeUpdaterRef.current?.()
      unsubscribeUpdaterRef.current = null
      modalRef.current?.destroy()
      modalRef.current = null
    }
  }, [])

  /** Task 5: 拉取同步日志列表（当前为占位数据） */
  const fetchSyncLogs = useCallback(async () => {
    setSyncLoading(true)
    try {
      // TODO: 接入真实同步日志 API
      await new Promise((resolve) => setTimeout(resolve, 300))
      setSyncLogs([
        {
          id: '1',
          timestamp: new Date().toISOString(),
          type: 'pull',
          status: 'success',
          detail: '工作流模板同步完成'
        }
      ])
    } catch (err) {
      console.error('[StatusBar] fetchSyncLogs error:', err)
      message.error('加载同步日志失败: ' + (err as Error).message)
      setSyncLogs([])
    } finally {
      setSyncLoading(false)
    }
  }, [])

  /** 打开同步日志 Modal 时自动拉取 */
  useEffect(() => {
    if (syncOpen) {
      void fetchSyncLogs()
    }
  }, [syncOpen, fetchSyncLogs])

  /** Task 6: 版本号点击检查更新
   * 1. 显示加载 Modal
   * 2. 调用 updater.check()，通过 onStatus 监听结果
   * 3. 根据状态展示对应 Modal（info/confirm/success/error）
   * 4. 用户确认更新后调用 download() + install()
   */
  const handleVersionClick = () => {
    // 若已有 modal 显示中，避免重复触发
    if (modalRef.current) return

    const updater = window.electronAPI?.updater
    if (!updater) {
      Modal.error({
        title: '检查更新失败',
        content: 'electronAPI.updater 不可用（preload 未注入）'
      })
      return
    }

    setVersionChecking(true)

    // 显示加载 Modal（保存引用以便后续替换）
    modalRef.current = Modal.info({
      title: '版本检查',
      content: (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Spin tip="正在检查更新..." />
        </div>
      ),
      icon: null,
      footer: null,
      closable: false,
      maskClosable: false
    })

    // 注册 onStatus 监听
    unsubscribeUpdaterRef.current?.()
    unsubscribeUpdaterRef.current = updater.onStatus((payload: UpdateStatusPayload) => {
      switch (payload.status) {
        case 'checking':
          // 加载中状态保持
          return
        case 'not-available': {
          setVersionChecking(false)
          cleanupUpdater()
          modalRef.current?.destroy()
          modalRef.current = Modal.info({
            title: '版本检查',
            content: `当前已是最新版本 v${version}`
          })
          break
        }
        case 'available': {
          setVersionChecking(false)
          cleanupUpdater()
          modalRef.current?.destroy()
          modalRef.current = Modal.confirm({
            title: '发现新版本',
            content: `发现新版本 v${payload.version || '未知'}，是否立即更新？${
              payload.releaseNotes ? `\n\n更新日志：\n${payload.releaseNotes}` : ''
            }`,
            okText: '立即更新',
            cancelText: '稍后',
            onOk: () => {
              // 重新订阅以接收 downloading/downloaded/error 事件
              unsubscribeUpdaterRef.current?.()
              unsubscribeUpdaterRef.current = updater.onStatus((p) => {
                if (p.status === 'downloading') {
                  // 下载中：保持 loading Modal
                  return
                }
                if (p.status === 'downloaded') {
                  cleanupUpdater()
                  modalRef.current?.destroy()

                  modalRef.current = Modal.success({
                    title: '下载完成',
                    content: '应用将重启以安装更新',
                    onOk: () => {
                      void updater.install()
                      modalRef.current = null
                    }
                  })
                } else if (p.status === 'error') {
                  cleanupUpdater()
                  modalRef.current?.destroy()
                  modalRef.current = Modal.error({
                    title: '更新失败',
                    content: p.message || '下载或安装过程发生错误'
                  })
                }
              })
              // 显示下载中 Modal
              modalRef.current = Modal.info({
                title: '正在下载更新',
                content: (
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <Spin tip="正在下载更新..." />
                  </div>
                ),
                icon: null,
                footer: null,
                closable: false,
                maskClosable: false
              })
              void updater.download()
            },
            onCancel: () => {
              modalRef.current = null
            }
          })
          break
        }
        case 'error': {
          setVersionChecking(false)
          cleanupUpdater()
          modalRef.current?.destroy()
          modalRef.current = Modal.error({
            title: '检查更新失败',
            content: payload.message || '发生未知错误'
          })
          break
        }
        default:
          return
      }
    })

    // 触发检查（onStatus 会以 'checking' 状态开始推送）
    void updater.check()

    /** 清理 updater 订阅 */
    function cleanupUpdater() {
      unsubscribeUpdaterRef.current?.()
      unsubscribeUpdaterRef.current = null
    }
  }

  const networkStatus: IndicatorStatus = online ? 'running' : 'stopped'
  const syncStatus: IndicatorStatus = 'running'

  return (
    <footer className={styles.statusbar}>
      <div className={styles.left}>
        {SERVICES.map((svc) => {
          const status = statuses[svc.name]
          return (
            <Tooltip
              key={svc.name}
              title={`${svc.label}:${svc.port} - ${STATUS_TEXT[status]}`}
            >
              <span
                className={styles.indicator}
                onClick={() => navigate('/services')}
              >
                <span
                  className={styles.dot}
                  style={{ background: STATUS_COLOR[status] }}
                />
                <span className={styles.label}>
                  {svc.label}:{svc.port}
                </span>
              </span>
            </Tooltip>
          )
        })}

        <Tooltip title={online ? '网络在线' : '网络离线'}>
          <span className={styles.indicator}>
            <span
              className={styles.dot}
              style={{ background: STATUS_COLOR[networkStatus] }}
            />
            <span className={styles.label}>网络</span>
          </span>
        </Tooltip>

        <Tooltip title="点击查看同步日志">
          <span
            className={styles.indicator}
            onClick={() => setSyncOpen(true)}
          >
            <span
              className={styles.dot}
              style={{ background: STATUS_COLOR[syncStatus] }}
            />
            <span className={styles.label}>同步</span>
          </span>
        </Tooltip>
      </div>

      <div className={styles.right}>
        <Tooltip title={versionChecking ? '正在检查更新...' : '点击检查更新'}>
          <span
            className={styles.indicator}
            onClick={handleVersionClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleVersionClick()
              }
            }}
          >
            <span className={styles.label}>
              v{version}
              {versionChecking ? ' ...' : ''}
            </span>
          </span>
        </Tooltip>
      </div>

      {/* Task 5: 同步日志 Modal — 占位数据 */}
      <Modal
        title="同步日志"
        open={syncOpen}
        onOk={() => setSyncOpen(false)}
        onCancel={() => setSyncOpen(false)}
        footer={null}
        width={640}
      >
        <div className={styles.syncLogToolbar}>
          <span className={styles.syncLogCount}>
            共 {syncLogs.length} 条记录
          </span>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => void fetchSyncLogs()}
            loading={syncLoading}
          >
            刷新
          </Button>
        </div>
        <Spin spinning={syncLoading}>
          {syncLogs.length === 0 && !syncLoading ? (
            <Empty description="暂无同步日志" />
          ) : (
            <List
              className={styles.syncLogList}
              dataSource={syncLogs}
              renderItem={(log) => (
                <List.Item className={styles.syncLogItem}>
                  <div className={styles.syncLogRow}>
                    <span className={styles.syncLogTimestamp}>
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <Tag color={SYNC_LOG_TYPE_COLOR[log.type]}>
                      {SYNC_LOG_TYPE_LABEL[log.type]}
                    </Tag>
                    <Tag color={SYNC_LOG_STATUS_COLOR[log.status]}>
                      {SYNC_LOG_STATUS_LABEL[log.status]}
                    </Tag>
                    <Typography.Text
                      ellipsis={{ tooltip: log.detail }}
                      className={styles.syncLogDetail}
                    >
                      {log.detail}
                    </Typography.Text>
                  </div>
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Modal>
    </footer>
  )
}
