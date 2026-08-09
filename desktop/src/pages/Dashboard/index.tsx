// 仪表盘首页 - 全部接真实数据
// 布局: 欢迎区 + 3 统计卡(积分/今日消费/会话数) + (我的 Agent + 最近对话) + 热门 Agent + 本周消费趋势
// 浅色主题, 空态友好

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Spin } from 'antd'
import {
  GiftOutlined,
  MessageOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  HeartFilled,
  RightOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store/auth'
import { useCreditsStore } from '@/store/credits'
import { getBalance, getTransactions } from '@/api/credits-api'
import { listSessions } from '@/api/chat-api'
import { listMyFavorites, listMarketAgents } from '@/api/agent-api'
import type { CreditTransaction } from '@/types/credits'
import type { ChatSession } from '@/types/chat'
import type { Agent } from '@/types/agent'
import styles from './styles.module.css'

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

function dayKey(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function dateStr(d: Date): string {
  return dayKey(d)
}

/** 最近对话时间显示：今天 HH:mm / 昨天 / M月d日 */
function formatRelativeTime(value: Date | string): string {
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = d.getTime()
  if (t >= startOfToday) {
    return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }
  if (t >= startOfToday - 86400000) return '昨天'
  return d.getMonth() + 1 + '月' + d.getDate() + '日'
}

function formatDate(): string {
  const d = new Date()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日 · ' + weekdays[d.getDay()]
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const balance = useCreditsStore((s) => s.balance)

  const [loading, setLoading] = useState(true)
  const [settles, setSettles] = useState<CreditTransaction[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionTotal, setSessionTotal] = useState(0)
  const [favorites, setFavorites] = useState<Agent[]>([])
  const [hotAgents, setHotAgents] = useState<Agent[]>([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - 6)
      const end = new Date()
      const [, txnRes, sessionRes, favRes, marketRes] = await Promise.all([
        getBalance().catch(() => undefined),
        getTransactions({
          type: 'settle',
          startDate: dateStr(weekStart),
          endDate: dateStr(end),
          pageSize: 100,
        }).catch(() => ({ list: [], total: 0 }) as never),
        listSessions({ pageSize: 5 }).catch(() => ({ list: [], total: 0 }) as never),
        listMyFavorites().catch(() => [] as Agent[]),
        listMarketAgents({ pageSize: 12 }).catch(() => ({ list: [], total: 0 }) as never),
      ])
      const txnList = (txnRes as { list?: CreditTransaction[] }).list || []
      const sessionList = (sessionRes as { list?: ChatSession[] }).list || []
      const marketList = (marketRes as { list?: Agent[] }).list || []
      setSettles(txnList)
      setSessions(sessionList)
      setSessionTotal((sessionRes as { total?: number }).total || sessionList.length)
      setFavorites(favRes || [])
      setHotAgents(
        [...marketList]
          .sort((a, b) => (b.callCount || 0) - (a.callCount || 0))
          .slice(0, 4),
      )
    } catch (err) {
      console.error('[Dashboard] load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // 余额实时刷新（登录后自动拉取）
  useEffect(() => {
    void useCreditsStore.getState().fetchBalance()
  }, [])

  /** 今日消费 */
  const todayConsume = useMemo(() => {
    const today = dayKey(new Date())
    return settles
      .filter((s) => dayKey(new Date(s.createdAt)) === today)
      .reduce((sum, s) => sum + Math.abs(Number(s.amount) || 0), 0)
  }, [settles])

  /** 本周消费趋势（近 7 天，含今天） */
  const trend = useMemo(() => {
    const days: Array<{ key: string; label: string; value: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = dayKey(d)
      const value = settles
        .filter((s) => dayKey(new Date(s.createdAt)) === key)
        .reduce((sum, s) => sum + Math.abs(Number(s.amount) || 0), 0)
      days.push({ key, label: i === 0 ? '今天' : d.getMonth() + 1 + '/' + d.getDate(), value })
    }
    return days
  }, [settles])

  const weekTotal = useMemo(() => trend.reduce((sum, d) => sum + d.value, 0), [trend])
  const maxTrend = useMemo(() => Math.max(1, ...trend.map((d) => d.value)), [trend])

  const showSkeleton = loading && settles.length === 0 && sessions.length === 0

  return (
    <div className={styles.dashboard}>
      {/* 欢迎区 */}
      <div className={styles.welcome}>
        <div className={styles.welcomeText}>
          <h2>欢迎回来，{user?.username || '用户'}</h2>
          <p>当前共有 {balance.toLocaleString()} 积分可用，开启今天的智能之旅</p>
        </div>
        <div className={styles.welcomeRight}>
          <div className={styles.welcomeDate}>
            今天是<strong className={styles.welcomeDateStrong}>{formatDate()}</strong>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/credits')}>
            去充值
          </Button>
        </div>
      </div>

      {showSkeleton ? (
        <div className={styles.loadingWrap}>
          <Spin size="large" tip="正在加载仪表盘数据..." />
        </div>
      ) : (
        <>
          {/* 统计卡片 */}
          <div className={styles.statsGrid}>
            <div
              className={styles.statCard}
              onClick={() => navigate('/credits')}
              role="button"
              tabIndex={0}
            >
              <div className={styles.statIcon + ' ' + styles.statIconCredits}>
                <GiftOutlined />
              </div>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>积分余额</div>
                <div className={styles.statValue}>{balance.toLocaleString()}</div>
                <div className={styles.statSub}>点击前往积分中心</div>
              </div>
            </div>

            <div
              className={styles.statCard}
              onClick={() => navigate('/credits/consumption')}
              role="button"
              tabIndex={0}
            >
              <div className={styles.statIcon + ' ' + styles.statIconChat}>
                <ThunderboltOutlined />
              </div>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>今日消费</div>
                <div className={styles.statValue}>{todayConsume.toLocaleString()}</div>
                <div className={styles.statSub}>查看消费明细</div>
              </div>
            </div>

            <div
              className={styles.statCard}
              onClick={() => navigate('/chat')}
              role="button"
              tabIndex={0}
            >
              <div className={styles.statIcon + ' ' + styles.statIconService}>
                <MessageOutlined />
              </div>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>对话总数</div>
                <div className={styles.statValue}>{sessionTotal.toLocaleString()}</div>
                <div className={styles.statSub}>点击进入对话</div>
              </div>
            </div>
          </div>

          {/* 双列：我的 Agent + 最近对话 */}
          <div className={styles.dualRow}>
            <div className={styles.sectionCard}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionTitleText}>
                  <HeartFilled style={{ color: '#f87171', marginRight: 6 }} />我的 Agent
                </span>
                <span
                  className={styles.sectionMore}
                  onClick={() => navigate('/agent-market/favorites')}
                  role="button"
                  tabIndex={0}
                >
                  查看全部 <RightOutlined style={{ fontSize: 10 }} />
                </span>
              </div>
              {favorites.length === 0 ? (
                <div className={styles.emptyHint}>还没有收藏 Agent，去官方市场逛逛吧</div>
              ) : (
                <div className={styles.recentList}>
                  {favorites.slice(0, 4).map((agent) => (
                    <div
                      key={agent.id}
                      className={styles.recentItem}
                      onClick={() => navigate('/agent-market/' + agent.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={styles.agentAvatar}>
                        {agent.avatar ? (
                          <img
                            src={agent.avatar}
                            alt={agent.displayName || agent.name}
                            className={styles.agentAvatarImg}
                          />
                        ) : (
                          (agent.displayName || agent.name).charAt(0)
                        )}
                      </div>
                      <div className={styles.recentInfo}>
                        <div className={styles.recentTitle}>{agent.displayName || agent.name}</div>
                        <div className={styles.recentMeta}>{agent.description || '暂无描述'}</div>
                      </div>
                      <div className={styles.recentTime}>
                        {agent.isOfficial ? '官方' : '社区'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.sectionCard}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionTitleText}>最近对话</span>
                <span
                  className={styles.sectionMore}
                  onClick={() => navigate('/chat')}
                  role="button"
                  tabIndex={0}
                >
                  查看全部 <RightOutlined style={{ fontSize: 10 }} />
                </span>
              </div>
              {sessions.length === 0 ? (
                <div className={styles.emptyHint}>暂无对话记录，去开始第一段对话吧</div>
              ) : (
                <div className={styles.recentList}>
                  {sessions.slice(0, 5).map((c) => (
                    <div
                      key={c.id}
                      className={styles.recentItem}
                      onClick={() => navigate('/chat')}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={styles.recentAvatar}>
                        <MessageOutlined />
                      </div>
                      <div className={styles.recentInfo}>
                        <div className={styles.recentTitle}>{c.title || '新对话'}</div>
                        <div className={styles.recentMeta}>
                          {c.agentId ? 'Agent 对话' : c.modelId || 'AI 对话'}
                        </div>
                      </div>
                      <div className={styles.recentTime}>
                        {formatRelativeTime(c.lastMessageAt || c.updatedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 热门 Agent */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleText}>热门 Agent</span>
              <span
                className={styles.sectionMore}
                onClick={() => navigate('/agent-market')}
                role="button"
                tabIndex={0}
              >
                更多 Agent <RightOutlined style={{ fontSize: 10 }} />
              </span>
            </div>
            {hotAgents.length === 0 ? (
              <div className={styles.emptyHint}>暂无 Agent 上架</div>
            ) : (
              <div className={styles.agentGrid}>
                {hotAgents.map((a) => (
                  <div
                    key={a.id}
                    className={styles.agentCard}
                    onClick={() => navigate('/agent-market/' + a.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.agentAvatar}>
                      {a.avatar ? (
                        <img
                          src={a.avatar}
                          alt={a.displayName || a.name}
                          className={styles.agentAvatarImg}
                        />
                      ) : (
                        <RobotOutlined />
                      )}
                    </div>
                    <div className={styles.agentName}>{a.displayName || a.name}</div>
                    <div className={styles.agentDesc}>
                      {a.callCount.toLocaleString()} 次调用
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 本周消费趋势 */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleText}>本周消费趋势</span>
              <span className={styles.sectionMore}>近 7 天累计消耗 {weekTotal.toLocaleString()} 积分</span>
            </div>
            <div className={styles.trendRow}>
              {trend.map((d) => {
                const heightPct = Math.round((d.value / maxTrend) * 100)
                return (
                  <div key={d.key} className={styles.trendItem}>
                    <span className={styles.trendValue}>{d.value.toLocaleString()}</span>
                    <div
                      className={styles.trendBar}
                      style={{ height: Math.max(6, heightPct) + '%' }}
                      title={d.label + ' 消费 ' + d.value + ' 积分'}
                    />
                    <span className={styles.trendLabel}>{d.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
