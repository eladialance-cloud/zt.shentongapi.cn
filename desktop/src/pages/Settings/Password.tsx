// 修改密码（SubTask 15.2）
// 当前密码 + 新密码 + 确认新密码
// 校验：新密码至少 8 位含字母+数字，两次输入一致
// 提交 PATCH /users/password body: { currentPassword, newPassword }
// 成功后清空表单并提示重新登录

import { useState } from 'react'
import { Card, Form, Input, Button, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { changePassword } from '@/api/settings-api'
import styles from './styles.module.css'

interface FormValues {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

/** 新密码强度校验：至少 8 位且包含字母与数字 */
function validateNewPassword(_rule: unknown, value: string): Promise<void> {
  if (!value) return Promise.reject(new Error('请输入新密码'))
  if (value.length < 8) return Promise.reject(new Error('密码至少 8 位'))
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
    return Promise.reject(new Error('密码需同时包含字母和数字'))
  }
  return Promise.resolve()
}

export default function Password() {
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      })
      message.success('密码修改成功，请重新登录')
      form.resetFields()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[Password] change failed:', err)
      message.error('密码修改失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={styles.card} bordered={false}>
      <div className={styles.cardBody}>
        <h2 className={styles.sectionTitle}>修改密码</h2>
        <div className={styles.sectionDesc}>
          新密码至少 8 位，需同时包含字母和数字
        </div>

        <Form
          form={form}
          layout="vertical"
          className={styles.form}
          onFinish={handleSubmit}
        >
          <Form.Item
            label="当前密码"
            name="currentPassword"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入当前密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[{ required: true, validator: validateNewPassword }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="至少 8 位，含字母和数字"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_rule, value: string) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                }
              })
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请再次输入新密码"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className={styles.primaryBtn}
              loading={saving}
            >
              提交
            </Button>
          </Form.Item>
        </Form>
      </div>
    </Card>
  )
}
