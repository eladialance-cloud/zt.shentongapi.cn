// 工作流编辑器（N8N iframe 嵌入）
//
// 实现说明：
// - iframe 嵌入 http://127.0.0.1:5678/workflow
// - 通过 window.electronAPI.service.start('n8n') 启动 N8N 子进程
// - 加载状态：检测 N8N 服务是否运行，未运行时显示"启动中..."进度
// - 通过 postMessage 与 N8N 通信（保存/加载工作流配置）
// - 返回按钮

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Progress, message } from 'antd'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import styles from './styles.module.css'

/** N8N 服务地址 */
const N8N_URL = 'http://127.0.0.1:5678/workflow'
/** N8N 健康检查地址 */
const N8N_HEALTH_URL = 'http://127.0.0.1:5678/healthz'
/** 健康检查最大尝试次数 */
const MAX_HEALTH_CHECK_RETRIES = 30
/** 健康检查间隔（ms） */
const HEALTH_CHECK_INTERVAL = 1000
/** iframe 加载超时（ms） */
const IFRAME_LOAD_TIMEOUT = 15000

/** 加载状态 */
type LoadState = 'starting' | 'running' | 'error' | 'iframe-loading' | 'ready'

export default function WorkflowEditor() {
  const navigate = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const healthCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const iframeLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [state, setState] = useState<LoadState>('starting')
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [retryCount, setRetryCount] = useState(0)

  /** 检测 N8N 服务是否运行（healthz） */
  const checkN8nHealth = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000)
      const resp = await fetch(N8N_HEALTH_URL, {
        method: 'GET',
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      return resp.ok
    } catch {
      return false
    }
  }, [])

  /** 启动 N8N 子进程并轮询健康检查 */
  const startN8n = useCallback(async () => {
    setState('starting')
    setProgress(0)
    setErrorMessage('')

    // 1. 先检测是否已经在运行
    const alreadyRunning = await checkN8nHealth()
    if (alreadyRunning) {
      setProgress(100)
      setState('iframe-loading')
      return
    }

    // 2. 调用主进程启动 N8N 子进程
    try {
      const ok = await window.electronAPI.service.start('n8n')
      if (!ok) {
        setState('error')
        setErrorMessage('N8N 子进程启动失败，请检查本地是否已安装 n8n。')
        return
      }
    } catch (err) {
      setState('error')
      setErrorMessage('调用主进程启动 N8N 失败: ' + (err as Error).message)
      return
    }

    // 3. 轮询健康检查
    let retries = 0
    const tick = async () => {
      retries += 1
      setProgress(Math.min(95, Math.round((retries / MAX_HEALTH_CHECK_RETRIES) * 100)))
      const healthy = await checkN8nHealth()
      if (healthy) {
        setProgress(100)
        setState('iframe-loading')
        return
      }
      if (retries >= MAX_HEALTH_CHECK_RETRIES) {
        setState('error')
        setErrorMessage(
          `N8N 服务在 ${MAX_HEALTH_CHECK_RETRIES} 秒内未就绪。请确认 n8n 已安装并监听 127.0.0.1:5678。`
        )
        return
      }
      healthCheckTimerRef.current = setTimeout(tick, HEALTH_CHECK_INTERVAL)
    }
    healthCheckTimerRef.current = setTimeout(tick, HEALTH_CHECK_INTERVAL)
  }, [checkN8nHealth])

  // 组件挂载：自动启动 N8N
  useEffect(() => {
    void startN8n()
    return () => {
      if (healthCheckTimerRef.current) {
        clearTimeout(healthCheckTimerRef.current)
        healthCheckTimerRef.current = null
      }
      if (iframeLoadTimerRef.current) {
        clearTimeout(iframeLoadTimerRef.current)
        iframeLoadTimerRef.current = null
      }
    }
  }, [startN8n])

  /** iframe 加载完成 */
  const handleIframeLoad = useCallback(() => {
    if (iframeLoadTimerRef.current) {
      clearTimeout(iframeLoadTimerRef.current)
      iframeLoadTimerRef.current = null
    }
    setState('ready')
  }, [])

  /** 设置 iframe 加载超时 */
  useEffect(() => {
    if (state !== 'iframe-loading') return
    iframeLoadTimerRef.current = setTimeout(() => {
      // 超时仍未触发 onLoad，可能是跨域阻止了 load 事件，直接置为 ready
      setState('ready')
    }, IFRAME_LOAD_TIMEOUT)
    return () => {
      if (iframeLoadTimerRef.current) {
        clearTimeout(iframeLoadTimerRef.current)
        iframeLoadTimerRef.current = null
      }
    }
  }, [state])

  /** 通过 postMessage 向 N8N 发送消息 */
  const postMessageToN8n = useCallback((type: string, payload: unknown) => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return
    try {
      iframe.contentWindow.postMessage({ type, payload }, N8N_URL)
    } catch (err) {
      console.warn('[WorkflowEditor] postMessage failed:', err)
    }
  }, [])

  /** 接收 N8N postMessage 消息 */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // 仅信任 N8N origin
      if (event.origin !== 'http://127.0.0.1:5678') return
      const data = event.data as { type?: string; payload?: unknown } | undefined
      if (!data || typeof data !== 'object') return
      switch (data.type) {
        case 'workflow:saved':
          message.success('工作流配置已保存')
          break
        case 'workflow:loaded':
          message.info('工作流配置已加载')
          break
        case 'workflow:error':
          message.warning('N8N 报告错误: ' + String(data.payload ?? ''))
          break
        default:
          break
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  /** 保存工作流配置（postMessage） */
  const handleSave = () => {
    postMessageToN8n('workflow:save', { timestamp: Date.now() })
  }

  /** 加载工作流配置（postMessage） */
  const handleLoad = () => {
    postMessageToN8n('workflow:load', { timestamp: Date.now() })
  }

  /** 返回 */
  const handleBack = () => {
    navigate('/workflow')
  }

  /** 重试 */
  const handleRetry = () => {
    setRetryCount((c) => c + 1)
    void startN8n()
  }

  return (
    <div className={styles.editorContainer}>
      {/* 顶部栏 */}
      <div className={styles.editorHeader}>
        <div className={styles.editorTitle}>
          <ThunderboltOutlined />
          <span>N8N 工作流编辑器</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            className={styles.backBtn}
            onClick={handleSave}
            disabled={state !== 'ready'}
          >
            保存配置
          </Button>
          <Button
            className={styles.backBtn}
            onClick={handleLoad}
            disabled={state !== 'ready'}
          >
            加载配置
          </Button>
          <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回
          </Button>
        </div>
      </div>

      {/* 编辑器主体 */}
      <div className={styles.editorBody}>
        {/* iframe */}
        {(state === 'iframe-loading' || state === 'ready') && (
          <iframe
            ref={iframeRef}
            className={styles.editorIframe}
            src={N8N_URL}
            onLoad={handleIframeLoad}
            title="N8N Workflow Editor"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
          />
        )}

        {/* 加载中遮罩 */}
        {state === 'starting' && (
          <div className={styles.loadingOverlay}>
            <LoadingOutlined className={styles.loadingIcon} />
            <div className={styles.loadingTitle}>正在启动 N8N 服务...</div>
            <Progress
              percent={progress}
              strokeColor={{ from: '#6366f1', to: '#8b5cf6' }}
              style={{ width: 280 }}
              status="active"
            />
            <div className={styles.loadingHint}>
              N8N 子进程正在启动并监听 127.0.0.1:5678，请稍候。
              <br />
              首次启动可能需要数十秒。
            </div>
          </div>
        )}

        {/* iframe 加载中 */}
        {state === 'iframe-loading' && (
          <div className={styles.loadingOverlay}>
            <LoadingOutlined className={styles.loadingIcon} />
            <div className={styles.loadingTitle}>正在加载 N8N 编辑器界面...</div>
            <div className={styles.loadingHint}>
              N8N 服务已就绪，正在加载编辑器 UI。
            </div>
          </div>
        )}

        {/* 错误状态 */}
        {state === 'error' && (
          <div className={styles.loadingOverlay}>
            <CloseCircleOutlined className={styles.loadingIcon} style={{ color: '#f87171' }} />
            <div className={styles.loadingTitle}>N8N 启动失败</div>
            <div className={styles.loadingError}>{errorMessage}</div>
            <Button
              type="primary"
              className={styles.retryBtn}
              icon={<ReloadOutlined />}
              onClick={handleRetry}
            >
              重试
            </Button>
          </div>
        )}

        {/* ready 状态指示（短暂显示，随后由 iframe 覆盖） */}
        {state === 'ready' && retryCount === -1 && (
          <div className={styles.loadingOverlay} style={{ pointerEvents: 'none' }}>
            <CheckCircleOutlined className={styles.loadingIcon} style={{ color: '#34d399' }} />
            <div className={styles.loadingTitle}>N8N 编辑器已就绪</div>
          </div>
        )}
      </div>
    </div>
  )
}
