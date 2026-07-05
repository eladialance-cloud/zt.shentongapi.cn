// 仪表盘首页 - 方案B
// 布局:欢迎区 + 3 统计卡片 + (快捷入口 + 最近对话) + 热门 Agent + 本周消费趋势
// 深色赛博风格,卡片化布局

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GiftOutlined,
  MessageOutlined,
  CloudServerOutlined,
  RobotOutlined,
  ApartmentOutlined,
  ApiOutlined,
  BookOutlined,
  TeamOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  RightOutlined
} from '@ant-design/icons'
import { useAuthStore } from '@/store/auth'
import { useCreditsStore } from '@/store/credits'
import styles from './styles.module.css'

interface QuickEntry {
  key: string
  label: string
  icon: React.ReactNode
  path: string
}

interface RecentConversation {
  id: number
  title: string
  agentName: string
  time: string
}

interface HotAgent {
  id: number
  name: string
  desc: string
  icon: React.ReactNode
}

interface TrendDay {
  label: string
  value: number
}

const QUICK_ENTRIES: QuickEntry[] = [
  { key: 'new-chat', label: '新建对话', icon: <PlusOutlined />, path: '/chat' },
  { key: 'agent', label: 'Agent 市场', icon: <RobotOutlined />, path: '/creator' },
  { key: 'workflow', label: '工作流', icon: <ApartmentOutlined />, path: '/workflow' },
  { key: 'plugins', label: '插件中心', icon: <ApiOutlined />, path: '/plugins' },
  { key: 'knowledge', label: '知识库', icon: <BookOutlined />, path: '/knowledge' },
  { key: 'team', label: '团队 OPC', icon: <TeamOutlined />, path: '/opc' }
]

const RECENT_CONVERSATIONS: RecentConversation[] = [
  { id: 1, title: '如何使用 React 优化性能?', agentName: '前端专家', time: '10 分钟前' },
  { id: 2, title: '帮我写一个 Python 数据处理脚本', agentName: '数据工程师', time: '1 小时前' },
  { id: 3, title: 'SQL 查询优化建议', agentName: 'DBA 助手', time: '3 小时前' },
  { id: 4, title: '产品需求文档评审', agentName: '产品经理', time: '昨天' }
]

const HOT_AGENTS: HotAgent[] = [
  { id: 1, name: '前端专家', desc: 'React/Vue 开发', icon: <RobotOutlined /> },
  { id: 2, name: '数据工程师', desc: 'Python/SQL 分析', icon: <ThunderboltOutlined /> },
  { id: 3, name: 'DBA 助手', desc: '数据库优化', icon: <ThunderboltOutlined /> },
  { id: 4, name: '产品经理', desc: '需求文档撰写', icon: <RobotOutlined /> }
]

const WEEK_TREND: TrendDay[] = [
  { label: '周一', value: 42 },
  { label: '周二', value: 68 },
  { label: '周三', value: 35 },
  { label: '周四', value: 91 },
  { label: '周五', value: 76 },
  { label: '周六', value: 28 },
  { label: '周日', value: 18 }
]

function formatDate(): string {
  const d = new Date()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${weekdays[d.getDay()]}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const balance = useCreditsStore((s) => s.balance)

  const maxTrend = useMemo(() => Math.max(...WEEK_TREND.map((d) => d.value)), [])
  const weekTotal = useMemo(() => WEEK_TREND.reduce((sum, d) => sum + d.value, 0), [])

  return (
    <div className={styles.dashboard}>
      {/* 欢迎区 */}
      <div className={styles.welcome}>
        <div className={styles.welcomeText}>
          <h2>欢迎回来,{user?.username || '用户'}</h2>
          <p>开启你的智能对话之旅,当前共有 {balance} 积分可用</p>
        </div>
        <div className={styles.welcomeDate}>
          今天是
          <strong className={styles.welcomeDateStrong}>{formatDate()}</strong>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className={styles.statsGrid}>
        <div
          className={styles.statCard}
          onClick={() => navigate('/credits')}
          role="button"
          tabIndex={0}
        >
          <div className={`${styles.statIcon} ${styles.statIconCredits}`}>
            <GiftOutlined />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>积分余额</div>
            <div className={styles.statValue}>{balance}</div>
            <div className={styles.statSub}>点击前往积分中心</div>
          </div>
        </div>

        <div
          className={styles.statCard}
          onClick={() => navigate('/chat')}
          role="button"
          tabIndex={0}
        >
          <div className={`${styles.statIcon} ${styles.statIconChat}`}>
            <MessageOutlined />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>今日对话</div>
            <div className={styles.statValue}>{RECENT_CONVERSATIONS.length}</div>
            <div className={styles.statSub}>较昨日 +2 条</div>
          </div>
        </div>

        <div
          className={styles.statCard}
          onClick={() => navigate('/services')}
          role="button"
          tabIndex={0}
        >
          <div className={`${styles.statIcon} ${styles.statIconService}`}>
            <CloudServerOutlined />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>本地服务</div>
            <div className={styles.statValue}>运行中</div>
            <div className={styles.statSub}>API / 数据库 / Redis</div>
          </div>
        </div>
      </div>

      {/* 双列:快捷入口 + 最近对话 */}
      <div className={styles.dualRow}>
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>快捷入口</span>
          </div>
          <div className={styles.quickGrid}>
            {QUICK_ENTRIES.map((item) => (
              <div
                key={item.key}
                className={styles.quickItem}
                onClick={() => navigate(item.path)}
                role="button"
                tabIndex={0}
              >
                <div className={styles.quickIcon}>{item.icon}</div>
                <span className={styles.quickLabel}>{item.label}</span>
              </div>
            ))}
          </div>
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
          <div className={styles.recentList}>
            {RECENT_CONVERSATIONS.length === 0 ? (
              <div className={styles.emptyHint}>暂无对话记录</div>
            ) : (
              RECENT_CONVERSATIONS.map((c) => (
                <div
                  key={c.id}
                  className={styles.recentItem}
                  onClick={() => navigate('/chat')}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.recentAvatar}>
                    <RobotOutlined />
                  </div>
                  <div className={styles.recentInfo}>
                    <div className={styles.recentTitle}>{c.title}</div>
                    <div className={styles.recentMeta}>{c.agentName}</div>
                  </div>
                  <div className={styles.recentTime}>{c.time}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 热门 Agent */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionTitleText}>热门 Agent</span>
          <span
            className={styles.sectionMore}
            onClick={() => navigate('/creator')}
            role="button"
            tabIndex={0}
          >
            更多 Agent <RightOutlined style={{ fontSize: 10 }} />
          </span>
        </div>
        <div className={styles.agentGrid}>
          {HOT_AGENTS.map((a) => (
            <div
              key={a.id}
              className={styles.agentCard}
              onClick={() => navigate('/chat')}
              role="button"
              tabIndex={0}
            >
              <div className={styles.agentAvatar}>{a.icon}</div>
              <div className={styles.agentName}>{a.name}</div>
              <div className={styles.agentDesc}>{a.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 本周消费趋势 */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionTitleText}>本周消费趋势</span>
          <span className={styles.sectionMore}>本周累计消耗 {weekTotal} 积分</span>
        </div>
        <div className={styles.trendRow}>
          {WEEK_TREND.map((d) => {
            const heightPct = maxTrend > 0 ? (d.value / maxTrend) * 100 : 0
            return (
              <div key={d.label} className={styles.trendItem}>
                <span className={styles.trendValue}>{d.value}</span>
                <div
                  className={styles.trendBar}
                  style={{ height: `${heightPct}%` }}
                  title={`${d.label}: ${d.value} 积分`}
                />
                <span className={styles.trendLabel}>{d.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
