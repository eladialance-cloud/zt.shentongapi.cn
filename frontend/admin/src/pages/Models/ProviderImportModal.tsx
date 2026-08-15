// 添加第三方供应商 + 读取上游模型 + 逐模型定价导入 Modal (v0.9.0)
//
// 流程：
//   Step 0 连接信息: 供应商模板(自动匹配后缀) + 模型类型(对话/图片/视频) + 名称 + Base URL + API Key + [测试连接]
//   Step 1 读取模型: [读取模型列表] -> 勾选(已存在禁用)
//   Step 2 逐模型定价: 每行显示名/模型类型/输入积分/输出积分/启用 -> [确认导入]
//
// v0.9 关键说明（用户诉求）：
//   同一个供应商、同一个 API Key；图片/对话/视频 只是 URL 后缀不同。
//   - 选「对话」：按 OpenAI 兼容 /models 读取上游模型列表（DashScope 为 /compatible-mode/v1/models）。
//   - 选「图片/视频」：平台（如 DashScope）没有图片/视频的模型列表接口，
//     系统自动匹配厂商模板的生成地址后缀（imagesPath/videosPath/taskPath）并写入供应商 config，
//     读取时改为加载该厂商官方预设模型（通义万相/qwen-video-plus 等），勾选即可导入。
//
// 价格单位：积分/千token（1 元 = 100 积分）。上游返回价格为元/千token时按 x100 预填。
//
// API:
//   POST /admin/models/providers                 新增供应商
//   POST /admin/models/providers/test            测试连接
//   POST /admin/models/providers/:id/fetch-models 读取上游模型
//   POST /admin/models/providers/:id/import      勾选逐模型定价导入
//   GET  /admin/models/market/vendors            厂商模板列表
//   GET  /admin/models/market/presets?vendor=&type= 按类型读取厂商预设
//   POST /admin/models/market/import             图片/视频预设批量导入

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Key } from 'react'
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ApiOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  createAdminProvider,
  createModelFromTemplate,
  fetchMarketPresets,
  fetchMarketVendors,
  fetchProviderModels,
  importProviderModels,
  marketImportModels,
  removeAdminProvider,
  testAdminProvider,
} from '@/api/admin-model-api'
import type {
  AdminProviderItem,
  ImportProviderModelItem,
  ImportProviderModelsResult,
  MarketPresetItem,
  MarketVendor,
  ModelTemplateReferencePrice,
  ProviderType,
  UpstreamModel
} from '@/types/admin-model'
import {
  INPUT_TYPE_OPTIONS,
  OUTPUT_TYPE_OPTIONS,
  type ModelInputType,
  type ModelOutputType
} from '@/utils/model-type'

const STEPS = [{ title: '连接信息' }, { title: '读取模型' }, { title: '逐模型定价' }]

const TYPE_OPTIONS: Array<{ label: string; value: ProviderType }> = [
  { label: '对话', value: 'chat' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
]

/** callMode -> 输出类型（预设行展示/过滤用） */
const OUTPUT_BY_MODE: Record<string, string> = {
  text_chat: 'text',
  embedding: 'text',
  rerank: 'text',
  vision: 'text',
  ocr: 'text',
  image: 'image',
  image_edit: 'image',
  video: 'video',
  video_edit: 'video',
  music: 'audio',
  stt: 'text',
  tts: 'audio',
  voice_conversion: 'audio',
  realtime: 'text'
}

/** 预设参考价格式化：图片按张 / 视频按秒 / 语音按次或分钟 / 文本按千token */
function formatPresetPrice(p: MarketPresetItem): string {
  const r: ModelTemplateReferencePrice | undefined = p.referencePrice
  if (!r) return '积分待定'
  if (r.videoPerSecond) {
    return Object.entries(r.videoPerSecond)
      .map(([k, v]) => `${k} ${v}分/秒`)
      .join(' · ')
  }
  if (r.pricePerImage != null) return `${r.pricePerImage} 分/张`
  if (r.pricePerCall != null) return `${r.pricePerCall} 分/次`
  if (r.pricePerMinute != null) return `${r.pricePerMinute} 分/分钟`
  const input = r.inputPricePerToken ?? 0
  const output = r.outputPricePerToken ?? 0
  return `输入 ${input} / 输出 ${output} 分/千token`
}

/** 每个勾选模型的定价配置（类型=输出类型、能力=输入类型） */
interface PricingRow {
  displayName: string
  outputType: ModelOutputType
  inputTypes: ModelInputType[]
  inputPricePer1k: number
  outputPricePer1k: number
  enabled: boolean
}

/** 可导入行：上游模型列表项，或厂商预设（带 presetKey，走 market/import） */
interface FetchRow extends UpstreamModel {
  presetKey?: string
  presetName?: string
  priceText?: string
  outputType?: ModelOutputType
}

interface ProviderImportModalProps {
  open: boolean
  /** 已保存供应商（供应商管理 -> 读取模型）；不传则从 Step 0 新建 */
  existingProvider?: AdminProviderItem | null
  onClose: () => void
  onRefresh: () => void
}

export default function ProviderImportModal({
  open,
  existingProvider,
  onClose,
  onRefresh
}: ProviderImportModalProps) {
  const [step, setStep] = useState(0)
  // 厂商模板 + 模型类型（v0.9）
  const [vendorList, setVendorList] = useState<MarketVendor[]>([])
  const [vendorKey, setVendorKey] = useState('')
  const [providerType, setProviderType] = useState<ProviderType>('chat')
  // Step 0 连接信息
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isGlobal, setIsGlobal] = useState(false)
  const [testModel, setTestModel] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  // 已保存供应商 ID（Step0 下一步时创建）
  const [providerId, setProviderId] = useState<number | null>(null)
  const createdInFlow = useRef(false)
  // Step 1 读取模型
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [models, setModels] = useState<FetchRow[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  // Step 2 逐模型定价
  const [pricingMap, setPricingMap] = useState<Record<string, PricingRow>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportProviderModelsResult | null>(null)
  // 手动添加模型（官方有、预设没有）
  const [manualOpen, setManualOpen] = useState(false)

  const selectedVendor = vendorList.find((v) => v.vendor === vendorKey) ?? null

  /** 拉取厂商模板（自动匹配后缀的数据源） */
  useEffect(() => {
    fetchMarketVendors()
      .then(setVendorList)
      .catch(() => {
        // 忽略：未选择模板时退化为纯手动填写
      })
  }, [])

  /** 进入 Modal 时重置状态 */
  const resetFlow = (fromProvider?: AdminProviderItem | null) => {
    if (fromProvider) {
      setProviderId(fromProvider.id)
      setStep(1)
      createdInFlow.current = false
      // 已有供应商：若保存过厂商模板，自动恢复
      setVendorKey(fromProvider.config?.vendorKey ? String(fromProvider.config.vendorKey) : '')
    } else {
      setProviderId(null)
      setStep(0)
      createdInFlow.current = false
      setVendorKey('')
    }
    setProviderType('chat')
    setName('')
    setBaseUrl('')
    setApiKey('')
    setIsGlobal(false)
    setTestModel('')
    setTestResult(null)
    setFetchError('')
    setModels([])
    setSelectedKeys([])
    setSearchKeyword('')
    setPricingMap({})
    setImportResult(null)
  }

  useEffect(() => {
    if (open) resetFlow(existingProvider)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingProvider])

  const handleClose = async () => {
    // 流程中新建了空供应商且未导入任何模型 -> 清理
    if (createdInFlow.current && providerId && importResult === null) {
      try {
        await removeAdminProvider(providerId)
      } catch {
        // 忽略清理失败
      }
    }
    onClose()
  }

  // ----- v0.9 厂商模板 / 类型 -----

  /** 选择厂商模板：自动预填名称/Base URL/测试模型，地址后缀保存进 config */
  const applyVendor = (k: string) => {
    setVendorKey(k)
    const v = vendorList.find((x) => x.vendor === k)
    if (!v) return
    setName((prev) => (prev.trim() ? prev : v.nameSuggestion))
    setBaseUrl((prev) => (prev.trim() ? prev : v.baseUrl))
    if (!testModel.trim() && v.vendor === 'aliyun-dashscope') setTestModel('qwen-plus')
  }

  /** 组装供应商 config：vendorKey + 对话/列表路径 + 生成适配模板（图片/视频后缀） */
  const buildProviderConfig = (): Record<string, unknown> | undefined => {
    if (!selectedVendor) return undefined
    return {
      vendorKey: selectedVendor.vendor,
      chatPath: selectedVendor.chatPath,
      modelsPath: selectedVendor.modelsPath,
      generation: selectedVendor.generation,
    }
  }

  /** 按当前类型显示已匹配的地址后缀 */
  const endpointHints = (): Array<{ label: string; path: string }> => {
    if (!selectedVendor) return []
    const gen = (selectedVendor.generation ?? {}) as Record<string, string>
    if (providerType === 'image') {
      return gen.imagesPath ? [{ label: '文生图 / 图生图', path: gen.imagesPath }] : []
    }
    if (providerType === 'video') {
      const out: Array<{ label: string; path: string }> = []
      if (gen.videosPath) out.push({ label: '视频生成', path: gen.videosPath })
      if (gen.taskPath) out.push({ label: '异步任务查询', path: gen.taskPath })
      return out
    }
    const out: Array<{ label: string; path: string }> = []
    if (selectedVendor.chatPath) out.push({ label: '对话', path: selectedVendor.chatPath })
    if (selectedVendor.modelsPath) out.push({ label: '模型列表', path: selectedVendor.modelsPath })
    return out
  }

  /** 类型切到图片/视频且未选模板时，自动选第一个带生成模板的厂商（默认阿里百炼） */
  useEffect(() => {
    if (existingProvider) return
    if (providerType === 'chat') return
    if (vendorKey) return
    if (vendorList.length === 0) return
    const fallback = vendorList.find((v) => v.generation && Object.keys(v.generation).length > 0)
    if (fallback) applyVendor(fallback.vendor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerType, vendorKey, vendorList, existingProvider])

  // ----- Step 0 -----
  const handleTestConnection = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      message.warning('请填写 Base URL 和 API Key')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testAdminProvider({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        ...(testModel.trim() ? { model: testModel.trim() } : {}),
        ...(buildProviderConfig() ? { config: buildProviderConfig() } : {})
      })
      setTestResult({ type: 'success', msg: (r.response || '连接成功').slice(0, 120) })
    } catch (err: any) {
      setTestResult({ type: 'error', msg: err?.message || '连接失败' })
    } finally {
      setTesting(false)
    }
  }

  const handleCreateProvider = async (): Promise<number | null> => {
    if (!name.trim() || !baseUrl.trim()) {
      message.warning('请填写供应商名称和 Base URL')
      return null
    }
    if (providerId) return providerId
    try {
      const p = await createAdminProvider({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        isGlobal,
        ...(selectedVendor
          ? { apiStyle: selectedVendor.apiStyle, config: buildProviderConfig() }
          : {}),
      })
      createdInFlow.current = true
      setProviderId(p.id)
      return p.id
    } catch (err: any) {
      message.error('创建供应商失败: ' + (err?.message || '未知错误'))
      return null
    }
  }

  const handleNextFromStep0 = async () => {
    const id = await handleCreateProvider()
    if (id) setStep(1)
  }

  // ----- Step 1 -----
  const handleFetchModels = async () => {
    if (!providerId) return
    setFetching(true)
    setFetchError('')
    setModels([])
    setSelectedKeys([])
    setPricingMap({})
    try {
      const canFetchUpstream = providerType === 'chat' || hints.length === 0
      if (canFetchUpstream) {
        // 对话/文本：OpenAI 兼容 /models 读取上游模型列表；
        // 图片/视频 + 中转/OpenAI（无官方生成端点模板）：同样直接拉取上游 /models
        const r = await fetchProviderModels(providerId)
        const rows: FetchRow[] = (r.models || []).map((m) => ({ ...m }))
        setModels(rows)
        const prefill: Record<string, PricingRow> = {}
        for (const m of rows) {
          prefill[m.modelId] = {
            displayName: m.modelId,
            outputType: 'text',
            inputTypes: ['text'],
            // 上游价格(元/千token) -> 积分/千token (x100)
            inputPricePer1k: m.upstreamInputPrice != null ? Math.round(m.upstreamInputPrice * 100 * 100) / 100 : 0,
            outputPricePer1k: m.upstreamOutputPrice != null ? Math.round(m.upstreamOutputPrice * 100 * 100) / 100 : 0,
            enabled: true,
          }
        }
        setPricingMap(prefill)
        return
      }
      // 图片/视频：平台无列表接口，加载厂商官方预设（market/presets?type=image|video）
      if (!vendorKey) {
        setFetchError('请先在「连接信息」中选择供应商模板（厂商），系统才能匹配图片/视频生成地址并加载官方预设')
        return
      }
      const presets = await fetchMarketPresets(vendorKey, providerType)
      if (presets.length === 0) {
        setFetchError(
          `该厂商没有${providerType === 'image' ? '图片' : '视频'}官方预设模型，且该厂商无生成端点模板；请改用「对话」类型通过 OpenAI 兼容 /models 读取，或确认上游是否提供图片/视频模型列表`,
        )
        return
      }
      const rows: FetchRow[] = presets.map((p) => ({
        modelId: p.upstreamModelId,
        presetKey: p.key,
        presetName: p.name,
        priceText: formatPresetPrice(p),
        outputType: (OUTPUT_BY_MODE[p.callMode] as ModelOutputType) ?? 'text',
        alreadyExists: false,
      }))
      setModels(rows)
      const prefill: Record<string, PricingRow> = {}
      for (const m of rows) {
        prefill[m.modelId] = {
          displayName: m.presetName || m.modelId,
          outputType: m.outputType ?? 'text',
          inputTypes: ['text'],
          inputPricePer1k: 0,
          outputPricePer1k: 0,
          enabled: true,
        }
      }
      setPricingMap(prefill)
    } catch (err: any) {
      setFetchError(err?.message || '读取模型列表失败')
      setModels([])
    } finally {
      setFetching(false)
    }
  }

  const filteredModels = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase()
    if (!kw) return models
    return models.filter((m) => m.modelId.toLowerCase().includes(kw))
  }, [models, searchKeyword])

  const selectedModels = useMemo(() => {
    const keySet = new Set(selectedKeys)
    return models.filter((m) => keySet.has(m.modelId) && !m.alreadyExists)
  }, [models, selectedKeys])

  const modelColumns: TableColumnsType<FetchRow> = [
    { title: '模型 ID', dataIndex: 'modelId', key: 'modelId' },
    {
      title: providerType === 'chat' ? '上游参考价(元/千token)' : '参考价（积分）',
      key: 'price',
      width: 220,
      render: (_, m) => {
        if (m.priceText) return <span style={{ color: '#c7d2fe', fontSize: 12 }}>{m.priceText}</span>
        const has = m.upstreamInputPrice != null || m.upstreamOutputPrice != null
        if (!has) return <span style={{ color: '#8b949e' }}>未知</span>
        return (
          <span style={{ color: '#c7d2fe', fontSize: 12 }}>
            {m.upstreamInputPrice ?? '-'} / {m.upstreamOutputPrice ?? '-'}
          </span>
        )
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_, m) =>
        m.alreadyExists ? <Tag color="orange">已存在</Tag> : <Tag color="green">可导入</Tag>,
    },
  ]

  // ----- Step 2 -----
  const updatePricing = (id: string, patch: Partial<PricingRow>) => {
    setPricingMap((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const pricingColumns: TableColumnsType<FetchRow> = [
    { title: '模型 ID(上游)', dataIndex: 'modelId', key: 'modelId', width: 200 },
    {
      title: '显示名',
      key: 'displayName',
      width: 200,
      render: (_, m) => (
        <Input
          value={pricingMap[m.modelId]?.displayName ?? m.presetName ?? m.modelId}
          onChange={(e) => updatePricing(m.modelId, { displayName: e.target.value })}
          maxLength={128}
        />
      ),
    },
    {
      title: '参考价',
      key: 'refPrice',
      width: 180,
      render: (_, m) =>
        m.priceText ? (
          <span style={{ color: '#c7d2fe', fontSize: 12 }}>{m.priceText}</span>
        ) : (
          <span style={{ color: '#8b949e' }}>—</span>
        ),
    },
    {
      title: '输出类型',
      key: 'outputType',
      width: 120,
      render: (_, m) => (
        <Select
          value={pricingMap[m.modelId]?.outputType ?? 'text'}
          onChange={(v) => updatePricing(m.modelId, { outputType: v })}
          options={OUTPUT_TYPE_OPTIONS}
          style={{ width: 100 }}
          placeholder="输出"
          disabled={Boolean(m.presetKey)}
        />
      ),
    },
    {
      title: '输入类型',
      key: 'inputTypes',
      width: 170,
      render: (_, m) => (
        <Select
          mode="multiple"
          value={pricingMap[m.modelId]?.inputTypes ?? ['text']}
          onChange={(v) => updatePricing(m.modelId, { inputTypes: v })}
          options={INPUT_TYPE_OPTIONS}
          style={{ width: 150 }}
          placeholder="输入能力"
          disabled={Boolean(m.presetKey)}
        />
      ),
    },
    {
      title: '输入积分(千token)',
      key: 'input',
      width: 150,
      render: (_, m) =>
        m.presetKey ? (
          <span style={{ color: '#8b949e' }}>—</span>
        ) : (
          <InputNumber
            value={pricingMap[m.modelId]?.inputPricePer1k ?? 0}
            onChange={(v) => updatePricing(m.modelId, { inputPricePer1k: v ?? 0 })}
            min={0}
            step={0.01}
            style={{ width: 130 }}
          />
        ),
    },
    {
      title: '输出积分(千token)',
      key: 'output',
      width: 150,
      render: (_, m) =>
        m.presetKey ? (
          <span style={{ color: '#8b949e' }}>—</span>
        ) : (
          <InputNumber
            value={pricingMap[m.modelId]?.outputPricePer1k ?? 0}
            onChange={(v) => updatePricing(m.modelId, { outputPricePer1k: v ?? 0 })}
            min={0}
            step={0.01}
            style={{ width: 130 }}
          />
        ),
    },
    {
      title: '启用',
      key: 'enabled',
      width: 80,
      render: (_, m) => (
        <Switch
          checked={pricingMap[m.modelId]?.enabled ?? true}
          onChange={(v) => updatePricing(m.modelId, { enabled: v })}
          checkedChildren="开"
          unCheckedChildren="关"
        />
      ),
    },
  ]

  const handleImport = async () => {
    if (!providerId || selectedModels.length === 0) return
    setImporting(true)
    setImportResult(null)
    try {
      // 图片/视频预设：走市场批量导入（带生成适配参数/按张按秒计费）
      if (selectedModels.every((m) => m.presetKey)) {
        const r = await marketImportModels({
          providerId,
          items: selectedModels.map((m) => ({
            presetKey: m.presetKey!,
            displayName: pricingMap[m.modelId]?.displayName || m.presetName || m.modelId,
            enabled: pricingMap[m.modelId]?.enabled ?? true,
          })),
        })
        setImportResult({
          imported: r.imported,
          skipped: r.failed,
          errors: r.results
            .filter((x) => !x.ok)
            .map((x) => ({ modelId: x.presetKey, error: x.error || '导入失败' })),
        })
        if (r.imported > 0) {
          message.success(`成功导入 ${r.imported} 个模型` + (r.failed ? `，失败 ${r.failed} 个` : ''))
          onRefresh()
        } else if (r.failed) {
          message.warning('导入失败: ' + (r.results.find((x) => !x.ok)?.error || '未知错误'))
        }
        return
      }
      // 对话/文本：逐模型定价 token 导入
      const modelsPayload: ImportProviderModelItem[] = selectedModels.map((m) => {
        const row = pricingMap[m.modelId] ?? {
          displayName: m.modelId,
          outputType: 'text' as ModelOutputType,
          inputTypes: ['text'] as ModelInputType[],
          inputPricePer1k: 0,
          outputPricePer1k: 0,
          enabled: true,
        }
        return {
          upstreamModelId: m.modelId,
          displayName: row.displayName || m.modelId,
          outputType: row.outputType || 'text',
          inputTypes: row.inputTypes && row.inputTypes.length ? row.inputTypes : ['text'],
          inputPricePer1k: row.inputPricePer1k ?? 0,
          outputPricePer1k: row.outputPricePer1k ?? 0,
          enabled: row.enabled ?? true,
        }
      })
      const r = await importProviderModels(providerId, { models: modelsPayload })
      setImportResult(r)
      if (r.imported > 0) {
        message.success(`成功导入 ${r.imported} 个模型` + (r.skipped ? `，跳过 ${r.skipped} 个` : ''))
        onRefresh()
      } else if (r.errors.length) {
        message.warning(`导入失败: ${r.errors[0].error}`)
      }
    } catch (err: any) {
      message.error('导入失败: ' + (err?.message || '未知错误'))
    } finally {
      setImporting(false)
    }
  }

  const footer = (() => {
    if (step === 0) {
      return [
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="next" type="primary" onClick={handleNextFromStep0}>下一步</Button>,
      ]
    }
    if (step === 1) {
      return [
        <Button key="back" onClick={() => setStep(0)}>上一步</Button>,
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="next" type="primary" disabled={selectedModels.length === 0} onClick={() => setStep(2)}>
          下一步({selectedModels.length})
        </Button>,
      ]
    }
    return [
      <Button key="back" onClick={() => setStep(1)}>上一步</Button>,
      <Button key="cancel" onClick={handleClose}>取消</Button>,
      <Button key="import" type="primary" loading={importing} onClick={handleImport}>
        确认导入
      </Button>,
    ]
  })()

  const hints = endpointHints()

  return (
    <>
    <Modal
      title={existingProvider ? `读取模型并导入 - ${existingProvider.name}` : '添加第三方供应商'}
      open={open}
      onCancel={handleClose}
      footer={footer}
      width={880}
      destroyOnClose={false}
    >
      <Steps current={step} items={STEPS} style={{ marginBottom: 20 }} />

      {step === 0 && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 6, color: '#c7d2fe' }}>供应商模板（选填：选择后自动匹配该厂商的地址后缀）</div>
            <Select
              style={{ width: '100%' }}
              placeholder="选择厂商模板（如 阿里百炼 DashScope）"
              value={vendorKey || undefined}
              onChange={(v) => applyVendor(v ? String(v) : '')}
              allowClear
              options={vendorList.map((v) => ({
                label: v.nameSuggestion + (v.hasProvider ? '（已创建）' : ''),
                value: v.vendor,
              }))}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 6, color: '#c7d2fe' }}>模型类型（决定自动匹配的地址后缀与读取方式）</div>
            <Segmented
              value={providerType}
              onChange={(v) => setProviderType(v as ProviderType)}
              options={TYPE_OPTIONS}
            />
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>
              同一个供应商、同一个 API Key，只是 URL 后缀不同；选择类型后系统自动匹配后缀，无需手填。
            </div>
          </div>
          {hints.length > 0 && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 12 }}
              message="已自动匹配地址后缀（保存进该供应商配置，测试/调用/读取都会用上）"
              description={
                <div style={{ fontSize: 12 }}>
                  {hints.map((h) => (
                    <div key={h.label}>
                      {h.label}: <span style={{ color: '#00d68f' }}>{h.path}</span>
                    </div>
                  ))}
                </div>
              }
            />
          )}
          {providerType !== 'chat' && hints.length === 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="该厂商模板没有图片/视频专属端点（如中转/OpenAI）"
              description="将按 OpenAI 兼容 /models 列表读取；若你的上游中转支持图片/视频模型也能读到，否则请改用官方预设较多的厂商（如阿里百炼 DashScope）。"
            />
          )}
          <div style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 6, color: '#c7d2fe' }}>供应商名称</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如: 阿里百炼 / DeepSeek 中转"
              maxLength={64}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 6, color: '#c7d2fe' }}>Base URL (OpenAI 兼容)</div>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com/v1"
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 6, color: '#c7d2fe' }}>API Key（调用第三方 API 的真实凭据，图片/对话/视频共用同一个）</div>
            <Space.Compact style={{ width: '100%' }}>
              <Input.Password
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="new-password"
              />
              <Button
                icon={<ApiOutlined />}
                loading={testing}
                onClick={handleTestConnection}
              >
                测试连接
              </Button>
            </Space.Compact>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 6, color: '#c7d2fe' }}>设为全局中转（可选）</div>
            <Switch
              checked={isGlobal}
              onChange={setIsGlobal}
              checkedChildren="全局"
              unCheckedChildren="普通"
            />
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>
              全站唯一：所有模型默认使用该供应商的 BaseURL+Key 调用；置为全局后，其他供应商的全局标记会被自动取消
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 6, color: '#c7d2fe' }}>测试模型（可选，用于连接测试）</div>
            <Input
              value={testModel}
              onChange={(e) => setTestModel(e.target.value)}
              placeholder="默认 gpt-3.5-turbo；DeepSeek 可填 deepseek-chat；留空则自动检测"
              maxLength={128}
            />
          </div>
          {testResult && (
            <Alert
              type={testResult.type}
              showIcon
              message={testResult.type === 'success' ? '连接成功' : '连接失败'}
              description={testResult.msg}
              style={{ marginBottom: 10 }}
            />
          )}
          <div style={{ color: '#8b949e', fontSize: 12 }}>
            下一步将保存供应商并读取其上游模型列表；保存后可随时在「供应商管理」中编辑或删除；设为全局中转后，全站模型将默认使用该供应商的 BaseURL+Key 调用。
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <Space style={{ marginBottom: 12 }} wrap>
            <Segmented
              value={providerType}
              onChange={(v) => {
                setProviderType(v as ProviderType)
                setModels([])
                setSelectedKeys([])
                setPricingMap({})
                setFetchError('')
              }}
              options={TYPE_OPTIONS}
            />
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={fetching}
              onClick={handleFetchModels}
            >
              {providerType === 'chat' || hints.length === 0
                ? '读取模型列表'
                : `加载${providerType === 'image' ? '图片' : '视频'}预设模型`}
            </Button>
            {providerType !== 'chat' && (
              <Button icon={<PlusOutlined />} onClick={() => setManualOpen(true)}>
                手动添加模型
              </Button>
            )}
            <Input
              placeholder="搜索模型 ID"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
          </Space>
          {step === 1 && providerType !== 'chat' && !selectedVendor && (
            <Alert
              type="warning"
              showIcon
              message="未关联厂商模板"
              description="该供应商没有厂商模板信息，无法加载图片/视频预设。请删除后重新通过「添加第三方供应商」选择模板创建，或改用「对话」类型读取模型列表。"
              style={{ marginBottom: 12 }}
            />
          )}
          {fetchError && <Alert type="error" showIcon message={fetchError} style={{ marginBottom: 12 }} />}
          {models.length > 0 && (
            <Table<FetchRow>
              rowKey="modelId"
              columns={modelColumns}
              dataSource={filteredModels}
              pagination={false}
              size="small"
              scroll={{ y: 340 }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: (keys) => setSelectedKeys(keys),
                getCheckboxProps: (record: FetchRow) => ({
                  disabled: record.alreadyExists,
                }),
              }}
              footer={() => (
                <span style={{ color: '#c7d2fe' }}>已选 {selectedModels.length} 个模型待导入</span>
              )}
            />
          )}
          {models.length === 0 && !fetchError && (
            <div style={{ color: '#8b949e', fontSize: 12, marginTop: 8 }}>
              {providerType === 'chat' || hints.length === 0
                ? '点击「读取模型列表」拉取该供应商上游 /models（中转/OpenAI 兼容可拉到图片/视频模型）'
                : `点击「加载${providerType === 'image' ? '图片' : '视频'}预设模型」获取 ${selectedVendor?.nameSuggestion ?? '该厂商'} 的官方${providerType === 'image' ? '图片' : '视频'}模型（阿里百炼等平台没有图片/视频模型列表接口，直接加载官方预设，地址后缀已自动匹配）`}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          {providerType !== 'chat' ? (
            <Alert
              type="info"
              showIcon
              message={`${providerType === 'image' ? '图片' : '视频'}模型预设导入`}
              description="参考积分来自官方预设（图片按张、视频按秒），导入后可在模型列表调整；生成地址/异步任务等适配参数已由厂商模板自动写入，无需手填。"
              style={{ marginBottom: 12 }}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="逐模型定价（积分/千token，1 元 = 100 积分）"
              description="每个勾选的模型可单独配置最终积分单价与模型类型；用户端选择模型时会显示该积分价格，使用后按实际 token 扣除。"
              style={{ marginBottom: 12 }}
            />
          )}
          <Table<FetchRow>
            rowKey="modelId"
            columns={pricingColumns}
            dataSource={selectedModels}
            pagination={false}
            size="small"
            scroll={{ x: 1080, y: 340 }}
            footer={() => (<span style={{ color: '#c7d2fe' }}>共 {selectedModels.length} 个模型</span>)}
          />
          {importResult && (
            <Alert
              type={importResult.imported > 0 ? 'success' : 'error'}
              showIcon
              style={{ marginTop: 12 }}
              message={`导入完成: 成功 ${importResult.imported}，跳过 ${importResult.skipped}`}
              description={importResult.errors.length ? importResult.errors.map((e) => e.modelId + ': ' + e.error).join('；') : undefined}
            />
          )}
        </div>
      )}
    </Modal>

    <ManualModelModal
      open={manualOpen}
      providerType={providerType}
      providerId={providerId}
      onClose={() => setManualOpen(false)}
      onSaved={() => {
        setManualOpen(false)
        onRefresh()
      }}
    />
    </>
  )
}

/** 手动添加模型（官方有、预设没有）：填真实上游模型 ID，自动套用该类型官方模板的生成适配参数 */
function ManualModelModal(props: {
  open: boolean
  providerType: ProviderType
  providerId: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const { open, providerType, providerId, onClose, onSaved } = props
  const [genType, setGenType] = useState<'image' | 'image_edit' | 'video'>(
    providerType === 'video' ? 'video' : 'image',
  )
  const [modelId, setModelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pricePerImage, setPricePerImage] = useState(12)
  const [price720, setPrice720] = useState(2)
  const [price1080, setPrice1080] = useState(4)
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setGenType(providerType === 'video' ? 'video' : 'image')
      setModelId('')
      setDisplayName('')
      setPricePerImage(12)
      setPrice720(2)
      setPrice1080(4)
      setEnabled(true)
    }
  }, [open, providerType])

  const isVideo = genType === 'video'
  const templateKey =
    genType === 'image' ? 'qwen-image' : genType === 'image_edit' ? 'wanx-sketch' : 'wan2.2-t2v'

  const handleSubmit = async () => {
    const id = modelId.trim()
    if (!id) {
      message.warning('请填写官方真实模型 ID')
      return
    }
    if (!providerId) {
      message.warning('请先保存供应商（下一步后再手动添加）')
      return
    }
    setSaving(true)
    try {
      const priceOverrides = isVideo
        ? { videoPerSecond: { '720P': price720 ?? 0, '1080P': price1080 ?? 0 } }
        : { pricePerImage: pricePerImage ?? 0 }
      await createModelFromTemplate({
        templateKey,
        modelId: id,
        displayName: displayName.trim() || undefined,
        providerId,
        enabled,
        priceOverrides,
      })
      message.success(`已添加模型 ${id}` + (enabled ? '（已上架）' : '（已下架）'))
      onSaved()
    } catch (err: any) {
      message.error('添加失败: ' + (err?.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="手动添加模型（官方有、预设没有）"
      open={open}
      onCancel={onClose}
      width={580}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>
            添加
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="只需填官方真实模型 ID"
        description="生成地址、请求参数、异步任务等适配参数会自动套用所选类型的官方模板（文生图/图像编辑/视频生成），无需手填。"
      />
      <div style={{ marginBottom: 14 }}>
        <div style={{ marginBottom: 6, color: '#c7d2fe' }}>生成类型</div>
        <Segmented
          value={genType}
          onChange={(v) => setGenType(v as 'image' | 'image_edit' | 'video')}
          options={[
            { label: '文生图', value: 'image' },
            { label: '图像编辑（图生图/线稿）', value: 'image_edit' },
            { label: '视频生成', value: 'video' },
          ]}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ marginBottom: 6, color: '#c7d2fe' }}>真实模型 ID（上游 API 的 model 字段）</div>
        <Input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder={isVideo ? '如 wan2.1-t2v-turbo / qwen-video-max' : '如 wanx2.1-t2i-turbo / wanx2.1-sketch-to-image'}
          maxLength={64}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ marginBottom: 6, color: '#c7d2fe' }}>显示名（可选）</div>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="留空则用模型 ID"
          maxLength={128}
        />
      </div>
      {isVideo ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ marginBottom: 6, color: '#c7d2fe' }}>积分/秒（按分辨率档，用户端视频选择框按此显示）</div>
          <Space>
            <span style={{ color: '#8b949e' }}>720P</span>
            <InputNumber value={price720} onChange={(v) => setPrice720(v ?? 0)} min={0} step={0.5} style={{ width: 130 }} />
            <span style={{ color: '#8b949e' }}>1080P</span>
            <InputNumber value={price1080} onChange={(v) => setPrice1080(v ?? 0)} min={0} step={0.5} style={{ width: 130 }} />
          </Space>
          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>
            生成时按实际时长扣除；更多分辨率档可到模型列表增删。
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <div style={{ marginBottom: 6, color: '#c7d2fe' }}>积分/张（用户端图片选择框按此显示）</div>
          <InputNumber value={pricePerImage} onChange={(v) => setPricePerImage(v ?? 0)} min={0} step={1} style={{ width: 180 }} />
        </div>
      )}
      <div style={{ marginBottom: 6 }}>
        <div style={{ marginBottom: 6, color: '#c7d2fe' }}>是否上架</div>
        <Switch checked={enabled} onChange={setEnabled} checkedChildren="上架" unCheckedChildren="下架" />
        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>
          建议先下架，在模型列表测试通过后再上架，避免用户端出现不可用模型。
        </div>
      </div>
    </Modal>
  )
}
