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
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Switch,
  Table,
  Tabs,
  message
} from 'antd'
import {
  BellOutlined,
  DeleteOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  SettingOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  UserOutlined
} from '@ant-design/icons'
import {
  clearCache,
  createOralWorkshopTemplate,
  deleteOralWorkshopTemplate,
  getCacheConfig,
  getNotificationConfig,
  getOralWorkshopConfig,
  getOralWorkshopPublishPlatforms,
  getRateLimitConfig,
  listOralWorkshopModels,
  listOralWorkshopTemplates,
  saveOralWorkshopPublishPlatforms,
  testOralWorkshopCapability,
  testOralWorkshopLlm,
  updateOralWorkshopConfig,
  updateSystemConfig,
  type OralWorkshopTemplateMeta
} from '@/api/admin-system-api'
import type {
  CacheConfig,
  CacheLayer,
  NotificationConfig,
  OralWorkshopConfig,
  PublishPlatformItem,
  RateLimitConfig,
  SystemConfigSection
} from '@/types/admin-system'
import styles from './styles.module.css'

const USER_LEVELS = [1, 2, 3, 4, 5]

/** 管理端媒体地址：后端返回 /uploads/... 相对路径，按 API 同源拼成可访问 URL */
function resolveAdminMediaUrl(url?: string): string | undefined {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url)) return url
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  let origin = ''
  try {
    origin = base.startsWith('http') ? new URL(base).origin : window.location.origin
  } catch {
    origin = window.location.origin
  }
  return origin + (url.startsWith('/') ? url : '/' + url)
}

/** 解析音色池文本：每行 speaker_id|名称|resourceId */
function parseVoicePool(text?: string): Array<{ speakerId: string; name?: string; resourceId?: string }> {
  if (!text) return []
  const pool: Array<{ speakerId: string; name?: string; resourceId?: string }> = []
  for (const line of String(text).split(/[\n\r]+/)) {
    const parts = line.split('|').map((v) => v.trim())
    const speakerId = parts[0] || ''
    if (!speakerId) continue
    pool.push({
      speakerId,
      name: parts[1] || '',
      resourceId: parts[2] && parts[2] !== 'seed-tts-2.0' ? parts[2] : 'seed-tts-2.0'
    })
  }
  return pool
}

/** 解析人设预设文本：每行 label|value（B1） */
function parsePersonaPresets(text?: string): Array<{ label: string; value: string }> {
  if (!text) return []
  const list: Array<{ label: string; value: string }> = []
  for (const line of String(text).split(/[\n\r]+/)) {
    const parts = line.split('|').map((v) => v.trim())
    const label = parts[0] || ''
    const value = parts[1] || parts[0] || ''
    if (!label) continue
    list.push({ label, value })
  }
  return list
}

/** 解析 BGM 库文本：每行 name|url|category（E3） */
function parseBgmLibrary(text?: string): Array<{ id: string; name: string; url: string; category?: string }> {
  if (!text) return []
  const list: Array<{ id: string; name: string; url: string; category?: string }> = []
  for (const line of String(text).split(/[\n\r]+/)) {
    const parts = line.split('|').map((v) => v.trim())
    const name = parts[0] || ''
    const url = parts[1] || ''
    if (!name || !url) continue
    list.push({ id: 'bgm-' + list.length + 1, name, url, category: parts[2] || undefined })
  }
  return list
}

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

/** 口播工坊发布平台默认兜底（后端返回为空/接口失败时使用） */
const DEFAULT_PUBLISH_PLATFORMS: PublishPlatformItem[] = [
  { platform: 'douyin', displayName: '抖音', enabled: true, sortOrder: 1, remark: null },
  { platform: 'kuaishou', displayName: '快手', enabled: true, sortOrder: 2, remark: null },
  { platform: 'xiaohongshu', displayName: '小红书', enabled: true, sortOrder: 3, remark: null },
  { platform: 'bilibili', displayName: 'B站', enabled: true, sortOrder: 4, remark: null },
  { platform: 'xigua', displayName: '西瓜视频', enabled: true, sortOrder: 5, remark: null },
  { platform: 'wx_channels', displayName: '蝴蝶号', enabled: true, sortOrder: 6, remark: null }
]

export default function SystemConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingLlm, setTestingLlm] = useState(false)
  const [modelOptions, setModelOptions] = useState<{ value: string }[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [testingCap, setTestingCap] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<SystemConfigSection>('cache')
  const [voiceOptions, setVoiceOptions] = useState<{ value: string; label: string }[]>([])
  const [templates, setTemplates] = useState<OralWorkshopTemplateMeta[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateJson, setTemplateJson] = useState('')
  const [templateCoverUrl, setTemplateCoverUrl] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)
  const [publishPlatforms, setPublishPlatforms] = useState<PublishPlatformItem[]>(DEFAULT_PUBLISH_PLATFORMS)
  const [publishSaving, setPublishSaving] = useState(false)

  const [cacheForm] = Form.useForm<CacheFormValues>()
  const [rateLimitForm] = Form.useForm<RateLimitFormValues>()
  const [notificationForm] = Form.useForm<NotificationFormValues>()
  const [oralForm] = Form.useForm<OralWorkshopConfig>()
  const defaultLlmModel = Form.useWatch('llmModel', oralForm)

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
        voiceEndpoint: cfgv.voiceEndpoint || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
        voiceModel: cfgv.voiceModel || '',
        voiceModelV1: cfgv.voiceModelV1 || '',
        voiceModelV2: cfgv.voiceModelV2 || '',
        voiceApiKey: cfgv.voiceApiKey || '',
        voiceResourceId: cfgv.voiceResourceId || 'seed-icl-2.0',
        voiceCloneEndpoint: cfgv.voiceCloneEndpoint || 'https://openspeech.bytedance.com/api/v3/tts/voice_clone',
        voiceFormat: cfgv.voiceFormat || 'mp3',
        voiceSampleRate: cfgv.voiceSampleRate ?? 24000,
        voiceEnableSubtitle: cfgv.voiceEnableSubtitle ?? false,
        voiceRefAudioUrl: cfgv.voiceRefAudioUrl || '',
        voiceSpeakerId: cfgv.voiceSpeakerId || '',
        baseCredits: cfgv.baseCredits ?? 5,
        voiceTierV1: {
          resourceId: cfgv.voiceTierV1?.resourceId || 'seed-icl-2.0',
          model: cfgv.voiceTierV1?.model || '',
          speakerId: cfgv.voiceTierV1?.speakerId || '',
          refAudioUrl: cfgv.voiceTierV1?.refAudioUrl || '',
          refAudioText: cfgv.voiceTierV1?.refAudioText || '',
          creditsCost: cfgv.voiceTierV1?.creditsCost ?? 0
        },
        voiceTierV2: {
          resourceId: cfgv.voiceTierV2?.resourceId || 'seed-icl-2.0',
          model: cfgv.voiceTierV2?.model || '',
          speakerId: cfgv.voiceTierV2?.speakerId || '',
          refAudioUrl: cfgv.voiceTierV2?.refAudioUrl || '',
          refAudioText: cfgv.voiceTierV2?.refAudioText || '',
          creditsCost: cfgv.voiceTierV2?.creditsCost ?? 0
        },
        dhTierV1: { creditsCost: cfgv.dhTierV1?.creditsCost ?? 0 },
        dhTierV2: { creditsCost: cfgv.dhTierV2?.creditsCost ?? 0 },
        voicePool: cfgv.voicePool || [],
        dhEndpoint: cfgv.dhEndpoint || '',
        dhSubmitPath: cfgv.dhSubmitPath || '/digital-human/submit',
        dhQueryPath: cfgv.dhQueryPath || '/digital-human/query',
        dhModelVersion: cfgv.dhModelVersion || 'V1',
        dhDefaultImageId: cfgv.dhDefaultImageId || '',
        heygenApiKey: cfgv.heygenApiKey || '',
        heygenEndpoint: cfgv.heygenEndpoint || 'https://api.heygen.com',
        heygenQuality: cfgv.heygenQuality || '1080',
        heygenDefaultAvatarId: cfgv.heygenDefaultAvatarId || '',
        sttProvider: cfgv.sttProvider || 'openai',
        sttModel: cfgv.sttModel || '',
        sttEndpoint: cfgv.sttEndpoint || '',
        sttApiKey: cfgv.sttApiKey || '',
        sttFileBase: cfgv.sttFileBase || '',
        embeddingProvider: cfgv.embeddingProvider || 'doubao',
        embeddingEndpoint: cfgv.embeddingEndpoint || '',
        embeddingApiKey: cfgv.embeddingApiKey || '',
        embeddingModel: cfgv.embeddingModel || 'doubao-embedding-text-240715',
        voicePoolText: (cfgv.voicePool || [])
          .map((v) => [v.speakerId, v.name || '', v.resourceId || 'seed-tts-2.0'].join('|'))
          .join('\n'),
        personaPresetsText: (cfgv.personaPresets || []).map((p) => [p.label, p.value].join('|')).join('\n'),
        bgmLibraryText: (cfgv.bgmLibrary || []).map((b) => [b.name, b.url, b.category || ''].join('|')).join('\n')
      })
      setVoiceOptions(
        (cfgv.voicePool || []).map((v) => ({
          value: v.speakerId,
          label: (v.name ? v.name + '（' + v.speakerId + '）' : v.speakerId) + (v.resourceId && v.resourceId !== 'seed-tts-2.0' ? ' [' + v.resourceId + ']' : '')
        }))
      )
      // 已保存的模型值合并进下拉（Select 回显 + 可重新选择）
      const savedModels = [
        cfgv.llmModel,
        cfgv.topicModel,
        cfgv.scriptModel,
        cfgv.rewriteModel,
        cfgv.titleModel,
        cfgv.translateModel,
        cfgv.reviewModel
      ]
        .filter((m): m is string => !!m)
        .map((m) => ({ value: m, label: m }))
      setModelOptions((prev) => {
        const seen = new Set(prev.map((o) => o.value))
        return [...prev, ...savedModels.filter((o) => !seen.has(o.value))]
      })
    } catch (err) {
      console.error('[SystemConfig] load oral_workshop failed:', err)
    }
  }, [oralForm])

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      setTemplates(await listOralWorkshopTemplates())
    } catch (err) {
      console.error('[SystemConfig] load oral templates failed:', err)
      message.error('模板列表加载失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

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

  useEffect(() => {
    if (tab === 'oral_workshop') void loadTemplates()
  }, [tab, loadTemplates])

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
        voiceModelV1: values.voiceModelV1 || '',
        voiceModelV2: values.voiceModelV2 || '',
        voiceApiKey: values.voiceApiKey || '',
        voiceResourceId: values.voiceResourceId || 'seed-icl-2.0',
        voiceCloneEndpoint: values.voiceCloneEndpoint || '',
        voiceFormat: values.voiceFormat || 'mp3',
        voiceSampleRate: values.voiceSampleRate ?? 24000,
        voiceEnableSubtitle: values.voiceEnableSubtitle ?? false,
        voiceRefAudioUrl: values.voiceRefAudioUrl || '',
        voiceSpeakerId: values.voiceSpeakerId || '',
        baseCredits: values.baseCredits ?? 5,
        voiceTierV1: {
          resourceId: values.voiceTierV1?.resourceId || 'seed-icl-2.0',
          model: values.voiceTierV1?.model || '',
          speakerId: values.voiceTierV1?.speakerId || '',
          refAudioUrl: values.voiceTierV1?.refAudioUrl || '',
          refAudioText: values.voiceTierV1?.refAudioText || '',
          creditsCost: values.voiceTierV1?.creditsCost ?? 0
        },
        voiceTierV2: {
          resourceId: values.voiceTierV2?.resourceId || 'seed-icl-2.0',
          model: values.voiceTierV2?.model || '',
          speakerId: values.voiceTierV2?.speakerId || '',
          refAudioUrl: values.voiceTierV2?.refAudioUrl || '',
          refAudioText: values.voiceTierV2?.refAudioText || '',
          creditsCost: values.voiceTierV2?.creditsCost ?? 0
        },
        dhTierV1: { creditsCost: values.dhTierV1?.creditsCost ?? 0 },
        dhTierV2: { creditsCost: values.dhTierV2?.creditsCost ?? 0 },
        voicePool: parseVoicePool(values.voicePoolText),
        personaPresets: parsePersonaPresets(values.personaPresetsText),
        bgmLibrary: parseBgmLibrary(values.bgmLibraryText),
        dhEndpoint: values.dhEndpoint || '',
        dhSubmitPath: values.dhSubmitPath || '/digital-human/submit',
        dhQueryPath: values.dhQueryPath || '/digital-human/query',
        dhModelVersion: values.dhModelVersion || 'V1',
        dhDefaultImageId: values.dhDefaultImageId || '',
        heygenApiKey: values.heygenApiKey || '',
        heygenEndpoint: values.heygenEndpoint || 'https://api.heygen.com',
        heygenQuality: values.heygenQuality === '720' ? '720' : '1080',
        heygenDefaultAvatarId: values.heygenDefaultAvatarId || '',
        sttProvider: values.sttProvider || 'openai',
        sttModel: values.sttModel || '',
        sttEndpoint: values.sttEndpoint || '',
        sttApiKey: values.sttApiKey || '',
        sttFileBase: values.sttFileBase || '',
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

  /** 加载口播工坊发布平台开关（接口失败用默认 6 平台兜底，不阻塞页面） */
  const loadPublishPlatforms = useCallback(async () => {
    try {
      const list = await getOralWorkshopPublishPlatforms()
      if (Array.isArray(list) && list.length > 0) setPublishPlatforms(list)
    } catch (err) {
      console.error('[SystemConfig] load publish platforms failed:', err)
    }
  }, [])

  useEffect(() => {
    void loadPublishPlatforms()
  }, [loadPublishPlatforms])

  const updatePublishPlatform = (platform: string, patch: Partial<PublishPlatformItem>) => {
    setPublishPlatforms((prev) => prev.map((p) => (p.platform === platform ? { ...p, ...patch } : p)))
  }

  /** 保存口播工坊发布平台开关（独立保存，不触碰口播工坊表单） */
  const handleSavePublishPlatforms = async () => {
    setPublishSaving(true)
    try {
      await saveOralWorkshopPublishPlatforms(publishPlatforms)
      message.success('发布平台开关已保存')
    } catch (err) {
      console.error('[SystemConfig] save publish platforms failed:', err)
      message.error('保存失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPublishSaving(false)
    }
  }

  const handleClearPurposeModels = () => {
    oralForm.setFieldsValue({
      topicModel: '',
      scriptModel: '',
      rewriteModel: '',
      titleModel: '',
      translateModel: '',
      reviewModel: ''
    })
    message.info('用途模型已清空，保存后各用途将自动使用默认模型')
  }

  const handleTestCapability = async (type: 'tts' | 'clone' | 'dh' | 'heygen' | 'stt' | 'embedding') => {
    try {
      const cfg = oralForm.getFieldsValue() as unknown as Record<string, unknown>
      setTestingCap((p) => ({ ...p, [type]: true }))
      const res = await testOralWorkshopCapability({ type, config: cfg })
      if (res.success) message.success(res.message)
      else message.error(res.message)
    } catch (err) {
      console.error('[SystemConfig] test capability failed:', err)
      message.error('测试失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setTestingCap((p) => ({ ...p, [type]: false }))
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

  const handleLoadModels = async () => {
    try {
      const v = await oralForm.validateFields(['llmBaseUrl', 'llmApiKey', 'llmSource'])
      setLoadingModels(true)
      const res = await listOralWorkshopModels({
        baseUrl: v.llmBaseUrl,
        apiKey: v.llmApiKey,
        source: v.llmSource
      })
      if (res.success && res.models?.length) {
        setModelOptions(res.models.map((m) => ({ value: m, label: m })))
        message.success('已加载 ' + res.models.length + ' 个模型（注意：列表含平台全部模型，未开通的调用会 404，请用「测试 LLM 连接」验证）')
      } else {
        setModelOptions([])
        message.error(res.message || '未获取到模型列表')
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SystemConfig] load models failed:', err)
      message.error('加载模型列表失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoadingModels(false)
    }
  }

  const handleCreateTemplate = async () => {
    if (!templateJson.trim()) {
      message.warning('请先粘贴模板 JSON')
      return
    }
    setTemplateSaving(true)
    try {
      await createOralWorkshopTemplate({
        templateJson,
        coverImageUrl: templateCoverUrl.trim() || undefined
      })
      message.success('自定义模板已上传')
      setTemplateModalOpen(false)
      setTemplateJson('')
      setTemplateCoverUrl('')
      void loadTemplates()
    } catch (err) {
      console.error('[SystemConfig] create oral template failed:', err)
      message.error('模板上传失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setTemplateSaving(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteOralWorkshopTemplate(id)
      message.success('模板已删除')
      void loadTemplates()
    } catch (err) {
      console.error('[SystemConfig] delete oral template failed:', err)
      message.error('模板删除失败：' + (err instanceof Error ? err.message : String(err)))
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
          <>
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
                  extra="volcano=火山方舟（云端）；heygen=HeyGen 数字人（云端，需配置下方 API Key）；local=本地卡片兜底；auto=自动降级（默认）"
                >
                  <Select
                    options={[
                      { value: 'volcano', label: '火山方舟（volcano，云端）' },
                      { value: 'heygen', label: 'HeyGen 数字人（heygen，云端）' },
                      { value: 'local', label: '本地引擎（local，卡片兜底）' }
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
                  <Select showSearch allowClear optionFilterProp="label" options={modelOptions} placeholder="如 doubao-seed-1-6-250615" />
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
                  onClick={handleLoadModels}
                  loading={loadingModels}
                  style={{ marginRight: 12 }}
                >
                  加载模型列表（baseUrl + apiKey）
                </Button>
                <Button
                  type="dashed"
                  icon={<ReloadOutlined />}
                  onClick={handleTestLlm}
                  loading={testingLlm}
                >
                  测试 LLM 连接（baseUrl + apiKey + 模型）
                </Button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <div className={styles.sectionTitle} style={{ margin: 0 }}>
                  <RobotOutlined /> 用途模型（不同接入口，留空=用默认模型）
                </div>
                <Button size="small" icon={<DeleteOutlined />} onClick={handleClearPurposeModels}>
                  一键清空用途模型
                </Button>
              </div>
              <div style={{ marginTop: 8, color: '#999', fontSize: 13 }}>
                优先级：用途模型 &gt; 默认模型（当前默认：{defaultLlmModel || '未配置'}）。下拉列表来自平台 /models，包含未开通的模型，调用会 404，请用「测试 LLM 连接」验证后再保存。
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <Form.Item name="topicModel" label="爆款选题模型">
                  <Select showSearch allowClear optionFilterProp="label" options={modelOptions} placeholder={'留空=使用默认模型 ' + (defaultLlmModel || '(未配置)')} />
                </Form.Item>
                <Form.Item name="scriptModel" label="口播/营销文案模型">
                  <Select showSearch allowClear optionFilterProp="label" options={modelOptions} placeholder={'留空=使用默认模型 ' + (defaultLlmModel || '(未配置)')} />
                </Form.Item>
                <Form.Item name="rewriteModel" label="文案改写模型">
                  <Select showSearch allowClear optionFilterProp="label" options={modelOptions} placeholder={'留空=使用默认模型 ' + (defaultLlmModel || '(未配置)')} />
                </Form.Item>
                <Form.Item name="titleModel" label="标题/封面模型">
                  <Select showSearch allowClear optionFilterProp="label" options={modelOptions} placeholder={'留空=使用默认模型 ' + (defaultLlmModel || '(未配置)')} />
                </Form.Item>
                <Form.Item name="translateModel" label="翻译/双语字幕模型">
                  <Select showSearch allowClear optionFilterProp="label" options={modelOptions} placeholder={'留空=使用默认模型 ' + (defaultLlmModel || '(未配置)')} />
                </Form.Item>
                <Form.Item name="reviewModel" label="法务审核模型">
                  <Select showSearch allowClear optionFilterProp="label" options={modelOptions} placeholder={'留空=使用默认模型 ' + (defaultLlmModel || '(未配置)')} />
                </Form.Item>
              </div>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <RobotOutlined /> 火山声音克隆 / TTS（云端）
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <Form.Item name="volcanoApiKey" label="火山方舟统一 API Key" extra="声音克隆/数字人共用；若已填上方 LLM Key 可留空">
                  <Input.Password placeholder="火山方舟 API Key" autoComplete="new-password" allowClear />
                </Form.Item>
                <Form.Item name="voiceApiKey" label="语音技术 API Key（X-Api-Key）" extra="语音技术控制台获取（console.volcengine.com/speech），独立于方舟 Key">
                  <Input.Password placeholder="语音技术 API Key" autoComplete="new-password" allowClear />
                </Form.Item>
                <Form.Item name="voiceResourceId" label="TTS 资源 ID（X-Api-Resource-Id）">
                  <Select
                    options={[
                      { value: 'seed-icl-2.0', label: 'seed-icl-2.0（声音复刻大模型2.0，默认）' },
                      { value: 'seed-tts-2.0', label: 'seed-tts-2.0（语音合成大模型2.0）' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="voiceEndpoint" label="TTS 合成端点" extra="官方默认 https://openspeech.bytedance.com/api/v3/tts/unidirectional">
                  <Input placeholder="https://openspeech.bytedance.com/api/v3/tts/unidirectional" allowClear />
                </Form.Item>
                <Form.Item name="voiceCloneEndpoint" label="声音复刻端点" extra="官方默认 https://openspeech.bytedance.com/api/v3/tts/voice_clone">
                  <Input placeholder="https://openspeech.bytedance.com/api/v3/tts/voice_clone" allowClear />
                </Form.Item>

                <Form.Item name="voiceFormat" label="音频格式">
                  <Select
                    options={[
                      { value: 'mp3', label: 'mp3（默认）' },
                      { value: 'pcm', label: 'pcm' },
                      { value: 'ogg_opus', label: 'ogg_opus' },
                      { value: 'wav', label: 'wav' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="voiceSampleRate" label="采样率">
                  <Select
                    options={[
                      { value: 16000, label: '16000' },
                      { value: 24000, label: '24000（默认）' },
                      { value: 44100, label: '44100' },
                      { value: 48000, label: '48000' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="voiceEnableSubtitle" label="字幕时间戳" valuePropName="checked">
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
                <div style={{ marginBottom: 12 }}>
                  <Button
                    type="dashed"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => void handleTestCapability('tts')}
                    loading={testingCap.tts}
                    style={{ marginRight: 12 }}
                  >
                    测试 TTS 合成（需已填 Key+模型+speaker_id/参考音频）
                  </Button>
                  <Button
                    type="dashed"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => void handleTestCapability('clone')}
                    loading={testingCap.clone}
                  >
                    测试声音复刻（需参考音频 URL）
                  </Button>
                </div>

                <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                  <ThunderboltOutlined /> 积分定价（按档位扣费，替换固定 21 分）
                </div>
                <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <Form.Item name="baseCredits" label="任务基础积分" extra="每次任务固定扣费（文案/改写/标题/封面等 LLM 步骤）">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name={['dhTierV1', 'creditsCost']} label="数字人 V1 档积分（标准）">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name={['dhTierV2', 'creditsCost']} label="数字人 V2 档积分（高清）">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </div>

                <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                  <RobotOutlined /> V1 / V2 档位模型配对（用户前端选 V1/V2 用不同模型，扣不同积分）
                </div>
                <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <Form.Item name={['voiceTierV1', 'resourceId']} label="V1 资源 ID（X-Api-Resource-Id）">
                    <Select
                      options={[
                        { value: 'seed-icl-2.0', label: 'seed-icl-2.0（复刻音色）' },
                        { value: 'seed-tts-2.0', label: 'seed-tts-2.0（官方音色）' }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name={['voiceTierV1', 'model']} label="V1 模型（可选）" extra="如 seed-tts-2.0-standard，留空=服务端默认">
                    <Input placeholder="留空=服务端默认" allowClear />
                  </Form.Item>
                  <Form.Item name={['voiceTierV1', 'speakerId']} label="V1 档音色 ID" extra="从下方音色池选择，或手输火山控制台音色库 ID">
                    <Select showSearch allowClear optionFilterProp="label" options={voiceOptions} placeholder="音色库音色 ID" />
                  </Form.Item>
                  <Form.Item name={['voiceTierV1', 'refAudioUrl']} label="V1 参考音频 URL" extra="无 speakerId 时克隆用">
                    <Input placeholder="https://.../ref.mp3" allowClear />
                  </Form.Item>
                  <Form.Item name={['voiceTierV1', 'refAudioText']} label="V1 参考音频文本" extra="参考音频里说的内容（复刻质量关键）">
                    <Input placeholder="参考音频对应文本" allowClear />
                  </Form.Item>
                  <Form.Item name={['voiceTierV1', 'creditsCost']} label="V1 配音积分（标准档）">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name={['voiceTierV2', 'resourceId']} label="V2 资源 ID（X-Api-Resource-Id）">
                    <Select
                      options={[
                        { value: 'seed-icl-2.0', label: 'seed-icl-2.0（复刻音色）' },
                        { value: 'seed-tts-2.0', label: 'seed-tts-2.0（官方音色）' }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name={['voiceTierV2', 'model']} label="V2 模型（可选）">
                    <Input placeholder="留空=服务端默认" allowClear />
                  </Form.Item>
                  <Form.Item name={['voiceTierV2', 'speakerId']} label="V2 档音色 ID" extra="用户默认选 V2">
                    <Select showSearch allowClear optionFilterProp="label" options={voiceOptions} placeholder="音色库音色 ID" />
                  </Form.Item>
                  <Form.Item name={['voiceTierV2', 'refAudioUrl']} label="V2 参考音频 URL">
                    <Input placeholder="https://.../ref.mp3" allowClear />
                  </Form.Item>
                  <Form.Item name={['voiceTierV2', 'refAudioText']} label="V2 参考音频文本">
                    <Input placeholder="参考音频对应文本" allowClear />
                  </Form.Item>
                  <Form.Item name={['voiceTierV2', 'creditsCost']} label="V2 配音积分（高清档）">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </div>

                <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                  <ThunderboltOutlined /> 官方音色池（seed-tts-2.0 共 99 个官方音色，桌面端可选）
                </div>
                <Form.Item
                  name="voicePoolText"
                  label="音色池批量编辑"
                  extra="每行一条：speaker_id|名称（可选）|resourceId（可选，默认 seed-tts-2.0）。音色 ID 从火山控制台 > 音色库 复制。桌面端创建任务时下拉展示。"
                >
                  <Input.TextArea rows={6} placeholder={'zh_female_wanwan_moon_bigtts|湾湾\nzh_female_xiaobei_bigtts|小北\nzh_female_tianmei_bigtts|甜妹'} />
                </Form.Item>
                <Form.Item
                  name="voiceRefAudioUrl" label="默认参考音频 URL" extra={'用户未选“我的声音”时的兜底参考音频（克隆音色用）'}>
                  <Input placeholder="https://.../ref.mp3" allowClear />
                </Form.Item>
                <Form.Item name="voiceSpeakerId" label="已训练 speaker_id" extra="优先复用，跳过克隆直接合成">
                  <Input placeholder="留空=每次克隆" allowClear />
                </Form.Item>
              </div>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <UserOutlined /> 人设预设（IP 大脑 · 桌面端可点选）
              </div>
              <Form.Item
                name="personaPresetsText"
                label="人设预设批量编辑"
                extra="每行一条：label|value。label=展示名（如 老板型 IP），value=完整人设描述（点击后填入人设输入框）。留空=使用系统默认 5 组预设。"
              >
                <Input.TextArea rows={5} placeholder={'老板型 IP|老板型IP：有格局、敢说真话，讲经营/行业真相\n知识干货型|知识干货型IP：严谨专业，输出方法论与清单'} />
              </Form.Item>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <SoundOutlined /> BGM 库（背景音乐 · 桌面端创建任务可选）
              </div>
              <Form.Item
                name="bgmLibraryText"
                label="BGM 库批量编辑"
                extra="每行一条：name|url|category（可选）。url 为可直接下载的 mp3 公网地址或 /uploads/ 路径；桌面端选曲后叠加到成片。留空=无 BGM 库。"
              >
                <Input.TextArea rows={5} placeholder={'轻快卡点|https://example.com/bgm1.mp3|卡点\n温柔钢琴|https://example.com/bgm2.mp3|舒缓'} />
              </Form.Item>

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
                <Form.Item name="dhModelVersion" label="默认数字人模型版本" extra="用户任务未选清晰度时使用；用户可在创作任务中自选 V1/V2">
                  <Select
                    options={[
                      { value: 'V1', label: 'V1（标准版，快）' },
                      { value: 'V2', label: 'V2（高清版，更清晰）' }
                    ]}
                  />
                </Form.Item>
                <div style={{ marginBottom: 12 }}>
                  <Button
                    type="dashed"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => void handleTestCapability('dh')}
                    loading={testingCap.dh}
                  >
                    测试数字人服务（探测提交接口连通性）
                  </Button>
                </div>
              </div>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <ThunderboltOutlined /> HeyGen 数字人（M4+ · 替换火山，需公网音频 URL）
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <Form.Item name="heygenApiKey" label="HeyGen API Key（X-Api-Key）" extra="https://app.heygen.com/settings 获取（需开通 API 套餐）">
                  <Input.Password placeholder="HeyGen API Key" autoComplete="new-password" allowClear />
                </Form.Item>
                <Form.Item name="heygenEndpoint" label="HeyGen API 端点" extra="官方默认 https://api.heygen.com">
                  <Input placeholder="https://api.heygen.com" allowClear />
                </Form.Item>
                <Form.Item name="heygenQuality" label="HeyGen 生成质量" extra="1080=高清（默认）；720=标清（更省配额）">
                  <Select
                    options={[
                      { value: '1080', label: '1080（高清，默认）' },
                      { value: '720', label: '720（标清，更省配额）' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="heygenDefaultAvatarId" label="HeyGen 默认预置形象 ID" extra="用户未选“我的形象”时的兜底形象（桌面端可从形象列表选择后保存）">
                  <Input placeholder="预置形象 ID（如 60ee9467c5d9854f4a19d2ba）" allowClear />
                </Form.Item>
                <div style={{ marginBottom: 12 }}>
                  <Button
                    type="dashed"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => void handleTestCapability('heygen')}
                    loading={testingCap.heygen}
                  >
                    测试 HeyGen 服务（拉取形象列表验证 Key）
                  </Button>
                </div>
              </div>

              <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                <RobotOutlined /> 语音识别 / 向量检索
              </div>
              <div className={styles.levelGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <Form.Item name="sttProvider" label="语音识别引擎" extra="dashscope=百炼 paraformer(推荐，复用现有百炼key)；openai=whisper；volcano=火山">
                  <Select
                    options={[
                      { value: 'dashscope', label: '阿里百炼 paraformer（推荐）' },
                      { value: 'openai', label: 'OpenAI whisper（需填端点+Key）' },
                      { value: 'volcano', label: '火山 ASR（需火山识别资源）' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="sttModel" label="语音识别模型" extra="dashscope 留空=paraformer-v2；openai 留空=whisper-1">
                  <Input placeholder="如 paraformer-v2 / whisper-1" allowClear />
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
                <Form.Item name="sttFileBase" label="公网音频前缀(百炼用)" extra="选 dashscope 时必须填，如 https://zt.shentongapi.cn">
                  <Input placeholder="https://zt.shentongapi.cn" allowClear />
                </Form.Item>
                <Form.Item name="embeddingEndpoint" label="Embedding 端点" extra="留空=按供应商默认">
                  <Input placeholder="如 https://ark.cn-beijing.volces.com/api/v3" allowClear />
                </Form.Item>
                <Form.Item name="embeddingApiKey" label="Embedding API Key" extra="留空=用上方 LLM/火山 API Key 兜底">
                  <Input.Password placeholder="请输入向量检索密钥" allowClear />
                </Form.Item>
                <div style={{ marginBottom: 12 }}>
                  <Button
                    type="dashed"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => void handleTestCapability('stt')}
                    loading={testingCap.stt}
                    style={{ marginRight: 12 }}
                  >
                    测试语音识别
                  </Button>
                  <Button
                    type="dashed"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => void handleTestCapability('embedding')}
                    loading={testingCap.embedding}
                  >
                    测试向量检索
                  </Button>
                </div>
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

            <div className={styles.sectionTitle} style={{ marginTop: 24 }}>
              <PictureOutlined /> 视频模板（样式）管理
            </div>
            <div style={{ color: '#8b949e', fontSize: 13, marginBottom: 12 }}>
              模板 = 视频呈现样式（背景 / 标题 / 字幕样式），与「封面设计」是两回事。内置 t1-t10 自动生成预览图；可粘贴模板 JSON 上传自定义模板，桌面端选择模板时展示预览。
            </div>
            <div style={{ marginBottom: 12 }}>
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => setTemplateModalOpen(true)}>
                上传自定义模板
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => void loadTemplates()} loading={templatesLoading} style={{ marginLeft: 8 }}>
                刷新模板
              </Button>
            </div>
            {templatesLoading ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Spin />
              </div>
            ) : templates.length === 0 ? (
              <Empty description="暂无模板" />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {templates.map((t) => {
                  const builtin = Number(t.template_id.replace(/^t/, '')) <= 10
                  return (
                    <div key={t.template_id} style={{ width: 132 }}>
                      <div style={{ position: 'relative' }}>
                        {t.cover_image_url ? (
                          <img
                            src={resolveAdminMediaUrl(t.cover_image_url)}
                            alt={t.name}
                            style={{
                              width: '100%',
                              aspectRatio: '9 / 16',
                              objectFit: 'cover',
                              borderRadius: 8,
                              border: '1px solid rgba(0,0,0,0.08)',
                              display: 'block'
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              aspectRatio: '9 / 16',
                              borderRadius: 8,
                              background: '#f5f6f8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#999',
                              fontSize: 12
                            }}
                          >
                            无预览
                          </div>
                        )}
                        {!builtin && (
                          <Popconfirm
                            title={`确认删除模板「${t.name}」?`}
                            onConfirm={() => void handleDeleteTemplate(t.template_id)}
                            okText="删除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                          >
                            <Button
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              style={{ position: 'absolute', top: 4, right: 4 }}
                            />
                          </Popconfirm>
                        )}
                      </div>
                      <div
                        style={{ fontSize: 13, fontWeight: 600, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={t.name}
                      >
                        {t.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#8b949e' }}>
                        {t.template_id} · {t.width}x{t.height} · {t.duration}s{builtin ? ' · 内置' : ' · 自定义'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <Modal
              title="上传自定义视频模板"
              open={templateModalOpen}
              onCancel={() => setTemplateModalOpen(false)}
              onOk={() => void handleCreateTemplate()}
              okText="上传"
              cancelText="取消"
              confirmLoading={templateSaving}
              width={720}
            >
              <p style={{ marginTop: 0, color: '#8b949e', fontSize: 13 }}>
                粘贴模板 JSON（参考内置模板结构：global_elements.h1/h2、subtitle_config、project_settings 等），可选填封面图片 URL。上传后自动分配 t11 及以上编号。
              </p>
              <Input.TextArea
                value={templateJson}
                onChange={(e) => setTemplateJson(e.target.value)}
                placeholder={'{\n  "name": "我的模板",\n  "global_elements": { ... },\n  "subtitle_config": { ... },\n  "project_settings": { "width": 1080, "height": 1920, "duration": 15 }\n}'}
                autoSize={{ minRows: 12, maxRows: 18 }}
              />
              <Input
                value={templateCoverUrl}
                onChange={(e) => setTemplateCoverUrl(e.target.value)}
                placeholder="封面图片 URL（可选）"
                style={{ marginTop: 12 }}
                allowClear
              />
            </Modal>
          </Card>

          <Card className={styles.card} bordered={false} style={{ marginTop: 16 }}>
            <div className={styles.sectionTitle}>
              <ThunderboltOutlined /> 发布平台开关
            </div>
            <div style={{ color: '#8b949e', fontSize: 13, marginBottom: 12 }}>
              只控制平台是否开放给用户扫码绑定；账号绑定在桌面端完成。
            </div>
            <Table<PublishPlatformItem>
              rowKey="platform"
              dataSource={publishPlatforms}
              pagination={false}
              size="middle"
              columns={[
                {
                  title: '平台',
                  dataIndex: 'platform',
                  width: 150,
                  render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>
                },
                {
                  title: '显示名',
                  dataIndex: 'displayName',
                  render: (v: string, record: PublishPlatformItem) => (
                    <Input
                      value={v}
                      maxLength={32}
                      onChange={(e) => updatePublishPlatform(record.platform, { displayName: e.target.value })}
                    />
                  )
                },
                {
                  title: '排序',
                  dataIndex: 'sortOrder',
                  width: 110,
                  render: (v: number, record: PublishPlatformItem) => (
                    <InputNumber
                      min={1}
                      max={99}
                      value={v}
                      onChange={(val) => updatePublishPlatform(record.platform, { sortOrder: val ?? 1 })}
                      style={{ width: '100%' }}
                    />
                  )
                },
                {
                  title: '启用',
                  dataIndex: 'enabled',
                  width: 100,
                  render: (v: boolean, record: PublishPlatformItem) => (
                    <Switch
                      checked={v}
                      checkedChildren="开"
                      unCheckedChildren="关"
                      onChange={(checked) => updatePublishPlatform(record.platform, { enabled: checked })}
                    />
                  )
                },
                {
                  title: '备注',
                  dataIndex: 'remark',
                  render: (v?: string | null) => v || '—'
                }
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => void handleSavePublishPlatforms()}
                loading={publishSaving}
                className={styles.primaryBtn}
              >
                保存发布平台开关
              </Button>
            </div>
          </Card>
          </>
        )}
      </Spin>
    </div>
  )
}
