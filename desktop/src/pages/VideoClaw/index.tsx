/**
 * ST-Claw — 本地视频生成工作台（Kimi 风格 v2.0）
 * 状态机: stopped(引导卡) -> starting(加载中) -> running(iframe)
 * 通过 IPC 实时订阅状态变更，无需手动刷新
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Spin } from 'antd'
import {
  Clapperboard,
  Play,
  RotateCw,
  Download,
  Video,
  Wand2,
  ShieldCheck,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import {
  listServices,
  startService,
  installService,
  onServiceStatusChanged,
} from '@/api/service-manager-api'
import type { ServiceInfo } from '@/types/service-manager'
import styles from './styles.module.css'

const VIDEO_CLAW_URL = 'http://127.0.0.1:3000'

interface Feature {
  key: string
  label: string
  desc: string
  icon: LucideIcon
}

/** 引导卡特性（精简三项，突出核心能力） */
const FEATURES: Feature[] = [
  { key: 't2v', label: '文生视频', desc: '一句话生成视频', icon: Wand2 },
  { key: 'i2v', label: '图生视频', desc: '静态图动起来', icon: Video },
  { key: 'local', label: '本地运行', desc: '数据不出本机', icon: ShieldCheck },
]

function statusText(status: string): string {
  if (status === 'running') return '运行中'
  if (status === 'starting') return '启动中'
  if (status === 'error') return '异常'
  return '未启动'
}

export default function VideoClaw() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [svc, setSvc] = useState<ServiceInfo | null>(null)
  const [frameKey, setFrameKey] = useState(0)

  const load = useCallback(async () => {
    try {
      const list = await listServices()
      setSvc(list.find((s) => s.name === 'video-claw') ?? null)
    } catch (err) {
      console.error('[VideoClaw] load failed:', err)
      setSvc(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsub = onServiceStatusChanged((payload) => {
      if (payload.name !== 'video-claw') return
      setSvc(payload.info)
    })
    return unsub
  }, [load])

  const handleStart = async () => {
    setBusy(true)
    try {
      await startService('video-claw')
    } catch (err) {
      console.error('[VideoClaw] start failed:', err)
    } finally {
      setBusy(false)
    }
  }

  const handleInstall = async () => {
    setBusy(true)
    try {
      await installService('video-claw')
    } catch (err) {
      console.error('[VideoClaw] install failed:', err)
    } finally {
      setBusy(false)
    }
  }

  const status = svc?.status ?? 'stopped'
  const running = status === 'running'

  return (
    <div className={styles.page}>
      {/* 顶部：标题 + 状态 + 操作 */}
      <header className={styles.head}>
        <div className={styles.headLeft}>
          <span className={styles.headIcon}>
            <Clapperboard size={16} strokeWidth={2} />
          </span>
          <span className={styles.headTitle}>ST-Claw</span>
          <span className={styles.statusTag + ' ' + styles['status' + status.charAt(0).toUpperCase() + status.slice(1)]}>
            {statusText(status)}
          </span>
        </div>
        <div className={styles.headRight}>
          {running ? (
            <Button
              type="text"
              icon={<RotateCw size={15} />}
              onClick={() => setFrameKey((k) => k + 1)}
            >
              刷新
            </Button>
          ) : (
            !loading &&
            status !== 'error' && (
              <Button
                type="primary"
                icon={<Play size={15} />}
                loading={busy}
                onClick={() => void handleStart()}
              >
                启动服务
              </Button>
            )
          )}
        </div>
      </header>

      <div className={styles.body}>
        {loading ? (
          <div className={styles.center}>
            <Spin />
            <p className={styles.centerHint}>正在获取服务状态…</p>
          </div>
        ) : running ? (
          <iframe
            key={frameKey}
            title="ST-Claw"
            src={VIDEO_CLAW_URL}
            className={styles.frame}
          />
        ) : status === 'starting' ? (
          <div className={styles.center}>
            <Spin />
            <p className={styles.centerHint}>正在启动 ST-Claw 服务…</p>
          </div>
        ) : status === 'error' ? (
          <div className={styles.hero}>
            <span className={styles.errorIcon}>
              <AlertTriangle size={28} strokeWidth={2} />
            </span>
            <h2 className={styles.heroTitle}>服务启动失败</h2>
            <p className={styles.heroSub}>
              {svc?.error || '请重试启动；若持续失败，可安装/修复运行时。'}
            </p>
            <div className={styles.btnGroup}>
              <Button
                type="primary"
                icon={<RotateCw size={15} />}
                loading={busy}
                onClick={() => void handleStart()}
              >
                重试启动
              </Button>
              <Button
                icon={<Download size={15} />}
                loading={busy}
                onClick={() => void handleInstall()}
              >
                安装 / 修复
              </Button>
            </div>
          </div>
        ) : (
          /* 未启动：引导卡 */
          <div className={styles.hero}>
            <span className={styles.heroIcon}>
              <Clapperboard size={30} strokeWidth={1.8} />
            </span>
            <h2 className={styles.heroTitle}>ST-Claw 视频工作台</h2>
            <p className={styles.heroSub}>本地生成视频 · 无需上传 · 开箱即用</p>

            <div className={styles.features}>
              {FEATURES.map((f) => {
                const Icon = f.icon
                return (
                  <div key={f.key} className={styles.feature}>
                    <span className={styles.featureIcon}>
                      <Icon size={20} strokeWidth={1.8} />
                    </span>
                    <span className={styles.featureLabel}>{f.label}</span>
                    <span className={styles.featureDesc}>{f.desc}</span>
                  </div>
                )
              })}
            </div>

            <div className={styles.heroBtn}>
              <Button
                type="primary"
                size="large"
                icon={<Play size={16} />}
                loading={busy}
                onClick={() => void handleStart()}
              >
                启动服务
              </Button>
            </div>
            <button className={styles.installLink} disabled={busy} onClick={() => void handleInstall()}>
              首次使用？请先安装运行时
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
