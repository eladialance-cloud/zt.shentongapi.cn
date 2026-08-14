import { Form, Input, InputNumber, Select, Switch } from 'antd'
import type { SpecFieldSchema } from '@/types/admin-model'

/** 按 callMode.specFields + SPEC_FIELD_SCHEMAS 渲染动态规格字段（值存 specs 对象） */
export default function DynamicSpecForm(props: {
  specFields: string[]
  schemas: Record<string, SpecFieldSchema>
}) {
  const { specFields, schemas } = props
  const items = specFields.map((f) => ({ field: f, schema: schemas[f] })).filter((x) => x.schema)
  if (items.length === 0) return <span style={{ color: '#999' }}>该调用模式无动态规格字段</span>
  return (
    <>
      {items.map(({ field, schema }) => (
        <Form.Item key={field} name={['specs', field]} label={schema.label} initialValue={schema.default}>
          {renderControl(schema)}
        </Form.Item>
      ))}
    </>
  )
}

function renderControl(schema: SpecFieldSchema) {
  switch (schema.type) {
    case 'number':
      return <InputNumber style={{ width: '100%' }} min={schema.min} max={schema.max} placeholder={schema.placeholder} />
    case 'select':
      return <Select options={(schema.options ?? []).map((o) => ({ label: o, value: o }))} placeholder={schema.placeholder} />
    case 'multiselect':
      return <Select mode="multiple" options={(schema.options ?? []).map((o) => ({ label: o, value: o }))} placeholder={schema.placeholder} />
    case 'boolean':
      return <Switch />
    case 'json':
      return <Input.TextArea rows={3} placeholder={schema.placeholder} />
    default:
      return <Input placeholder={schema.placeholder} />
  }
}