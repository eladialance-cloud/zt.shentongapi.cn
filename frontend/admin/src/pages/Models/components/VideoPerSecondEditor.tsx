import { Button, Form, InputNumber, Space } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'

const TIERS = ['720P', '1080P', '2K', '4K']

/** 视频计费：分辨率档 × 积分/秒 编辑器（表单值存 videoPerSecond 对象） */
export default function VideoPerSecondEditor() {
  return (
    <Form.List name="videoPerSecondList">
      {(fields, { add, remove }) => (
        <Space direction="vertical" style={{ width: '100%' }}>
          {fields.map(({ key, name }) => (
            <Space key={key} align="baseline">
              <Form.Item name={[name, 'resolution']} noStyle initialValue={TIERS[name]}>
                <InputNumber disabled style={{ width: 100 }} />
              </Form.Item>
              <span>积分/秒</span>
              <Form.Item name={[name, 'rate']} noStyle rules={[{ required: true, message: '请输入每秒积分' }]}>
                <InputNumber min={0} step={0.1} style={{ width: 120 }} />
              </Form.Item>
              <MinusCircleOutlined onClick={() => remove(name)} />
            </Space>
          ))}
          <Button type="dashed" onClick={() => add({ resolution: TIERS[fields.length] ?? '720P', rate: 0 })} icon={<PlusOutlined />}>
            添加分辨率档
          </Button>
        </Space>
      )}
    </Form.List>
  )
}