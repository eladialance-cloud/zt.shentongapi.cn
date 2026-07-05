// Agent 市场 - 我的使用记录页
// SubTask 7.5
// 使用记录列表：Agent 名称、调用时间、消耗积分、Token 用量、状态

import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  List,
  Tag,
  Spin,
  Empty,
  Button,
  Pagination,
  message
} from 'antd'
import {
  RollbackOutlined,
  HistoryOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getUsageLogs } from '@/api/agent-api'
import type { AgentCallLog, PaginatedResult } from '@/types/agent'
import styles from './styles.module.css'

const PAGE_SIZE = 10

/** 状态 → 标签颜色 */
function getStatusTag(status: string) {
  const lower = (status || '').toLowerCase()
  if (lower === 'success' || lower === 'done' || lower === 'settled') {
    return (
      <Tag color="green" icon={<CheckCircleOutlined />}>
        成功
      </Tag>
    )
  }
  if (lower === 'failed' || lower === 'error') {
    return (
      <Tag color="red" icon={<CloseCircleOutlined />}>
        失败
      </Tag>
    )
  }
  if (lower === 'frozen' || lower === 'running') {
    return (
      <Tag color="orange" icon={<ClockCircleOutlined />}>
        {lower === 'frozen' ? '已冻结' : '进行中'}
      </Tag>
    )
  }
  return <Tag>{status || '-'}</Tag>
}

export default function UsageHistory() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PaginatedResult<AgentCallLog>>({
    list: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 0
  })
  const [page, setPage] = useState(1)

  const loadData = useCallback(
    async (targetPage = page) => {
      setLoading(true)
      try {
        const result = await getUsageLogs({ page: targetPage, pageSize: PAGE_SIZE })
        setData(result)
      } catch (err) {
        console.error('[UsageHistory] load failed:', err)
        message.error('加载使用记录失败')
      } finally {
        setLoading(false)
      }
    },
    [page]
  )

  useEffect(() => {
    void loadData(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePageChange = (p: number) => {
    setPage(p)
    void loadData(p)
  }

  return (
    <div className={styles.page}>
      {/* 顶部标题 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <HistoryOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>使用记录</h1>
            <div className={styles.subtitle}>查看 Agent 调用历史与计费详情</div>
          </div>
        </div>
        <Button
          icon={<RollbackOutlined />}
          onClick={() => navigate('/agents')}
          className={styles.backBtn}
        >
          返回市场
        </Button>
      </div>

      <Spin spinning={loading}>
        {data.list.length === 0 && !loading ? (
          <Empty description="暂无使用记录" style={{ marginTop: 80 }} />
        ) : (
          <List
            dataSource={data.list}
            renderItem={(log) => (
              <List.Item className={styles.usageLogItem}>
                <div style={{ width: '100%' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 6
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <RobotOutlined style={{ color: '#818cf8' }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>
                        {log.agentName}
                      </span>
                      {getStatusTag(log.status)}
                    </div>
                    <span style={{ fontSize: 11, color: '#6e7681' }}>
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 16,
                      fontSize: 12,
                      color: '#8b949e'
                    }}
                  >
                    <span>
                      <ThunderboltOutlined style={{ color: '#22d3ee', marginRight: 4 }} />
                      消耗积分：
                      <span style={{ color: '#f87171', fontWeight: 600 }}>
                        {log.creditsCost}
                      </span>
                    </span>
                    <span>
                      Token 用量：
                      <span style={{ color: '#c7d2fe' }}>
                        输入 {log.tokenUsage?.promptTokens ?? 0} / 输出{' '}
                        {log.tokenUsage?.completionTokens ?? 0} / 共{' '}
                        {log.tokenUsage?.totalTokens ?? 0}
                      </span>
                    </span>
                    <span>
                      会话：
                      <span style={{ color: '#6e7681' }}>
                        {log.sessionId?.slice(0, 8) || '-'}
                      </span>
                    </span>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}

        {data.total > PAGE_SIZE && (
          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Pagination
              current={data.page || page}
              pageSize={data.pageSize || PAGE_SIZE}
              total={data.total}
              showSizeChanger={false}
              onChange={handlePageChange}
            />
          </div>
        )}
      </Spin>
    </div>
  )
}
