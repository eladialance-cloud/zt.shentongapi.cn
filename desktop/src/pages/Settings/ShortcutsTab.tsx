// 快捷键设置（Task 11 v0.3.1）
// 6 个可配置快捷键：全局搜索 / 新建 / 保存 / 命令面板 / 设置 / 删除
// 捕获 Input：按下组合键自动填入；支持单项恢复默认、单项清除、保存、恢复全部默认
// 持久化到 localStorage（key: shortcuts-config）

import { useState } from 'react'
import { Card, Form, Input, Button, Space, message } from 'antd'
import {
  UndoOutlined,
  ClearOutlined,
  SaveOutlined,
  KeyOutlined
} from '@ant-design/icons'
import {
  loadShortcutsConfig,
  saveShortcutsConfig,
  formatFromKeyboardEvent,
  isModifierKey,
  DEFAULT_SHORTCUTS
} from '@/utils/shortcut-parser'
import styles from './styles.module.css'

interface ShortcutItem {
  actionKey: string
  label: string
  description: string
  defaultValue: string
}

const SHORTCUT_ITEMS: ShortcutItem[] = [
  {
    actionKey: 'global-search',
    label: '全局搜索',
    description: '聚焦顶部全局搜索框',
    defaultValue: 'Ctrl+K'
  },
  {
    actionKey: 'new-item',
    label: '新建',
    description: '创建新项目',
    defaultValue: 'Ctrl+N'
  },
  {
    actionKey: 'save',
    label: '保存',
    description: '保存当前内容',
    defaultValue: 'Ctrl+S'
  },
  {
    actionKey: 'command-palette',
    label: '命令面板',
    description: '打开命令面板',
    defaultValue: 'Ctrl+Shift+P'
  },
  {
    actionKey: 'settings',
    label: '设置',
    description: '打开设置页面',
    defaultValue: 'Ctrl+,'
  },
  {
    actionKey: 'delete',
    label: '删除',
    description: '删除选中项',
    defaultValue: 'Ctrl+D'
  }
]

export default function ShortcutsTab() {
  const [config, setConfig] = useState<Record<string, string>>(() =>
    loadShortcutsConfig()
  )
  const [capturing, setCapturing] = useState<string | null>(null)

  const handleKeyDown =
    (actionKey: string) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      e.stopPropagation()

      const native = e.nativeEvent

      // 纯修饰键按下：忽略，等待主键
      if (isModifierKey(native.key)) return

      // 必须包含至少一个修饰键
      if (
        !native.ctrlKey &&
        !native.shiftKey &&
        !native.altKey &&
        !native.metaKey
      ) {
        message.warning('快捷键必须包含 Ctrl / Shift / Alt / Meta 之一')
        return
      }

      const shortcut = formatFromKeyboardEvent(native)
      if (!shortcut) return

      // 冲突检测：不允许两个 action 使用相同快捷键
      const conflictEntry = Object.entries(config).find(
        ([k, v]) => k !== actionKey && v === shortcut
      )
      if (conflictEntry) {
        const conflictItem = SHORTCUT_ITEMS.find(
          (i) => i.actionKey === conflictEntry[0]
        )
        message.warning(
          `快捷键 ${shortcut} 已被「${
            conflictItem?.label || conflictEntry[0]
          }」占用`
        )
        return
      }

      setConfig((prev) => ({ ...prev, [actionKey]: shortcut }))
      setCapturing(null)
    }

  const handleReset = (actionKey: string) => {
    const item = SHORTCUT_ITEMS.find((i) => i.actionKey === actionKey)
    if (!item) return
    setConfig((prev) => ({ ...prev, [actionKey]: item.defaultValue }))
    message.success(`已恢复「${item.label}」默认快捷键：${item.defaultValue}`)
  }

  const handleClear = (actionKey: string) => {
    setConfig((prev) => ({ ...prev, [actionKey]: '' }))
  }

  const handleSave = () => {
    saveShortcutsConfig(config)
    message.success('快捷键配置已保存，刷新后仍生效')
  }

  const handleResetAll = () => {
    const defaults = { ...DEFAULT_SHORTCUTS }
    setConfig(defaults)
    saveShortcutsConfig(defaults)
    message.success('已恢复全部默认快捷键')
  }

  return (
    <Card className={styles.card} bordered={false}>
      <div className={styles.cardBody}>
        <h2 className={styles.sectionTitle}>
          <KeyOutlined style={{ marginRight: 8, color: 'var(--color-primary)' }} />
          快捷键
        </h2>
        <div className={styles.sectionDesc}>
          自定义常用快捷键。点击输入框后按下组合键即可捕获，保存后立即生效并持久化到本地。
        </div>

        <Form layout="vertical" className={styles.shortcutForm}>
          {SHORTCUT_ITEMS.map((item) => {
            const value = config[item.actionKey] ?? ''
            const isCapturing = capturing === item.actionKey
            return (
              <Form.Item
                key={item.actionKey}
                label={
                  <div className={styles.shortcutLabel}>
                    <span className={styles.shortcutTitle}>{item.label}</span>
                    <span className={styles.shortcutDesc}>
                      {item.description}
                    </span>
                  </div>
                }
              >
                <Space align="center" wrap>
                  <Input
                    readOnly
                    value={value || '（未设置）'}
                    placeholder="点击并按下快捷键"
                    onFocus={() => setCapturing(item.actionKey)}
                    onBlur={() => setCapturing(null)}
                    onKeyDown={handleKeyDown(item.actionKey)}
                    className={
                      isCapturing
                        ? styles.shortcutCapturing
                        : styles.shortcutInput
                    }
                    style={{ width: 220 }}
                  />
                  <Button
                    icon={<UndoOutlined />}
                    onClick={() => handleReset(item.actionKey)}
                  >
                    恢复默认
                  </Button>
                  <Button
                    icon={<ClearOutlined />}
                    onClick={() => handleClear(item.actionKey)}
                  >
                    清除
                  </Button>
                </Space>
              </Form.Item>
            )
          })}
        </Form>

        <Space style={{ marginTop: 16 }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            className={styles.primaryBtn}
          >
            保存配置
          </Button>
          <Button onClick={handleResetAll}>恢复全部默认</Button>
        </Space>
      </div>
    </Card>
  )
}
