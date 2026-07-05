// 状态面板浮层 - Task 34.4
// 从右侧滑出的 Drawer,显示积分余额/服务状态/今日统计

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Drawer, Tooltip } from 'antd'
import {
  GiftOutlined,
  PlayCircleOutlined,
  StopOutlined
} from '@ant-design/icons'
import { useCreditsStore } from '@/store/credits'
import {
  listServices,
  startService,
  stopService,
  onServiceStatusChanged
} from '@/api/service-manager-api'
import { getTransactions } from '@/api/credits-api'
import type { ServiceName, ServiceStatus } from '@/types/service-manager'
import styles from './styles.module.css'

const SERVICE_ORDER: ServiceName[] = ['openclaw', 'n8n', 'mcp']

const SERVICE_LABELS: Record<ServiceName, string> = {
  openclaw: 'OpenClaw',
  n8n: 'N8N',
  mcp: 'MCP'
}

const STATUS_COLOR: Record<ServiceStatus, string> = {
  running: '#10b981',
  stopped: '#94a3b8',
  starting: '#facc15',
  error: '#ef4444',
  unknown: '#64748b'
}

const STATUS_TEXT: Record<ServiceStatus, string> = {
  running: '运行中',
  stopped: '已停止',
  starting: '启动中',
  error: '错误',
  unknown: '未知'
}

interface StatusPanelProps {
  open: boolean
  onClose: () => void
}

interface TodayStats {
  chatCount: number
  consumedCredits: number
}

export default function StatusPanel({ open, onClose }: StatusPanelProps) {
  const navigate = useNavigate()
  const balance = useCreditsStore((s) => s.balance)
  const fetchBalance = useCreditsStore((s) => s.fetchBalance)

  const [statuses, setStatuses] = useState<Record<ServiceName, ServiceStatus>>({
    openclaw: 'unknown',
    n8n: 'unknown',
    mcp: 'unknown'
  })
  const [busy, setBusy] = useState<Set<ServiceName>>(new Set())
  const [todayStats, setTodayStats] = useState<TodayStats>({
    chatCount: 0,
    consumedCredits: 0
  })

  // 加载服务状态 + 订阅变更
  useEffect(() => {
    if (!open) return
    let mounted = true
    void (async () => {
      try {
        const list = await listServices()
        if (!mounted) return
        const map = {} as Record<ServiceName, ServiceStatus>
        for (const svc of list) map[svc.name] = svc.status
        setStatuses((prev) => ({ ...prev, ...map }))
      } catch {
        // electronAPI 不可用,保持 unknown
      }
    })()

    const unsub = onServiceStatusChanged((payload) => {
      if (!mounted) return
      setStatuses((prev) => ({ ...prev, [payload.name]: payload.status }))
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [open])

  // 加载今日统计 + 刷新余额
  useEffect(() => {
    if (!open) return
    let mounted = true
    const now = new Date()
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString()

    void (async () => {
      try {
        const result = await getTransactions({
          page: 1,
          pageSize: 200,
          startDate
        })
        if (!mounted) return
        const consumeList = result.list.filter((t) => t.type === 'consume')
        const consumed = consumeList.reduce(
          (sum, t) => sum + Math.abs(t.amount),
          0
        )
        setTodayStats({
          chatCount: consumeList.length,
          consumedCredits: consumed
        })
      } catch {
        // 接口失败显示 0
        setTodayStats({ chatCount: 0, consumedCredits: 0 })
      }
    })()

    void fetchBalance()

    return () => {
      mounted = false
    }
  }, [open, fetchBalance])

  const setBusyFor = (name: ServiceName, value: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev)
      if (value) next.add(name)
      else next.delete(name)
      return next
    })
  }

  const handleStart = async (name: ServiceName) => {
    setBusyFor(name, true)
    try {
      await startService(name)
    } catch {
      // 忽略
    } finally {
      setBusyFor(name, false)
    }
  }

  const handleStop = async (name: ServiceName) => {
    setBusyFor(name, true)
    try {
      await stopService(name)
    } catch {
      // 忽略
    } finally {
      setBusyFor(name, false)
    }
  }

  return (
    <Drawer
      title="状态面板"
      placement="right"
      open={open}
      onClose={onClose}
      width={360}
      styles={{
        header: {
          background: '#0a0e1a',
          borderBottom: '1px solid rgba(99,102,241,0.2)',
          color: '#e2e8f0'
        },
        body: { background: '#0a0e1a', padding: 16 },
        content: { background: '#0a0e1a' }
      }}
    >
      {/* 积分余额 */}
      <div className={styles.panelSection}>
        <div className={styles.panelSectionTitle}>
          <GiftOutlined /> 积分余额
        </div>
        <div className={styles.creditsRow}>
          <span className={styles.creditsValue}>{balance}</span>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              navigate('/credits')
              onClose()
            }}
          >
            + 充值
          </Button>
        </div>
      </div>

      {/* 本地服务 */}
      <div className={styles.panelSection}>
        <div className={styles.panelSectionTitle}>⚙️ 本地服务</div>
        <div className={styles.serviceList}>
          {SERVICE_ORDER.map((name) => {
            const status = statuses[name]
            const isRunning = status === 'running'
            const isBusy = busy.has(name)
            return (
              <div key={name} className={styles.serviceRow}>
                <div className={styles.serviceInfo}>
                  <span
                    className={styles.serviceDot}
                    style={{ background: STATUS_COLOR[status] }}
                  />
                  <span className={styles.serviceName}>
                    {SERVICE_LABELS[name]}
                  </span>
                  <span className={styles.serviceStatus}>
                    {STATUS_TEXT[status]}
                  </span>
                </div>
                <div className={styles.serviceActions}>
                  <Tooltip title="启动">
                    <Button
                      size="small"
                      type="text"
                      icon={<PlayCircleOutlined />}
                      loading={isBusy}
                      disabled={isRunning}
                      onClick={() => handleStart(name)}
                      className={styles.serviceActionBtn}
                    />
                  </Tooltip>
                  <Tooltip title="停止">
                    <Button
                      size="small"
                      type="text"
                      icon={<StopOutlined />}
                      loading={isBusy}
                      disabled={!isRunning}
                      onClick={() => handleStop(name)}
                      className={styles.serviceActionBtn}
                    />
                  </Tooltip>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 今日统计 */}
      <div className={styles.panelSection}>
        <div className={styles.panelSectionTitle}>📊 今日统计</div>
        <div className={styles.statsRow}>
          <div className={styles.statsItem}>
            <div className={styles.statsLabel}>对话次数</div>
            <div className={styles.statsValue}>{todayStats.chatCount}</div>
          </div>
          <div className={styles.statsItem}>
            <div className={styles.statsLabel}>消耗积分</div>
            <div className={styles.statsValue}>
              {todayStats.consumedCredits}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.panelFooter}>
        <Button block onClick={onClose}>
          关闭
        </Button>
      </div>
    </Drawer>
  )
}
