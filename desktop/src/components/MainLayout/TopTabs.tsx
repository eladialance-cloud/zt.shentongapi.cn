// 顶部 Tab 导航 - 方案B
// 44px 高度, 7 个核心 Tab + "更多"下拉
// 使用 antd Menu horizontal 模式

import { useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Dropdown, Menu } from 'antd'
import type { MenuProps } from 'antd'
import {
  HomeOutlined,
  MessageOutlined,
  RobotOutlined,
  ApartmentOutlined,
  ApiOutlined,
  BookOutlined,
  TeamOutlined,
  SettingOutlined,
  DesktopOutlined,
  AppstoreOutlined,
  ToolOutlined,
  SendOutlined,
  EllipsisOutlined
} from '@ant-design/icons'
import styles from './styles.module.css'

interface TabItem {
  key: string
  label: string
  icon: React.ReactNode
  path: string
}

const CORE_TABS: TabItem[] = [
  { key: 'dashboard', label: '首页', icon: <HomeOutlined />, path: '/dashboard' },
  { key: 'chat', label: '对话', icon: <MessageOutlined />, path: '/chat' },
  { key: 'team', label: '团队', icon: <TeamOutlined />, path: '/team' },
  { key: 'office', label: 'AI办公室', icon: <DesktopOutlined />, path: '/office' },
  { key: 'creator', label: 'Agent', icon: <RobotOutlined />, path: '/creator' },
  { key: 'workflow', label: '工作流', icon: <ApartmentOutlined />, path: '/workflow' },
  { key: 'channels', label: '渠道', icon: <SendOutlined />, path: '/channels' },
]

const MORE_TABS: TabItem[] = [
  { key: 'plugins', label: '插件', icon: <ApiOutlined />, path: '/plugins' },
  { key: 'knowledge', label: '知识库', icon: <BookOutlined />, path: '/knowledge' },
  { key: 'agents', label: 'Agent市场', icon: <AppstoreOutlined />, path: '/agents' },
  { key: 'mcp-config', label: 'MCP配置', icon: <ToolOutlined />, path: '/mcp-config' },
  { key: 'publish', label: '发布', icon: <SendOutlined />, path: '/publish' },
  { key: 'settings', label: '设置', icon: <SettingOutlined />, path: '/settings' },
]

export default function TopTabs() {
  const navigate = useNavigate()
  const location = useLocation()

  // 根据当前路由匹配 Tab
  const selectedKey = useMemo(() => {
    const allTabs = [...CORE_TABS, ...MORE_TABS]
    const exact = allTabs.find((item) => location.pathname === item.path)
    if (exact) return exact.key
    const matched = allTabs.find(
      (item) => item.path !== '/dashboard' && location.pathname.startsWith(item.path)
    )
    return matched?.key || 'dashboard'
  }, [location.pathname])

  const menuItems: MenuProps['items'] = useMemo(
    () =>
      CORE_TABS.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
        onClick: () => navigate(item.path)
      })),
    [navigate]
  )

  const moreMenuItems: MenuProps['items'] = useMemo(
    () =>
      MORE_TABS.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
        onClick: () => navigate(item.path)
      })),
    [navigate]
  )

  const isInMore = MORE_TABS.some((t) => selectedKey === t.key)

  return (
    <div className={styles.tabsBar}>
      <Menu
        mode="horizontal"
        selectedKeys={[isInMore ? '' : selectedKey]}
        items={menuItems}
        style={{
          background: 'transparent',
          borderBottom: 'none',
          flex: 1,
          minWidth: 0
        }}
        theme="dark"
      />
      <Dropdown
        menu={{
          items: moreMenuItems,
          selectedKeys: isInMore ? [selectedKey] : [],
        }}
        trigger={['click']}
        placement="bottomRight"
      >
        <div
          className={styles.moreButton}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            cursor: 'pointer',
            color: isInMore ? '#4F6EF7' : '#8B949E',
            borderLeft: '1px solid #30363D',
          }}
        >
          <EllipsisOutlined style={{ fontSize: 18 }} />
        </div>
      </Dropdown>
    </div>
  )
}
