import { Form, InputNumber, Radio, Space } from 'antd'
import { useMemo } from 'react'
import VideoPerSecondEditor from './VideoPerSecondEditor'
import type { CallModeDef } from '@/types/admin-model'

const MODE_LABELS: Record<string, string> = {
  token: '按 token（积分/千token）',
  per_image: '按张（积分/张）',
  per_call: '按次（积分/次）',
  per_minute: '按分钟（积分/分钟）',
  per_second: '按秒（积分/秒，按分辨率档）'
}

/** 计费配置：pricingMode 单选 + 动态单价 + 成本价与毛利率 */
export default function PricingConfigForm(props: { def?: CallModeDef }) {
  const { def } = props
  const pricingMode = Form.useWatch('pricingMode', undefined as any)
  const costPrice = Form.useWatch('costPrice', undefined as any)
  const billingModes = def?.billingModes ?? []
  const margin = useMemo(() => {
    if (costPrice == null) return null
    // 毛利率按成本价估算：输入单价口径显示（精确值在提交时由后端计算）
    return null
  }, [costPrice])

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Form.Item name="pricingMode" label="计费方式" initialValue={def?.recommendedBilling}>
        <Radio.Group>
          <Space direction="vertical">
            {billingModes.map((m) => (
              <Radio key={m} value={m}>
                {MODE_LABELS[m] ?? m}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      </Form.Item>

      {pricingMode === 'token' && (
        <Space>
          <Form.Item name="inputPricePerToken" label="输入(积分/千token)">
            <InputNumber min={0} step={0.1} />
          </Form.Item>
          <Form.Item name="outputPricePerToken" label="输出(积分/千token)">
            <InputNumber min={0} step={0.1} />
          </Form.Item>
        </Space>
      )}
      {pricingMode === 'per_image' && (
        <Form.Item name="pricePerImage" label="单价(积分/张)">
          <InputNumber min={0} step={1} />
        </Form.Item>
      )}
      {pricingMode === 'per_call' && (
        <Form.Item name="pricePerCall" label="单价(积分/次)">
          <InputNumber min={0} step={0.5} />
        </Form.Item>
      )}
      {pricingMode === 'per_minute' && (
        <Form.Item name="pricePerMinute" label="单价(积分/分钟)">
          <InputNumber min={0} step={0.5} />
        </Form.Item>
      )}
      {pricingMode === 'per_second' && <VideoPerSecondEditor />}

      <Form.Item name="costPrice" label="成本价(元)">
        <InputNumber min={0} step={0.01} />
      </Form.Item>
      {margin !== null && <span style={{ color: '#999' }}>毛利率将按成本价与定价自动计算（后端入库时核算）</span>}
    </Space>
  )
}