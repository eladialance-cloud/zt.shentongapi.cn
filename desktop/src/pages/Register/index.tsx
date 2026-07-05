// 注册页 - 赛博科技深色风格
//
// 注册流程：
// 1. 表单校验（username/email/password/confirmPassword/inviteCode）
// 2. 调用 POST /auth/register
// 3. 注册成功后自动登录（register API 返回 tokens + secretKey + user）
// 4. 初始化本地 DB → 跳转 dashboard

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, message } from 'antd'
import {
  GiftOutlined,
  LockOutlined,
  MailOutlined,
  RobotOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { httpClient } from '@/api/http-client'
import { useAuthStore, type User } from '@/store/auth'
import { BusinessError } from '@/utils/errors'
import styles from './styles.module.css'

interface RegisterFormValues {
  username: string
  email: string
  password: string
  confirmPassword: string
  inviteCode?: string
}

/** 后端 register 响应（与 login 一致） */
interface RegisterResponse {
  accessToken: string
  refreshToken: string
  secretKey: string
  user: User
}

export default function Register() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form] = Form.useForm<RegisterFormValues>()

  /** 注册成功后自动登录 */
  const handleRegisterSuccess = async (data: RegisterResponse) => {
    // 保存认证信息
    setAuth(data.accessToken, data.refreshToken, data.secretKey, data.user)

    // 初始化本地数据库
    try {
      await window.electronAPI.db.initialize(data.accessToken)
    } catch {
      message.warning('本地数据库初始化失败，已进入降级模式')
    }

    message.success(`注册成功，欢迎加入深瞳 AI，${data.user.username}`)
    navigate('/dashboard', { replace: true })
  }

  /** 表单提交 */
  const handleFinish = async (values: RegisterFormValues) => {
    setLoading(true)
    try {
      const data = await httpClient.post<RegisterResponse>('/auth/register', {
        username: values.username,
        email: values.email,
        password: values.password,
        inviteCode: values.inviteCode || undefined,
      })
      await handleRegisterSuccess(data)
    } catch (err) {
      if (err instanceof BusinessError) {
        message.error(err.message || '注册失败')
      } else {
        message.error('注册失败，请检查网络后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <RobotOutlined className={styles.logoIcon} />
          <h2 className={styles.title}>创建账号</h2>
          <p className={styles.subtitle}>加入深瞳 AI，开启智能对话之旅</p>
        </div>

        <Form<RegisterFormValues>
          form={form}
          onFinish={handleFinish}
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="username"
            label={<span style={{ color: '#cbd5e1' }}>用户名</span>}
            rules={[
              { required: true, message: '请输入用户名' },
              {
                pattern: /^[a-zA-Z0-9_]{4,20}$/,
                message: '用户名 4-20 字符，仅字母、数字、下划线',
              },
            ]}
          >
            <Input
              prefix={<UserOutlined className={styles.inputPrefix} />}
              placeholder="4-20 字符，字母/数字/下划线"
              className={styles.input}
            />
          </Form.Item>

          <Form.Item
            name="email"
            label={<span style={{ color: '#cbd5e1' }}>邮箱</span>}
            rules={[
              { required: true, message: '请输入邮箱' },
              {
                type: 'email',
                message: '邮箱格式不正确',
              },
            ]}
          >
            <Input
              prefix={<MailOutlined className={styles.inputPrefix} />}
              placeholder="your@email.com"
              className={styles.input}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span style={{ color: '#cbd5e1' }}>密码</span>}
            rules={[
              { required: true, message: '请输入密码' },
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
            label={<span style={{ color: '#cbd5e1' }}>确认密码</span>}
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className={styles.inputPrefix} />}
              placeholder="再次输入密码"
              className={styles.input}
            />
          </Form.Item>

          <Form.Item
            name="inviteCode"
            label={<span style={{ color: '#cbd5e1' }}>邀请码（可选）</span>}
          >
            <Input
              prefix={<GiftOutlined className={styles.inputPrefix} />}
              placeholder="如有邀请码请填写"
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
              注册
            </Button>
          </Form.Item>
        </Form>

        <div className={styles.footer}>
          <span
            className={styles.link}
            onClick={() => navigate('/login')}
          >
            已有账号？立即登录
          </span>
        </div>
      </div>
    </div>
  )
}
