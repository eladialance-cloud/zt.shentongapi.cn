import { useState } from 'react'
import { Button, ColorPicker, Drawer, InputNumber, Select, Slider, Space, Switch, Typography, Divider } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import type { OfficeConfig, OfficeLayoutConfig, OfficeColorConfig } from './types'
import { COLOR_PRESETS, DEFAULT_CONFIG } from './types'

const { Text } = Typography

interface ConfigPanelProps {
  config: OfficeConfig
  onChange: (config: OfficeConfig) => void
}

export default function ConfigPanel({ config, onChange }: ConfigPanelProps) {
  const [open, setOpen] = useState(false)

  const updateLayout = (patch: Partial<OfficeLayoutConfig>) => {
    onChange({ ...config, layout: { ...config.layout, ...patch } })
  }

  const updateColors = (patch: Partial<OfficeColorConfig>) => {
    onChange({ ...config, colors: { ...config.colors, ...patch } })
  }

  const applyPreset = (key: string) => {
    const preset = COLOR_PRESETS[key]
    if (preset) {
      onChange({ ...config, colors: { ...preset } })
    }
  }

  const resetAll = () => {
    onChange({ ...DEFAULT_CONFIG })
  }

  return (
    <>
      <Button
        type="text"
        icon={<SettingOutlined />}
        onClick={() => setOpen(true)}
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        布局与配色
      </Button>

      <Drawer
        title="办公室配置"
        open={open}
        onClose={() => setOpen(false)}
        width={340}
        styles={{ body: { padding: 16 } }}
      >
        {/* 主题预设 */}
        <Text strong style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>配色主题</Text>
        <Space wrap style={{ margin: '8px 0 16px' }}>
          {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              size="small"
              onClick={() => applyPreset(key)}
              style={{
                background: preset.background,
                color: preset.floor === '#161B22' ? '#E6EDF3' : '#333',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
              }}
            >
              {key === 'dark' ? '🌙 暗色' :
               key === 'light' ? '☀️ 亮色' :
               key === 'warm' ? '🔥 暖色' :
               '🌿 自然'}
            </Button>
          ))}
        </Space>

        <Divider style={{ margin: '12px 0' }} />

        {/* 布局 */}
        <Text strong style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>布局设置</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <Text style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>列数</Text>
            <InputNumber
              size="small"
              min={1}
              max={8}
              value={config.layout.cols}
              onChange={(v) => updateLayout({ cols: v ?? 3 })}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <Text style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>行数 (0=自动)</Text>
            <InputNumber
              size="small"
              min={0}
              max={8}
              value={config.layout.rows}
              onChange={(v) => updateLayout({ rows: v ?? 0 })}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <Text style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>列间距</Text>
            <InputNumber
              size="small"
              min={60}
              max={400}
              step={10}
              value={config.layout.colGap}
              onChange={(v) => updateLayout({ colGap: v ?? 160 })}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <Text style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>行间距</Text>
            <InputNumber
              size="small"
              min={60}
              max={400}
              step={10}
              value={config.layout.rowGap}
              onChange={(v) => updateLayout({ rowGap: v ?? 150 })}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <Divider style={{ margin: '16px 0 12px' }} />

        {/* 颜色 */}
        <Text strong style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>自定义颜色</Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {([
            { key: 'floor' as const, label: '地板颜色' },
            { key: 'background' as const, label: '背景颜色' },
            { key: 'deskTop' as const, label: '桌面颜色' },
            { key: 'chairColor' as const, label: '椅子颜色' },
          ]).map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{label}</Text>
              <ColorPicker
                size="small"
                value={config.colors[key]}
                onChange={(_, hex) => updateColors({ [key]: hex })}
              />
            </div>
          ))}
        </div>

        <Divider style={{ margin: '16px 0 12px' }} />

        {/* 显示选项 */}
        <Text strong style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>显示选项</Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>显示名称标签</Text>
            <Switch
              size="small"
              checked={config.showLabels}
              onChange={(v) => onChange({ ...config, showLabels: v })}
            />
          </div>
          <div>
            <Text style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>动画速度</Text>
            <Slider
              min={0.1}
              max={3}
              step={0.1}
              value={config.animationSpeed}
              onChange={(v) => onChange({ ...config, animationSpeed: v })}
              style={{ margin: '4px 0' }}
            />
          </div>
        </div>

        <Divider style={{ margin: '16px 0 12px' }} />

        <Button block onClick={resetAll} style={{ marginTop: 8 }}>
          恢复默认
        </Button>
      </Drawer>
    </>
  )
}
