// 首次启动引导向导
// 4 步：环境检测（运行时 SHA-256 校验 + 下载）→ 服务初始化 → 登录 → 进入主界面

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Form,
  Input,
  message,
  Progress,
  Result,
  Space,
  Steps,
  Typography
} from 'antd'
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  DownloadOutlined,
  LoadingOutlined,
  LockOutlined,
  RobotOutlined,
  UserOutlined
} from '@ant-design/icons'
import { useOnboardingStore } from '@/store'
import type { RuntimeDownloadProgress, ServiceName } from '@shared/types'
import styles from './styles.module.css'

interface ServiceItem {
  name: ServiceName
  label: string
  port: number
}

const SERVICES: ServiceItem[] = [
  { name: 'openclaw', label: 'OpenClaw', port: 8080 },
  { name: 'n8n', label: 'N8N', port: 5678 },
  { name: 'mcp', label: 'MCP Gateway', port: 3100 }
]

interface LoginParams {
  account: string
  password: string
}

interface DownloadState {
  downloading: boolean
  progress: RuntimeDownloadProgress | null
  error: string | null
}

type VerifyResults = Record<ServiceName, boolean | null>

const initialDownloads: Record<ServiceName, DownloadState> = {
  openclaw: { downloading: false, progress: null, error: null },
  n8n: { downloading: false, progress: null, error: null },
  mcp: { downloading: false, progress: null, error: null }
}

export default function Onboarding() {
  const navigate = useNavigate()
  const setCompleted = useOnboardingStore((s) => s.setCompleted)

  const [current, setCurrent] = useState(0)
  const [verifyResults, setVerifyResults] = useState<VerifyResults>({
    openclaw: null,
    n8n: null,
    mcp: null
  })
  const [verifying, setVerifying] = useState(false)
  const [allPassed, setAllPassed] = useState(false)
  const [downloads, setDownloads] =
    useState<Record<ServiceName, DownloadState>>(initialDownloads)
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [installLabel, setInstallLabel] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const api = window.electronAPI
  const runtime = window.runtime

  // Step 1: 环境检测 - 调用 IPC runtime:verify 校验运行时 SHA-256 完整性
  const runVerify = useCallback(async () => {
    setVerifying(true)
    setAllPassed(false)
    try {
      const result = await runtime.verify()
      setVerifyResults(result.results)
      setAllPassed(result.allPassed)
      if (result.allPassed) {
        message.success('运行时完整性校验通过')
      } else {
        message.warning('部分运行时校验失败，请重新下载')
      }
    } catch {
      message.error('运行时校验失败，请重试')
    } finally {
      setVerifying(false)
    }
  }, [runtime])

  // 进入"环境检测"步骤时自动触发校验
  useEffect(() => {
    if (current === 0) {
      void runVerify()
    }
  }, [current, runVerify])

  // 监听下载进度推送（返回 unsubscribe 在 cleanup 中调用，避免内存泄漏）
  useEffect(() => {
    const unsubscribe = runtime.onDownloadProgress((progress) => {
      setDownloads((prev) => ({
        ...prev,
        [progress.name]: {
          downloading: true,
          progress,
          error: null
        }
      }))
    })
    return unsubscribe
  }, [runtime])

  const anyDownloading = Object.values(downloads).some((d) => d.downloading)

  // 重新下载单个服务运行时
  const handleDownload = useCallback(
    async (name: ServiceName) => {
      const label = SERVICES.find((s) => s.name === name)?.label ?? name
      setDownloads((prev) => ({
        ...prev,
        [name]: { downloading: true, progress: null, error: null }
      }))
      try {
        const ok = await runtime.download(name)
        if (!ok) {
          throw new Error(`下载 ${label} 失败`)
        }
        // 下载完成后重新校验完整性
        const verifyResult = await runtime.verify()
        setVerifyResults(verifyResult.results)
        setAllPassed(verifyResult.allPassed)
        if (verifyResult.results[name]) {
          message.success(`${label} 下载并校验通过`)
        } else {
          setDownloads((prev) => ({
            ...prev,
            [name]: {
              downloading: false,
              progress: null,
              error: '下载完成后校验仍未通过'
            }
          }))
          message.error(`${label} 校验未通过`)
          return
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : `下载 ${label} 失败`
        setDownloads((prev) => ({
          ...prev,
          [name]: { downloading: false, progress: null, error: msg }
        }))
        message.error(msg)
        return
      }
      // 成功：清除下载中状态
      setDownloads((prev) => ({
        ...prev,
        [name]: { downloading: false, progress: null, error: null }
      }))
    },
    [runtime]
  )

  // Step 2: 服务初始化（下载安装 + 启动）
  const handleInstallAndStart = useCallback(async () => {
    setInstalling(true)
    try {
      for (const svc of SERVICES) {
        setInstallLabel(svc.label)
        setInstallProgress(0)
        const installed = await api.service.install(svc.name)
        if (!installed) {
          throw new Error(`安装 ${svc.label} 失败`)
        }
        setInstallProgress(100)
        await api.service.start(svc.name)
      }
      message.success('服务初始化完成')
      setCurrent(2)
    } catch {
      message.error('服务初始化失败，请重试')
    } finally {
      setInstalling(false)
    }
  }, [api])

  // Step 3: 登录
  const handleLogin = async (values: LoginParams) => {
    setLoginLoading(true)
    try {
      // 占位：实际调用后端 /api/auth/login
      await new Promise((resolve) => setTimeout(resolve, 500))
      message.success(`欢迎回来，${values.account}`)
      setCurrent(3)
    } catch {
      message.error('登录失败，请重试')
    } finally {
      setLoginLoading(false)
    }
  }

  // Step 4: 进入主界面
  const handleEnter = () => {
    setCompleted(true)
    navigate('/dashboard', { replace: true })
  }

  const renderVerifyStatus = (name: ServiceName) => {
    const status = verifyResults[name]
    if (verifying) return <LoadingOutlined style={{ color: '#6366f1' }} />
    if (status === null) return <span style={{ color: '#999' }}>未检测</span>
    if (status) return <CheckCircleTwoTone twoToneColor="#52c41a" />
    return <CloseCircleTwoTone twoToneColor="#ff4d4f" />
  }

  const stepsItems = [
    { title: '环境检测' },
    { title: '服务初始化' },
    { title: '登录' },
    { title: '完成' }
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        padding: 24
      }}
    >
      <Card style={{ width: 640, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <RobotOutlined style={{ fontSize: 48, color: '#6366f1' }} />
          <Typography.Title level={3} style={{ marginTop: 12, marginBottom: 0 }}>
            深瞳AI 初始化向导
          </Typography.Title>
        </div>

        <Steps current={current} items={stepsItems} style={{ marginBottom: 32 }} />

        {/* Step 1: 环境检测（运行时 SHA-256 校验 + 下载） */}
        {current === 0 && (
          <div>
            <Typography.Paragraph type="secondary">
              校验内置运行时（OpenClaw / N8N / MCP Gateway）的 SHA-256 完整性，缺失或损坏时可重新下载。
            </Typography.Paragraph>
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              {SERVICES.map((svc) => {
                const dl = downloads[svc.name]
                const showProgress = dl.downloading || dl.progress !== null
                return (
                  <div key={svc.name}>
                    <div className={styles.serviceRow}>
                      <span className={styles.serviceName}>
                        {svc.label}
                        <span className={styles.servicePort}>:{svc.port}</span>
                      </span>
                      <span className={styles.serviceStatus}>
                        {renderVerifyStatus(svc.name)}
                        {!verifying && verifyResults[svc.name] === false && (
                          <Button
                            size="small"
                            type="primary"
                            icon={<DownloadOutlined />}
                            loading={dl.downloading}
                            disabled={anyDownloading || verifying}
                            onClick={() => void handleDownload(svc.name)}
                          >
                            {dl.downloading ? '下载中...' : '重新下载'}
                          </Button>
                        )}
                      </span>
                    </div>
                    {showProgress && (
                      <div className={styles.progressContainer}>
                        <div className={styles.progressBar}>
                          <div
                            className={styles.progressFill}
                            style={{ width: `${dl.progress?.percent ?? 0}%` }}
                          />
                        </div>
                        <div className={styles.progressText}>
                          <span className={styles.progressPercent}>
                            {dl.progress
                              ? `${dl.progress.percent.toFixed(1)}%`
                              : '准备中...'}
                          </span>
                          <span className={styles.progressMeta}>
                            {dl.progress
                              ? `${dl.progress.speedKBs.toFixed(0)} KB/s · ETA ${dl.progress.etaSec}s`
                              : ''}
                          </span>
                        </div>
                      </div>
                    )}
                    {dl.error && <div className={styles.errorMsg}>{dl.error}</div>}
                  </div>
                )
              })}
            </Space>
            {allPassed && (
              <Typography.Paragraph style={{ color: '#10b981', marginBottom: 12 }}>
                ✅ 全部就绪，点击下一步启动服务
              </Typography.Paragraph>
            )}
            <Space>
              <Button
                onClick={() => void runVerify()}
                loading={verifying}
                disabled={verifying || anyDownloading}
              >
                {verifying ? '校验中...' : '重新校验'}
              </Button>
              <Button
                type="primary"
                onClick={() => setCurrent(1)}
                disabled={!allPassed || verifying || anyDownloading}
              >
                下一步
              </Button>
            </Space>
          </div>
        )}

        {/* Step 2: 服务初始化 */}
        {current === 1 && (
          <div>
            <Typography.Paragraph type="secondary">
              自动下载并安装运行时，然后启动三个本地服务。
            </Typography.Paragraph>
            {installing && (
              <div style={{ marginBottom: 16 }}>
                <Typography.Text>正在安装 {installLabel}...</Typography.Text>
                <Progress percent={installProgress} status="active" />
              </div>
            )}
            <Space>
              <Button
                type="primary"
                onClick={handleInstallAndStart}
                loading={installing}
                disabled={installing}
              >
                {installing ? '初始化中...' : '开始初始化'}
              </Button>
              <Button onClick={() => setCurrent(0)} disabled={installing}>
                上一步
              </Button>
            </Space>
          </div>
        )}

        {/* Step 3: 登录 */}
        {current === 2 && (
          <div>
            <Typography.Paragraph type="secondary">
              登录以开始你的智能对话。
            </Typography.Paragraph>
            <Form<LoginParams> onFinish={handleLogin} size="large" layout="vertical">
              <Form.Item
                name="account"
                label="账号"
                rules={[{ required: true, message: '请输入用户名或邮箱' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="用户名或邮箱" />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="密码" />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  loading={loginLoading}
                >
                  登录
                </Button>
              </Form.Item>
            </Form>
            <Button type="link" onClick={() => setCurrent(1)}>
              上一步
            </Button>
          </div>
        )}

        {/* Step 4: 完成 */}
        {current === 3 && (
          <Result
            status="success"
            title="初始化完成"
            subTitle="深瞳AI 已准备就绪，点击下方按钮进入主界面。"
            extra={
              <Button type="primary" size="large" onClick={handleEnter}>
                进入主界面
              </Button>
            }
          />
        )}
      </Card>
    </div>
  )
}
