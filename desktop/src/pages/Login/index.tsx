// 登录页 - 赛博科技深色风格
//
// 登录流程：
// 1. 获取设备指纹（window.electronAPI.device.getFingerprint）
// 2. 获取设备名称（navigator.platform 回退）
// 3. 调用 POST /auth/login
// 4. 成功：保存 token + secretKey → 初始化本地 DB → 跳转 dashboard
// 5. 失败：antd message 错误提示（DEVICE_LIMIT_EXCEEDED 特殊提示）
// 6. 演示模式：DEMO_TOKEN 直接进入 dashboard

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, message } from 'antd'
import { LockOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons'
import { httpClient } from '@/api/http-client'
import { useAuthStore, type User } from '@/store/auth'
import { BusinessError } from '@/utils/errors'
import styles from './styles.module.css'

/** 演示模式 token（不调用后端 API，直接进入 dashboard） */
const DEMO_TOKEN = 'demo-token-shentong-ai'

/** 设备类型错误码 */
const DEVICE_LIMIT_EXCEEDED_CODE = 1011

interface LoginFormValues {
  account: string
  password: string
}

/** 后端 login 响应 */
interface LoginResponse {
  accessToken: string
  refreshToken: string
  secretKey: string
  user: User
}

/** 获取设备类型（映射 navigator.platform → win32/darwin/linux） */
function getDeviceType(): string {
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('win')) return 'win32'
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('linux')) return 'linux'
  return 'unknown'
}

/** 获取设备名称 */
function getDeviceName(): string {
  // 优先使用 electronAPI（如果暴露了 getDeviceName）
  const deviceApi = window.electronAPI?.device as
    | { getDeviceName?: () => Promise<string>; getFingerprint: () => Promise<string> }
    | undefined
  if (deviceApi?.getDeviceName) {
    return 'Desktop' // getDeviceName 是异步的，这里用同步回退
  }
  return navigator.platform || '未知设备'
}

export default function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)

  /** 执行登录 API 调用 */
  const doLogin = async (account: string, password: string): Promise<LoginResponse> => {
    // 1. 获取设备指纹
    let deviceFingerprint: string | undefined
    try {
      deviceFingerprint = await window.electronAPI.device.getFingerprint()
    } catch {
      // 获取指纹失败，继续登录（后端设备校验可选）
    }

    // 2. 获取设备信息
    const deviceName = getDeviceName()
    const deviceType = getDeviceType()

    // 3. 调用登录 API
    return httpClient.post<LoginResponse>('/auth/login', {
      account,
      password,
      deviceFingerprint,
      deviceName,
      deviceType,
    })
  }

  /** 登录成功后的处理：保存 token → 初始化 DB → 跳转 */
  const handleLoginSuccess = async (data: LoginResponse) => {
    // 保存认证信息到 store（accessToken/refreshToken/secretKey/user）
    setAuth(data.accessToken, data.refreshToken, data.secretKey, data.user)

    // 初始化本地数据库（使用 accessToken 作为派生密钥的种子）
    try {
      await window.electronAPI.db.initialize(data.accessToken)
    } catch {
      // DB 初始化失败不阻塞登录（进入降级模式）
      message.warning('本地数据库初始化失败，已进入降级模式')
    }

    message.success(`欢迎回来，${data.user.username}`)
    navigate('/dashboard', { replace: true })
  }

  /** 表单提交 */
  const handleFinish = async (values: LoginFormValues) => {
    setLoading(true)
    try {
      const data = await doLogin(values.account, values.password)
      await handleLoginSuccess(data)
    } catch (err) {
      // 设备超限特殊提示
      if (err instanceof BusinessError && err.code === DEVICE_LIMIT_EXCEEDED_CODE) {
        message.error('已绑定设备数超过限制，请先解绑旧设备')
      } else if (err instanceof BusinessError) {
        message.error(err.message || '登录失败')
      } else {
        message.error('登录失败，请检查网络后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  /** 演示模式登录 */
  const handleDemoLogin = () => {
    const demoUser: User = {
      id: 0,
      username: '演示用户',
      email: 'demo@shentong.ai',
      level: 0,
      roles: ['user'],
    }
    setAuth(DEMO_TOKEN, DEMO_TOKEN, DEMO_TOKEN, demoUser)
    message.success('已进入演示模式')
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <RobotOutlined className={styles.logoIcon} />
          <h2 className={styles.title}>深瞳 AI</h2>
          <p className={styles.subtitle}>登录以开始你的智能对话</p>
        </div>

        <Form<LoginFormValues> onFinish={handleFinish} size="large" layout="vertical">
          <Form.Item
            name="account"
            rules={[{ required: true, message: '请输入用户名或邮箱' }]}
          >
            <Input
              prefix={<UserOutlined className={styles.inputPrefix} />}
              placeholder="用户名或邮箱"
              className={styles.input}
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined className={styles.inputPrefix} />}
              placeholder="密码"
              className={styles.input}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              className={styles.submitBtn}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div className={styles.footerLinks}>
          <span
            className={styles.link}
            onClick={() => navigate('/forgot-password')}
          >
            忘记密码？
          </span>
          <span
            className={styles.link}
            onClick={() => navigate('/register')}
          >
            没有账号？立即注册
          </span>
        </div>

        <div className={styles.divider}>或</div>

        <Button
          block
          onClick={handleDemoLogin}
          className={styles.demoBtn}
        >
          演示模式体验
        </Button>
      </div>
    </div>
  )
}
