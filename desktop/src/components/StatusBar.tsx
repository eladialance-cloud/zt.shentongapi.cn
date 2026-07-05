// 底栏状态指示器（Task 16.4 + Task 34.3）
// 32px 高底部状态栏：三个服务状态点 + [📊]状态面板按钮 + 版本号
// 点击状态点跳转到服务管理页；通过 IPC service:status-changed 实时更新
// [📊] 按钮点击弹出状态面板浮层（Task 34.4）

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Tooltip } from 'antd'
import { BarChartOutlined } from '@ant-design/icons'
import {
  listServices,
  onServiceStatusChanged
} from '@/api/service-manager-api'
import type { ServiceName, ServiceStatus } from '@/types/service-manager'
import StatusPanel from '@/components/MainLayout/StatusPanel'

const SERVICE_ORDER: ServiceName[] = ['openclaw', 'n8n', 'mcp']

const SERVICE_LABELS: Record<ServiceName, string> = {
  openclaw: 'OpenClaw',
  n8n: 'N8N',
  mcp: 'MCP'
}

/** 状态点颜色 */
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

export default function StatusBar() {
  const navigate = useNavigate()
  const [statuses, setStatuses] = useState<Record<ServiceName, ServiceStatus>>({
    openclaw: 'unknown',
    n8n: 'unknown',
    mcp: 'unknown'
  })
  const [version, setVersion] = useState<string>('0.1.0')
  const [panelOpen, setPanelOpen] = useState(false)

  // 初始加载 + 订阅状态变更
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const list = await listServices()
        if (!mounted) return
        const map = {} as Record<ServiceName, ServiceStatus>
        for (const svc of list) map[svc.name] = svc.status
        setStatuses((prev) => ({ ...prev, ...map }))
      } catch {
        // electronAPI 不可用忽略
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
  }, [])

  // 获取版本号（优先 electronAPI，回退 package.json 默认值 0.1.0）
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const v = await window.electronAPI?.app?.getVersion?.()
        if (mounted && v) setVersion(v)
      } catch {
        // 忽略，保持默认 0.1.0
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div
      style={{
        height: 32,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: '#0a0e1a',
        borderTop: '1px solid rgba(99, 102, 241, 0.15)',
        color: '#8b949e',
        fontSize: 12,
        userSelect: 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {SERVICE_ORDER.map((name) => {
          const status = statuses[name]
          return (
            <Tooltip
              key={name}
              title={`${SERVICE_LABELS[name]}：${STATUS_TEXT[status]}（点击查看）`}
            >
              <span
                onClick={() => navigate('/services')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS_COLOR[status],
                    boxShadow:
                      status === 'running'
                        ? `0 0 6px ${STATUS_COLOR[status]}`
                        : 'none',
                    display: 'inline-block'
                  }}
                />
                <span>{SERVICE_LABELS[name]}</span>
              </span>
            </Tooltip>
          )
        })}
        <Tooltip title="状态面板">
          <Button
            type="text"
            size="small"
            icon={<BarChartOutlined />}
            onClick={() => setPanelOpen(true)}
            style={{ color: '#8b949e', fontSize: 12 }}
          />
        </Tooltip>
      </div>
      <div>
        <span style={{ marginRight: 12 }}>v{version}</span>
        <span>深瞳 AI</span>
      </div>

      <StatusPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  )
}
