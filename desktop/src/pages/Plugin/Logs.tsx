// 插件调用记录页
// 布局：Tab 导航 + 调用记录表格（时间/插件名/输入/输出/状态/耗时/积分消耗）+ 分页
// 调用 GET /plugins/logs?page=

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Spin, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  DollarOutlined
} from '@ant-design/icons'
import * as pluginApi from '@/api/plugin-api'
import type { PluginCallLog, PluginLogQuery } from '@/types/plugin'
import styles from './styles.module.css'

/** 状态标签 className */
function statusTagClass(status: string): string {
  switch (status) {
    case 'success':
      return styles.statusTagSuccess
    case 'failed':
      return styles.statusTagFailed
    case 'running':
      return styles.statusTagRunning
    default:
      return ''
  }
}

/** 状态中文显示 */
function statusLabel(status: string): string {
  switch (status) {
    case 'success':
      return '成功'
    case 'failed':
      return '失败'
    case 'running':
      return '运行中'
    default:
      return status
  }
}

/** 格式化 JSON */
function formatJson(value: unknown): string {
  if (value == null) return '-'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** 格式化耗时 */
function formatDuration(ms?: number): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function PluginLogs() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState<PluginCallLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)

  /** 加载日志 */
  const loadLogs = useCallback(
    async (query: PluginLogQuery = {}) => {
      setLoading(true)
      try {
        const result = await pluginApi.getPluginLogs(query)
        setLogs(result.list || [])
        setTotal(result.total || 0)
        setPage(result.page || query.page || 1)
        setPageSize(result.pageSize || query.pageSize || 20)
      } catch (err) {
        console.error('[PluginLogs] load failed:', err)
        message.error('加载调用记录失败')
        setLogs([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void loadLogs({ page: 1, pageSize: 20 })
  }, [loadLogs])

  /** 分页变化 */
  const handlePageChange = (nextPage: number, nextSize: number) => {
    void loadLogs({ page: nextPage, pageSize: nextSize })
  }

  /** 表格列 */
  const columns: TableColumnsType<PluginCallLog> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70
    },
    {
      title: '插件',
      dataIndex: 'pluginName',
      key: 'pluginName',
      width: 160,
      render: (v: string) => (
        <span style={{ color: '#e6edf3', fontWeight: 500 }}>{v}</span>
      )
    },
    {
      title: '输入',
      dataIndex: 'input',
      key: 'input',
      width: 200,
      render: (v: unknown) => (
        <div className={styles.jsonCell}>{formatJson(v)}</div>
      )
    },
    {
      title: '输出',
      dataIndex: 'output',
      key: 'output',
      width: 200,
      render: (v: unknown) => (
        <div className={styles.jsonCell}>{formatJson(v)}</div>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => (
        <Tag className={statusTagClass(s)}>{statusLabel(s)}</Tag>
      )
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 100,
      render: (v: number) => (
        <span style={{ color: '#a5b4fc' }}>{formatDuration(v)}</span>
      )
    },
    {
      title: '积分消耗',
      dataIndex: 'creditsCost',
      key: 'creditsCost',
      width: 110,
      render: (v: number) => (
        <span className={styles.creditsValue}>{v ?? 0}</span>
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

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <FileTextOutlined />
          <span>插件调用记录</span>
        </div>
        <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>
          返回
        </Button>
      </div>

      {/* Tab 导航 */}
      <div className={styles.tabNav}>
        <div className={styles.tabItem} onClick={() => navigate('/plugins')}>
          插件市场
        </div>
        <div className={styles.tabItem} onClick={() => navigate('/plugins/installed')}>
          已安装
        </div>
        <div
          className={`${styles.tabItem} ${styles.tabItemActive}`}
          onClick={() => navigate('/plugins/logs')}
        >
          调用记录
        </div>
      </div>

      <Spin spinning={loading}>
        <div className={styles.logsTableWrapper}>
          <Table<PluginCallLog>
            columns={columns}
            dataSource={logs}
            rowKey="id"
            size="small"
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: handlePageChange,
              onShowSizeChange: handlePageChange
            }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: '暂无调用记录' }}
          />
        </div>
      </Spin>

      {/* 底部统计提示 */}
      <div style={{ marginTop: 12, color: '#6e7681', fontSize: 12, display: 'flex', gap: 16 }}>
        <span>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          共 {total} 条记录
        </span>
        <span>
          <DollarOutlined style={{ marginRight: 4 }} />
          总积分消耗: {logs.reduce((sum, l) => sum + (l.creditsCost || 0), 0)}
        </span>
      </div>
    </div>
  )
}
