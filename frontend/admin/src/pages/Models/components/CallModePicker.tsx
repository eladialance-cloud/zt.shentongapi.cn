import { Button, Space } from 'antd'
import type { CallModeDef } from '@/types/admin-model'

const GROUPS: Array<{ key: CallModeDef['group']; label: string }> = [
  { key: 'text', label: '文本类' },
  { key: 'multimodal', label: '多模态理解类' },
  { key: 'generation', label: '生成类' },
  { key: 'voice', label: '语音类' }
]

/** 14 种调用模式总开关（4 组大按钮），选中后由父组件联动动态规格/计费/能力 */
export default function CallModePicker(props: {
  callModes: CallModeDef[]
  value?: string
  onChange?: (key: string) => void
}) {
  const { callModes, value, onChange } = props
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      {GROUPS.map((g) => (
        <Space key={g.key} wrap size={8}>
          <span style={{ width: 100, color: '#666' }}>{g.label}</span>
          {callModes
            .filter((m) => m.group === g.key)
            .map((m) => (
              <Button
                key={m.key}
                type={value === m.key ? 'primary' : 'default'}
                onClick={() => onChange?.(m.key)}
              >
                {m.label}
              </Button>
            ))}
        </Space>
      ))}
    </Space>
  )
}