// 外观主题（Task 19 v0.3.1）
// 主题模式切换（light/dark）+ 主色选择器（v0.3.1 锁定 #1677FF）
// 通过 [data-theme="dark"] 属性切换 design-tokens.css 暗色变量

import { useEffect, useState } from 'react'
import { Card, Segmented, Tag, Tooltip } from 'antd'
import { BgColorsOutlined, LockOutlined, CheckCircleFilled } from '@ant-design/icons'
import styles from './styles.module.css'

type ThemeMode = 'light' | 'dark'

const PRIMARY_COLOR = '#1677FF' // v0.3.1 锁定主色

const PRESET_COLORS = [
  { name: '极客蓝', value: PRIMARY_COLOR },
  { name: '极光绿', value: '#52C41A' },
  { name: '日暮橙', value: '#FA8C16' },
  { name: '酱紫', value: '#722ED1' }
]

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else {
    root.removeAttribute('data-theme')
  }
}

function getInitialMode(): ThemeMode {
  const cur = document.documentElement.getAttribute('data-theme')
  return cur === 'dark' ? 'dark' : 'light'
}

export default function Theme() {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode)

  useEffect(() => {
    applyTheme(mode)
  }, [mode])

  return (
    <Card className={styles.card} bordered={false}>
      <div className={styles.cardBody}>
        <h2 className={styles.sectionTitle}>外观主题</h2>
        <div className={styles.sectionDesc}>
          切换浅色 / 深色主题，主色按 v0.3.1 规范锁定为 #1677FF
        </div>

        {/* 主题模式切换 */}
        <div className={styles.themeBlock}>
          <div className={styles.themeLabel}>主题模式</div>
          <div className={styles.themeDesc}>选择浅色或深色界面</div>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as ThemeMode)}
            options={[
              { label: '浅色', value: 'light' },
              { label: '深色', value: 'dark' }
            ]}
          />
        </div>

        {/* 主色选择器（锁定） */}
        <div className={styles.themeBlock}>
          <div className={styles.themeLabel}>
            主色
            <Tag color="blue" style={{ marginLeft: 8 }}>
              v0.3.1 锁定
            </Tag>
          </div>
          <div className={styles.themeDesc}>
            当前主色为 <code>{PRIMARY_COLOR}</code>，遵循 v0.3.1 设计规范，暂不支持自定义
          </div>
          <div className={styles.themeSwatches}>
            <Tooltip title="v0.3.1 锁定主色 - 极客蓝">
              <span className={styles.themeSwatchLocked}>
                <CheckCircleFilled />
              </span>
            </Tooltip>
            {PRESET_COLORS.slice(1).map((c) => (
              <Tooltip key={c.value} title={`${c.name}（${c.value}）- 已锁定`}>
                <span
                  className={styles.themeSwatch}
                  style={{ background: c.value, opacity: 0.4, cursor: 'not-allowed' }}
                >
                  <LockOutlined style={{ color: '#fff', fontSize: 12 }} />
                </span>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* 提示 */}
        <div className={styles.themeBlock}>
          <div className={styles.themeDesc}>
            <BgColorsOutlined style={{ marginRight: 6 }} />
            主题切换实时生效，所有页面将统一应用 design-tokens.css 中的浅色 / 深色变量。
          </div>
        </div>
      </div>
    </Card>
  )
}
