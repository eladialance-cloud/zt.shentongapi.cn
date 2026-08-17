// 重置密码页 - Kimi 风格极简（与登录页一致）
//
// 流程：
// 1. 从 URL query 获取 token（支持 hash router 和 query router）
// 2. 输入新密码 + 确认密码
// 3. 调用 POST /auth/reset-password
// 4. 成功后跳转登录页

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, message } from 'antd'
import { ArrowLeftOutlined, LockOutlined } from '@ant-design/icons'
import { httpClient } from '@/api/http-client'
import { BusinessError } from '@/utils/errors'
import styles from './styles.module.css'

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
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.logo}>深瞳AI</div>
          <div className={styles.subtitle}>重置密码</div>
          <div className={styles.invalidBox}>
            <p className={styles.invalidTitle}>链接无效</p>
            <p className={styles.invalidText}>
              重置链接缺少必要的令牌参数，请重新通过邮箱获取重置链接。
            </p>
            <Button
              type="primary"
              block
              onClick={() => navigate('/forgot-password')}
              className={styles.submitBtn}
            >
              重新获取重置链接
            </Button>
          </div>
          <div className={styles.footer}>
            <span className={styles.link} onClick={() => navigate('/login')}>
              <ArrowLeftOutlined /> 返回登录
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>深瞳AI</div>
        <div className={styles.subtitle}>
          {success ? '密码已重置成功' : '请输入您的新密码'}
        </div>

        {!success ? (
          <Form<ResetPasswordFormValues>
            onFinish={handleFinish}
            size="large"
            layout="vertical"
            requiredMark={false}
          >
            <Form.Item
              name="newPassword"
              label={<span className={styles.fieldLabel}>新密码</span>}
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '密码至少 6 字符' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className={styles.inputPrefix} />}
                placeholder="至少 6 字符"
                className={styles.input}
              />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label={<span className={styles.fieldLabel}>确认新密码</span>}
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
                prefix={<LockOutlined className={styles.inputPrefix} />}
                placeholder="再次输入新密码"
                className={styles.input}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                className={styles.submitBtn}
              >
                重置密码
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <div className={styles.successBox}>
            <p className={styles.successText}>
              密码重置成功！<br />
              请使用新密码登录您的账号。
            </p>
            <Button
              type="primary"
              block
              onClick={() => navigate('/login')}
              className={styles.submitBtn}
            >
              前往登录
            </Button>
          </div>
        )}

        <div className={styles.footer}>
          <span className={styles.link} onClick={() => navigate('/login')}>
            <ArrowLeftOutlined /> 返回登录
          </span>
        </div>
      </div>
    </div>
  )
}
