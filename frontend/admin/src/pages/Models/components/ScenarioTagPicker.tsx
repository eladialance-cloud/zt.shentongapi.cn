import { Select, Space, Tag } from 'antd'
import { useMemo } from 'react'

/** 场景标签多选 + 规则 A 预览（显示名 + 第一个标签 + 计费） */
export default function ScenarioTagPicker(props: {
  scenarioTags: string[]
  value?: string[]
  displayName?: string
  priceText?: string
  onChange?: (tags: string[]) => void
}) {
  const { scenarioTags, value = [], displayName, priceText, onChange } = props
  const firstTag = useMemo(() => value[0] ?? '', [value])
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select
        mode="multiple"
        style={{ width: '100%' }}
        options={scenarioTags.map((t) => ({ label: t, value: t }))}
        value={value}
        onChange={onChange}
        placeholder="选择场景标签（多选，第一个作为展示标签）"
      />
      <div>
        <span style={{ color: '#666', marginRight: 8 }}>自动归类预览：</span>
        <Tag>{[displayName, firstTag, priceText].filter(Boolean).join(' ')}</Tag>
      </div>
    </Space>
  )
}