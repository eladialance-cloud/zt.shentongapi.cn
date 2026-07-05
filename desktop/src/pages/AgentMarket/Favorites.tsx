// Agent 市场 - 我的收藏页
// SubTask 7.5
// 收藏列表 + 取消收藏

import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  Button,
  Rate,
  Spin,
  Empty,
  Tooltip,
  message
} from 'antd'
import {
  RollbackOutlined,
  HeartFilled,
  ThunderboltOutlined,
  FireOutlined,
  CrownOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { listMyFavorites, unfavoriteAgent } from '@/api/agent-api'
import type { Agent } from '@/types/agent'
import styles from './styles.module.css'

export default function Favorites() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<Agent[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listMyFavorites()
      setFavorites(data || [])
    } catch (err) {
      console.error('[Favorites] load failed:', err)
      message.error('加载收藏列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleUnfavorite = async (agent: Agent) => {
    // 乐观移除
    setFavorites((prev) => prev.filter((a) => a.id !== agent.id))
    try {
      await unfavoriteAgent(agent.id)
      message.success('已取消收藏')
    } catch (err) {
      // 回滚
      setFavorites((prev) => [...prev, agent])
      console.error('[Favorites] unfavorite failed:', err)
      message.error('取消收藏失败')
    }
  }

  return (
    <div className={styles.page}>
      {/* 顶部标题 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <HeartFilled className={styles.titleIcon} style={{ color: '#f87171' }} />
          <div>
            <h1 className={styles.title}>我的收藏</h1>
            <div className={styles.subtitle}>共 {favorites.length} 个收藏 Agent</div>
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
        {favorites.length === 0 && !loading ? (
          <Empty description="还没有收藏任何 Agent" style={{ marginTop: 80 }}>
            <Button type="primary" onClick={() => navigate('/agents')}>
              去市场逛逛
            </Button>
          </Empty>
        ) : (
          <div className={styles.agentGrid}>
            {favorites.map((agent) => (
              <Card key={agent.id} className={styles.agentCard} bordered={false}>
                <div className={styles.agentCardBody}>
                  <div className={styles.agentHeader}>
                    <div className={styles.agentAvatar}>
                      {agent.avatar ? (
                        <img
                          src={agent.avatar}
                          alt={agent.name}
                          className={styles.agentAvatarImg}
                        />
                      ) : (
                        agent.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className={styles.agentTitleRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className={styles.agentName}
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/agents/${agent.id}`)}
                        >
                          {agent.isOfficial && (
                            <span className={styles.officialBadge}>
                              <CrownOutlined /> 官方
                            </span>
                          )}
                          <span>{agent.name}</span>
                        </div>
                        <div className={styles.agentMeta}>
                          <span className={styles.agentRating}>
                            <Rate
                              disabled
                              allowHalf
                              value={agent.rating}
                              character={
                                <ThunderboltOutlined className={styles.ratingStar} />
                              }
                              style={{ fontSize: 12 }}
                            />
                            <span style={{ color: '#facc15' }}>
                              {agent.rating.toFixed(1)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.agentDesc}>
                    {agent.description || '暂无描述'}
                  </div>

                  <div className={styles.agentMeta}>
                    <span className={styles.priceTag}>
                      {agent.pricePerCall === 0
                        ? '免费'
                        : `${agent.pricePerCall} 积分/次`}
                    </span>
                    <span className={styles.callCount}>
                      <FireOutlined style={{ marginRight: 4, color: '#fb923c' }} />
                      {agent.callCount.toLocaleString()} 次
                    </span>
                  </div>

                  <div className={styles.agentActions}>
                    <Button
                      type="primary"
                      className={styles.useBtn}
                      onClick={() => navigate(`/chat?agentId=${agent.id}`)}
                    >
                      使用
                    </Button>
                    <Tooltip title="取消收藏">
                      <Button
                        className={`${styles.favBtn} ${styles.favBtnActive}`}
                        icon={<HeartFilled />}
                        onClick={() => handleUnfavorite(agent)}
                      />
                    </Tooltip>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>
    </div>
  )
}
