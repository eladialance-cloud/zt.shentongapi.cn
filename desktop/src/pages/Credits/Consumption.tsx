// 积分中心 - 消费明细页
// SubTask 6.4
// Tab 分类：model_call（对话调用）/ plugin_call（插件调用）/ workflow_call（工作流调用）
// 每个 Tab 下显示明细列表

import { useCallback, useEffect, useState } from 'react'
import {
  Tabs,
  List,
  Tag,
  Spin,
  Button,
  Pagination,
  Empty,
  message
} from 'antd'
import {
  RollbackOutlined,
  PieChartOutlined,
  MessageOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getTransactions } from '@/api/credits-api'
import type {
  CreditTransaction,
  PaginatedResult
} from '@/types/credits'
import styles from './styles.module.css'

type ConsumptionSource = 'model_call' | 'plugin_call' | 'workflow_call'

const TAB_ITEMS: Array<{
  key: ConsumptionSource
  label: string
  icon: React.ReactNode
}> = [
  {
    key: 'model_call',
    label: '对话调用',
    icon: <MessageOutlined style={{ color: '#818cf8' }} />
  },
  {
    key: 'plugin_call',
    label: '插件调用',
    icon: <AppstoreOutlined style={{ color: '#34d399' }} />
  },
  {
    key: 'workflow_call',
    label: '工作流调用',
    icon: <ThunderboltOutlined style={{ color: '#fbbf24' }} />
  }
]

const PAGE_SIZE = 10

/** 状态图标 */
function StatusIcon({ status }: { status?: string }) {
  if (!status) return null
  const lower = status.toLowerCase()
  if (lower === 'success' || lower === 'done' || lower === 'settled') {
    return <CheckCircleOutlined style={{ color: '#34d399' }} />
  }
  if (lower === 'failed' || lower === 'error') {
    return <CloseCircleOutlined style={{ color: '#f87171' }} />
  }
  return <ClockCircleOutlined style={{ color: '#fbbf24' }} />
}

export default function Consumption() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ConsumptionSource>('model_call')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PaginatedResult<CreditTransaction>>({
    list: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 0
  })
  const [page, setPage] = useState(1)

  const loadData = useCallback(
    async (source: ConsumptionSource, targetPage = 1) => {
      setLoading(true)
      try {
        const result = await getTransactions({
          source,
          page: targetPage,
          pageSize: PAGE_SIZE
        })
        setData(result)
      } catch (err) {
        console.error('[Consumption] load failed:', err)
        message.error('加载消费明细失败')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void loadData(activeTab, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handlePageChange = (p: number) => {
    setPage(p)
    void loadData(activeTab, p)
  }

  return (
    <div className={styles.page}>
      {/* 顶部标题 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <PieChartOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>消费明细</h1>
            <div className={styles.subtitle}>按类型查看积分消费记录</div>
          </div>
        </div>
        <Button
          icon={<RollbackOutlined />}
          onClick={() => navigate('/credits')}
          className={styles.backBtn}
        >
          返回余额
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key as ConsumptionSource)
          setPage(1)
        }}
        items={TAB_ITEMS.map((item) => ({
          key: item.key,
          label: (
            <span>
              {item.icon}
              <span style={{ marginLeft: 6 }}>{item.label}</span>
            </span>
          )
        }))}
        style={{ marginBottom: 16 }}
      />

      <Spin spinning={loading}>
        {data.list.length === 0 && !loading ? (
          <Empty description="暂无消费记录" style={{ marginTop: 60 }} />
        ) : (
          <List
            dataSource={data.list}
            renderItem={(item) => (
              <List.Item
                style={{
                  background: 'rgba(17, 24, 39, 0.6)',
                  border: '1px solid rgba(99, 102, 241, 0.15)',
                  borderRadius: 10,
                  marginBottom: 10,
                  padding: '12px 16px',
                  color: '#e6edf3'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    flexWrap: 'wrap',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StatusIcon status={item.remark} />
                    <div>
                      <div style={{ fontSize: 13, color: '#e6edf3' }}>
                        {item.remark || item.source}
                      </div>
                      <div style={{ fontSize: 11, color: '#8b949e' }}>
                        {new Date(item.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Tag color="blue">{item.source}</Tag>
                    <span className={styles.amountNegative}>{item.amount}</span>
                    <span style={{ fontSize: 11, color: '#6e7681' }}>
                      余额 {item.balanceAfter?.toLocaleString?.() ?? '-'}
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
