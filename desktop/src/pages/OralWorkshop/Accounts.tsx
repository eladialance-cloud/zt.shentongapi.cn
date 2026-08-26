/**
 * 口播工坊 · 发布账号（桌面端扫码绑定）
 * 账号绑定在桌面端完成：弹出扫码窗口采集 cookies → 加密存本地 → 上传后端。
 * 管理后台只控制平台开关（listPublishPlatforms 过滤 enabled）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, List, Modal, Popconfirm, Select, Spin, Tag, message } from 'antd'
import { ExternalLink, Plus, QrCode, RefreshCw, Trash2, Unlink, Wifi } from 'lucide-react'
import {
  clearAccountSession,
  createPublishAccount,
  deletePublishAccount,
  listPublishAccounts,
  listPublishPlatforms,
  saveAccountSession,
  testAccountLogin,
} from '@/api/oral-workshop-api'
import type { PublishAccount, PublishPlatformItem } from '@/types/oral-workshop'
import type { PlatformAccountApi } from '@shared/types'
import styles from './styles.module.css'

/** 平台展示名兜底（后端平台开关接口失败时用） */
const PLATFORM_FALLBACK_NAMES: Record<string, string> = {
  douyin: '抖音',
  kuaishou: '快手',
  xiaohongshu: '小红书',
  bilibili: 'B站',
  xigua: '西瓜视频',
  wx_channels: '蝴蝶号',
}

const LOGIN_STATUS_META: Record<string, { label: string; color: string }> = {
  online: { label: '已登录', color: 'success' },
  expired: { label: '已过期', color: 'warning' },
  offline: { label: '未登录', color: 'default' },
  pending: { label: '待绑定', color: 'default' },
}

function formatTime(iso?: string | null): string {
  if (!iso) return '--'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false })
}

/** 渲染层访问桌面端扫码 API（类型缺失/未注入时降级提示） */
function getPlatformAccountApi(): PlatformAccountApi | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any
  return win?.electronAPI?.platformAccount as PlatformAccountApi | undefined
}

export default function OralWorkshopAccounts() {
  const [platforms, setPlatforms] = useState<PublishPlatformItem[]>([])
  const [accounts, setAccounts] = useState<PublishAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<string | undefined>()
  const [scanning, setScanning] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [accts, plats] = await Promise.all([
        listPublishAccounts(),
        listPublishPlatforms().catch(() => [] as PublishPlatformItem[]),
      ])
      setAccounts(accts)
      setPlatforms(plats)
    } catch (err) {
      const e = err as Error
      message.error('账号列表加载失败: ' + (e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const enabledPlatforms = useMemo(() => platforms.filter((p) => p.enabled), [platforms])

  const platformName = (platform: string): string =>
    platforms.find((p) => p.platform === platform)?.displayName || PLATFORM_FALLBACK_NAMES[platform] || platform

  const accountStatus = (account: PublishAccount): { label: string; color: string } => {
    if (account.status === 'disabled') return { label: '停用', color: 'default' }
    if (account.loginStatus === 'online') return LOGIN_STATUS_META.online
    if (account.loginStatus === 'expired') return LOGIN_STATUS_META.expired
    if (account.loginStatus === 'offline') return LOGIN_STATUS_META.offline
    if (account.status === 'pending' || !account.lastLoginAt) return LOGIN_STATUS_META.pending
    return LOGIN_STATUS_META.offline
  }

  /** 扫码并回填到账号（新建 or 已存在） */
  const runScan = async (targetAccount?: PublishAccount): Promise<boolean> => {
    const api = getPlatformAccountApi()
    if (!api) {
      message.error('桌面端扫码功能不可用，请使用桌面端打开此页面')
      return false
    }
    setScanning(true)
    try {
      const platform = targetAccount?.platform ?? selectedPlatform
      if (!platform) {
        message.warning('请先选择平台')
        return false
      }
      const res = await api.setupLogin(platform)
      if (!res.ok) {
        message.error(res.error || '扫码登录失败')
        return false
      }
      let account = targetAccount
      if (!account) {
        account = accounts.find((a) => a.platform === platform)
      }
      if (!account) {
        const created = await createPublishAccount({
          platform,
          accountName: res.displayName || platformName(platform),
        })
        account = created
      }
      await saveAccountSession(account.id, {
        cookiesJson: res.cookiesJson,
        displayName: res.displayName || account.displayName || undefined,
      })
      message.success('账号绑定成功')
      return true
    } catch (err) {
      const e = err as Error
      message.error('绑定失败: ' + (e?.message ?? e))
      return false
    } finally {
      setScanning(false)
    }
  }

  const handleAddScan = async (): Promise<void> => {
    if (!selectedPlatform) {
      message.warning('请先选择平台')
      return
    }
    const ok = await runScan()
    if (ok) {
      setModalOpen(false)
      setSelectedPlatform(undefined)
      void load()
    }
  }

  const handleRelogin = async (account: PublishAccount): Promise<void> => {
    const ok = await runScan(account)
    if (ok) void load()
  }

  const handleTest = async (account: PublishAccount): Promise<void> => {
    setTestingId(account.id)
    try {
      const res = await testAccountLogin(account.id)
      if (res.online) {
        message.success(platformName(account.platform) + ' 账号在线')
      } else {
        message.warning(platformName(account.platform) + ' 未在线' + (res.message ? '：' + res.message : ''))
      }
      void load()
    } catch (err) {
      const e = err as Error
      message.error('测试连接失败: ' + (e?.message ?? e))
    } finally {
      setTestingId(null)
    }
  }

  const handleOpenHome = async (account: PublishAccount): Promise<void> => {
    const api = getPlatformAccountApi()
    if (!api) {
      message.error('桌面端功能不可用，请使用桌面端打开此页面')
      return
    }
    try {
      await api.openAccount(account.platform)
    } catch (err) {
      const e = err as Error
      message.error('打开主页失败: ' + (e?.message ?? e))
    }
  }

  const handleUnbind = async (account: PublishAccount): Promise<void> => {
    try {
      await clearAccountSession(account.id)
      message.success('已解绑登录态')
      void load()
    } catch (err) {
      const e = err as Error
      message.error('解绑失败: ' + (e?.message ?? e))
    }
  }

  const handleDelete = async (account: PublishAccount): Promise<void> => {
    try {
      await deletePublishAccount(account.id)
      message.success('账号已删除')
      void load()
    } catch (err) {
      const e = err as Error
      message.error('删除失败: ' + (e?.message ?? e))
    }
  }

  const actions = (account: PublishAccount): React.ReactNode[] => [
    <Button
      key="scan"
      type="link"
      size="small"
      icon={<QrCode size={14} />}
      loading={scanning}
      onClick={() => void handleRelogin(account)}
    >
      扫码登录
    </Button>,
    <Button
      key="test"
      type="link"
      size="small"
      icon={<Wifi size={14} />}
      loading={testingId === account.id}
      onClick={() => void handleTest(account)}
    >
      测试连接
    </Button>,
    <Button key="home" type="link" size="small" icon={<ExternalLink size={14} />} onClick={() => void handleOpenHome(account)}>
      打开主页
    </Button>,
    <Popconfirm key="unbind" title="确定解绑该账号的登录态？解绑后需重新扫码。" onConfirm={() => void handleUnbind(account)}>
      <Button type="link" size="small" icon={<Unlink size={14} />}>
        解绑
      </Button>
    </Popconfirm>,
    <Popconfirm key="del" title="确定删除该账号？删除后不可恢复。" onConfirm={() => void handleDelete(account)}>
      <Button type="link" size="small" danger icon={<Trash2 size={14} />}>
        删除
      </Button>
    </Popconfirm>,
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}>
            <Wifi size={17} strokeWidth={2} />
          </span>
          <div>
            <h1 className={styles.title}>发布账号</h1>
            <div className={styles.subtitle}>桌面端扫码绑定各平台创作号，用于一键发布</div>
          </div>
        </div>
        <div className={styles.headActions}>
          <Button icon={<RefreshCw size={14} />} onClick={() => void load()}>
            刷新
          </Button>
          <Button type="primary" className={styles.primaryBtn} icon={<Plus size={14} />} onClick={() => setModalOpen(true)}>
            添加账号
          </Button>
        </div>
      </header>

      <div className={styles.notice}>
        <span>账号绑定在桌面端完成（扫码采集登录态并加密保存），管理后台只控制平台开关。</span>
      </div>

      <Card className={styles.card} styles={{ body: { padding: 0 } }}>
        <Spin spinning={loading}>
          {accounts.length === 0 ? (
            <Empty style={{ padding: '48px 0' }} description="暂无发布账号，点击右上角「添加账号」扫码绑定" />
          ) : (
            <List
              dataSource={accounts}
              renderItem={(account) => {
                const status = accountStatus(account)
                return (
                  <List.Item actions={actions(account)}>
                    <List.Item.Meta
                      title={
                        <span className={styles.cardTitle}>
                          {platformName(account.platform)}
                          <Tag color={status.color} style={{ marginLeft: 8 }}>
                            {status.label}
                          </Tag>
                        </span>
                      }
                      description={
                        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.7 }}>
                          <div>账号：{account.displayName || account.accountName || '--'}</div>
                          <div>最后登录：{formatTime(account.lastLoginAt)}</div>
                        </div>
                      }
                    />
                  </List.Item>
                )
              }}
            />
          )}
        </Spin>
      </Card>

      <Modal
        title="添加发布账号"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={420}
      >
        <div className={styles.panelHint} style={{ marginBottom: 12 }}>
          选择平台后点击「打开扫码窗口」，在窗口内完成登录；登录成功后将自动采集登录态并绑定。
        </div>
        {enabledPlatforms.length === 0 ? (
          <div className={styles.lockHint}>
            当前没有可用的发布平台，请先到管理后台开启对应平台开关。
          </div>
        ) : (
          <>
            <Select
              style={{ width: '100%' }}
              placeholder="选择平台"
              value={selectedPlatform}
              onChange={setSelectedPlatform}
              options={enabledPlatforms.map((p) => ({ value: p.platform, label: p.displayName }))}
            />
            <Button
              type="primary"
              block
              className={styles.primaryBtn}
              style={{ marginTop: 14 }}
              icon={<QrCode size={14} />}
              loading={scanning}
              disabled={!selectedPlatform}
              onClick={() => void handleAddScan()}
            >
              打开扫码窗口
            </Button>
          </>
        )}
      </Modal>
    </div>
  )
}
