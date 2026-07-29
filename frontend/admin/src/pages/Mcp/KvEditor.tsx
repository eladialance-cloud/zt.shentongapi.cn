import { Button, Form, Input } from 'antd'
import styles from './styles.module.css'

/** 可复用的 KV 编辑器（环境变量、请求头等） */
export function KvEditor({ label, addText = '+ 添加', keyPlaceholder = 'KEY', valuePlaceholder = 'value' }: {
  label: string
  addText?: string
  keyPlaceholder?: string
  valuePlaceholder?: string
}) {
  return (
    <Form.Item label={label}>
      <Form.List name={label === '环境变量 (env)' ? 'envKv' : 'headersKv'}>
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => (
              <div key={field.key} className={styles.kvRow}>
                <Form.Item
                  {...field}
                  name={[field.name, 'key']}
                  className={styles.kvKey}
                  rules={[{ required: true, message: '键' }]}
                >
                  <Input placeholder={keyPlaceholder} />
                </Form.Item>
                <Form.Item
                  {...field}
                  name={[field.name, 'value']}
                  className={styles.kvValue}
                >
                  <Input placeholder={valuePlaceholder} />
                </Form.Item>
                <Button
                  type="link"
                  danger
                  size="small"
                  onClick={() => remove(field.name)}
                  className={styles.kvRemove}
                >
                  移除
                </Button>
              </div>
            ))}
            <Button
              type="dashed"
              size="small"
              onClick={() => add({ key: '', value: '' })}
              className={styles.kvAddBtn}
            >
              {addText}
            </Button>
          </>
        )}
      </Form.List>
    </Form.Item>
  )
}
