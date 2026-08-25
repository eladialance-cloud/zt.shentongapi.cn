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
  Select,
  Spin,
  Switch,
  Tabs,
  message
} from 'antd'
import {
  BellOutlined,
  DeleteOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import {
  clearCache,
  getCacheConfig,
  getNotificationConfig,
  getOralWorkshopConfig,
  getRateLimitConfig,
  testOralWorkshopLlm,
  updateOralWorkshopConfig,
  updateSystemConfig
} from '@/api/admin-system-api'
import type {
  CacheConfig,
  CacheLayer,
  NotificationConfig,
  OralWorkshopConfig,
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
  const [testingLlm, setTestingLlm] = useState(false)
  const [tab, setTab] = useState<SystemConfigSection>('cache')

  const [cacheForm] = Form.useForm<CacheFormValues>()
  const [rateLimitForm] = Form.useForm<RateLimitFormValues>()
  const [notificationForm] = Form.useForm<NotificationFormValues>()
  const [oralForm] = Form.useForm<OralWorkshopConfig>()

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

  const loadOralWorkshop = useCallback(async () => {
    try {
      const cfgv = await getOralWorkshopConfig()
      oralForm.setFieldsValue({
        voiceEngine: cfgv.voiceEngine || 'volcano',
        digitalHumanEngine: cfgv.digitalHumanEngine || 'volcano',
        watermarkEnabled: cfgv.watermarkEnabled !== false,
        maxConcurrentJobs: cfgv.maxConcurrentJobs || 2,
        watermarkText: cfgv.watermarkText || '',
        llmSource: cfgv.llmSource || 'volcano',
        llmBaseUrl: cfgv.llmBaseUrl || 'https://ark.cn-beijing.volces.com/api/v3',
        llmApiKey: cfgv.llmApiKey || '',
        llmModel: cfgv.llmModel || '',
        topicModel: cfgv.topicModel || '',
        scriptModel: cfgv.scriptModel || '',
        rewriteModel: cfgv.rewriteModel || '',
        titleModel: cfgv.titleModel || '',
        translateModel: cfgv.translateModel || '',
        reviewModel: cfgv.reviewModel || '',
        volcanoApiKey: cfgv.volcanoApiKey || '',
        voiceEndpoint: cfgv.voiceEndpoint || 'https://ark.cn-beijing.volces.com/api/v3',
        voiceModel: cfgv.voiceModel || '',
        voiceModelVersion: cfgv.voiceModelVersion || 'V1',
        voiceRefAudioUrl: cfgv.voiceRefAudioUrl || '',
        voiceSpeakerId: cfgv.voiceSpeakerId || '',
        dhEndpoint: cfgv.dhEndpoint || '',
        dhSubmitPath: cfgv.dhSubmitPath || '/digital-human/submit',
        dhQueryPath: cfgv.dhQueryPath || '/digital-human/query',
        dhModelVersion: cfgv.dhModelVersion || 'V1',
        dhDefaultImageId: cfgv.dhDefaultImageId || '',
        sttProvider: cfgv.sttProvider || 'openai',
        sttModel: cfgv.sttModel || '',
        sttEndpoint: cfgv.sttEndpoint || '',
        sttApiKey: cfgv.sttApiKey || '',
        embeddingProvider: cfgv.embeddingProvider || 'doubao',
        embeddingEndpoint: cfgv.embeddingEndpoint || '',
        embeddingApiKey: cfgv.embeddingApiKey || '',
        embeddingModel: cfgv.embeddingModel || 'doubao-embedding-text-240715'
      })
    } catch (err) {
      console.error('[SystemConfig] load oral_workshop failed:', err)
    }
  }, [oralForm])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([loadCache(), loadRateLimit(), loadNotification(), loadOralWorkshop()])
    } catch (err) {
      console.error('[SystemConfig] load failed:', err)
      message.error('加载系统配置失败')
    } finally {
      setLoading(false)
    }
  }, [loadCache, loadRateLimit, loadNotification, loadOralWorkshop])

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

  const handleSaveOralWorkshop = async () => {
    try {
      const values = await oralForm.validateFields()
      setSaving(true)
      const cfgv: OralWorkshopConfig = {
        voiceEngine: values.voiceEngine,
        digitalHumanEngine: values.digitalHumanEngine,
        watermarkEnabled: values.watermarkEnabled,
        maxConcurrentJobs: values.maxConcurrentJobs,
        watermarkText: values.watermarkText || '',
        llmSource: values.llmSource || 'volcano',
        llmBaseUrl: values.llmBaseUrl || '',
        llmApiKey: values.llmApiKey || '',
        llmModel: values.llmModel || '',
        topicModel: values.topicModel || '',
        scriptModel: values.scriptModel || '',
        rewriteModel: values.rewriteModel || '',
        titleModel: values.titleModel || '',
        translateModel: values.translateModel || '',
        reviewModel: values.reviewModel || '',
        volcanoApiKey: values.volcanoApiKey || '',
        voiceEndpoint: values.voiceEndpoint || '',
        voiceModel: values.voiceModel || '',
        voiceModelVersion: values.voiceModelVersion || 'V1',
        voiceRefAudioUrl: values.voiceRefAudioUrl || '',
        voiceSpeakerId: values.voiceSpeakerId || '',
        dhEndpoint: values.dhEndpoint || '',
        dhSubmitPath: values.dhSubmitPath || '/digital-human/submit',
        dhQueryPath: values.dhQueryPath || '/digital-human/query',
        dhModelVersion: values.dhModelVersion || 'V1',
        dhDefaultImageId: values.dhDefaultImageId || '',
        sttProvider: values.sttProvider || 'openai',
        sttModel: values.sttModel || '',
        sttEndpoint: values.sttEndpoint || '',
        sttApiKey: values.sttApiKey || '',
        embeddingProvider: values.embeddingProvider || 'doubao',
        embeddingEndpoint: values.embeddingEndpoint || '',
        embeddingApiKey: values.embeddingApiKey || '',
        embeddingModel: values.embeddingModel || 'doubao-embedding-text-240715'
      }
      await updateOralWorkshopConfig(cfgv)
      message.success('口播工坊配置已保存（含火山方舟云端配置）')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SystemConfig] save oral_workshop failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTestLlm = async () => {
    try {
      const v = await oralForm.validateFields(['llmBaseUrl', 'llmApiKey', 'llmModel'])
      setTestingLlm(true)
      const res = await testOralWorkshopLlm({
        baseUrl: v.llmBaseUrl,
        apiKey: v.llmApiKey,
        model: v.llmModel
      })
      if (res.success) message.success(res.message)
      else message.error(res.message)
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SystemConfig] test llm failed:', err)
      message.error('测试失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setTestingLlm(false)
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
            { key: 'notification', label: '通知配置' },
            { key: 'oral_workshop', label: '口播工坊' }
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
        {tab === 'oral_workshop' && (
          <Card className={styles.card} bordered={false}>
            <div className={styles.sectionTitle}>
              <ThunderboltOutlined /> 口播工坊引擎开关
            </div>
            <Form<OralWorkshopConfig> form={oralForm} layout="vertical">
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <Form.Item
                  name="voiceEngine"
                  label="声音克隆引擎"
                  rules={[{ required: true, message: '请选择' }]}
                  extra="volcano=火山方舟（云端，默认）；local=本地引擎（预留）"
                >
                  <Select
                    options={[
                      { value: 'volcano', label: '火山方舟（volcano，云端）' },
                      { value: 'local', label: '本地引擎（local，预留）' }
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  name="digitalHumanEngine"
                  label="数字人合成引擎"
                  rules={[{ required: true, message: '请选择' }]}
                  extra="volcano=火山方舟（云端，默认）；local=本地引擎（预留）"
                >
                  <Select
                    options={[
                      { value: 'volcano', label: '火山方舟（volcano，云端）' },
                      { value: 'local', label: '本地引擎（local，预留）' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="watermarkEnabled" label="免费档水印" valuePropName="checked">
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
                <Form.Item
                  name="maxConcurrentJobs"
                  label="并发任务上限"
                  rules={[{ required: true, message: '请输入' }]}
                  extra="单轮同时推进的任务数（1-20），保存后立即生效"
                >
                  <InputNumber min={1} max={20} style={{ width: '100%' }} />
                </Form.Item>
              </div>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <RobotOutlined /> LLM AI 算力（云端为主）
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <Form.Item
                  name="llmSource"
                  label="LLM 算力来源"
                  rules={[{ required: true, message: '请选择' }]}
                  extra="火山方舟=云端（默认）；自定义=任意 OpenAI 兼容端点；供应商池=服务端已配 model_providers"
                >
                  <Select
                    options={[
                      { value: 'volcano', label: '火山方舟（volcano，云端，默认）' },
                      { value: 'custom', label: '自定义 OpenAI 兼容端点（custom）' },
                      { value: 'pool', label: '服务端供应商池（pool）' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="llmModel" label="默认模型（兜底）" extra="各用途未单独配置时使用；如 doubao-seed-1-6-250615 / deepseek-v3.2">
                  <Input placeholder="如 doubao-seed-1-6-250615" allowClear />
                </Form.Item>
                <Form.Item name="llmBaseUrl" label="LLM 接入端点（baseUrl）" extra="火山方舟默认 https://ark.cn-beijing.volces.com/api/v3；不同模型可换不同接入点">
                  <Input placeholder="https://ark.cn-beijing.volces.com/api/v3" allowClear />
                </Form.Item>
                <Form.Item name="llmApiKey" label="LLM API Key" extra="火山方舟密钥（可选填，也可用下方统一火山密钥）">
                  <Input.Password placeholder="sk-..." autoComplete="new-password" allowClear />
                </Form.Item>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Button
                  type="dashed"
                  icon={<ReloadOutlined />}
                  onClick={handleTestLlm}
                  loading={testingLlm}
                >
                  测试 LLM 连接（baseUrl + apiKey + 模型）
                </Button>
              </div>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <RobotOutlined /> 用途模型（不同接入口，留空=用默认模型）
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <Form.Item name="topicModel" label="爆款选题模型">
                  <Input placeholder="如 doubao-seed-2-0-lite" allowClear />
                </Form.Item>
                <Form.Item name="scriptModel" label="口播/营销文案模型">
                  <Input placeholder="留空=默认" allowClear />
                </Form.Item>
                <Form.Item name="rewriteModel" label="文案改写模型">
                  <Input placeholder="留空=默认" allowClear />
                </Form.Item>
                <Form.Item name="titleModel" label="标题/封面模型">
                  <Input placeholder="如 Qwen2.5-7B-Instruct" allowClear />
                </Form.Item>
                <Form.Item name="translateModel" label="翻译/双语字幕模型">
                  <Input placeholder="如 meta-llama/Llama-3.3-70B-Instruct" allowClear />
                </Form.Item>
                <Form.Item name="reviewModel" label="法务审核模型">
                  <Input placeholder="留空=默认" allowClear />
                </Form.Item>
              </div>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <RobotOutlined /> 火山声音克隆 / TTS（云端）
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <Form.Item name="volcanoApiKey" label="火山方舟统一 API Key" extra="声音克隆/数字人共用；若已填上方 LLM Key 可留空">
                  <Input.Password placeholder="火山方舟 API Key" autoComplete="new-password" allowClear />
                </Form.Item>
                <Form.Item name="voiceEndpoint" label="声音克隆 TTS 接入端点">
                  <Input placeholder="https://ark.cn-beijing.volces.com/api/v3" allowClear />
                </Form.Item>
                <Form.Item name="voiceModel" label="TTS 模型 ID" extra="如火山方舟 doubao-tts 系列模型">
                  <Input placeholder="如 doubao-tts" allowClear />
                </Form.Item>
                <Form.Item name="voiceModelVersion" label="声音克隆模型版本">
                  <Select
                    options={[
                      { value: 'V1', label: 'V1（标准版，快）' },
                      { value: 'V2', label: 'V2（高清增强版，更自然）' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="voiceRefAudioUrl" label="默认参考音频 URL" extra={'用户未选“我的声音”时的兜底参考音频（克隆音色用）'}>
                  <Input placeholder="https://.../ref.mp3" allowClear />
                </Form.Item>
                <Form.Item name="voiceSpeakerId" label="已训练 speaker_id" extra="优先复用，跳过克隆直接合成">
                  <Input placeholder="留空=每次克隆" allowClear />
                </Form.Item>
              </div>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <RobotOutlined /> 火山数字人（云端）
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <Form.Item name="dhEndpoint" label="数字人服务端点" rules={[{ required: false }]} extra="火山数字人服务地址（必填才能启用云端数字人）">
                  <Input placeholder="https://..." allowClear />
                </Form.Item>
                <Form.Item name="dhDefaultImageId" label="默认数字人形象 ID" extra={'用户未选“我的形象”时的兜底形象'}>
                  <Input placeholder="形象 ID" allowClear />
                </Form.Item>
                <Form.Item name="dhSubmitPath" label="提交任务路径">
                  <Input placeholder="/digital-human/submit" allowClear />
                </Form.Item>
                <Form.Item name="dhQueryPath" label="查询任务路径">
                  <Input placeholder="/digital-human/query" allowClear />
                </Form.Item>
                <Form.Item name="dhModelVersion" label="数字人模型版本">
                  <Select
                    options={[
                      { value: 'V1', label: 'V1（标准版，快）' },
                      { value: 'V2', label: 'V2（高清版，更清晰）' }
                    ]}
                  />
                </Form.Item>
              </div>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <RobotOutlined /> 语音识别 / 向量检索
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <Form.Item name="sttProvider" label="语音识别引擎" extra="openai=whisper（默认）；volcano=火山 ASR">
                  <Select
                    options={[
                      { value: 'openai', label: 'OpenAI whisper' },
                      { value: 'volcano', label: '火山方舟 ASR' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="sttModel" label="语音识别模型" extra="提取文案/字幕用；留空=whisper-1">
                  <Input placeholder="如 whisper-1" allowClear />
                </Form.Item>
                <Form.Item name="embeddingProvider" label="向量 Embedding 供应商">
                  <Select
                    options={[
                      { value: 'doubao', label: '火山方舟（Doubao-embedding）' },
                      { value: 'qwen', label: '阿里通义（text-embedding-v3）' },
                      { value: 'openai', label: 'OpenAI（text-embedding-3-small）' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="embeddingModel" label="向量 Embedding 模型">
                  <Input placeholder="doubao-embedding-text-240715" allowClear />
                </Form.Item>
                <Form.Item name="sttEndpoint" label="语音识别端点" extra="volcano ASR 接入地址；openai 留空走默认">
                  <Input placeholder="如 https://ark.cn-beijing.volces.com/api/v3" allowClear />
                </Form.Item>
                <Form.Item name="sttApiKey" label="语音识别 API Key" extra="火山 ASR 专用密钥">
                  <Input.Password placeholder="请输入语音识别密钥" allowClear />
                </Form.Item>
                <Form.Item name="embeddingEndpoint" label="Embedding 端点" extra="留空=按供应商默认">
                  <Input placeholder="如 https://ark.cn-beijing.volces.com/api/v3" allowClear />
                </Form.Item>
                <Form.Item name="embeddingApiKey" label="Embedding API Key" extra="留空=用上方 LLM/火山 API Key 兜底">
                  <Input.Password placeholder="请输入向量检索密钥" allowClear />
                </Form.Item>
                <Form.Item name="watermarkText" label="水印文案" extra="免费档叠加的品牌水印文字">
                  <Input placeholder="如 深瞳AI" allowClear />
                </Form.Item>
              </div>

              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveOralWorkshop}
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
