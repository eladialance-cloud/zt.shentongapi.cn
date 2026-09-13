// 环境组件设置页（对标 RRClaw「环境组件」）
// 检测内置 Python / 业务流依赖 / 浏览器自动化内核 / 语音模型，未就绪的可一键安装。
// 数据源：主进程 service:checkEnvComponents / service:installEnvComponent（IPC）。
import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Spin, Tag, message } from 'antd'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  DownloadOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  ToolOutlined
} from '@ant-design/icons'
import type { EnvComponentStatus } from '@shared/types'
import styles from './styles.module.css'

/**
 * 不可一键安装的组件的人工处理说明。
 * 未就绪且不可安装时也必须渲染按钮 —— 否则整页"点了没反应"（2026-09-13 用户反馈）。
 */
const MANUAL_HINTS: Record<EnvComponentStatus['id'], string> = {
  python:
    '内置 Python 随安装包分发。若这里显示未安装，通常是安装包不完整或运行时尚未下载：请到「本地服务管理」下载任一本地服务运行时后，点上方「重新检测」。',
  flowsDeps: '需要先检测到内置 Python，才能一键安装 flask 等依赖。',
  playwright: '需要先检测到内置 Python，才能一键安装 playwright 及其 Chromium 内核。',
  vosk: '中文语音识别模型需手动放入 vosk-model-small-cn 目录（可选组件，不影响其他功能）。'
}

/** 单项组件行 */
function ComponentRow({
  item,
  onInstalled
}: {
  item: EnvComponentStatus
  onInstalled: () => void
}) {
  const [installing, setInstalling] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    try {
      const res = await window.electronAPI.service.installEnvComponent(item.id)
      if (res.ok) {
        message.success(`${item.title} 安装完成`)
      } else {
        message.error(`${item.title} 安装失败：${res.error ?? '未知错误'}`)
      }
    } catch (err) {
      message.error(`${item.title} 安装失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInstalling(false)
      onInstalled()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        border: '1px solid var(--app-split, #f0f0f0)',
        borderRadius: 8,
        marginBottom: 10
      }}
    >
      <span style={{ fontSize: 18 }}>
        {item.ready ? (
          <CheckCircleFilled style={{ color: '#52c41a' }} />
        ) : (
          <CloseCircleFilled style={{ color: '#ff4d4f' }} />
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          {item.title}
          <Tag
            color={item.ready ? 'success' : 'default'}
            style={{ marginLeft: 8 }}
          >
            {item.ready ? '已就绪' : '未安装'}
          </Tag>
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: 'rgba(0,0,0,0.45)',
            wordBreak: 'break-all'
          }}
        >
          {item.detail}
        </div>
      </div>
      {!item.ready && item.installable && (
        <Button
          type="primary"
          size="small"
          icon={<DownloadOutlined />}
          loading={installing}
          onClick={() => void handleInstall()}
        >
          安装
        </Button>
      )}
      {!item.ready && !item.installable && (
        <Button
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={() => message.info(`${item.title}：${MANUAL_HINTS[item.id]}`)}
        >
          如何处理
        </Button>
      )}
    </div>
  )
}

export default function EnvComponents() {
  const [items, setItems] = useState<EnvComponentStatus[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.electronAPI.service.checkEnvComponents()
      setItems(Array.isArray(list) ? list : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            <ToolOutlined style={{ marginRight: 8 }} />
            环境组件
          </div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>
            业务流引擎、浏览器自动化等运行所需的依赖，未就绪时相关自动化无法执行。
          </div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          重新检测
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description="未获取到环境组件信息" />
      ) : (
        items.map((item) => (
          <ComponentRow key={item.id} item={item} onInstalled={() => void load()} />
        ))
      )}
    </div>
  )
}
