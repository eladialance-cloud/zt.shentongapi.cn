// 系统参数页 - SubTask 28.1
//
// Tab:缓存配置/限流配置/通知配置
// 缓存配置:L1/L2/L3 TTL 输入框 + 清空缓存按钮
// 限流配置:日调用上限(按等级)/并发上限/月积分上限(按等级)
// 通知配置:邮件 SMTP/短信/客户端推送配置
// 保存按钮 PUT /admin/system/config body: { section, config }
// API: GET /admin/system/config?section=、PUT /admin/system/config、POST /admin/system/cache/clear

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Spin,
  Switch,
  Tabs,
  message
} from 'antd'
import {
  BellOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import {
  clearCache,
  getCacheConfig,
  getNotificationConfig,
  getRateLimitConfig,
  updateSystemConfig
} from '@/api/admin-system-api'
import type {
  CacheConfig,
  CacheLayer,
  NotificationConfig,
  RateLimitConfig,
  SystemConfigSection
} from '@/types/admin-system'
import styles from './styles.module.css'

const USER_LEVELS = [1, 2, 3, 4, 5]

interface CacheFormValues {
  l1Ttl: number
  l2Ttl: number
  l3Ttl: number
}

interface RateLimitFormValues {
  dailyCallLimitByLevel: Record<number, number>
  concurrencyLimit: number
  monthlyCreditsLimitByLevel: Record<number, number>
}

interface NotificationFormValues {
  smtpHost: string
  smtpPort: number
  smtpUsername: string
  smtpPassword: string
  smtpFrom: string
  smtpEnabled: boolean
  smsProvider: string
  smsAccessKeyId: string
  smsAccessKeySecret: string
  smsSignName: string
  smsEnabled: boolean
  pushAppId: string
  pushAppKey: string
  pushEnabled: boolean
}

const CACHE_LAYERS: Array<{ layer: CacheLayer; label: string; desc: string }> = [
  { layer: 'L1', label: 'L1 本地缓存', desc: '本地内存' },
  { layer: 'L2', label: 'L2 Redis', desc: '分布式缓存' },
  { layer: 'L3', label: 'L3 Qdrant', desc: '向量缓存' }
]

export default function SystemConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<SystemConfigSection>('cache')

  const [cacheForm] = Form.useForm<CacheFormValues>()
  const [rateLimitForm] = Form.useForm<RateLimitFormValues>()
  const [notificationForm] = Form.useForm<NotificationFormValues>()

  const loadCache = useCallback(async () => {
    try {
      const cfg = await getCacheConfig()
      cacheForm.setFieldsValue({
        l1Ttl: cfg.l1Ttl,
        l2Ttl: cfg.l2Ttl,
        l3Ttl: cfg.l3Ttl
      })
    } catch (err) {
      console.error('[SystemConfig] load cache failed:', err)
    }
  }, [cacheForm])

  const loadRateLimit = useCallback(async () => {
    try {
      const cfg = await getRateLimitConfig()
      rateLimitForm.setFieldsValue({
        dailyCallLimitByLevel: cfg.dailyCallLimitByLevel || {},
        concurrencyLimit: cfg.concurrencyLimit,
        monthlyCreditsLimitByLevel: cfg.monthlyCreditsLimitByLevel || {}
      })
    } catch (err) {
      console.error('[SystemConfig] load rate_limit failed:', err)
    }
  }, [rateLimitForm])

  const loadNotification = useCallback(async () => {
    try {
      const cfg = await getNotificationConfig()
      notificationForm.setFieldsValue({
        smtpHost: cfg.smtp.host,
        smtpPort: cfg.smtp.port,
        smtpUsername: cfg.smtp.username,
        smtpPassword: '',
        smtpFrom: cfg.smtp.from,
        smtpEnabled: cfg.smtp.enabled,
        smsProvider: cfg.sms.provider,
        smsAccessKeyId: cfg.sms.accessKeyId,
        smsAccessKeySecret: '',
        smsSignName: cfg.sms.signName,
        smsEnabled: cfg.sms.enabled,
        pushAppId: cfg.push.appId,
        pushAppKey: '',
        pushEnabled: cfg.push.enabled
      })
    } catch (err) {
      console.error('[SystemConfig] load notification failed:', err)
    }
  }, [notificationForm])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([loadCache(), loadRateLimit(), loadNotification()])
    } catch (err) {
      console.error('[SystemConfig] load failed:', err)
      message.error('加载系统配置失败')
    } finally {
      setLoading(false)
    }
  }, [loadCache, loadRateLimit, loadNotification])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const handleSaveCache = async () => {
    try {
      const values = await cacheForm.validateFields()
      setSaving(true)
      const cfg: CacheConfig = {
        l1Ttl: values.l1Ttl,
        l2Ttl: values.l2Ttl,
        l3Ttl: values.l3Ttl
      }
      await updateSystemConfig({ section: 'cache', config: cfg as unknown as Record<string, unknown> })
      message.success('缓存配置已保存')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SystemConfig] save cache failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRateLimit = async () => {
    try {
      const values = await rateLimitForm.validateFields()
      setSaving(true)
      const cfg: RateLimitConfig = {
        dailyCallLimitByLevel: values.dailyCallLimitByLevel,
        concurrencyLimit: values.concurrencyLimit,
        monthlyCreditsLimitByLevel: values.monthlyCreditsLimitByLevel
      }
      await updateSystemConfig({ section: 'rate_limit', config: cfg as unknown as Record<string, unknown> })
      message.success('限流配置已保存')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SystemConfig] save rate_limit failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotification = async () => {
    try {
      const values = await notificationForm.validateFields()
      setSaving(true)
      const cfg: NotificationConfig = {
        smtp: {
          host: values.smtpHost,
          port: values.smtpPort,
          username: values.smtpUsername,
          from: values.smtpFrom,
          enabled: values.smtpEnabled
        },
        sms: {
          provider: values.smsProvider,
          accessKeyId: values.smsAccessKeyId,
          signName: values.smsSignName,
          enabled: values.smsEnabled
        },
        push: {
          appId: values.pushAppId,
          enabled: values.pushEnabled
        }
      }
      // 仅当用户填写了密码/密钥才传给后端(后端判断是否更新)
      if (values.smtpPassword) cfg.smtp.passwordMasked = values.smtpPassword
      if (values.smsAccessKeySecret) cfg.sms.accessKeySecretMasked = values.smsAccessKeySecret
      if (values.pushAppKey) cfg.push.appKeyMasked = values.pushAppKey
      await updateSystemConfig({ section: 'notification', config: cfg as unknown as Record<string, unknown> })
      message.success('通知配置已保存')
      void loadNotification()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SystemConfig] save notification failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleClearCache = async (layer: CacheLayer) => {
    try {
      await clearCache({ layer })
      message.success(`已清空 ${layer} 缓存`)
    } catch (err) {
      console.error('[SystemConfig] clear cache failed:', err)
      message.error('清空缓存失败')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <SettingOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>系统参数</h1>
            <div className={styles.subtitle}>配置缓存/限流/通知等系统级参数</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadAll}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as SystemConfigSection)}
          items={[
            { key: 'cache', label: '缓存配置' },
            { key: 'rate_limit', label: '限流配置' },
            { key: 'notification', label: '通知配置' }
          ]}
        />

        {tab === 'cache' && (
          <Card className={styles.card} bordered={false}>
            <Form<CacheFormValues> form={cacheForm} layout="vertical">
              <Form.Item
                name="l1Ttl"
                label="L1 TTL(秒,本地内存)"
                rules={[{ required: true, message: '请输入 L1 TTL' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="l2Ttl"
                label="L2 TTL(秒,Redis)"
                rules={[{ required: true, message: '请输入 L2 TTL' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="l3Ttl"
                label="L3 TTL(秒,Qdrant)"
                rules={[{ required: true, message: '请输入 L3 TTL' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSaveCache}
                  loading={saving}
                  className={styles.primaryBtn}
                >
                  保存
                </Button>
                <span style={{ color: '#8b949e', fontSize: 12, marginRight: 8 }}>清空缓存:</span>
                {CACHE_LAYERS.map((c) => (
                  <Popconfirm
                    key={c.layer}
                    title={`确认清空 ${c.label}?`}
                    onConfirm={() => handleClearCache(c.layer)}
                    okText="清空"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button icon={<DeleteOutlined />} className={styles.ghostBtn}>
                      {c.layer}
                    </Button>
                  </Popconfirm>
                ))}
              </div>
            </Form>
          </Card>
        )}

        {tab === 'rate_limit' && (
          <Card className={styles.card} bordered={false}>
            <Form<RateLimitFormValues> form={rateLimitForm} layout="vertical">
              <div className={styles.sectionTitle}>
                <ThunderboltOutlined /> 日调用上限(按用户等级)
              </div>
              <div className={styles.levelGrid}>
                {USER_LEVELS.map((lv) => (
                  <Form.Item
                    key={`daily-${lv}`}
                    name={['dailyCallLimitByLevel', lv]}
                    label={`等级 ${lv}`}
                    rules={[{ required: true, message: '请输入' }]}
                  >
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                ))}
              </div>

              <Form.Item
                name="concurrencyLimit"
                label="并发上限"
                rules={[{ required: true, message: '请输入并发上限' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <div className={styles.sectionTitle}>
                <ThunderboltOutlined /> 月积分上限(按用户等级)
              </div>
              <div className={styles.levelGrid}>
                {USER_LEVELS.map((lv) => (
                  <Form.Item
                    key={`monthly-${lv}`}
                    name={['monthlyCreditsLimitByLevel', lv]}
                    label={`等级 ${lv}`}
                    rules={[{ required: true, message: '请输入' }]}
                  >
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                ))}
              </div>

              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveRateLimit}
                loading={saving}
                className={styles.primaryBtn}
              >
                保存
              </Button>
            </Form>
          </Card>
        )}

        {tab === 'notification' && (
          <Card className={styles.card} bordered={false}>
            <Form<NotificationFormValues> form={notificationForm} layout="vertical">
              <div className={styles.sectionTitle}>
                <BellOutlined /> 邮件 SMTP 配置
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <Form.Item name="smtpHost" label="SMTP 主机" rules={[{ required: true, message: '请输入' }]}>
                  <Input placeholder="smtp.example.com" />
                </Form.Item>
                <Form.Item name="smtpPort" label="端口" rules={[{ required: true, message: '请输入' }]}>
                  <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="smtpFrom" label="发件人" rules={[{ required: true, message: '请输入' }]}>
                  <Input placeholder="noreply@example.com" />
                </Form.Item>
                <Form.Item name="smtpUsername" label="用户名" rules={[{ required: true, message: '请输入' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="smtpPassword" label="密码(留空不修改)">
                  <Input.Password placeholder="留空不修改" autoComplete="new-password" />
                </Form.Item>
                <Form.Item name="smtpEnabled" label="启用" valuePropName="checked">
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
              </div>

              <div className={styles.sectionTitle}>
                <BellOutlined /> 短信配置
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <Form.Item name="smsProvider" label="服务商" rules={[{ required: true, message: '请输入' }]}>
                  <Input placeholder="aliyun" />
                </Form.Item>
                <Form.Item name="smsAccessKeyId" label="AccessKeyId" rules={[{ required: true, message: '请输入' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="smsAccessKeySecret" label="AccessKeySecret(留空不修改)">
                  <Input.Password placeholder="留空不修改" autoComplete="new-password" />
                </Form.Item>
                <Form.Item name="smsSignName" label="签名" rules={[{ required: true, message: '请输入' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="smsEnabled" label="启用" valuePropName="checked">
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
              </div>

              <div className={styles.sectionTitle}>
                <BellOutlined /> 客户端推送配置
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <Form.Item name="pushAppId" label="AppID" rules={[{ required: true, message: '请输入' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="pushAppKey" label="AppKey(留空不修改)">
                  <Input.Password placeholder="留空不修改" autoComplete="new-password" />
                </Form.Item>
                <Form.Item name="pushEnabled" label="启用" valuePropName="checked">
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
              </div>

              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveNotification}
                loading={saving}
                className={styles.primaryBtn}
              >
                保存
              </Button>
            </Form>
          </Card>
        )}
      </Spin>
    </div>
  )
}
