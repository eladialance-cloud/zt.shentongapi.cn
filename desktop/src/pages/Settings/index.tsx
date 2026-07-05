// 个人设置 - 首页布局（Task 15）
// 左侧 antd Menu 5 项 + 右侧根据选中项渲染对应组件
// 使用 antd Layout + Sider

import { useState } from 'react'
import { Layout, Menu, Button } from 'antd'
import {
  SettingOutlined,
  UserOutlined,
  LockOutlined,
  KeyOutlined,
  DesktopOutlined,
  BellOutlined,
  SyncOutlined,
  RollbackOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import Profile from './Profile'
import Password from './Password'
import ApiKeys from './ApiKeys'
import Devices from './Devices'
import Notifications from './Notifications'
import Update from './Update'
import styles from './styles.module.css'

type SettingsTab = 'profile' | 'password' | 'apikeys' | 'devices' | 'notifications' | 'update'

const MENU_ITEMS: Array<{ key: SettingsTab; label: string; icon: React.ReactNode }> = [
  { key: 'profile', label: '资料编辑', icon: <UserOutlined /> },
  { key: 'password', label: '修改密码', icon: <LockOutlined /> },
  { key: 'apikeys', label: 'API Key', icon: <KeyOutlined /> },
  { key: 'devices', label: '设备管理', icon: <DesktopOutlined /> },
  { key: 'notifications', label: '通知设置', icon: <BellOutlined /> },
  { key: 'update', label: '检查更新', icon: <SyncOutlined /> }
]

export default function Settings() {
  const navigate = useNavigate()
  const [active, setActive] = useState<SettingsTab>('profile')

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <SettingOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>个人设置</h1>
            <div className={styles.subtitle}>管理账户资料、安全与偏好</div>
          </div>
        </div>
        <Button
          icon={<RollbackOutlined />}
          onClick={() => navigate('/dashboard')}
          className={styles.backBtn}
        >
          返回主页
        </Button>
      </div>

      <div className={styles.body}>
        <Layout className={styles.sider}>
          <Menu
            className={styles.menu}
            mode="inline"
            selectedKeys={[active]}
            items={MENU_ITEMS.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: item.label
            }))}
            onClick={(e) => setActive(e.key as SettingsTab)}
            theme="dark"
          />
        </Layout>

        <div className={styles.content}>
          {active === 'profile' && <Profile />}
          {active === 'password' && <Password />}
          {active === 'apikeys' && <ApiKeys />}
          {active === 'devices' && <Devices />}
          {active === 'notifications' && <Notifications />}
          {active === 'update' && <Update />}
        </div>
      </div>
    </div>
  )
}
