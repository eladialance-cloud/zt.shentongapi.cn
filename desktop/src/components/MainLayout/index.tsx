// 主窗口骨架 - 方案B(顶部 Tab + 卡片仪表盘)
// Layout 结构:顶栏(48px) + Tab 栏(44px) + 内容区(flex:1) + 底栏(32px)
// 深色赛博风格,背景 #0a0e1a,主色 #6366f1/#00d4ff

import { Outlet } from 'react-router-dom'
import TopBar from './TopBar'
import TopTabs from './TopTabs'
import StatusBar from '@/components/StatusBar'
import styles from './styles.module.css'

export default function MainLayout() {
  return (
    <div className={styles.layout}>
      <TopBar />
      <TopTabs />
      <div className={styles.content}>
        <Outlet />
      </div>
      <StatusBar />
    </div>
  )
}
