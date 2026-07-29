// 关于（Task 19 v0.3.1）
// 版本信息 + 检查更新按钮 + 开源许可证

import { useCallback, useEffect, useState } from 'react'
import { Card, Button, Tag, Descriptions, Alert, Progress, Space, message } from 'antd'
import {
  SyncOutlined,
  DownloadOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import type { UpdateStatusPayload } from '@shared/types'
import styles from './styles.module.css'

const OPEN_SOURCE_LICENSES = `本项目使用以下开源组件（部分列表）：

- React 18 (MIT)
- Ant Design 5 (MIT)
- Vite (MIT)
- TypeScript (Apache-2.0)
- Electron (MIT)
- Zustand (MIT)
- React Router (MIT)
- @ant-design/icons (MIT)

完整许可证清单请参阅 node_modules 目录下各包的 LICENSE 文件。`

export default function About() {
  const [version, setVersion] = useState<string>('加载中...')
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null)
  const [checking, setChecking] = useState(false)

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
        <h2 className={styles.sectionTitle}>关于</h2>
        <div className={styles.sectionDesc}>版本信息、检查更新与开源许可证</div>

        {/* 版本信息 */}
        <div className={styles.aboutList}>
          <div className={styles.aboutRow}>
            <span className={styles.aboutLabel}>应用名称</span>
            <span className={styles.aboutValue}>深瞳 AI 桌面客户端</span>
          </div>
          <div className={styles.aboutRow}>
            <span className={styles.aboutLabel}>当前版本</span>
            <span className={styles.aboutValue}>
              <Tag color="blue">{version}</Tag>
            </span>
          </div>
          <div className={styles.aboutRow}>
            <span className={styles.aboutLabel}>规范版本</span>
            <span className={styles.aboutValue}>
              <Tag color="geekblue">v0.3.1</Tag>
            </span>
          </div>
        </div>

        {/* 检查更新 */}
        <div style={{ marginTop: 24, marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<SyncOutlined spin={checking} />}
            loading={checking}
            onClick={handleCheck}
            className={styles.primaryBtn}
          >
            {checking ? '正在检查...' : '检查更新'}
          </Button>
        </div>

        {renderUpdateStatus(status, handleDownload, handleInstall)}

        {/* 开源许可证 */}
        <div style={{ marginTop: 32, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <InfoCircleOutlined style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>开源许可证</span>
        </div>
        <pre className={styles.licenseBox}>{OPEN_SOURCE_LICENSES}</pre>
      </div>
    </Card>
  )
}

function renderUpdateStatus(
  status: UpdateStatusPayload | null,
  onDownload: () => void,
  onInstall: () => void
): React.ReactNode {
  if (!status) return null
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
      return (
        <Alert
          message={status.message || '当前已是最新版本'}
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
        />
      )
    case 'available':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {status.forceUpdate && (
            <Alert
              message="强制更新"
              description="此版本为强制更新，必须更新才能继续使用。"
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
            </Descriptions.Item>
          </Descriptions>
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
            strokeColor={{ from: '#1677FF', to: '#4096FF' }}
          />
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
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
