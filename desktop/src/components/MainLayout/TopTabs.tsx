// 顶部 Tab 导航 - 方案B
// 44px 高度,8 个 Tab:首页/对话/Agent/工作流/插件/知识库/团队/设置
// 使用 antd Menu horizontal 模式

import { useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import {
  HomeOutlined,
  MessageOutlined,
  RobotOutlined,
  ApartmentOutlined,
  ApiOutlined,
  BookOutlined,
  TeamOutlined,
  SettingOutlined
} from '@ant-design/icons'
import styles from './styles.module.css'

interface TabItem {
  key: string
  label: string
  icon: React.ReactNode
  path: string
}

const TAB_ITEMS: TabItem[] = [
  { key: 'dashboard', label: '首页', icon: <HomeOutlined />, path: '/dashboard' },
  { key: 'chat', label: '对话', icon: <MessageOutlined />, path: '/chat' },
  { key: 'creator', label: 'Agent', icon: <RobotOutlined />, path: '/creator' },
  { key: 'workflow', label: '工作流', icon: <ApartmentOutlined />, path: '/workflow' },
  { key: 'plugins', label: '插件', icon: <ApiOutlined />, path: '/plugins' },
  { key: 'knowledge', label: '知识库', icon: <BookOutlined />, path: '/knowledge' },
  { key: 'opc', label: '团队', icon: <TeamOutlined />, path: '/opc' },
  { key: 'settings', label: '设置', icon: <SettingOutlined />, path: '/settings' }
]

export default function TopTabs() {
  const navigate = useNavigate()
  const location = useLocation()

  // 根据当前路由匹配 Tab
  const selectedKey = useMemo(() => {
    // 精确匹配优先
    const exact = TAB_ITEMS.find((item) => location.pathname === item.path)
    if (exact) return exact.key
    // 前缀匹配(子路由)
    const matched = TAB_ITEMS.find(
      (item) => item.path !== '/dashboard' && location.pathname.startsWith(item.path)
    )
    return matched?.key || 'dashboard'
  }, [location.pathname])

  const menuItems: MenuProps['items'] = useMemo(
    () =>
      TAB_ITEMS.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
        onClick: () => navigate(item.path)
      })),
    [navigate]
  )

  return (
    <div className={styles.tabsBar}>
      <Menu
        mode="horizontal"
        selectedKeys={[selectedKey]}
        items={menuItems}
        style={{
          background: 'transparent',
          borderBottom: 'none',
          flex: 1,
          minWidth: 0
        }}
        theme="dark"
      />
    </div>
  )
}
