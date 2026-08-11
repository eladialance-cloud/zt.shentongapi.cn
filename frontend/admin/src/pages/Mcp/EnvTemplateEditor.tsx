// 环境变量模板编辑器（官方目录）
//
// Form.List name="envTemplate"，每行:key/label/required/secret/default/description

import { Button, Form, Input, Switch } from 'antd'
import styles from './styles.module.css'

/** 环境变量模板编辑器 */
export function EnvTemplateEditor() {
  return (
    <Form.Item label="环境变量模板">
      <Form.List name="envTemplate">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => (
              <div key={field.key} className={styles.kvRow}>
                <Form.Item
                  {...field}
                  name={[field.name, 'key']}
                  className={styles.kvKey}
                  rules={[{ required: true, message: 'KEY' }]}
                >
                  <Input placeholder="KEY" maxLength={128} />
                </Form.Item>
                <Form.Item
                  {...field}
                  name={[field.name, 'label']}
                  className={styles.kvKey}
                >
                  <Input placeholder="显示名" maxLength={64} />
                </Form.Item>
                <Form.Item
                  {...field}
                  name={[field.name, 'required']}
                  className={styles.kvValue}
                  valuePropName="checked"
                >
                  <Switch size="small" checkedChildren="必填" unCheckedChildren="选填" />
                </Form.Item>
                <Form.Item
                  {...field}
                  name={[field.name, 'secret']}
                  className={styles.kvValue}
                  valuePropName="checked"
                >
                  <Switch size="small" checkedChildren="密" unCheckedChildren="-" />
                </Form.Item>
                <Form.Item
                  {...field}
                  name={[field.name, 'default']}
                  className={styles.kvKey}
                >
                  <Input placeholder="默认值" maxLength={256} />
                </Form.Item>
                <Form.Item
                  {...field}
                  name={[field.name, 'description']}
                  className={styles.kvKey}
                >
                  <Input placeholder="说明" maxLength={256} />
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
              onClick={() => add({ key: '', label: '', required: false, secret: false, default: '', description: '' })}
              className={styles.kvAddBtn}
            >
              + 添加环境变量
            </Button>
          </>
        )}
      </Form.List>
    </Form.Item>
  )
}
