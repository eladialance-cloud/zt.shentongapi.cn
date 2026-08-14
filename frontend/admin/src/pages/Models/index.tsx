// 大模型配置管理页 (v0.7.0 供应商体系)
//
// 新流程：添加第三方供应商(名称+Base URL+API Key) -> 测试 -> 读取模型 -> 勾选 -> 逐模型定价 -> 导入
// 模型管理：编辑(显示名/类型标签/积分单价/能力)/上下架/删除
//
// API:
//   GET/PATCH/DELETE /admin/models, POST /admin/models/:id/{enable,disable,test}
//   GET/POST/PATCH/DELETE /admin/models/providers, POST /admin/models/providers/test
//   POST /admin/models/providers/:id/{fetch-models,import}

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
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
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ShopOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import {
  disableAdminModel,
  enableAdminModel,
  listAdminModels,
  listAdminProviders,
  removeAdminModel,
  removeAdminProvider,
  testAdminProvider,
  testModel,
  updateAdminModel,
  updateAdminProvider,
  fetchCallModesMeta,
  listModelTemplates,
  createModelFromTemplate
} from '@/api/admin-model-api'
import ProviderImportModal from './ProviderImportModal'
import CallModePicker from './components/CallModePicker'
import DynamicSpecForm from './components/DynamicSpecForm'
import ScenarioTagPicker from './components/ScenarioTagPicker'
import PricingConfigForm from './components/PricingConfigForm'
import TemplatePickerModal from './components/TemplatePickerModal'
import BatchBar from './components/BatchBar'
import VideoPriceMatrixEditor from '@/components/VideoPriceMatrixEditor'
import type {
  AdminModelItem,
  AdminProviderItem,
  ConnectionStatus,
  UpdateAdminModelDto,
  UpdateProviderDto,
  CallModeKey,
  CallModesMeta,
  ModelTemplateItem
} from '@/types/admin-model'
import {
  ADVANCED_CAP_LABEL,
  ADVANCED_CAP_OPTIONS,
  INPUT_TYPE_LABEL,
  INPUT_TYPE_OPTIONS,
  MODEL_TYPE_LABEL,
  OUTPUT_TYPE_OPTIONS,
  deriveModelType,
  inputTypesFromModelType,
  outputTypeFromModelType,
  type AdvancedCapability,
  type ModelInputType,
  type ModelOutputType
} from '@/utils/model-type'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const MODEL_TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '文本对话 chat', value: 'chat' },
  { label: '图片识图 vision', value: 'vision' },
  { label: '文生图 image', value: 'image' },
  { label: '图生图 image_edit', value: 'image_edit' },
  { label: '视频生成 video', value: 'video' },
  { label: '语音合成 tts', value: 'tts' }
]

const CONNECTION_TAG: Record<string, { color: string; text: string }> = {
  untested: { color: 'default', text: '未测试' },
  connected: { color: 'green', text: '已连接' },
  failed: { color: 'red', text: '连接失败' }
}

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

const ENABLED_OPTIONS = [
  { label: '全部', value: '' },
  { label: '已上架', value: 'true' },
  { label: '已下架', value: 'false' }
]

interface ModelFormValues {
  displayName: string
  outputType: ModelOutputType
  inputTypes: ModelInputType[]
  advancedCapabilities: AdvancedCapability[]
  inputPricePerToken?: number
  outputPricePerToken?: number
  enabled: boolean
  sortOrder?: number
  pricePerImage?: number
  pricePerCall?: number
  videoPrices?: Record<string, Record<string, number>>
  generationParamsText?: string
  imageSizesText?: string
  imageCount?: number
  negativePrompt?: string
  videoSubmitPath?: string
  videoQueryPath?: string
  ttsVoice?: string
  ttsSpeed?: number
  ttsVolume?: number
  ttsFormat?: string
  callMode?: string
  scenarioTags?: string[]
  specs?: Record<string, unknown>
  videoPerSecondList?: Array<{ resolution: string; rate: number }>
  remark?: string
  costPrice?: number
  pricingMode?: string
  pricePerMinute?: number
}

export default function AdminModels() {
  // ----- 模型列表 -----
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminModelItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [providerFilter, setProviderFilter] = useState<string | ''>('')
  const [typeFilter, setTypeFilter] = useState<string | ''>('')
  const [enabledFilter, setEnabledFilter] = useState<'' | 'true' | 'false'>('')
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')

  // ----- 供应商 -----
  const [providers, setProviders] = useState<AdminProviderItem[]>([])
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [providerLoading, setProviderLoading] = useState(false)
  const [editProvider, setEditProvider] = useState<AdminProviderItem | null>(null)
  const [providerForm] = Form.useForm()
  const [providerSaving, setProviderSaving] = useState(false)
  const [providerTestingId, setProviderTestingId] = useState<number | null>(null)

  // ----- 模型编辑 -----
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminModelItem | null>(null)
  const [form] = Form.useForm<ModelFormValues>()
  const [meta, setMeta] = useState<CallModesMeta>()
  const [templates, setTemplates] = useState<ModelTemplateItem[]>([])
  const [templateOpen, setTemplateOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const callMode = Form.useWatch('callMode', form)
  const callModeDef = useMemo(
    () => meta?.callModes.find((m) => m.key === callMode),
    [meta, callMode]
  )
  const outputType = Form.useWatch('outputType', form)
  const inputTypes = Form.useWatch('inputTypes', form)
  // 输出类型 × 输入类型 -> 路由分类（自动归类）
  const derivedType = useMemo(
    () => deriveModelType(outputType, inputTypes),
    [outputType, inputTypes]
  )
  const [saving, setSaving] = useState(false)

  // ----- 导入向导 -----
  const [importOpen, setImportOpen] = useState(false)
  const [importProvider, setImportProvider] = useState<AdminProviderItem | null>(null)
  const [testingModelId, setTestingModelId] = useState<number | null>(null)

  const loadProviders = useCallback(async () => {
    try {
      const list = await listAdminProviders()
      setProviders(list || [])
    } catch (err) {
      console.error('[AdminModels] load providers failed:', err)
    }
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (providerFilter) query.provider = providerFilter
      if (typeFilter) query.modelType = typeFilter
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
  }, [page, providerFilter, typeFilter, enabledFilter, searchKeyword])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  useEffect(() => {
    fetchCallModesMeta().then(setMeta).catch(() => undefined)
    listModelTemplates().then(setTemplates).catch(() => undefined)
  }, [])

  const handleReset = () => {
    setProviderFilter('')
    setTypeFilter('')
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
      outputType: item.outputType ?? outputTypeFromModelType(item.modelType),
      inputTypes:
        item.inputTypes && item.inputTypes.length
          ? item.inputTypes
          : inputTypesFromModelType(item.modelType),
      advancedCapabilities: item.advancedCapabilities ?? [],
      inputPricePerToken: item.inputPricePerToken ?? 0,
      outputPricePerToken: item.outputPricePerToken ?? 0,
      enabled: item.enabled,
      sortOrder: item.sortOrder ?? 0,
      pricePerImage: item.pricePerImage ?? undefined,
      pricePerCall: item.pricePerCall ?? undefined,
      videoPrices: item.videoPrices || undefined,
      imageSizesText: Array.isArray(gen.image_sizes) ? gen.image_sizes.join(', ') : undefined,
      imageCount: typeof gen.image_count === 'number' ? gen.image_count : undefined,
      negativePrompt: typeof gen.negative_prompt === 'string' ? gen.negative_prompt : undefined,
      videoSubmitPath: typeof gen.video_submit_path === 'string' ? gen.video_submit_path : undefined,
      videoQueryPath: typeof gen.video_query_path === 'string' ? gen.video_query_path : undefined,
      ttsVoice: typeof gen.voice === 'string' ? gen.voice : undefined,
      ttsSpeed: typeof gen.speed === 'number' ? gen.speed : undefined,
      ttsVolume: typeof gen.volume === 'number' ? gen.volume : undefined,
      ttsFormat: typeof gen.format === 'string' ? gen.format : undefined,
      generationParamsText: Object.keys(gen).length ? JSON.stringify(gen, null, 2) : undefined,
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
      // meta 未加载时 specFields 为空，会把全部 specs 过滤清空，先拦截
      if (!meta) {
        message.warning('模型配置元数据加载中，请稍后再试')
        return
      }
      setSaving(true)
      // 输出类型 × 输入类型 -> 路由分类（后端同样推导，仅作为无 pricingMode 时的 legacy 兜底）
      const mt = deriveModelType(values.outputType, values.inputTypes)
      const dto: UpdateAdminModelDto = {
        displayName: values.displayName,
        outputType: values.outputType,
        inputTypes: values.inputTypes,
        advancedCapabilities: values.advancedCapabilities ?? [],
        enabled: values.enabled,
        sortOrder: values.sortOrder ?? 0
      }
      // 计费字段组装：
      // 1) mt 专属旧字段按 mt 无条件保留（legacy 兼容：旧版矩阵/单价不因新 pricingMode 分支丢失）
      // 2) pricingMode 只决定新计费字段（pricePerImage/pricePerCall/pricePerMinute/videoPerSecond/token 单价）的写入
      const pricingMode = values.pricingMode
      // 1) mt 专属旧字段（chat/vision -> token 单价；image/image_edit -> pricePerImage；video -> videoPrices；tts -> pricePerCall）
      if (mt === 'chat' || mt === 'vision') {
        if (values.inputPricePerToken != null) dto.inputPricePerToken = values.inputPricePerToken
        if (values.outputPricePerToken != null) dto.outputPricePerToken = values.outputPricePerToken
      }
      if (mt === 'image' || mt === 'image_edit') {
        if (values.pricePerImage != null) dto.pricePerImage = values.pricePerImage
      }
      if (mt === 'video') {
        if (values.videoPrices != null) dto.videoPrices = values.videoPrices
      }
      if (mt === 'tts') {
        if (values.pricePerCall != null) dto.pricePerCall = values.pricePerCall
      }
      // 2) 新 pricingMode 字段：只写当前模式对应的字段（videoPerSecond 由下方 videoPerSecondList 转换写入）
      if (pricingMode === 'per_image') {
        if (values.pricePerImage != null) dto.pricePerImage = values.pricePerImage
      } else if (pricingMode === 'per_call') {
        if (values.pricePerCall != null) dto.pricePerCall = values.pricePerCall
      } else if (pricingMode === 'per_minute') {
        if (values.pricePerMinute != null) dto.pricePerMinute = values.pricePerMinute
      } else if (pricingMode === 'per_second') {
        // 无其他新字段
      } else {
        // token / 无 pricingMode（旧数据）：token 单价（原值，不写 0 强转）
        if (values.inputPricePerToken != null) dto.inputPricePerToken = values.inputPricePerToken
        if (values.outputPricePerToken != null) dto.outputPricePerToken = values.outputPricePerToken
      }
      // 分类专属生成参数（动态字段覆盖 JSON 中同名 key）
      const managedKeys = [
        'image_sizes',
        'image_count',
        'negative_prompt',
        'video_submit_path',
        'video_query_path',
        'voice',
        'speed',
        'volume',
        'format'
      ]
      let gen: Record<string, unknown> = {}
      if (values.generationParamsText) {
        try {
          gen = JSON.parse(values.generationParamsText) as Record<string, unknown>
        } catch (e) {
          message.error('生成参数 JSON 格式错误')
          return
        }
      }
      for (const k of managedKeys) delete gen[k]
      if (mt === 'image' || mt === 'image_edit') {
        if (values.imageSizesText) {
          gen.image_sizes = values.imageSizesText
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
        }
        if (values.imageCount != null) gen.image_count = values.imageCount
        if (values.negativePrompt) gen.negative_prompt = values.negativePrompt
      }
      if (mt === 'video') {
        if (values.videoSubmitPath) gen.video_submit_path = values.videoSubmitPath.trim()
        if (values.videoQueryPath) gen.video_query_path = values.videoQueryPath.trim()
      }
      if (mt === 'tts') {
        if (values.ttsVoice) gen.voice = values.ttsVoice.trim()
        if (values.ttsSpeed != null) gen.speed = values.ttsSpeed
        if (values.ttsVolume != null) gen.volume = values.ttsVolume
        if (values.ttsFormat) gen.format = values.ttsFormat.trim()
      }
      if (Object.keys(gen).length > 0) dto.generationParams = gen
      // P2：调用模式 / 场景标签 / 计费 / 成本价 / 备注 合并进 dto
      if (values.callMode) dto.callMode = values.callMode as CallModeKey
      if (values.scenarioTags && values.scenarioTags.length) dto.scenarioTags = values.scenarioTags
      if (values.pricingMode) dto.pricingMode = values.pricingMode
      if (values.costPrice != null) dto.costPrice = values.costPrice
      if (values.remark != null) dto.remark = values.remark
      if (values.pricePerMinute != null) dto.pricePerMinute = values.pricePerMinute
      // 动态规格：仅保留当前调用模式的 specFields，json 类型值解析为对象
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
      // 视频按秒计费：videoPerSecondList -> videoPerSecond（dto 显式构造，不含 list 字段）
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

  const handleTestModel = async (item: AdminModelItem) => {
    setTestingModelId(item.id)
    try {
      const result = await testModel(item.id)
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

  const columns: TableColumnsType<AdminModelItem> = [
    {
      title: '模型 ID',
      key: 'modelId',
      width: 220,
      render: (_, m) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.modelId}</div>
          {m.upstreamModelId && m.upstreamModelId !== m.modelId && (
            <div style={{ fontSize: 12, color: '#8b949e' }}>上游: {m.upstreamModelId}</div>
          )}
        </div>
      )
    },
    { title: '显示名', dataIndex: 'displayName', key: 'displayName', width: 160 },
    {
      title: '供应商',
      key: 'provider',
      width: 160,
      render: (_, m) => (
        <Space size={4} direction="vertical" style={{ gap: 0 }}>
          <span>{m.providerName || m.provider}</span>
          <span style={{ fontSize: 12, color: '#8b949e' }}>{m.provider}</span>
        </Space>
      )
    },
    {
      title: '类型标签',
      dataIndex: 'modelType',
      key: 'modelType',
      width: 120,
      render: (t: string) => (
        <Tag color={MODEL_TYPE_COLOR[t] || 'default'}>{MODEL_TYPE_LABEL[t] || t || 'chat'}</Tag>
      )
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 70,
      render: (v: number) => <Tag>{v ?? 0}</Tag>
    },
    {
      title: '计费',
      key: 'price',
      width: 190,
      render: (_, m) => {
        const t = m.modelType || 'chat'
        if (t === 'image' || t === 'image_edit') {
          return <span style={{ color: '#c7d2fe' }}>{m.pricePerImage ?? 10} 积分/张</span>
        }
        if (t === 'video') {
          return <Tag color="purple">视频矩阵</Tag>
        }
        if (t === 'tts') {
          return <span style={{ color: '#c7d2fe' }}>{m.pricePerCall ?? 1} 积分/次</span>
        }
        return (
          <span style={{ color: '#c7d2fe' }}>
            {m.inputPricePerToken ?? 0} / {m.outputPricePerToken ?? 0}
          </span>
        )
      }
    },
    {
      title: '能力（输入类型）',
      key: 'capabilities',
      width: 200,
      render: (_, m) => {
        const inputs =
          m.inputTypes && m.inputTypes.length
            ? m.inputTypes
            : inputTypesFromModelType(m.modelType)
        const adv = m.advancedCapabilities || []
        return (
          <Space size={4} wrap>
            {inputs.map((t) => (
              <Tag key={'in-' + t} color="blue" style={{ marginRight: 0 }}>
                {INPUT_TYPE_LABEL[t] || t}
              </Tag>
            ))}
            {adv.map((c) => (
              <Tag key={'adv-' + c} color="purple" style={{ marginRight: 0 }}>
                {ADVANCED_CAP_LABEL[c] || c}
              </Tag>
            ))}
          </Space>
        )
      }
    },
    {
      title: '连接',
      key: 'connection',
      width: 100,
      render: (_, m) => {
        const c = CONNECTION_TAG[m.connectionStatus || 'untested'] || CONNECTION_TAG.untested
        return <Tag color={c.color}>{c.text}</Tag>
      }
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
      width: 200,
      fixed: 'right',
      render: (_, m) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={testingModelId === m.id}
            onClick={() => void handleTestModel(m)}
          >
            测试
          </Button>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(m)}
          >
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

  // ----- 供应商管理 -----
  const loadProviderList = useCallback(async () => {
    setProviderLoading(true)
    try {
      const list = await listAdminProviders()
      setProviders(list || [])
    } catch (err: any) {
      message.error('加载供应商列表失败: ' + (err?.message || ''))
    } finally {
      setProviderLoading(false)
    }
  }, [])

  const openAddProvider = () => {
    setImportProvider(null)
    setImportOpen(true)
  }

  const openReadModels = (p: AdminProviderItem) => {
    setImportProvider(p)
    setImportOpen(true)
  }

  const openEditProvider = (p: AdminProviderItem) => {
    setEditProvider(p)
    providerForm.setFieldsValue({
      name: p.name,
      baseUrl: p.baseUrl,
      status: p.status,
      isGlobal: p.isGlobal === true,
      generationTemplate: p.config?.generation ? JSON.stringify(p.config.generation, null, 2) : undefined
    })
  }

  const handleSaveProvider = async () => {
    if (!editProvider) return
    try {
      const values = await providerForm.validateFields()
      const templateText = values.generationTemplate != null ? String(values.generationTemplate).trim() : ''
      if (templateText) {
        try {
          JSON.parse(templateText)
        } catch {
          message.error('生成适配模板 JSON 格式错误')
          return
        }
      }
      setProviderSaving(true)
      const dto: UpdateProviderDto = {
        name: values.name,
        baseUrl: values.baseUrl,
        status: values.status,
        isGlobal: values.isGlobal === true
      }
      if (values.apiKey && String(values.apiKey).trim()) dto.apiKey = String(values.apiKey).trim()
      if (templateText) {
        dto.config = { ...(editProvider.config || {}), generation: JSON.parse(templateText) }
      } else if (editProvider.config?.generation) {
        const { generation: _removed, ...restConfig } = editProvider.config
        dto.config = restConfig
      }
      await updateAdminProvider(editProvider.id, dto)
      message.success('供应商已更新')
      setEditProvider(null)
      void loadProviderList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('保存失败')
    } finally {
      setProviderSaving(false)
    }
  }

  const handleTestProvider = async (p: AdminProviderItem) => {
    setProviderTestingId(p.id)
    try {
      const r = await testAdminProvider({ providerId: p.id })
      message.success('连接成功: ' + (r.response || '').slice(0, 60))
      void loadProviderList()
    } catch (err: any) {
      message.error('连接失败: ' + (err?.message || ''))
      void loadProviderList()
    } finally {
      setProviderTestingId(null)
    }
  }

  const handleDeleteProvider = async (p: AdminProviderItem) => {
    try {
      await removeAdminProvider(p.id)
      message.success('供应商已删除')
      void loadProviderList()
    } catch (err: any) {
      message.error('删除失败: ' + (err?.message || ''))
    }
  }

  const providerColumns: TableColumnsType<AdminProviderItem> = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: 'Base URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span>
    },
    {
      title: '连接状态',
      key: 'conn',
      width: 110,
      render: (_, p) => {
        const c = CONNECTION_TAG[p.connectionStatus || 'untested'] || CONNECTION_TAG.untested
        return <Tag color={c.color}>{c.text}</Tag>
      }
    },
    {
      title: '全局中转',
      key: 'isGlobal',
      width: 100,
      render: (_, p) =>
        p.isGlobal ? <Tag color="gold">全局</Tag> : <Tag>—</Tag>
    },
    {
      title: '模型数',
      dataIndex: 'modelCount',
      key: 'modelCount',
      width: 80,
      render: (v: number) => <Tag color="geekblue">{v ?? 0}</Tag>
    },
    {
      title: '状态',
      key: 'status',
      width: 90,
      render: (_, p) =>
        p.status === 'active' ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_, p) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditProvider(p)}
          >
            编辑
          </Button>
          <Button
            type="text"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={providerTestingId === p.id}
            onClick={() => void handleTestProvider(p)}
          >
            测试
          </Button>
          <Button
            type="text"
            size="small"
            icon={<ApiOutlined />}
            onClick={() => openReadModels(p)}
          >
            读取模型
          </Button>
          <Popconfirm
            title="确认删除该供应商？"
            description="供应商下存在模型时不允许删除"
            onConfirm={() => void handleDeleteProvider(p)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const providerFilterOptions = useMemo(
    () => providers.map((p) => ({ label: p.name, value: p.slug })),
    [providers]
  )
  const globalProvider = providers.find((p) => p.isGlobal)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ApiOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>模型管理</h1>
            <p className={styles.subtitle}>
              添加第三方供应商 -&gt; 读取模型 -&gt; 勾选 -&gt; 逐模型定价导入；全站 1 套全局中转（BaseURL+Key），6 大分类模型上架（文本/识图/文生图/图生图/视频/语音）
            </p>
          </div>
        </div>
        <Space>
          <Button
            className={styles.ghostBtn}
            icon={<ShopOutlined />}
            onClick={() => setProviderModalOpen(true)}
          >
            供应商管理
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<PlusOutlined />}
            onClick={openAddProvider}
          >
            添加第三方供应商
          </Button>
          <Button onClick={() => setTemplateOpen(true)}>从模板创建</Button>
        </Space>
        <TemplatePickerModal
          open={templateOpen}
          templates={templates}
          onCancel={() => setTemplateOpen(false)}
          onPick={async (tpl) => {
            setTemplateOpen(false)
            try {
              await createModelFromTemplate({ templateKey: tpl.key })
              message.success('已从模板创建 ' + tpl.name + '（默认下架，请在列表中编辑定价后上架）')
              void loadList()
            } catch (err) {
              message.error((err as Error)?.message || '从模板创建失败')
            }
          }}
        />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="供应商"
            value={providerFilter}
            onChange={(v) => setProviderFilter(v as string | '')}
            className={styles.filterSelect}
            allowClear
            options={providerFilterOptions}
          />
          <Select
            placeholder="模型分类"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as string | '')}
            className={styles.filterSelect}
            allowClear
            options={MODEL_TYPE_OPTIONS}
          />
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

      <BatchBar selectedIds={selectedIds} onChanged={loadList} />

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty
            description="暂无模型，请先点击右上角「添加第三方供应商」"
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
              scroll={{ x: 1500 }}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as number[])
              }}
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

      {/* 编辑模型 */}
      <Modal
        title={editing ? `编辑模型 - ${editing.displayName}` : '编辑模型'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={620}
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
            name="outputType"
            label="模型类型（输出）"
            extra="模型输出的内容类型：文本 / 图片 / 视频 / 语音"
          >
            <Select options={OUTPUT_TYPE_OPTIONS} placeholder="选择输出类型" />
          </Form.Item>
          <Form.Item
            name="inputTypes"
            label="能力（输入类型，多选）"
            extra="模型能识别的输入：文字 / 图片 / 视频 / 语音；选择后自动归类调用路径"
          >
            <Select mode="multiple" options={INPUT_TYPE_OPTIONS} placeholder="选择模型支持的输入类型" />
          </Form.Item>
          <Form.Item
            name="advancedCapabilities"
            label="高级能力（多选）"
            extra="函数调用 / 流式 / 推理 / JSON 模式等"
          >
            <Select mode="multiple" options={ADVANCED_CAP_OPTIONS} placeholder="选择高级能力" />
          </Form.Item>
          <Form.Item label="自动归类" extra="根据输出类型与输入类型自动推导，保存后生效">
            <Tag color={MODEL_TYPE_COLOR[derivedType] || 'default'}>
              {MODEL_TYPE_LABEL[derivedType] || derivedType || '文本对话'}
            </Tag>
          </Form.Item>
          <Form.Item name="callMode" label="调用模式（14 种总开关）" initialValue="text_chat">
            <CallModePicker
              callModes={meta?.callModes ?? []}
              onChange={(key) => {
                const def = meta?.callModes.find((m) => m.key === key)
                form.setFieldsValue({ pricingMode: def?.recommendedBilling })
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
            <Form.Item label="自动归类">
              <span>
                {callModeDef.label} → 输出 {callModeDef.output} / 输入 {callModeDef.inputs.join('+')}
              </span>
            </Form.Item>
          )}
          {callModeDef && (
            <Form.Item label="动态规格">
              <DynamicSpecForm specFields={callModeDef.specFields} schemas={meta?.specFieldSchemas ?? {}} />
            </Form.Item>
          )}
          <Form.Item name="scenarioTags" label="场景标签（第一个作为展示标签）" initialValue={[]}>
            <ScenarioTagPicker
              scenarioTags={meta?.scenarioTags ?? []}
              displayName={form.getFieldValue('displayName')}
              priceText={callModeDef?.recommendedBilling}
            />
          </Form.Item>
          <Form.Item label="计费配置" style={{ marginBottom: 0 }}>
            <PricingConfigForm def={callModeDef} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序权重" extra="越小越靠前（用户端默认模型与下拉排序）">
            <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="如 0" />
          </Form.Item>
          {(derivedType === 'chat' || derivedType === 'vision') && (
            <>
              <Form.Item
                name="inputPricePerToken"
                label="输入单价(积分/千token)"
                extra="用户使用该模型时按此价格扣除积分"
              >
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="outputPricePerToken"
                label="输出单价(积分/千token)"
                extra="用户使用该模型时按此价格扣除积分"
              >
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
          {(derivedType === 'image' || derivedType === 'image_edit') && (
            <>
              <Form.Item name="pricePerImage" label="图片生成积分/张" extra="用户生成一张图扣除的积分">
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="如 10" />
              </Form.Item>
              <Form.Item name="imageSizesText" label="默认尺寸" extra="多个用逗号分隔，如 1024x1024, 512x512（用户端默认尺寸/下拉选项）">
                <Input placeholder="1024x1024, 512x512" />
              </Form.Item>
              <Form.Item name="imageCount" label="单次生成数量" extra="用户一次调用默认生成的图片数">
                <InputNumber min={1} max={10} step={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="negativePrompt" label="默认负面提示词" extra="可选，追加到生成请求的负面约束">
                <Input.TextArea rows={2} placeholder="如: 低质量, 模糊, 畸形" />
              </Form.Item>
            </>
          )}
          {derivedType === 'video' && (
            <>
              <Form.Item key={editing?.modelId ?? 'new-model'} name="videoPrices" label="视频价格矩阵（分辨率 × 时长）" extra="每个格子 = 该规格生成一条视频扣除的积分，留空表示不提供">
                <VideoPriceMatrixEditor />
              </Form.Item>
              <Form.Item name="videoSubmitPath" label="视频任务提交后缀" extra="异步任务提交路径，如 /api/v1/services/aigc/video-generation/video-synthesis">
                <Input placeholder="/api/v1/services/aigc/video-generation/video-synthesis" />
              </Form.Item>
              <Form.Item name="videoQueryPath" label="视频任务查询后缀" extra="支持 {task_id} 或 {id} 占位符，如 /api/v1/tasks/{task_id}">
                <Input placeholder="/api/v1/tasks/{task_id}" />
              </Form.Item>
            </>
          )}
          {derivedType === 'tts' && (
            <>
              <Form.Item name="pricePerCall" label="按次计费积分" extra="用户每次语音合成调用扣除的积分">
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="如 1" />
              </Form.Item>
              <Form.Item name="ttsVoice" label="默认音色" extra="如 alloy / echo / 自定义音色 ID">
                <Input placeholder="alloy" />
              </Form.Item>
              <Form.Item name="ttsSpeed" label="语速" extra="0.5 ~ 2.0，默认 1.0">
                <InputNumber min={0.5} max={2} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="ttsVolume" label="音量" extra="0.0 ~ 1.0，默认 1.0">
                <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="ttsFormat" label="音频格式" extra="如 mp3 / wav / opus">
                <Input placeholder="mp3" />
              </Form.Item>
            </>
          )}
          {(derivedType === 'image' || derivedType === 'image_edit' || derivedType === 'video' || derivedType === 'tts') && (
            <Form.Item name="generationParamsText" label="高级参数(JSON, 可选)" extra='其他接口参数，如 {"video_resolutions":["720p","1080p"],"video_durations":[5,10]}'>
              <Input.TextArea rows={3} placeholder='{"video_resolutions":["720p","1080p"]}' />
            </Form.Item>
          )}
          <Form.Item name="enabled" label="上架" valuePropName="checked">
            <Switch checkedChildren="上架" unCheckedChildren="下架" />
          </Form.Item>
          <Form.Item name="remark" label="备注（用户不可见）">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 供应商管理 */}
      <Modal
        title="供应商管理"
        open={providerModalOpen}
        onCancel={() => setProviderModalOpen(false)}
        footer={null}
        width={980}
      >
        <div style={{ marginBottom: 12, textAlign: 'right' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddProvider}>
            添加供应商
          </Button>
        </div>
        {globalProvider && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`全局中转：${globalProvider.name}（${globalProvider.baseUrl}）`}
            description="全站唯一：所有模型默认使用该供应商的 BaseURL+Key 调用；可在下方编辑或新增供应商时调整"
          />
        )}
        <Spin spinning={providerLoading}>
          <Table<AdminProviderItem>
            rowKey="id"
            columns={providerColumns}
            dataSource={providers}
            pagination={false}
            size="middle"
            scroll={{ x: 980 }}
            locale={{ emptyText: <Empty description="暂无供应商" /> }}
          />
        </Spin>
      </Modal>

      {/* 编辑供应商 */}
      <Modal
        title={editProvider ? `编辑供应商 - ${editProvider.name}` : '编辑供应商'}
        open={Boolean(editProvider)}
        onCancel={() => setEditProvider(null)}
        onOk={handleSaveProvider}
        confirmLoading={providerSaving}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <Form form={providerForm} layout="vertical">
          <Form.Item
            name="name"
            label="供应商名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true, message: '请输入 Base URL' }]}
          >
            <Input placeholder="https://api.xxx.com/v1" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            extra={editProvider ? `当前: ${editProvider.apiKeyMasked || '未设置'}(留空不修改)` : undefined}
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
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
            name="generationTemplate"
            label="生成适配模板 (JSON)"
            extra={'{\"imagesPath\":\"/v1/images/generations\",\"videosPath\":\"/v1/videos/generations\",\"requestTemplate\":{\"model\":\"{upstreamModelId}\",\"prompt\":\"{prompt}\"},\"resultUrlPath\":\"data.task_result.videos[0].url\"} 留空表示清空生成配置'}
          >
            <Input.TextArea
              rows={8}
              placeholder={'{\n  \"imagesPath\": \"/v1/images/generations\",\n  \"videosPath\": \"/v1/videos/generations\",\n  \"async\": true,\n  \"requestTemplate\": { \"model\": \"{upstreamModelId}\", \"prompt\": \"{prompt}\" }\n}'}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加供应商/读取模型导入向导 */}
      <ProviderImportModal
        open={importOpen}
        existingProvider={importProvider}
        onClose={() => {
          setImportOpen(false)
          setImportProvider(null)
        }}
        onRefresh={() => {
          void loadList()
          void loadProviderList()
        }}
      />
    </div>
  )
}
