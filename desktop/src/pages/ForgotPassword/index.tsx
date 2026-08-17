// 忘记密码页 - Kimi 风格极简（与登录页一致）
//
// 流程：
// 1. 输入邮箱
// 2. 调用 POST /auth/forgot-password
// 3. 成功提示"重置链接已发送到您的邮箱（30 分钟内有效）"

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, message } from 'antd'
import { ArrowLeftOutlined, MailOutlined } from '@ant-design/icons'
import { httpClient } from '@/api/http-client'
import { BusinessError } from '@/utils/errors'
import styles from './styles.module.css'

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
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>深瞳AI</div>
        <div className={styles.subtitle}>
          {sent
            ? '重置链接已发送，请查收邮件'
            : '输入注册邮箱，我们将发送密码重置链接'}
        </div>

        {!sent ? (
          <Form<ForgotPasswordFormValues>
            onFinish={handleFinish}
            size="large"
            layout="vertical"
            requiredMark={false}
          >
            <Form.Item
              name="email"
              label={<span className={styles.fieldLabel}>邮箱</span>}
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' },
              ]}
            >
              <Input
                prefix={<MailOutlined className={styles.inputPrefix} />}
                placeholder="your@email.com"
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
                发送重置链接
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <div className={styles.successBox}>
            <p className={styles.successText}>
              重置链接已发送到您的邮箱，<br />
              请在 30 分钟内完成密码重置。<br />
              如果没有收到邮件，请检查垃圾邮件文件夹。
            </p>
            <Button
              type="primary"
              block
              onClick={() => navigate('/login')}
              className={styles.submitBtn}
            >
              返回登录
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
