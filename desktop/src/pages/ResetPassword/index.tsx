// 重置密码页 - 从 URL 获取 token，输入新密码
//
// 流程：
// 1. 从 URL query 获取 token（支持 hash router 和 query router）
// 2. 输入新密码 + 确认密码
// 3. 调用 POST /auth/reset-password
// 4. 成功后跳转登录页

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, message } from 'antd'
import { ArrowLeftOutlined, LockOutlined, RobotOutlined } from '@ant-design/icons'
import { httpClient } from '@/api/http-client'
import { BusinessError } from '@/utils/errors'

interface ResetPasswordFormValues {
  newPassword: string
  confirmPassword: string
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // 从 URL 获取 token
  const token = searchParams.get('token') || ''

  const handleFinish = async (values: ResetPasswordFormValues) => {
    if (!token) {
      message.error('重置链接无效，缺少令牌参数')
      return
    }

    setLoading(true)
    try {
      await httpClient.post('/auth/reset-password', {
        token,
        newPassword: values.newPassword,
      })
      setSuccess(true)
      message.success('密码重置成功，请使用新密码登录')
    } catch (err) {
      if (err instanceof BusinessError) {
        message.error(err.message || '重置失败')
      } else {
        message.error('重置失败，请检查网络后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  /** 无效 token 提示 */
  if (!token) {
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
            'radial-gradient(circle at 20% 30%, rgba(99,102,241,0.15) 0%, transparent 50%), linear-gradient(135deg, #0a0e1a 0%, #111827 100%)',
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
            textAlign: 'center',
          }}
        >
          <RobotOutlined style={{ fontSize: 48, color: '#ef4444', marginBottom: 16 }} />
          <h2 style={{ color: '#f1f5f9', fontSize: 20, marginBottom: 8 }}>链接无效</h2>
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>
            重置链接缺少必要的令牌参数，请重新通过邮箱获取重置链接。
          </p>
          <Button
            type="primary"
            onClick={() => navigate('/forgot-password')}
            style={{
              height: 44,
              borderRadius: 8,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
            }}
          >
            重新获取重置链接
          </Button>
        </div>
      </div>
    )
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
          <h2 style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>重置密码</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
            {success ? '密码已重置成功' : '请输入您的新密码'}
          </p>
        </div>

        {!success ? (
          <Form<ResetPasswordFormValues> onFinish={handleFinish} size="large" layout="vertical">
            <Form.Item
              name="newPassword"
              label={<span style={{ color: '#cbd5e1' }}>新密码</span>}
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '密码至少 6 字符' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#64748b' }} />}
                placeholder="至少 6 字符"
                style={{
                  background: 'rgba(15,23,42,0.6)',
                  borderColor: 'rgba(99,102,241,0.2)',
                  color: '#e2e8f0',
                  height: 44,
                  borderRadius: 8,
                }}
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
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#64748b' }} />}
                placeholder="再次输入新密码"
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
                重置密码
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
              密码重置成功！<br />
              请使用新密码登录您的账号。
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
              前往登录
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
