// 外观主题 - Kimi 风格（P5 重构）
// 主题三态：跟随系统 / 浅色 / 深色（与 settings-store 同步，TopBar 快捷切换同样生效）

import { Card, Segmented, Tag } from 'antd'
import { BgColorsOutlined, CheckCircleFilled, DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import {
  useSettingsStore,
  resolveThemeMode,
  systemPrefersDark,
  type ThemeMode
} from '@/store/settings'
import styles from './styles.module.css'

export default function Theme() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const effective = resolveThemeMode(theme, systemPrefersDark())

  return (
    <Card className={styles.card} bordered={false}>
      <div className={styles.cardBody}>
        <h2 className={styles.sectionTitle}>外观主题</h2>
        <div className={styles.sectionDesc}>
          支持跟随系统自动切换，也可手动固定为浅色或深色
        </div>

        {/* 主题模式三态切换 */}
        <div className={styles.themeBlock}>
          <div className={styles.themeLabel}>主题模式</div>
          <div className={styles.themeDesc}>
            当前生效：{effective === 'dark' ? '深色' : '浅色'}
            {theme === 'system' && '（跟随系统）'}
          </div>
          <Segmented
            value={theme}
            onChange={(v) => setTheme(v as ThemeMode)}
            options={[
              { label: '跟随系统', value: 'system', icon: <DesktopOutlined /> },
              { label: '浅色', value: 'light', icon: <SunOutlined /> },
              { label: '深色', value: 'dark', icon: <MoonOutlined /> }
            ]}
          />
        </div>

        {/* 主色（品牌蓝锁定） */}
        <div className={styles.themeBlock}>
          <div className={styles.themeLabel}>
            品牌主色
            <Tag color="blue" style={{ marginLeft: 8 }}>
              已锁定
            </Tag>
          </div>
          <div className={styles.themeDesc}>
            统一使用品牌蓝 <code>#1F6FEB</code>（深色模式 <code>#3B82F6</code>），全站按钮、链接与选中态自动应用
          </div>
          <div className={styles.themeSwatches}>
            <span className={styles.themeSwatchLocked}>
              <CheckCircleFilled />
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              Kimi 式单主色 · 不提供自定义色板
            </span>
          </div>
        </div>

        {/* 提示 */}
        <div className={styles.themeBlock}>
          <div className={styles.themeDesc}>
            <BgColorsOutlined style={{ marginRight: 6 }} />
            主题切换实时生效；顶栏按钮可在浅色 / 深色间快速切换，此处可随时回到「跟随系统」。
          </div>
        </div>
      </div>
    </Card>
  )
}
