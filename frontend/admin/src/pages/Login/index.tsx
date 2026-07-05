// 管理端登录页 - SubTask 17.1
//
// 登录流程：
// 1. 前端生成 4 位随机图形验证码(显示在 canvas)
// 2. 用户输入用户名 + 密码 + 验证码
// 3. 校验验证码(前端比对,大小写不敏感)
// 4. 调用 POST /admin/auth/login body: { username, password, captcha }
// 5. 成功:存储 adminToken + adminUser + permissions → 跳转 /admin/dashboard
// 6. 失败:antd message.error 提示 + 刷新验证码

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, message } from 'antd'
import {
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined
} from '@ant-design/icons'
import { adminLogin } from '@/api/admin-auth-api'
import { useAdminAuthStore } from '@/store/admin-auth'
import { BusinessError } from '@/utils/errors'
import styles from './styles.module.css'

interface LoginFormValues {
  username: string
  password: string
  captcha: string
}

/** 生成 4 位随机验证码(排除易混淆字符) */
function generateCaptcha(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

interface CaptchaInputProps {
  value?: string
  onChange?: (value: string) => void
  captchaRef: React.MutableRefObject<string>
  canvasRef: React.RefObject<HTMLCanvasElement>
  onRefresh: () => void
}

/**
 * 受控的图形验证码输入组件(Input + canvas 并排)
 * 兼容 antd Form 的 value/onChange 协议
 */
function CaptchaInput({
  value,
  onChange,
  canvasRef,
  onRefresh
}: CaptchaInputProps) {
  return (
    <div className={styles.captchaRow}>
      <Input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        prefix={<SafetyCertificateOutlined className={styles.inputPrefix} />}
        placeholder="图形验证码"
        className={`${styles.input} ${styles.captchaInput}`}
        maxLength={4}
      />
      <canvas
        ref={canvasRef}
        width={110}
        height={44}
        className={styles.captchaCanvas}
        title="点击刷新验证码"
        onClick={onRefresh}
      />
    </div>
  )
}

export default function AdminLogin() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const setAdminAuth = useAdminAuthStore((s) => s.setAdminAuth)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const captchaRef = useRef<string>('')

  /** 绘制验证码到 canvas */
  const drawCaptcha = useCallback(() => {
    const code = generateCaptcha()
    captchaRef.current = code
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
    ctx.fillRect(0, 0, w, h)
    // 干扰线
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(${56 + Math.random() * 80}, ${
        189 + Math.random() * 40
      }, 248, 0.4)`
      ctx.beginPath()
      ctx.moveTo(Math.random() * w, Math.random() * h)
      ctx.lineTo(Math.random() * w, Math.random() * h)
      ctx.stroke()
    }
    // 字符
    const colors = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#facc15']
    for (let i = 0; i < code.length; i++) {
      ctx.save()
      ctx.font = 'bold 26px Consolas, monospace'
      ctx.fillStyle = colors[i % colors.length]
      const x = 18 + i * 24
      const y = 32 + (Math.random() * 6 - 3)
      ctx.translate(x, y)
      ctx.rotate(((Math.random() * 30 - 15) * Math.PI) / 180)
      ctx.fillText(code[i], 0, 0)
      ctx.restore()
    }
    // 干扰点
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3})`
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5)
    }
  }, [])

  useEffect(() => {
    drawCaptcha()
  }, [drawCaptcha])

  const handleFinish = async (values: LoginFormValues) => {
    if (
      values.captcha.trim().toUpperCase() !== captchaRef.current.toUpperCase()
    ) {
      message.error('图形验证码错误')
      drawCaptcha()
      return
    }
    setLoading(true)
    try {
      const data = await adminLogin({
        username: values.username.trim(),
        password: values.password,
        captcha: values.captcha.trim()
      })
      setAdminAuth(
        data.token,
        data.expiresAt,
        data.user,
        data.permissions,
        data.mustChangePassword
      )
      message.success(`欢迎回来,${data.user.username}`)
      // 首次登录默认账号需强制改密，重定向到改密页
      if (data.mustChangePassword) {
        navigate('/change-password', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      if (err instanceof BusinessError) {
        message.error(err.message || '登录失败')
      } else {
        message.error('登录失败,请检查网络后重试')
      }
      drawCaptcha()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <SafetyCertificateOutlined className={styles.logoIcon} />
          <h2 className={styles.title}>深瞳AI 管理后台</h2>
          <p className={styles.subtitle}>管理员登录 · 请妥善保管账号</p>
        </div>

        <Form<LoginFormValues>
          onFinish={handleFinish}
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入管理员用户名' }]}
          >
            <Input
              prefix={<UserOutlined className={styles.inputPrefix} />}
              placeholder="管理员用户名"
              className={styles.input}
              autoComplete="username"
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
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item
            name="captcha"
            rules={[{ required: true, message: '请输入图形验证码' }]}
          >
            <CaptchaInput
              captchaRef={captchaRef}
              canvasRef={canvasRef}
              onRefresh={drawCaptcha}
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
              登录管理后台
            </Button>
          </Form.Item>
        </Form>

        <div className={styles.footer}>
          <span
            className={styles.footerLink}
            onClick={() => navigate('/login')}
          >
            返回用户端登录
          </span>
        </div>
      </div>
    </div>
  )
}
