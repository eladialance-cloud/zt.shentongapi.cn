// 检查更新（SubTask 35.5）- 灰度发布测试页面
// 展示当前版本号 + 检查更新 + 下载/安装 + 强制更新提示 + 灰度命中状态

import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  Button,
  Progress,
  Alert,
  Tag,
  Space,
  Descriptions,
  message
} from 'antd'
import {
  SyncOutlined,
  DownloadOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined
} from '@ant-design/icons'
import type { UpdateStatusPayload } from '@shared/types'
import styles from './styles.module.css'

export default function Update() {
  const [version, setVersion] = useState<string>('加载中...')
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null)
  const [checking, setChecking] = useState(false)

  // 加载当前版本号
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const v = await window.electronAPI?.app?.getVersion?.()
        if (mounted && v) setVersion(v)
        else if (mounted) setVersion('unknown')
      } catch {
        if (mounted) setVersion('unknown')
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // 监听更新状态推送
  useEffect(() => {
    const unsubscribe = window.electronAPI?.updater?.onStatus((payload) => {
      setStatus(payload)
      setChecking(payload.status === 'checking')
      if (payload.status === 'error') {
        message.error(payload.message || '更新失败')
      }
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  const handleCheck = useCallback(() => {
    setChecking(true)
    void window.electronAPI?.updater?.check()
  }, [])

  const handleDownload = useCallback(() => {
    void window.electronAPI?.updater?.download()
  }, [])

  const handleInstall = useCallback(() => {
    void window.electronAPI?.updater?.install()
  }, [])

  return (
    <Card className={styles.card} bordered={false}>
      <div className={styles.cardBody}>
        <h2 className={styles.sectionTitle}>检查更新</h2>
        <div className={styles.sectionDesc}>
          检查是否有新版本可用，支持灰度发布与强制更新
        </div>

        {/* 当前版本 */}
        <Descriptions column={1} size="small" style={{ marginBottom: 20 }}>
          <Descriptions.Item label="当前版本">
            <Tag color="blue">{version}</Tag>
          </Descriptions.Item>
        </Descriptions>

        {/* 检查更新按钮 */}
        <Button
          type="primary"
          icon={<SyncOutlined spin={checking} />}
          loading={checking}
          onClick={handleCheck}
          className={styles.primaryBtn}
          style={{ marginBottom: 20 }}
        >
          {checking ? '正在检查...' : '检查更新'}
        </Button>

        {/* 状态展示区 */}
        {renderStatus(status, handleDownload, handleInstall)}
      </div>
    </Card>
  )
}

/** 根据更新状态渲染对应 UI */
function renderStatus(
  status: UpdateStatusPayload | null,
  onDownload: () => void,
  onInstall: () => void
): React.ReactNode {
  if (!status) {
    return null
  }

  switch (status.status) {
    case 'checking':
      return (
        <Alert
          message="正在检查更新..."
          type="info"
          showIcon
          icon={<SyncOutlined spin />}
        />
      )

    case 'not-available':
      // 灰度未命中也走 not-available 分支（带 message）
      return (
        <Alert
          message={status.message || '当前已是最新版本'}
          type={status.grayscalePercent && status.grayscalePercent > 0 ? 'warning' : 'success'}
          showIcon
          icon={status.grayscalePercent && status.grayscalePercent > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
          description={
            status.grayscalePercent !== undefined && status.grayscalePercent > 0 ? (
              <span>
                灰度发布比例 {status.grayscalePercent}%，当前客户端未命中灰度
              </span>
            ) : undefined
          }
        />
      )

    case 'available':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {status.forceUpdate && (
            <Alert
              message="强制更新"
              description="此版本为强制更新，必须更新才能继续使用。下载完成后将自动安装重启。"
              type="error"
              showIcon
              icon={<WarningOutlined />}
            />
          )}
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="新版本">
              <Tag color="green">{status.version}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="灰度命中">
              {status.grayscaleHit ? (
                <Tag color="green">命中</Tag>
              ) : (
                <Tag color="default">未命中</Tag>
              )}
              {status.grayscalePercent !== undefined && status.grayscalePercent > 0 && (
                <span style={{ marginLeft: 8, color: '#8b949e', fontSize: 12 }}>
                  （灰度比例 {status.grayscalePercent}%）
                </span>
              )}
            </Descriptions.Item>
          </Descriptions>
          {status.releaseNotes && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#cbd5e1' }}>
                更新日志：
              </div>
              <pre
                style={{
                  background: 'rgba(10, 14, 26, 0.6)',
                  border: '1px solid rgba(99, 102, 241, 0.15)',
                  borderRadius: 8,
                  padding: 12,
                  color: '#e6edf3',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                  maxHeight: 240,
                  overflowY: 'auto'
                }}
              >
                {status.releaseNotes}
              </pre>
            </div>
          )}
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={onDownload}
            className={styles.primaryBtn}
          >
            立即下载
          </Button>
        </Space>
      )

    case 'downloading':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Progress
            percent={status.progress}
            status="active"
            strokeColor={{ from: '#6366f1', to: '#8b5cf6' }}
          />
          <div style={{ color: '#8b949e', fontSize: 13 }}>
            正在下载更新... {status.progress}%
          </div>
        </Space>
      )

    case 'downloaded':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            message="更新已下载完成"
            description="点击下方按钮立即安装并重启应用。"
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={onInstall}
            className={styles.primaryBtn}
          >
            立即安装并重启
          </Button>
        </Space>
      )

    case 'error':
      return (
        <Alert
          message="更新失败"
          description={status.message || '发生未知错误'}
          type="error"
          showIcon
          icon={<CloudUploadOutlined />}
        />
      )

    default:
      return null
  }
}
