// 大模型配置管理页 (v0.10.0 重构)
//
// 两个 Tab：
//   Tab1 模型管理：模型列表(分类/计费/上下架/批量) + 顶部【添加第三方供应商】【添加大模型】
//   Tab2 供应商管理：供应商列表 + 新增/编辑(厂商模板自动匹配后缀)/测试/删除
//
// 添加路径（收敛为两条，模型市场已删除）：
//   1. 添加第三方供应商向导：供应商 URL+Key -> 测试 -> 读取上游(对话) / 官方预设(图片/视频) -> 逐项设置参数与积分
//   2. 添加大模型（单模型）：选已有供应商(自动带 URL+Key)或新建 -> 模型类型 -> 调用模式 -> 分类标签 -> 参数配置 -> 积分扣除
//
// API:
//   GET/PATCH/DELETE /admin/models, POST /admin/models/:id/{enable,disable,test}, POST /admin/models
//   GET/POST/PATCH/DELETE /admin/models/providers, POST /admin/models/providers/test
//   POST /admin/models/providers/:id/{fetch-models,import}
//   GET /admin/models/market/vendors（厂商模板，供应商编辑自动匹配后缀）

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
  Tabs,
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
import BatchBar from './components/BatchBar'
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
  ADVANCED_CAP_LABEL,
  ADVANCED_CAP_OPTIONS,
  INPUT_TYPE_LABEL,
  INPUT_TYPE_OPTIONS,
  MODEL_TYPE_LABEL,
  deriveModelType,
  inputTypesFromModelType,
  type AdvancedCapability,
  type ModelInputType
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

/** 模型编辑表单值（v0.10：调用模式驱动，旧字段已清理） */
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

  // ----- 供应商（Tab2）-----
  const [providers, setProviders] = useState<AdminProviderItem[]>([])
  const [providerLoading, setProviderLoading] = useState(false)
  const [editProvider, setEditProvider] = useState<AdminProviderItem | null>(null)
  const [providerForm] = Form.useForm()
  const [providerSaving, setProviderSaving] = useState(false)
  const [providerTestingId, setProviderTestingId] = useState<number | null>(null)
  // 厂商模板（供应商编辑：自动匹配后缀/生成适配参数）
  const [vendorList, setVendorList] = useState<MarketVendor[]>([])
  // ----- 模型编辑 -----
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminModelItem | null>(null)
  const [form] = Form.useForm<ModelFormValues>()
  const [meta, setMeta] = useState<CallModesMeta>()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const callMode = Form.useWatch('callMode', form)
  const callModeDef = useMemo(
    () => meta?.callModes.find((m) => m.key === callMode),
    [meta, callMode]
  )
  // 类型标签 = 输出类型 × 输入类型（由调用模式推导，能力标签可调整）
  const derivedType = useMemo(() => {
    if (!callModeDef) return 'chat'
    return deriveModelType(callModeDef.output, callModeDef.inputs)
  }, [callModeDef])

  // ----- 导入向导 / 单模型添加 -----
  const [importOpen, setImportOpen] = useState(false)
  const [importProvider, setImportProvider] = useState<AdminProviderItem | null>(null)
  const [testingModelId, setTestingModelId] = useState<number | null>(null)
  const [addModelOpen, setAddModelOpen] = useState(false)

  // ----- 页面模式 (模型列表 / 供应商管理) -----
  const [pageMode, setPageMode] = useState<'list' | 'providers'>('list')

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
    fetchMarketVendors().then(setVendorList).catch(() => undefined)
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
        // 类型由调用模式推导（输出类型 = def.output；能力标签可调整）
        outputType: def.output,
        inputTypes: values.inputTypes && values.inputTypes.length ? values.inputTypes : def.inputs,
        advancedCapabilities: values.advancedCapabilities ?? [],
        enabled: values.enabled,
        sortOrder: values.sortOrder ?? 0
      }
      // 计费：按 pricingMode 只写当前模式对应字段（token / 张 / 次 / 分钟 / 秒）
      const pricingMode = values.pricingMode
      if (pricingMode === 'per_image') {
        if (values.pricePerImage != null) dto.pricePerImage = values.pricePerImage
      } else if (pricingMode === 'per_call') {
        if (values.pricePerCall != null) dto.pricePerCall = values.pricePerCall
      } else if (pricingMode === 'per_minute') {
        if (values.pricePerMinute != null) dto.pricePerMinute = values.pricePerMinute
      } else if (pricingMode === 'per_second') {
        // 无其他字段；videoPerSecond 由下方 videoPerSecondList 写入
      } else {
        // token / 无 pricingMode（旧数据兜底）
        if (values.inputPricePerToken != null) dto.inputPricePerToken = values.inputPricePerToken
        if (values.outputPricePerToken != null) dto.outputPricePerToken = values.outputPricePerToken
      }
      // 高级参数（JSON 透传；供应商级生成适配模板仍生效，模型级覆盖同名 key）
      if (values.generationParamsText?.trim()) {
        try {
          dto.generationParams = JSON.parse(values.generationParamsText) as Record<string, unknown>
        } catch {
          message.error('高级参数 JSON 格式错误')
          return
        }
      }
      // P2：调用模式 / 场景标签 / 计费 / 成本价 / 备注 合并进 dto
      dto.callMode = values.callMode as CallModeKey
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
      // 视频按秒计费：videoPerSecondList -> videoPerSecond
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
          const vps = m.videoPerSecond
          if (vps && Object.keys(vps).length) {
            return (
              <span style={{ color: '#c7d2fe', fontSize: 12 }}>
                {Object.entries(vps)
                  .map(([k, v]) => `${k} ${v}分/秒`)
                  .join(' · ')}
              </span>
            )
          }
          return <Tag color="purple">视频计费</Tag>
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
    // 已有厂商模板的供应商：自动选中对应厂商（用于界面提示，不强制改）
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
      // 厂商模板：选中后自动写入 vendorKey + chatPath + modelsPath + generation（后缀自动匹配）
      const vendor = vendorList.find((v) => v.vendor === values.vendorKey)
      const cfg = (editProvider.config ?? {}) as Record<string, unknown>
      const nextConfig: Record<string, unknown> = { ...cfg }
      if (vendor) {
        nextConfig.vendorKey = vendor.vendor
        nextConfig.chatPath = vendor.chatPath
        nextConfig.modelsPath = vendor.modelsPath
        nextConfig.generation = vendor.generation
      } else {
        // 未选模板：保留原 vendorKey/生成配置，仅同步手填路径
        const chatPath = values.chatPath != null ? String(values.chatPath).trim() : ''
        const modelsPath = values.modelsPath != null ? String(values.modelsPath).trim() : ''
        if (chatPath) nextConfig.chatPath = chatPath
        if (modelsPath) nextConfig.modelsPath = modelsPath
      }
      if (Object.keys(nextConfig).length > 0) dto.config = nextConfig
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
      <Tabs
        activeKey={pageMode}
        onChange={(k) => setPageMode(k as 'list' | 'providers')}
        items={[
          { key: 'list', label: '模型管理' },
          { key: 'providers', label: '供应商管理' },
        ]}
      />
      {pageMode === 'list' ? (
        <>
          <div className={styles.header}>
            <div className={styles.titleArea}>
              <ApiOutlined className={styles.titleIcon} />
              <div>
                <h1 className={styles.title}>模型管理</h1>
                <p className={styles.subtitle}>
                  添加供应商 -&gt; 读取模型/加载预设 -&gt; 设置类型与积分导入；按类型计费：文本/千token、图片/张、视频/秒(分档)、语音/次或分钟
                </p>
              </div>
            </div>
            <Space>
              <Button
                type="primary"
                className={styles.primaryBtn}
                icon={<PlusOutlined />}
                onClick={openAddProvider}
              >
                添加第三方供应商
              </Button>
              <Button
                className={styles.ghostBtn}
                icon={<PlusOutlined />}
                onClick={() => setAddModelOpen(true)}
              >
                添加大模型
              </Button>
            </Space>
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
                description="暂无模型，请点击右上角「添加第三方供应商」或「添加大模型」"
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
                      advancedCapabilities: (def.advancedCaps as AdvancedCapability[]) ?? [],
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
              <Form.Item name="generationParamsText" label="高级参数（JSON，可选）" extra={'如 {"video_resolutions":["720p","1080p"]}；留空用供应商生成适配模板'}>
                <Input.TextArea rows={3} placeholder='{"video_resolutions":["720p","1080p"]}' />
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

          {/* 添加大模型（单模型） */}
          <AddModelModal
            open={addModelOpen}
            providers={providers}
            meta={meta}
            onClose={() => setAddModelOpen(false)}
            onSaved={() => {
              setAddModelOpen(false)
              void loadList()
              void loadProviderList()
            }}
          />
        </>
      ) : (
        <>
          <div className={styles.header}>
            <div className={styles.titleArea}>
              <ShopOutlined className={styles.titleIcon} />
              <div>
                <h1 className={styles.title}>供应商管理</h1>
                <p className={styles.subtitle}>
                  一个供应商 = 一个 API Key，可同时挂对话/图片/视频/语音模型；编辑时选择厂商模板自动匹配 URL 后缀与生成适配参数
                </p>
              </div>
            </div>
            <Space>
              <Button type="primary" className={styles.primaryBtn} icon={<PlusOutlined />} onClick={openAddProvider}>
                添加供应商
              </Button>
            </Space>
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
              locale={{ emptyText: <Empty description="暂无供应商，点击右上角添加" /> }}
            />
          </Spin>

          {/* 编辑供应商（厂商模板自动匹配后缀） */}
          <Modal
            title={editProvider ? `编辑供应商 - ${editProvider.name}` : '编辑供应商'}
            open={Boolean(editProvider)}
            onCancel={() => setEditProvider(null)}
            onOk={handleSaveProvider}
            confirmLoading={providerSaving}
            okText="保存"
            cancelText="取消"
            width={620}
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
        </>
      )}
    </div>
  )
}
