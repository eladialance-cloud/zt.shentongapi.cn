// 瀹㈡埛绔湰鍦版湇鍔＄鐞?- v0.3.1 瑙勮寖锛圱ask 19锛?// 椤堕儴锛氬埛鏂?+ 鍏ㄩ儴鍚姩 / 鍏ㄩ儴鍋滄
// 缃戞牸锛? 涓湇鍔″崱鐗囷紙OpenClaw / N8N / MCP Gateway / Hermes锛?//   - 姣忓紶鍗＄墖锛氭湇鍔″悕 + ServiceStatus 鐘舵€佹寚绀哄櫒 + 绔彛 + 鐗堟湰 + CPU/鍐呭瓨 + 鍚姩/鍋滄/閲嶅惎
//   - 鐘舵€佽壊锛歳unning=缁?/ warning=榛?/ stopped=绾?// 鐐瑰嚮鍗＄墖鎵撳紑璇︽儏鎶藉眽锛氬畬鏁存寚鏍?+ 鏃ュ織 + 閰嶇疆

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Spin,
  Empty,
  Tooltip,
  Popconfirm,
  notification,
  message,
  Tag,
  Drawer,
  Descriptions,
  Space
} from 'antd'
import {
  RollbackOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  CloudServerOutlined,
  ApartmentOutlined,
  ApiOutlined,
  RobotOutlined,
  ProfileOutlined,
  ToolOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons'
import {
  listServices,
  startService,
  stopService,
  restartService,
  installService,
  onServiceStatusChanged,
  onServiceError
} from '@/api/service-manager-api'
import type {
  ServiceName,
  ServiceInfo,
  ServiceStatus
} from '@/types/service-manager'
import ServiceStatusIndicator from '@/components/ServiceStatus'
import type { ServiceStatusValue } from '@/components/ServiceStatus'
import styles from './styles.module.css'

/** 鏈嶅姟鍥炬爣鏄犲皠 */
const SERVICE_ICONS: Record<ServiceName, React.ReactNode> = {
  openclaw: <CloudServerOutlined style={{ color: 'var(--color-primary)' }} />,
  n8n: <ApartmentOutlined style={{ color: 'var(--color-purple)' }} />,
  mcp: <ApiOutlined style={{ color: 'var(--color-ai-delivery)' }} />,
  hermes: <RobotOutlined style={{ color: 'var(--color-error)' }} />
}

/** 鍚庣 ServiceStatus 鈫?ServiceStatus 缁勪欢 value */
function toIndicatorStatus(s: ServiceStatus): ServiceStatusValue {
  if (s === 'running') return 'running'
  if (s === 'starting') return 'warning'
  if (s === 'error') return 'stopped'
  if (s === 'stopped') return 'stopped'
  return 'unknown'
}

/** 鐘舵€佸睍绀洪厤缃紙鍗＄墖鍙充笂瑙掑窘鏍囷級 */
const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; className: string }
> = {
  running: { label: '杩愯涓?, className: styles.statusRunning },
  stopped: { label: '宸插仠姝?, className: styles.statusStopped },
  starting: { label: '鍚姩涓?, className: styles.statusStarting },
  error: { label: '閿欒', className: styles.statusError },
  unknown: { label: '鏈煡', className: styles.statusUnknown }
}

/** 鏍煎紡鍖栨椂闂?*/
function formatTime(value: string | undefined | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function ServiceManager() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<ServiceInfo[]>([])
  /** 姝ｅ湪鎵ц鎿嶄綔鐨勬湇鍔★紙闃叉閲嶅鐐瑰嚮锛?*/
  const [busy, setBusy] = useState<Set<ServiceName>>(new Set())
  /** 璇︽儏鎶藉眽锛氬綋鍓嶉€変腑鐨勬湇鍔?*/
  const [drawerService, setDrawerService] = useState<ServiceInfo | null>(null)
  /** 鍏ㄥ眬鎵瑰鐞嗚繘琛屼腑 */
  const [batchBusy, setBatchBusy] = useState(false)
  /** 姝ｅ湪瀹夎 / 淇鐨勬湇鍔?*/
  const [installing, setInstalling] = useState<Set<ServiceName>>(new Set())

  const loadData = useCallback(async () => {
    try {
      const list = await listServices()
      setServices(list || [])
    } catch (err) {
      console.error('[ServiceManager] load failed:', err)
      setServices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 鐩戝惉鐘舵€佸彉鏇翠簨浠讹紝瀹炴椂鏇存柊瀵瑰簲鏈嶅姟
  useEffect(() => {
    const unsub = onServiceStatusChanged((payload) => {
      setServices((prev) => {
        const idx = prev.findIndex((s) => s.name === payload.name)
        if (idx < 0) return prev
        const next = [...prev]
        next[idx] = payload.info
        return next
      })
      // 鍚屾鎶藉眽涓殑鏈嶅姟锛堝鏋滄墦寮€鐨勬槸鍚屼竴涓級
      setDrawerService((cur) =>
        cur && cur.name === payload.name ? payload.info : cur
      )
    })
    return () => {
      unsub()
    }
  }, [])

  // 鐩戝惉鏈嶅姟閿欒浜嬩欢锛屽脊绐楅€氱煡
  useEffect(() => {
    const unsub = onServiceError((payload) => {
      notification.error({
        key: `service-error-${payload.name}`,
        message: `鏈嶅姟寮傚父锛?{payload.name}`,
        description: `${payload.message}锛堝凡閲嶈瘯 ${payload.retryCount} 娆★級`,
        duration: 0
      })
    })
    return () => {
      unsub()
    }
  }, [])

  // 杞鍒锋柊 CPU/鍐呭瓨锛?s 涓€娆★級
  useEffect(() => {
    const timer = setInterval(() => {
      void loadData()
    }, 2000)
    return () => clearInterval(timer)
  }, [loadData])

  const setBusyFor = (name: ServiceName, value: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev)
      if (value) next.add(name)
      else next.delete(name)
      return next
    })
  }

  const handleStart = async (name: ServiceName) => {
    setBusyFor(name, true)
    try {
      const ok = await startService(name)
      if (ok) message.success(`${name} 宸插惎鍔╜)
      else message.warning(`${name} 鍚姩涓紝璇风◢鍊檂)
      void loadData()
    } catch (err) {
      console.error('[ServiceManager] start failed:', err)
      message.error(`鍚姩澶辫触: ${(err as Error).message}`)
    } finally {
      setBusyFor(name, false)
    }
  }

  const handleStop = async (name: ServiceName) => {
    setBusyFor(name, true)
    try {
      await stopService(name)
      message.success(`${name} 宸插仠姝)
      void loadData()
    } catch (err) {
      console.error('[ServiceManager] stop failed:', err)
      message.error(`鍋滄澶辫触: ${(err as Error).message}`)
    } finally {
      setBusyFor(name, false)
    }
  }

  const handleRestart = async (name: ServiceName) => {
    setBusyFor(name, true)
    try {
      const ok = await restartService(name)
      if (ok) message.success(`${name} 宸查噸鍚痐)
      else message.warning(`${name} 閲嶅惎涓紝璇风◢鍊檂)
      void loadData()
    } catch (err) {
      console.error('[ServiceManager] restart failed:', err)
      message.error(`閲嶅惎澶辫触: ${(err as Error).message}`)
    } finally {
      setBusyFor(name, false)
    }
  }

  const setInstallingFor = (name: ServiceName, value: boolean) => {
    setInstalling((prev) => {
      const next = new Set(prev)
      if (value) next.add(name)
      else next.delete(name)
      return next
    })
  }

  const handleInstall = async (name: ServiceName) => {
    setInstallingFor(name, true)
    try {
      message.loading({ content: `姝ｅ湪閲嶆柊瀹夎 ${name}锛岃绋嶅€?..`, key: `install-${name}`, duration: 0 })
      const ok = await installService(name)
      if (ok) {
        message.success({ content: `${name} 瀹夎/淇瀹屾垚`, key: `install-${name}` })
      } else {
        message.error({ content: `${name} 瀹夎/淇澶辫触锛岃鏌ョ湅鏈嶅姟璇︽儏涓殑閿欒淇℃伅`, key: `install-${name}` })
      }
      void loadData()
    } catch (err) {
      console.error('[ServiceManager] install failed:', err)
      message.error({ content: `瀹夎/淇澶辫触: ${(err as Error).message}`, key: `install-${name}` })
    } finally {
      setInstallingFor(name, false)
    }
  }

  /** 涓€閿慨澶嶏細瀵规墍鏈夋湭杩愯鎴栧紓甯哥殑鏈湴鏈嶅姟閲嶆柊瀹夎 */
  const handleRepairAll = async () => {
    const targets = services.filter(
      (s) => s.deploymentType !== 'cloud' && s.status !== 'running'
    )
    if (targets.length === 0) {
      message.info('娌℃湁闇€瑕佷慨澶嶇殑鏈湴鏈嶅姟')
      return
    }
    setBatchBusy(true)
    try {
      await Promise.all(targets.map((s) => handleInstall(s.name)))
      message.success('涓€閿慨澶嶆墽琛屽畬鎴?)
      void loadData()
    } finally {
      setBatchBusy(false)
    }
  }

  /** 鍏ㄩ儴鍚姩锛堜粎鍚姩宸插仠姝㈢殑鏈湴鏈嶅姟锛?*/
  const handleStartAll = async () => {
    const targets = services.filter(
      (s) => s.deploymentType !== 'cloud' && s.status !== 'running'
    )
    if (targets.length === 0) {
      message.info('娌℃湁闇€瑕佸惎鍔ㄧ殑鏈湴鏈嶅姟')
      return
    }
    setBatchBusy(true)
    try {
      await Promise.all(targets.map((s) => startService(s.name)))
      message.success(`宸叉壒閲忓惎鍔?${targets.length} 涓湇鍔)
      void loadData()
    } catch (err) {
      console.error('[ServiceManager] start all failed:', err)
      message.error('鎵归噺鍚姩澶辫触: ' + (err as Error).message)
    } finally {
      setBatchBusy(false)
    }
  }

  /** 鍏ㄩ儴鍋滄锛堜粎鍋滄杩愯涓殑鏈湴鏈嶅姟锛?*/
  const handleStopAll = async () => {
    const targets = services.filter(
      (s) => s.deploymentType !== 'cloud' && s.status === 'running'
    )
    if (targets.length === 0) {
      message.info('娌℃湁闇€瑕佸仠姝㈢殑鏈湴鏈嶅姟')
      return
    }
    setBatchBusy(true)
    try {
      await Promise.all(targets.map((s) => stopService(s.name)))
      message.success(`宸叉壒閲忓仠姝?${targets.length} 涓湇鍔)
      void loadData()
    } catch (err) {
      console.error('[ServiceManager] stop all failed:', err)
      message.error('鎵归噺鍋滄澶辫触: ' + (err as Error).message)
    } finally {
      setBatchBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ApartmentOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>鏈湴鏈嶅姟绠＄悊</h1>
            <div className={styles.subtitle}>
              绠＄悊 OpenClaw / N8N / MCP Gateway / Hermes 鍥涗釜鏈湴鏈嶅姟杩涚▼
            </div>
          </div>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadData}
            className={styles.ghostBtn}
          >
            鍒锋柊
          </Button>
          <Popconfirm
            title="纭畾鍚姩鎵€鏈夊凡鍋滄鐨勬湰鍦版湇鍔″悧锛?
            onConfirm={handleStartAll}
            okText="鍏ㄩ儴鍚姩"
            cancelText="鍙栨秷"
          >
            <Button
              icon={<PlayCircleOutlined />}
              loading={batchBusy}
              className={styles.primaryBtn}
            >
              鍏ㄩ儴鍚姩
            </Button>
          </Popconfirm>
          <Popconfirm
            title="纭畾鍋滄鎵€鏈夎繍琛屼腑鐨勬湰鍦版湇鍔″悧锛?
            onConfirm={handleStopAll}
            okText="鍏ㄩ儴鍋滄"
            cancelText="鍙栨秷"
            okButtonProps={{ danger: true }}
          >
            <Button
              icon={<StopOutlined />}
              loading={batchBusy}
              className={styles.dangerBtn}
            >
              鍏ㄩ儴鍋滄
            </Button>
          </Popconfirm>
          <Popconfirm
            title="涓€閿慨澶嶅皢瀵规墍鏈夋湭杩愯鐨勬湰鍦版湇鍔￠噸鏂板畨瑁呰繍琛屾椂锛屾槸鍚︾户缁紵"
            onConfirm={handleRepairAll}
            okText="涓€閿慨澶?
            cancelText="鍙栨秷"
          >
            <Button
              icon={<ToolOutlined />}
              loading={batchBusy}
              className={styles.repairBtn}
            >
              涓€閿慨澶?            </Button>
          </Popconfirm>
          <Button
            icon={<RollbackOutlined />}
            onClick={() => navigate('/dashboard')}
            className={styles.backBtn}
          >
            杩斿洖涓婚〉
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        {services.length === 0 && !loading ? (
          <div className={styles.emptyWrap}>
            <Empty description="鏆傛棤鏈嶅姟淇℃伅锛坋lectronAPI 涓嶅彲鐢級" />
          </div>
        ) : (
          <div className={styles.grid}>
            {services.map((svc) => {
              const cfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.unknown
              const isRunning = svc.status === 'running'
              const isBusy = busy.has(svc.name)
              const isCloud = svc.deploymentType === 'cloud'
              return (
                <Card
                  key={svc.name}
                  className={styles.card}
                  bordered={false}
                  hoverable
                  onClick={() => setDrawerService(svc)}
                >
                  {/* 澶撮儴锛氭湇鍔″悕 + 鐘舵€佸窘鏍?*/}
                  <div className={styles.cardHeader}>
                    <div className={styles.serviceName}>
                      {SERVICE_ICONS[svc.name]}
                      {svc.displayName}
                      {isCloud && (
                        <Tag color="magenta" style={{ marginLeft: 8, fontSize: 11 }}>
                          浜戠鏈嶅姟
                        </Tag>
                      )}
                    </div>
                    <span className={`${styles.statusBadge} ${cfg.className}`}>
                      <span className={styles.statusDot} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* v0.3.1: 浣跨敤 ServiceStatus 鍏变韩缁勪欢浣滀负绔彛鎸囩ず鍣?*/}
                  <div style={{ marginBottom: 12 }}>
                    <ServiceStatusIndicator
                      name={svc.displayName}
                      status={toIndicatorStatus(svc.status)}
                      port={svc.port}
                    />
                  </div>

                  {/* 閿欒淇℃伅 */}
                  {svc.status === 'error' && svc.error && (
                    <div className={styles.errorMsg}>
                      <ExclamationCircleOutlined style={{ marginRight: 6 }} />
                      {svc.error}
                      {!isCloud && !isRunning && (
                        <span style={{ marginLeft: 4 }}>鍙皾璇曠偣鍑?淇"閲嶆柊瀹夎杩愯鏃躲€?/span>
                      )}
                    </div>
                  )}

                  {/* 鎸囨爣 */}
                  <div className={styles.metrics}>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>绔彛</span>
                      <span className={styles.metricValue}>{svc.port}</span>
                    </div>
                    {isCloud ? (
                      <div className={styles.metricItem}>
                        <span className={styles.metricLabel}>閮ㄧ讲</span>
                        <span className={styles.metricValue}>浜戠杩炴帴鍨?/span>
                      </div>
                    ) : (
                      <div className={styles.metricItem}>
                        <span className={styles.metricLabel}>PID</span>
                        <span className={styles.metricValue}>
                          {svc.pid ?? '-'}
                        </span>
                      </div>
                    )}
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>鍚姩鏃堕棿</span>
                      <span className={styles.metricValue}>
                        {formatTime(svc.startTime)}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>CPU / 鍐呭瓨</span>
                      <span className={styles.metricValue}>
                        {isRunning && !isCloud
                          ? `${svc.cpuUsage != null ? svc.cpuUsage.toFixed(1) : '-'}% / ${svc.memoryUsage != null ? svc.memoryUsage + ' MB' : '-'}`
                          : '-'}
                      </span>
                    </div>
                  </div>

                  {/* 鎿嶄綔鎸夐挳 */}
                  {isCloud ? (
                    <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                      <Button
                        className={styles.primaryBtn}
                        icon={<ReloadOutlined />}
                        loading={isBusy}
                        onClick={() => handleStart(svc.name)}
                      >
                        閲嶆柊妫€鏌?                      </Button>
                      <Button
                        className={styles.ghostBtn}
                        icon={<ProfileOutlined />}
                        onClick={() => setDrawerService(svc)}
                      >
                        璇︽儏
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="鍚姩">
                        <Button
                          className={styles.primaryBtn}
                          icon={<PlayCircleOutlined />}
                          loading={isBusy}
                          disabled={isRunning}
                          onClick={() => handleStart(svc.name)}
                        >
                          鍚姩
                        </Button>
                      </Tooltip>
                      <Popconfirm
                        title={`纭畾鍋滄 ${svc.displayName} 鍚楋紵`}
                        onConfirm={() => handleStop(svc.name)}
                        okText="鍋滄"
                        cancelText="鍙栨秷"
                        disabled={!isRunning}
                      >
                        <Tooltip title="鍋滄">
                          <Button
                            className={styles.dangerBtn}
                            icon={<StopOutlined />}
                            loading={isBusy}
                            disabled={!isRunning}
                          >
                            鍋滄
                          </Button>
                        </Tooltip>
                      </Popconfirm>
                      <Button
                        className={styles.ghostBtn}
                        icon={<ReloadOutlined />}
                        loading={isBusy}
                        onClick={() => handleRestart(svc.name)}
                      >
                        閲嶅惎
                      </Button>
                      <Tooltip title="閲嶆柊涓嬭浇骞跺畨瑁呰繍琛屾椂锛堝彲淇鏂囦欢鎹熷潖鎴栦緷璧栦涪澶憋級">
                        <Button
                          className={styles.repairBtn}
                          icon={<ToolOutlined />}
                          loading={installing.has(svc.name)}
                          disabled={isRunning || installing.has(svc.name)}
                          onClick={() => handleInstall(svc.name)}
                        >
                          淇
                        </Button>
                      </Tooltip>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </Spin>

      {/* 璇︽儏鎶藉眽 */}
      <Drawer
        title={drawerService ? `${drawerService.displayName} - 鏈嶅姟璇︽儏` : '鏈嶅姟璇︽儏'}
        open={drawerService !== null}
        onClose={() => setDrawerService(null)}
        width={560}
      >
        {drawerService && (
          <div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="鏈嶅姟鍚?>
                {drawerService.displayName}
              </Descriptions.Item>
              <Descriptions.Item label="鏍囪瘑">
                <code>{drawerService.name}</code>
              </Descriptions.Item>
              <Descriptions.Item label="鐘舵€?>
                <Tag color={drawerService.status === 'running' ? 'green' : 'red'}>
                  {STATUS_CONFIG[drawerService.status]?.label ?? '鏈煡'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="绔彛">
                {drawerService.port}
              </Descriptions.Item>
              <Descriptions.Item label="PID">
                {drawerService.pid ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="閮ㄧ讲绫诲瀷">
                {drawerService.deploymentType === 'cloud' ? '浜戠' : '鏈湴'}
              </Descriptions.Item>
              <Descriptions.Item label="鍚姩鏃堕棿">
                {formatTime(drawerService.startTime)}
              </Descriptions.Item>
              <Descriptions.Item label="CPU 浣跨敤鐜?>
                {drawerService.cpuUsage != null
                  ? `${drawerService.cpuUsage.toFixed(2)}%`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="鍐呭瓨浣跨敤">
                {drawerService.memoryUsage != null
                  ? `${drawerService.memoryUsage} MB`
                  : '-'}
              </Descriptions.Item>
              {drawerService.error && (
                <Descriptions.Item label="閿欒淇℃伅">
                  <span style={{ color: 'var(--color-error)' }}>
                    {drawerService.error}
                  </span>
                </Descriptions.Item>
              )}
            </Descriptions>

            <div style={{ marginTop: 24, marginBottom: 8, fontWeight: 600 }}>
              杩愯鏃ュ織
            </div>
            <pre className={styles.drawerLogs}>
{`[${formatTime(drawerService.startTime)}] 鏈嶅姟鍚姩涓?..
[${formatTime(drawerService.startTime)}] 鐘舵€? ${drawerService.status}
${drawerService.error ? `[閿欒] ${drawerService.error}` : ''}
锛堝疄鏃舵棩蹇楁帴鍏ュ緟鍚庣 IPC 鎺ㄩ€佸畬鍠勶級`}
            </pre>

            <div style={{ marginTop: 24, marginBottom: 8, fontWeight: 600 }}>
              閰嶇疆淇℃伅
            </div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="閮ㄧ讲绫诲瀷">
                {drawerService.deploymentType === 'cloud' ? '浜戠杩炴帴鍨? : '鏈湴杩涚▼'}
              </Descriptions.Item>
              <Descriptions.Item label="鏈嶅姟绔彛">
                {drawerService.port}
              </Descriptions.Item>
              <Descriptions.Item label="杩涚▼ PID">
                {drawerService.pid ?? '-'}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Drawer>
    </div>
  )
}
