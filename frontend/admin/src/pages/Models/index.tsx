// 大模型配置管理页 (v0.11.0 按原型重构)
//
// 界面结构（与用户确认的原型一致）：
//   顶部：标题「模型管理」 + 右侧【🔑 凭据管理】【＋ 添加模型】
//   Tab：文案模型 | 图片模型 | 视频模型 | 语音模型（按输出大类过滤，复用后端 modelType 查询）
//   表格：模型ID / 显示名 / 场景标签 / 积分 / 状态 / 操作（测试·编辑·删除）
//   底部提示：各类模型的积分单位
//
// 添加模型 -> AddModelModal（单模型向导：选/新建凭据 -> 模型类型 -> 调用模式 -> 参数与积分）
// 凭据管理 -> 右侧抽屉：凭据列表 + 测试/读取模型/编辑/删除 + 新建凭据（ProviderImportModal 向导）
//
// API（复用后端，未改动）：
//   GET/PATCH/DELETE /admin/models, POST /admin/models/:id/{enable,disable,test}
//   GET/POST/PATCH/DELETE /admin/models/providers, POST /admin/models/providers/test
//   POST /admin/models/providers/:id/{fetch-models,import}
//   GET /admin/models/market/vendors（厂商模板）

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tabs,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ShopOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import {
  disableAdminModel,
  enableAdminModel,
  fetchCallModesMeta,
  fetchMarketVendors,
  listAdminModels,
  listAdminProviders,
  removeAdminModel,
  removeAdminProvider,
  testAdminProvider,
  testModel,
  updateAdminModel,
  updateAdminProvider
} from '@/api/admin-model-api'
import ProviderImportModal from './ProviderImportModal'
import AddModelModal from './components/AddModelModal'
import CallModePicker from './components/CallModePicker'
import DynamicSpecForm from './components/DynamicSpecForm'
import ScenarioTagPicker from './components/ScenarioTagPicker'
import PricingConfigForm from './components/PricingConfigForm'
import type {
  AdminModelItem,
  AdminProviderItem,
  ConnectionStatus,
  UpdateAdminModelDto,
  UpdateProviderDto,
  CallModeKey,
  CallModesMeta,
  MarketVendor
} from '@/types/admin-model'
import {
  ADVANCED_CAP_OPTIONS,
  INPUT_TYPE_OPTIONS,
  MODEL_TYPE_LABEL,
  deriveModelType,
  inputTypesFromModelType,
  type AdvancedCapability,
  type ModelInputType,
  type ModelOutputType
} from '@/utils/model-type'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

type CatKey = 'text' | 'image' | 'video' | 'voice'

const CATEGORY_TABS: Array<{ key: CatKey; label: string; sub: string; modelTypes: string }> = [
  {
    key: 'text',
    label: '文案模型',
    sub: '对话/翻译/OCR/向量等文本输出',
    modelTypes: 'chat,vision,embedding,rerank,reasoning'
  },
  {
    key: 'image',
    label: '图片模型',
    sub: '文生图 / 图生图 / 局部重绘 / 虚拟试衣 / 创意海报',
    modelTypes: 'image,image_edit'
  },
  { key: 'video', label: '视频模型', sub: '文生视频 / 图生视频', modelTypes: 'video' },
  { key: 'voice', label: '语音模型', sub: '识别 / 合成 / 转语音', modelTypes: 'tts,stt,audio' }
]

const PRICE_HINTS: Record<CatKey, string> = {
  text: '文案：输入/输出积分 · 千token',
  image: '图片：x积分/张',
  video: '视频：x积分/秒（按分辨率自动跳档）',
  voice: '语音：x积分/次 或 x积分/分钟'
}

const CONNECTION_TAG: Record<string, { color: string; text: string }> = {
  untested: { color: 'default', text: '未测试' },
  connected: { color: 'green', text: '已连接' },
  failed: { color: 'red', text: '连接失败' }
}

const ENABLED_OPTIONS = [
  { label: '全部', value: '' },
  { label: '已上架', value: 'true' },
  { label: '已下架', value: 'false' }
]

const MODEL_TYPE_COLOR: Record<string, string> = {
  chat: 'geekblue',
  vision: 'cyan',
  image: 'green',
  image_edit: 'lime',
  video: 'purple',
  tts: 'orange',
  reasoning: 'magenta',
  embedding: 'cyan',
  audio: 'gold'
}

/** 模型编辑表单值（调用模式驱动） */
interface ModelFormValues {
  displayName: string
  upstreamModelId?: string
  apiEndpoint?: string
  inputTypes: ModelInputType[]
  advancedCapabilities: AdvancedCapability[]
  inputPricePerToken?: number
  outputPricePerToken?: number
  enabled: boolean
  sortOrder?: number
  pricePerImage?: number
  pricePerCall?: number
  generationParamsText?: string
  /** 请求体模板 JSON（存 generationParams.request_template / image_request_template） */
  requestTemplateText?: string
  callMode?: string
  scenarioTags?: string[]
  specs?: Record<string, unknown>
  videoPerSecondList?: Array<{ resolution: string; rate: number }>
  remark?: string
  costPrice?: number
  pricingMode?: string
  pricePerMinute?: number
}

/** 按模型类型格式化积分展示（与用户端选择框口径一致） */
function formatPrice(m: AdminModelItem): string {
  const t = (m.modelType || 'chat').toLowerCase()
  if (m.pricingMode === 'per_image') return `${m.pricePerImage ?? 0} 积分/张`
  if (m.pricingMode === 'per_call') return `按次 ${m.pricePerCall ?? 0} 积分`
  if (m.pricingMode === 'per_minute') return `按分钟 ${m.pricePerMinute ?? 0} 积分`
  if (m.pricingMode === 'per_second') {
    const vps = m.videoPerSecond
    if (vps && Object.keys(vps).length) {
      return Object.entries(vps)
        .map(([k, v]) => `${k} ${v} 积分/秒`)
        .join(' · ')
    }
    return '积分待设'
  }
  if (t === 'image' || t === 'image_edit') return `${m.pricePerImage ?? 0} 积分/张`
  if (t === 'video') {
    const vps = m.videoPerSecond
    if (vps && Object.keys(vps).length) {
      return Object.entries(vps)
        .map(([k, v]) => `${k} ${v} 积分/秒`)
        .join(' · ')
    }
    return '积分待设'
  }
  if (t === 'tts' || t === 'audio' || t === 'music') {
    const parts: string[] = []
    if (m.pricePerCall != null) parts.push(`按次 ${m.pricePerCall} 积分`)
    if (m.pricePerMinute != null) parts.push(`按分钟 ${m.pricePerMinute} 积分`)
    return parts.length ? parts.join(' · ') : '积分待设'
  }
  return `输入 ${m.inputPricePerToken ?? 0} / 输出 ${m.outputPricePerToken ?? 0} · 千token`
}

export default function AdminModels() {
  // ----- 分类 Tab（文案/图片/视频/语音）-----
  const [activeCat, setActiveCat] = useState<CatKey>('text')
  const activeDef = CATEGORY_TABS.find((c) => c.key === activeCat) ?? CATEGORY_TABS[0]

  // ----- 模型列表 -----
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminModelItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [enabledFilter, setEnabledFilter] = useState<'' | 'true' | 'false'>('')
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testRefImage, setTestRefImage] = useState('')
  const [pendingTestItem, setPendingTestItem] = useState<AdminModelItem | null>(null)

  // ----- 凭据（供应商）-----
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [providers, setProviders] = useState<AdminProviderItem[]>([])
  const [providerLoading, setProviderLoading] = useState(false)
  const [editProvider, setEditProvider] = useState<AdminProviderItem | null>(null)
  const [providerForm] = Form.useForm()
  const [providerSaving, setProviderSaving] = useState(false)
  const [providerTestingId, setProviderTestingId] = useState<number | null>(null)
  const [vendorList, setVendorList] = useState<MarketVendor[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [importProvider, setImportProvider] = useState<AdminProviderItem | null>(null)

  // ----- 模型编辑 -----
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminModelItem | null>(null)
  const [form] = Form.useForm<ModelFormValues>()
  const [meta, setMeta] = useState<CallModesMeta>()
  const [saving, setSaving] = useState(false)
  const callMode = Form.useWatch('callMode', form)
  const callModeDef = useMemo(
    () => meta?.callModes.find((m) => m.key === callMode),
    [meta, callMode]
  )
  const derivedType = useMemo(() => {
    if (!callModeDef) return 'chat'
    return deriveModelType(callModeDef.output, callModeDef.inputs)
  }, [callModeDef])

  // ----- 添加模型 -----
  const [addModelOpen, setAddModelOpen] = useState(false)
  const [testingModelId, setTestingModelId] = useState<number | null>(null)

  const loadProviders = useCallback(async () => {
    setProviderLoading(true)
    try {
      const list = await listAdminProviders()
      setProviders(list || [])
    } catch (err: any) {
      message.error('加载凭据列表失败: ' + (err?.message || ''))
    } finally {
      setProviderLoading(false)
    }
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = {
        page,
        pageSize: PAGE_SIZE,
        modelType: activeDef.modelTypes
      }
      if (enabledFilter) query.enabled = enabledFilter === 'true'
      if (searchKeyword) query.keyword = searchKeyword
      const result = await listAdminModels(query)
      const r = result as AdminPaginatedResult<AdminModelItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AdminModels] load failed:', err)
      message.error('加载模型列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, activeDef.modelTypes, enabledFilter, searchKeyword])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  useEffect(() => {
    fetchCallModesMeta().then(setMeta).catch(() => undefined)
    fetchMarketVendors().then(setVendorList).catch(() => undefined)
  }, [])

  const handleCatChange = (key: string) => {
    setActiveCat(key as CatKey)
    setPage(1)
  }

  const handleReset = () => {
    setEnabledFilter('')
    setKeyword('')
    setSearchKeyword('')
    setPage(1)
  }

  // ----- 模型编辑 -----
  const openEdit = (item: AdminModelItem) => {
    setEditing(item)
    const gen = item.generationParams || {}
    const specSchemas = meta?.specFieldSchemas ?? {}
    const specsBackfill: Record<string, unknown> = {}
    if (item.specs && typeof item.specs === 'object') {
      for (const [k, v] of Object.entries(item.specs)) {
        specsBackfill[k] =
          specSchemas[k]?.type === 'json' && typeof v !== 'string' ? JSON.stringify(v) : v
      }
    }
    let videoPerSecondList: Array<{ resolution: string; rate: number }> | undefined
    if (item.videoPerSecond && typeof item.videoPerSecond === 'object') {
      videoPerSecondList = Object.entries(item.videoPerSecond).map(([resolution, rate]) => ({
        resolution,
        rate
      }))
    }
    const editCallModeDef = meta?.callModes.find((m) => m.key === item.callMode)
    form.setFieldsValue({
      displayName: item.displayName,
      upstreamModelId: item.upstreamModelId ?? undefined,
      apiEndpoint: item.apiEndpoint ?? undefined,
      inputTypes:
        item.inputTypes && item.inputTypes.length
          ? item.inputTypes
          : (editCallModeDef?.inputs ?? inputTypesFromModelType(item.modelType)),
      advancedCapabilities: item.advancedCapabilities ?? [],
      inputPricePerToken: item.inputPricePerToken ?? 0,
      outputPricePerToken: item.outputPricePerToken ?? 0,
      enabled: item.enabled,
      sortOrder: item.sortOrder ?? 0,
      pricePerImage: item.pricePerImage ?? undefined,
      pricePerCall: item.pricePerCall ?? undefined,
      generationParamsText: Object.keys(gen).length ? JSON.stringify(gen, null, 2) : undefined,
      requestTemplateText:
        typeof gen.image_request_template === 'object' && gen.image_request_template
          ? JSON.stringify(gen.image_request_template, null, 2)
          : typeof gen.request_template === 'object' && gen.request_template
            ? JSON.stringify(gen.request_template, null, 2)
            : undefined,
      callMode: item.callMode ?? 'text_chat',
      scenarioTags: item.scenarioTags ?? [],
      videoPerSecondList,
      remark: item.remark ?? undefined,
      costPrice: item.costPrice ?? undefined,
      pricingMode: item.pricingMode ?? editCallModeDef?.recommendedBilling,
      pricePerMinute: item.pricePerMinute ?? undefined
    })
    form.setFieldValue('specs', specsBackfill ?? {})
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      if (!editing) return
      if (!meta) {
        message.warning('模型配置元数据加载中，请稍后再试')
        return
      }
      setSaving(true)
      const def = callModeDef
      if (!def) {
        message.warning('请选择调用模式')
        return
      }
      const dto: UpdateAdminModelDto = {
        displayName: values.displayName,
        ...(values.upstreamModelId && values.upstreamModelId.trim()
          ? { upstreamModelId: values.upstreamModelId.trim() }
          : {}),
        ...(values.apiEndpoint && values.apiEndpoint.trim()
          ? { apiEndpoint: values.apiEndpoint.trim() }
          : {}),
        outputType: def.output,
        inputTypes: values.inputTypes && values.inputTypes.length ? values.inputTypes : def.inputs,
        advancedCapabilities: values.advancedCapabilities ?? [],
        enabled: values.enabled,
        sortOrder: values.sortOrder ?? 0
      }
      const pricingMode = values.pricingMode
      if (pricingMode === 'per_image') {
        if (values.pricePerImage != null) dto.pricePerImage = values.pricePerImage
      } else if (pricingMode === 'per_call') {
        if (values.pricePerCall != null) dto.pricePerCall = values.pricePerCall
      } else if (pricingMode === 'per_minute') {
        if (values.pricePerMinute != null) dto.pricePerMinute = values.pricePerMinute
      } else if (pricingMode === 'per_second') {
        // videoPerSecond 由下方 videoPerSecondList 写入
      } else {
        if (values.inputPricePerToken != null) dto.inputPricePerToken = values.inputPricePerToken
        if (values.outputPricePerToken != null) dto.outputPricePerToken = values.outputPricePerToken
      }
      if (values.generationParamsText?.trim()) {
        try {
          dto.generationParams = JSON.parse(values.generationParamsText) as Record<string, unknown>
        } catch {
          message.error('高级参数 JSON 格式错误')
          return
        }
      }
      // 请求体模板：图片类写 image_request_template，其余写 request_template；清空则删除
      if (values.requestTemplateText?.trim()) {
        try {
          const tpl = JSON.parse(values.requestTemplateText) as Record<string, unknown>
          if (!dto.generationParams) dto.generationParams = {}
          if (def.key === 'image' || def.key === 'image_edit') {
            dto.generationParams.image_request_template = tpl
          } else {
            dto.generationParams.request_template = tpl
          }
        } catch {
          message.error('请求体模板 JSON 格式错误')
          return
        }
      } else if (dto.generationParams) {
        delete dto.generationParams.image_request_template
        delete dto.generationParams.request_template
      }
      dto.callMode = values.callMode as CallModeKey
      if (values.scenarioTags && values.scenarioTags.length) dto.scenarioTags = values.scenarioTags
      if (values.pricingMode) dto.pricingMode = values.pricingMode
      if (values.costPrice != null) dto.costPrice = values.costPrice
      if (values.remark != null) dto.remark = values.remark
      if (values.pricePerMinute != null) dto.pricePerMinute = values.pricePerMinute
      if (values.specs) {
        const specKeys = callModeDef?.specFields ?? []
        const specs = { ...values.specs }
        for (const k of Object.keys(specs)) {
          if (!specKeys.includes(k)) delete specs[k]
        }
        for (const f of specKeys) {
          const schema = meta?.specFieldSchemas[f]
          if (schema?.type === 'json' && typeof specs[f] === 'string') {
            try {
              specs[f] = JSON.parse(specs[f] as string)
            } catch {
              message.error('规格字段「' + schema.label + '」JSON 格式错误')
              return
            }
          }
        }
        dto.specs = specs
      }
      if (values.videoPerSecondList && values.videoPerSecondList.length) {
        dto.videoPerSecond = Object.fromEntries(
          values.videoPerSecondList.map((row) => [row.resolution, row.rate])
        )
      }
      await updateAdminModel(editing.id, dto)
      message.success('模型已更新')
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminModels] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleEnabled = async (item: AdminModelItem, checked: boolean) => {
    try {
      if (checked) {
        await enableAdminModel(item.id)
      } else {
        await disableAdminModel(item.id)
      }
      message.success(checked ? '已上架' : '已下架')
      setItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, enabled: checked } : m))
      )
    } catch (err) {
      console.error('[AdminModels] toggle failed:', err)
      message.error('操作失败')
    }
  }

  const handleDelete = async (item: AdminModelItem) => {
    try {
      await removeAdminModel(item.id)
      message.success('模型已删除')
      void loadList()
      void loadProviders()
    } catch (err: any) {
      message.error('删除失败: ' + (err?.message || ''))
    }
  }

  const handleTestModel = async (item: AdminModelItem, refImageUrl?: string) => {
    setTestingModelId(item.id)
    try {
      const result = await testModel(item.id, 'Hello', refImageUrl)
      message.success('测试通过: ' + (result.response || '').slice(0, 60))
      setItems((prev) =>
        prev.map((m) =>
          m.id === item.id
            ? { ...m, connectionStatus: 'connected' as ConnectionStatus }
            : m
        )
      )
    } catch (err: any) {
      console.error('[AdminModels] test failed:', err)
      message.error('测试失败: ' + (err?.message || ''))
      setItems((prev) =>
        prev.map((m) =>
          m.id === item.id ? { ...m, connectionStatus: 'failed' as ConnectionStatus } : m
        )
      )
    } finally {
      setTestingModelId(null)
    }
  }

  /** 图生图 / 图生视频(i2v) 模型测试需参考图 URL；其他模型直接测试 */
  const isI2vVideo = (item: AdminModelItem) =>
    (item.callMode === 'video' || item.callMode === 'video_edit') &&
    (item.generationParams as Record<string, unknown> | undefined)?.i2v === true

  const onClickTest = (item: AdminModelItem) => {
    const needsRefImage =
      item.callMode === 'image_edit' ||
      item.modelType === 'image_edit' ||
      isI2vVideo(item)
    if (needsRefImage) {
      setPendingTestItem(item)
      setTestRefImage('')
      setTestModalOpen(true)
      return
    }
    void handleTestModel(item)
  }

  const columns: TableColumnsType<AdminModelItem> = [
    {
      title: '模型 ID',
      key: 'modelId',
      width: 260,
      render: (_, m) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.modelId}</div>
          <div style={{ fontSize: 12, color: '#8b949e' }}>
            {m.providerName || m.provider}
            {m.upstreamModelId && m.upstreamModelId !== m.modelId
              ? ` · 上游 ${m.upstreamModelId}`
              : ''}
          </div>
        </div>
      )
    },
    { title: '显示名', dataIndex: 'displayName', key: 'displayName', width: 180 },
    {
      title: '场景标签',
      key: 'scenarioTags',
      width: 220,
      render: (_, m) => {
        const tags = m.scenarioTags ?? []
        return tags.length ? (
          <Space size={4} wrap>
            {tags.map((t) => (
              <Tag key={t} color="geekblue" style={{ marginRight: 0 }}>
                {t}
              </Tag>
            ))}
          </Space>
        ) : (
          <span style={{ color: '#8b949e' }}>—</span>
        )
      }
    },
    {
      title: '积分',
      key: 'price',
      width: 200,
      render: (_, m) => <span style={{ color: '#c7d2fe' }}>{formatPrice(m)}</span>
    },
    {
      title: '状态',
      key: 'enabled',
      width: 90,
      render: (_, m) => (
        <Switch
          checked={m.enabled}
          onChange={(v) => void handleToggleEnabled(m, v)}
          checkedChildren="上架"
          unCheckedChildren="下架"
        />
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 190,
      fixed: 'right',
      render: (_, m) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={testingModelId === m.id}
            onClick={() => onClickTest(m)}
          >
            测试
          </Button>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(m)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该模型？"
            onConfirm={() => void handleDelete(m)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  // ----- 凭据操作 -----
  const handleTestProvider = async (p: AdminProviderItem) => {
    setProviderTestingId(p.id)
    try {
      const r = await testAdminProvider({ providerId: p.id })
      message.success('连接成功: ' + (r.response || '').slice(0, 60))
    } catch (err: any) {
      message.error('连接失败: ' + (err?.message || ''))
    } finally {
      setProviderTestingId(null)
      void loadProviders()
    }
  }

  const handleDeleteProvider = async (p: AdminProviderItem) => {
    try {
      await removeAdminProvider(p.id)
      message.success('凭据已删除')
      void loadProviders()
    } catch (err: any) {
      message.error('删除失败: ' + (err?.message || ''))
    }
  }

  const openEditProvider = (p: AdminProviderItem) => {
    setEditProvider(p)
    const cfg = (p.config ?? {}) as Record<string, unknown>
    providerForm.setFieldsValue({
      name: p.name,
      baseUrl: p.baseUrl,
      status: p.status,
      isGlobal: p.isGlobal === true,
      vendorKey: typeof cfg.vendorKey === 'string' ? cfg.vendorKey : undefined,
      chatPath: cfg.chatPath ? String(cfg.chatPath) : undefined,
      modelsPath: cfg.modelsPath ? String(cfg.modelsPath) : undefined
    })
  }

  const handleSaveProvider = async () => {
    if (!editProvider) return
    try {
      const values = await providerForm.validateFields()
      setProviderSaving(true)
      const dto: UpdateProviderDto = {
        name: values.name,
        baseUrl: values.baseUrl,
        status: values.status,
        isGlobal: values.isGlobal === true
      }
      if (values.apiKey && String(values.apiKey).trim()) dto.apiKey = String(values.apiKey).trim()
      const vendor = vendorList.find((v) => v.vendor === values.vendorKey)
      const cfg = (editProvider.config ?? {}) as Record<string, unknown>
      const nextConfig: Record<string, unknown> = { ...cfg }
      if (vendor) {
        nextConfig.vendorKey = vendor.vendor
        nextConfig.chatPath = vendor.chatPath
        nextConfig.modelsPath = vendor.modelsPath
        nextConfig.generation = vendor.generation
      } else {
        const chatPath = values.chatPath != null ? String(values.chatPath).trim() : ''
        const modelsPath = values.modelsPath != null ? String(values.modelsPath).trim() : ''
        if (chatPath) nextConfig.chatPath = chatPath
        if (modelsPath) nextConfig.modelsPath = modelsPath
      }
      if (Object.keys(nextConfig).length > 0) dto.config = nextConfig
      await updateAdminProvider(editProvider.id, dto)
      message.success('凭据已更新')
      setEditProvider(null)
      void loadProviders()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('保存失败')
    } finally {
      setProviderSaving(false)
    }
  }

  const openAddCredential = () => {
    setImportProvider(null)
    setImportOpen(true)
  }

  const openReadModels = (p: AdminProviderItem) => {
    setImportProvider(p)
    setImportOpen(true)
  }

  const refreshAll = () => {
    void loadList()
    void loadProviders()
  }

  const addInitialOutput: ModelOutputType =
    activeCat === 'image'
      ? 'image'
      : activeCat === 'video'
        ? 'video'
        : activeCat === 'voice'
          ? 'audio'
          : 'text'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ApiOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>模型管理</h1>
            <p className={styles.subtitle}>
              按 文案 / 图片 / 视频 / 语音 四大类管理模型；一个凭据（供应商）一个 API Key 可挂多类模型，图片/视频生成地址由厂商模板自动匹配
            </p>
          </div>
        </div>
        <Space>
          <Button className={styles.ghostBtn} icon={<KeyOutlined />} onClick={() => setDrawerOpen(true)}>
            🔑 凭据管理
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<PlusOutlined />}
            onClick={() => setAddModelOpen(true)}
          >
            ＋ 添加模型
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={activeCat}
        onChange={handleCatChange}
        items={CATEGORY_TABS.map((c) => ({ key: c.key, label: c.label }))}
        tabBarExtraContent={
          <span style={{ color: 'var(--color-text-tertiary, #8b949e)', fontSize: 13 }}>
            {activeDef.sub} · 共 {total} 个模型
          </span>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="上架状态"
            value={enabledFilter}
            onChange={(v) => setEnabledFilter((v ?? '') as '' | 'true' | 'false')}
            className={styles.filterSelect}
            allowClear
            options={ENABLED_OPTIONS}
          />
          <Input.Search
            placeholder="搜索模型 ID / 名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => {
              setSearchKeyword(v)
              setPage(1)
            }}
            className={styles.searchBox}
            allowClear
          />
        </div>
        <Button type="primary" className={styles.primaryBtn} onClick={handleReset}>
          重置
        </Button>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty
            description="暂无该分类模型：可点右上角「＋ 添加模型」逐个添加，或在「🔑 凭据管理」新建凭据后「读取模型」批量导入"
            style={{ marginTop: 80 }}
          />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminModelItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1150 }}
            />
          </div>
        )}
        <div className={styles.paginationWrap}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={(p) => setPage(p)}
            showSizeChanger={false}
            showTotal={(t) => `共 ${t} 条`}
          />
        </div>
      </Spin>

      <div
        style={{
          marginTop: 16,
          padding: '10px 14px',
          border: '1px dashed rgba(128,128,128,.35)',
          borderRadius: 8,
          fontSize: 12,
          color: '#8b949e'
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <b>用户端选择框显示原则：</b>模型ID＋场景标签＋积分
        </div>
        <div>{PRICE_HINTS[activeCat]}</div>
      </div>

      {/* 编辑模型（调用模式驱动：类型/规格/计费按 14 种调用模式动态） */}
      <Modal
        title={editing ? `编辑模型 - ${editing.displayName}` : '编辑模型'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={720}
      >
        <Form<ModelFormValues> form={form} layout="vertical">
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item
            name="upstreamModelId"
            label="上游模型 ID"
            extra="真实发给上游 API 的 model 字段，如 qwen-plus / wanx2.1-t2i-turbo / qwen-video-plus"
          >
            <Input maxLength={128} placeholder="上游真实模型名" />
          </Form.Item>
          <Form.Item
            name="apiEndpoint"
            label="接口地址 (可选)"
            extra="模型级端点覆盖；留空用供应商 Base URL + 生成适配路径"
          >
            <Input maxLength={512} placeholder="https://... 或 /api/v1/services/..." />
          </Form.Item>
          <Form.Item name="callMode" label="调用模式（14 种总开关）" initialValue="text_chat">
            <CallModePicker
              callModes={meta?.callModes ?? []}
              onChange={(key) => {
                const def = meta?.callModes.find((m) => m.key === key)
                if (!def) return
                form.setFieldsValue({
                  pricingMode: def.recommendedBilling,
                  inputTypes: def.inputs,
                  advancedCapabilities: (def.advancedCaps as AdvancedCapability[]) ?? []
                })
                for (const name of [
                  'inputPricePerToken',
                  'outputPricePerToken',
                  'pricePerImage',
                  'pricePerCall',
                  'pricePerMinute'
                ]) {
                  form.setFieldValue(name, undefined)
                }
              }}
            />
          </Form.Item>
          {callModeDef && (
            <div style={{ marginBottom: 14 }}>
              <Space wrap size={6}>
                <Tag color={MODEL_TYPE_COLOR[derivedType] || 'default'}>
                  类型标签：{MODEL_TYPE_LABEL[derivedType] || derivedType}
                </Tag>
                <Tag color="blue">输出 {callModeDef.output}</Tag>
                <Tag color="cyan">默认输入 {callModeDef.inputs.join('+')}</Tag>
              </Space>
            </div>
          )}
          <Form.Item
            name="inputTypes"
            label="能力标签（输入类型，可调整）"
            extra="模型能识别的输入：文字 / 图片 / 视频 / 语音"
          >
            <Select mode="multiple" options={INPUT_TYPE_OPTIONS} placeholder="选择模型支持的输入类型" />
          </Form.Item>
          <Form.Item name="advancedCapabilities" label="高级能力（多选）">
            <Select mode="multiple" options={ADVANCED_CAP_OPTIONS} placeholder="函数调用 / 流式 / 推理 等" />
          </Form.Item>
          {callModeDef && (
            <Form.Item label="参数配置（按类型动态）">
              <DynamicSpecForm specFields={callModeDef.specFields} schemas={meta?.specFieldSchemas ?? {}} />
            </Form.Item>
          )}
          <Form.Item name="scenarioTags" label="场景标签（用户端显示，第一个作为展示）" initialValue={[]}>
            <ScenarioTagPicker
              scenarioTags={meta?.scenarioTags ?? []}
              displayName={form.getFieldValue('displayName')}
              priceText={callModeDef?.recommendedBilling}
            />
          </Form.Item>
          <Form.Item label="积分扣除设置" style={{ marginBottom: 0 }}>
            <PricingConfigForm def={callModeDef} />
          </Form.Item>
          <Form.Item
            name="generationParamsText"
            label="高级参数（JSON，可选）"
            extra={'如 {"video_resolutions":["720p","1080p"]}；留空用供应商生成适配模板'}
          >
            <Input.TextArea rows={3} placeholder='{"video_resolutions":["720p","1080p"]}' />
          </Form.Item>
          <Form.Item
            name="requestTemplateText"
            label="请求体模板（JSON，可选）"
            extra={
              <span>
                实际请求体，支持变量 <code>{'{upstreamModelId}'}</code> <code>{'{prompt}'}</code>{' '}
                <code>{'{resolution}'}</code> <code>{'{duration}'}</code> <code>{'{imageUrl0}'}</code>{' '}
                <code>{'{media}'}</code>；留空由系统按厂商模板自动拼装
              </span>
            }
          >
            <Input.TextArea rows={4} placeholder='{"model": "{upstreamModelId}", "input": {"prompt": "{prompt}"}}' />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序权重" extra="越小越靠前（用户端默认模型与下拉排序）">
            <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="如 0" />
          </Form.Item>
          <Form.Item name="enabled" label="上架" valuePropName="checked">
            <Switch checkedChildren="上架" unCheckedChildren="下架" />
          </Form.Item>
          <Form.Item name="remark" label="备注（用户不可见）">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 凭据管理抽屉 */}
      <Drawer
        title={
          <Space size={6}>
            <ShopOutlined />
            <span>凭据管理</span>
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAddCredential}>
            新建凭据
          </Button>
        }
      >
        <Spin spinning={providerLoading}>
          {providers.length === 0 ? (
            <Empty description="暂无凭据，点击右上角「新建凭据」添加" style={{ marginTop: 60 }} />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {providers.map((p) => {
                const conn = CONNECTION_TAG[p.connectionStatus || 'untested'] || CONNECTION_TAG.untested
                return (
                  <div
                    key={p.id}
                    style={{
                      border: '1px solid rgba(128,128,128,.25)',
                      borderRadius: 8,
                      padding: '10px 12px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6
                      }}
                    >
                      <Space size={6} wrap>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        <Tag color={conn.color}>{conn.text}</Tag>
                        {p.isGlobal && <Tag color="gold">全局</Tag>}
                        {p.status === 'active' ? (
                          <Tag color="green">启用</Tag>
                        ) : (
                          <Tag color="red">停用</Tag>
                        )}
                      </Space>
                      <Tag color="geekblue">{p.modelCount ?? 0} 个模型</Tag>
                    </div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4, wordBreak: 'break-all' }}>
                      {p.baseUrl}
                    </div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>
                      Key: {p.apiKeyMasked || '未设置'}
                    </div>
                    <Space size={4}>
                      <Button
                        size="small"
                        icon={<ThunderboltOutlined />}
                        loading={providerTestingId === p.id}
                        onClick={() => void handleTestProvider(p)}
                      >
                        测试
                      </Button>
                      <Button size="small" icon={<ApiOutlined />} onClick={() => openReadModels(p)}>
                        读取模型
                      </Button>
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEditProvider(p)}>
                        编辑
                      </Button>
                      <Popconfirm
                        title="确认删除该凭据？"
                        description="凭据下存在模型时不允许删除"
                        onConfirm={() => void handleDeleteProvider(p)}
                        okText="删除"
                        cancelText="取消"
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                )
              })}
            </Space>
          )}
        </Spin>
      </Drawer>

      {/* 编辑凭据（厂商模板自动匹配后缀） */}
      <Modal
        title={editProvider ? `编辑凭据 - ${editProvider.name}` : '编辑凭据'}
        open={Boolean(editProvider)}
        onCancel={() => setEditProvider(null)}
        onOk={handleSaveProvider}
        confirmLoading={providerSaving}
        okText="保存"
        cancelText="取消"
        width={620}
      >
        <Form form={providerForm} layout="vertical">
          <Form.Item name="name" label="凭据名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true, message: '请输入 Base URL' }]}
          >
            <Input placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            extra={editProvider ? `当前: ${editProvider.apiKeyMasked || '未设置'}(留空不修改)` : undefined}
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="vendorKey"
            label="厂商模板（自动匹配地址后缀与生成适配参数）"
            extra="选择后自动写入对话路径 / 模型列表路径 / 图片视频生成端点；不选则保留原配置"
          >
            <Select
              allowClear
              placeholder="选择厂商，如 阿里百炼 DashScope"
              options={vendorList.map((v) => ({ label: v.nameSuggestion, value: v.vendor }))}
            />
          </Form.Item>
          {(() => {
            const v = vendorList.find((x) => x.vendor === providerForm.getFieldValue('vendorKey'))
            return v ? (
              <Alert
                type="success"
                showIcon
                style={{ marginBottom: 12 }}
                message="已匹配该厂商后缀"
                description={
                  <div style={{ fontSize: 12 }}>
                    <div>对话: {v.chatPath}</div>
                    <div>模型列表: {v.modelsPath}</div>
                    {Object.keys(v.generation || {}).length > 0 && (
                      <div>生成适配: {Object.keys(v.generation).join('、')}</div>
                    )}
                  </div>
                }
              />
            ) : null
          })()}
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '启用', value: 'active' },
                { label: '停用', value: 'disabled' }
              ]}
            />
          </Form.Item>
          <Form.Item
            name="isGlobal"
            label="设为全局中转"
            valuePropName="checked"
            extra="全站唯一：所有模型（文本/识图/绘画/语音/视频）默认使用该供应商的 BaseURL+Key 调用；置 true 会自动取消其他供应商的全局标记"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="chatPath"
            label="Chat 测试路径 (可选，高级)"
            extra="供应商连接测试用的聊天探测路径；留空用厂商模板或默认 /chat/completions"
          >
            <Input placeholder="/compatible-mode/v1/chat/completions" />
          </Form.Item>
          <Form.Item
            name="modelsPath"
            label="模型列表路径 (可选，高级)"
            extra="读取上游模型列表的路径；留空用厂商模板或默认 /models"
          >
            <Input placeholder="/compatible-mode/v1/models" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建凭据 / 读取上游模型 向导 */}
      <ProviderImportModal
        open={importOpen}
        existingProvider={importProvider}
        onClose={() => {
          setImportOpen(false)
          setImportProvider(null)
        }}
        onRefresh={refreshAll}
      />

      {/* 添加模型（单模型向导，按当前 Tab 预选类型） */}
      <AddModelModal
        open={addModelOpen}
        providers={providers}
        meta={meta}
        initialOutput={addInitialOutput}
        onClose={() => setAddModelOpen(false)}
        onSaved={() => {
          setAddModelOpen(false)
          refreshAll()
        }}
      />

      {/* 图生图 / 图生视频(i2v) 模型测试：需参考图 URL */}
      <Modal
        title={
          pendingTestItem && isI2vVideo(pendingTestItem)
            ? '测试图生视频模型'
            : '测试图像编辑模型'
        }
        open={testModalOpen}
        onCancel={() => setTestModalOpen(false)}
        onOk={() => {
          const url = testRefImage.trim()
          if (!url) {
            message.warning(
              pendingTestItem && isI2vVideo(pendingTestItem)
                ? '图生视频（i2v）测试需要一张公网可访问的首帧图 URL'
                : '图像编辑（图生图）测试需要一张公网可访问的参考图 URL',
            )
            return
          }
          setTestModalOpen(false)
          if (pendingTestItem) void handleTestModel(pendingTestItem, url)
        }}
        okText="开始测试"
        cancelText="取消"
        width={520}
      >
        <p style={{ marginBottom: 8 }}>
          {pendingTestItem && isI2vVideo(pendingTestItem) ? (
            <>
              该模型为图生视频（i2v），上游要求 <code>input.media.first_frame</code> 为公网可访问的首帧图 URL，请粘贴图片地址：
            </>
          ) : (
            <>
              该模型为图生图（图像编辑），上游要求 <code>base_image_url</code> 为公网可访问图片，请粘贴参考图 URL：
            </>
          )}
        </p>
        <Input
          placeholder="https://cdn.example.com/sketch.png"
          value={testRefImage}
          onChange={(e) => setTestRefImage(e.target.value)}
          onPressEnter={() => {
            const url = testRefImage.trim()
            if (url) {
              setTestModalOpen(false)
              if (pendingTestItem) void handleTestModel(pendingTestItem, url)
            }
          }}
        />
      </Modal>
    </div>
  )
}
