// 顶栏 - 方案B
// 48px 高度:logo + 搜索框 + 通知 + 积分余额 + 头像菜单
// (页面标题已由顶部 Tab 栏体现,此处不再显示)

import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, Dropdown, Input, Popover, type MenuProps } from 'antd'
import {
  BellOutlined,
  GiftOutlined,
  LogoutOutlined,
  UserOutlined,
  DashboardOutlined
} from '@ant-design/icons'
import { useAuthStore } from '@/store/auth'
import { useCreditsStore } from '@/store/credits'
import styles from './styles.module.css'

interface NotificationItem {
  id: number
  title: string
  time: string
  read: boolean
}

/** Mock 通知列表 */
const NOTIFICATIONS: NotificationItem[] = [
  { id: 1, title: '欢迎使用深瞳AI', time: '刚刚', read: false },
  { id: 2, title: '您的积分已到账', time: '1 小时前', read: false },
  { id: 3, title: '系统已更新到最新版本', time: '昨天', read: true }
]

export default function TopBar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const balance = useCreditsStore((s) => s.balance)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人设置',
      onClick: () => navigate('/settings')
    },
    {
      key: 'admin',
      icon: <DashboardOutlined />,
      label: '管理后台',
      onClick: () => navigate('/admin/login')
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout
    }
  ]

  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length

  const notificationContent = (
    <div className={styles.notificationList}>
      {NOTIFICATIONS.length === 0 ? (
        <div className={styles.notificationEmpty}>暂无通知</div>
      ) : (
        NOTIFICATIONS.map((n) => (
          <div key={n.id} className={styles.notificationItem}>
            <div className={styles.notificationTitle}>
              {!n.read && <span className={styles.notificationDot} />}
              {n.title}
            </div>
            <div className={styles.notificationTime}>{n.time}</div>
          </div>
        ))
      )}
    </div>
  )

  return (
    <div className={styles.topbar}>
      {/* 左侧:logo */}
      <div className={styles.topbarLeft}>
        <span className={styles.logo}>深瞳AI</span>
      </div>

      {/* 中间:搜索框 */}
      <div className={styles.topbarCenter}>
        <Input.Search
          placeholder="搜索 Agent/工作流/知识库..."
          className={styles.searchInput}
          size="middle"
          variant="filled"
        />
      </div>

      {/* 右侧:通知 + 积分 + 头像 */}
      <div className={styles.topbarRight}>
        <Popover
          content={notificationContent}
          title="通知"
          trigger="click"
          placement="bottomRight"
        >
          <Badge count={unreadCount} size="small">
            <BellOutlined className={styles.iconBtn} />
          </Badge>
        </Popover>

        <div
          className={styles.creditsBadge}
          onClick={() => navigate('/credits')}
          role="button"
          tabIndex={0}
        >
          <GiftOutlined />
          <span>{balance}</span>
        </div>

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <div className={styles.avatarWrap}>
            <Avatar
              size={28}
              icon={<UserOutlined />}
              src={user?.avatar}
              className={styles.avatar}
            />
            <span className={styles.username}>{user?.username || '用户'}</span>
          </div>
        </Dropdown>
      </div>
    </div>
  )
}
