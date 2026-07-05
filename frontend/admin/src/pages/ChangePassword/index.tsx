// 管理端强制改密页 - Task 4 安全加固
//
// 触发条件：默认管理员账号首次登录（login 返回 mustChangePassword=true）
// 流程：
// 1. 用户输入旧密码 + 新密码 + 确认新密码
// 2. 前端校验：新密码 >= 8 位、确认密码一致
// 3. 调用 POST /admin/auth/change-password body: { oldPassword, newPassword }
// 4. 成功：clearMustChangePassword() → 跳转 /dashboard
// 5. 失败：antd message.error 提示

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, message } from 'antd'
import { LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { changeAdminPassword } from '@/api/admin-auth-api'
import { useAdminAuthStore } from '@/store/admin-auth'
import { BusinessError } from '@/utils/errors'

interface ChangePasswordFormValues {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

export default function AdminChangePassword() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const clearMustChangePassword = useAdminAuthStore(
    (s) => s.clearMustChangePassword
  )

  const handleFinish = async (values: ChangePasswordFormValues) => {
    setLoading(true)
    try {
      await changeAdminPassword(values.oldPassword, values.newPassword)
      clearMustChangePassword()
      message.success('密码修改成功，即将进入控制台')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof BusinessError) {
        message.error(err.message || '密码修改失败')
      } else {
        message.error('密码修改失败，请检查网络后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        background: '#0a0e1a',
        backgroundImage:
          'radial-gradient(circle at 20% 30%, rgba(56, 189, 248, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(99, 102, 241, 0.12) 0%, transparent 50%), linear-gradient(135deg, #0a0e1a 0%, #0f172a 100%)'
      }}
    >
      <div
        style={{
          width: 440,
          maxWidth: '100%',
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(56, 189, 248, 0.22)',
          borderRadius: 16,
          padding: '40px 36px',
          boxShadow:
            '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 80px rgba(56, 189, 248, 0.08)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <SafetyCertificateOutlined
            style={{ fontSize: 40, color: '#38bdf8' }}
          />
          <h2
            style={{
              color: '#e2e8f0',
              margin: '12px 0 4px',
              fontSize: 22,
              fontWeight: 600
            }}
          >
            修改管理员密码
          </h2>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: 13 }}>
            为保障账号安全，首次登录请先修改默认密码
          </p>
        </div>

        <Form<ChangePasswordFormValues>
          onFinish={handleFinish}
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="oldPassword"
            label={<span style={{ color: '#cbd5e1' }}>旧密码</span>}
            rules={[{ required: true, message: '请输入旧密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#64748b' }} />}
              placeholder="当前密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={<span style={{ color: '#cbd5e1' }}>新密码</span>}
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码至少 8 位' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#64748b' }} />}
              placeholder="至少 8 位新密码"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={<span style={{ color: '#cbd5e1' }}>确认新密码</span>}
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                }
              })
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#64748b' }} />}
              placeholder="再次输入新密码"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
            >
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}
