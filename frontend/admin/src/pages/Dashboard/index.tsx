// 管理端首页 - SubTask 17.8
//
// 组成：欢迎卡片 + 今日概览(用户数/调用量/收入/待审核数) + 12 个快捷入口卡片

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Spin } from 'antd'
import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  CloudServerOutlined,
  CloudSyncOutlined,
  DashboardOutlined,
  DollarOutlined,
  KeyOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  ToolOutlined,
  UserAddOutlined,
  ThunderboltOutlined,
  WalletOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import { useAdminAuthStore } from '@/store/admin-auth'
import { adminRequest } from '@/api/admin-auth-api'
import styles from './styles.module.css'

interface ShortcutItem {
  key: string
  label: string
  desc: string
  icon: React.ReactNode
  path: string
}

const SHORTCUTS: ShortcutItem[] = [
  { key: 'users', label: '用户管理', desc: '用户/等级/积分/订单/设备', icon: <TeamOutlined />, path: '/users' },
  { key: 'apikey', label: 'Key 池', desc: 'API Key 池管理', icon: <KeyOutlined />, path: '/api-key-pool' },
  { key: 'agent', label: 'Agent', desc: 'Agent 审核与管理', icon: <RobotOutlined />, path: '/agents' },
  { key: 'workflow', label: '工作流', desc: '工作流审核', icon: <AppstoreOutlined />, path: '/workflows' },
  { key: 'plugin', label: '插件', desc: '插件审核', icon: <ToolOutlined />, path: '/plugins' },
  { key: 'model', label: '模型', desc: '模型配置', icon: <CloudServerOutlined />, path: '/models' },
  { key: 'finance', label: '财务', desc: '订单与退款', icon: <DollarOutlined />, path: '/finance' },
  { key: 'audit', label: '审核', desc: '审核中心', icon: <AuditOutlined />, path: '/audit' },
  { key: 'stats', label: '统计', desc: '统计报表', icon: <BarChartOutlined />, path: '/stats' },
  { key: 'version', label: '版本', desc: '版本发布', icon: <CloudSyncOutlined />, path: '/versions' },
  { key: 'system', label: '系统', desc: '系统配置', icon: <SettingOutlined />, path: '/system' },
  { key: 'dashboard', label: '仪表盘', desc: '返回首页', icon: <DashboardOutlined />, path: '/dashboard' }
]

interface TodayOverview {
  newUsers: number
  callCount: number
  revenue: number
  pendingAudit: number
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const user = useAdminAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<TodayOverview>({
    newUsers: 0,
    callCount: 0,
    revenue: 0,
    pendingAudit: 0
  })

  useEffect(() => {
    let cancelled = false
    const loadOverview = async () => {
      setLoading(true)
      try {
        const data = await adminRequest<TodayOverview>('get', '/admin/stats/today')
        if (!cancelled) setOverview(data)
      } catch (err) {
        console.error('[AdminDashboard] load overview failed:', err)
        // 静默失败,使用默认值(后端可能未实现)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadOverview()
    return () => {
      cancelled = true
    }
  }, [])

  const statsCards = [
    {
      label: '今日新增用户',
      value: overview.newUsers,
      icon: <UserAddOutlined />,
      iconClass: styles.statIconBlue
    },
    {
      label: '今日调用量',
      value: overview.callCount,
      icon: <ThunderboltOutlined />,
      iconClass: styles.statIconGreen
    },
    {
      label: '今日收入(积分)',
      value: overview.revenue,
      icon: <WalletOutlined />,
      iconClass: styles.statIconOrange
    },
    {
      label: '待审核数',
      value: overview.pendingAudit,
      icon: <ClockCircleOutlined />,
      iconClass: styles.statIconRed
    }
  ]

  return (
    <div className={styles.page}>
      {/* 欢迎卡片 */}
      <Card className={styles.welcomeCard} bordered={false}>
        <h2 className={styles.welcomeTitle}>
          欢迎回来,{user?.username || '管理员'}
        </h2>
        <p className={styles.welcomeSub}>
          深瞳AI 管理后台 · 这里是您的运营总览与快捷入口
        </p>
      </Card>

      {/* 今日概览 */}
      <div className={styles.sectionTitle}>
        <BarChartOutlined /> 今日概览
      </div>
      <Spin spinning={loading}>
        <div className={styles.statsGrid}>
          {statsCards.map((c) => (
            <Card key={c.label} className={styles.statCard} bordered={false}>
              <div className={styles.statCardBody}>
                <div className={`${styles.statIcon} ${c.iconClass}`}>
                  {c.icon}
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statLabel}>{c.label}</span>
                  <span className={styles.statValue}>
                    {c.value.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Spin>

      {/* 快捷入口 */}
      <div className={styles.sectionTitle}>
        <AppstoreOutlined /> 快捷入口
      </div>
      <Card className={styles.sectionCard} bordered={false}>
        <div className={styles.shortcutGrid}>
          {SHORTCUTS.map((s) => (
            <Card
              key={s.key}
              className={styles.shortcutCard}
              bordered={false}
              size="small"
              onClick={() => navigate(s.path)}
            >
              <div className={styles.shortcutBody}>
                <div className={styles.shortcutIcon}>{s.icon}</div>
                <div>
                  <div className={styles.shortcutLabel}>{s.label}</div>
                  <div className={styles.shortcutDesc}>{s.desc}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  )
}
