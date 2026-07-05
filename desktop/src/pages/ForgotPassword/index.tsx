// 忘记密码页 - 输入邮箱发送重置链接
//
// 流程：
// 1. 输入邮箱
// 2. 调用 POST /auth/forgot-password
// 3. 成功提示"重置链接已发送到您的邮箱（30 分钟内有效）"

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, message } from 'antd'
import { ArrowLeftOutlined, MailOutlined, RobotOutlined } from '@ant-design/icons'
import { httpClient } from '@/api/http-client'
import { BusinessError } from '@/utils/errors'

interface ForgotPasswordFormValues {
  email: string
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleFinish = async (values: ForgotPasswordFormValues) => {
    setLoading(true)
    try {
      await httpClient.post('/auth/forgot-password', { email: values.email })
      setSent(true)
      message.success('重置链接已发送到您的邮箱（30 分钟内有效）')
    } catch (err) {
      if (err instanceof BusinessError) {
        message.error(err.message || '发送失败')
      } else {
        message.error('发送失败，请检查网络后重试')
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
          'radial-gradient(circle at 20% 30%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(139,92,246,0.12) 0%, transparent 50%), linear-gradient(135deg, #0a0e1a 0%, #111827 100%)',
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: '100%',
          background: 'rgba(17,24,39,0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 16,
          padding: '40px 36px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 80px rgba(99,102,241,0.08)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <RobotOutlined style={{ fontSize: 48, color: '#6366f1', filter: 'drop-shadow(0 0 12px rgba(99,102,241,0.6))', marginBottom: 12 }} />
          <h2 style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>忘记密码</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
            {sent ? '重置链接已发送，请查收邮件' : '输入注册邮箱，我们将发送密码重置链接'}
          </p>
        </div>

        {!sent ? (
          <Form<ForgotPasswordFormValues> onFinish={handleFinish} size="large" layout="vertical">
            <Form.Item
              name="email"
              label={<span style={{ color: '#cbd5e1' }}>邮箱</span>}
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#64748b' }} />}
                placeholder="your@email.com"
                style={{
                  background: 'rgba(15,23,42,0.6)',
                  borderColor: 'rgba(99,102,241,0.2)',
                  color: '#e2e8f0',
                  height: 44,
                  borderRadius: 8,
                }}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{
                  height: 44,
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 15,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none',
                  boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                }}
              >
                发送重置链接
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
              重置链接已发送到您的邮箱，<br />
              请在 30 分钟内完成密码重置。<br />
              如果没有收到邮件，请检查垃圾邮件文件夹。
            </p>
            <Button
              type="primary"
              onClick={() => navigate('/login')}
              style={{
                height: 44,
                borderRadius: 8,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
              }}
            >
              返回登录
            </Button>
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <span
            style={{ color: '#818cf8', fontSize: 13, cursor: 'pointer' }}
            onClick={() => navigate('/login')}
          >
            <ArrowLeftOutlined /> 返回登录
          </span>
        </div>
      </div>
    </div>
  )
}
