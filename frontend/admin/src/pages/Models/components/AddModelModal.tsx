// 添加大模型（单模型窗口）v0.10.0
//
// 流程：选供应商(已有自动带 URL+Key，或现场新建) -> 模型类型(对话/图片/视频/语音)
//       -> 调用模式(细分,自动归类类型标签/能力标签) -> 场景标签(用户端显示)
//       -> 参数配置(按类型动态) -> 积分扣除(按类型动态) -> 上架
//
// API:
//   POST /admin/models/providers           新建供应商（选"新建供应商"时）
//   POST /admin/models/providers/test      测试连接
//   POST /admin/models                     新增模型

import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  message
} from 'antd'
import { ApiOutlined } from '@ant-design/icons'
import {
  createAdminModel,
  createAdminProvider,
  fetchMarketVendors,
  testAdminProvider
} from '@/api/admin-model-api'
import type {
  AdminProviderItem,
  AdvancedCapability,
  CallModesMeta,
  CreateAdminModelDto,
  MarketVendor,
  ModelInputType,
  ModelOutputType
} from '@/types/admin-model'
import CallModePicker from './CallModePicker'
import DynamicSpecForm from './DynamicSpecForm'
import ScenarioTagPicker from './ScenarioTagPicker'
import PricingConfigForm from './PricingConfigForm'
import { ADVANCED_CAP_OPTIONS, deriveModelType, MODEL_TYPE_LABEL } from '@/utils/model-type'

const MODEL_TYPE_COLOR: Record<string, string> = {
  chat: 'geekblue',
  vision: 'cyan',
  image: 'green',
  image_edit: 'lime',
  video: 'purple',
  tts: 'orange',
  embedding: 'cyan',
  audio: 'gold'
}

/** 输出大类（用户端四大类选择） */
const OUTPUT_GROUPS: Array<{ label: string; value: ModelOutputType }> = [
  { label: '对话（文本输出）', value: 'text' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '语音', value: 'audio' }
]

const NEW_PROVIDER = '__new__'

interface AddModelFormValues {
  callMode: string
  displayName: string
  upstreamModelId: string
  inputTypes: ModelInputType[]
  advancedCapabilities: AdvancedCapability[]
  scenarioTags: string[]
  specs: Record<string, unknown>
  videoPerSecondList: Array<{ resolution: string; rate: number }>
  generationParamsText?: string
  pricingMode?: string
  inputPricePerToken?: number
  outputPricePerToken?: number
  pricePerImage?: number
  pricePerCall?: number
  pricePerMinute?: number
  costPrice?: number
  enabled: boolean
  remark?: string
}

export default function AddModelModal(props: {
  open: boolean
  providers: AdminProviderItem[]
  meta?: CallModesMeta
  onClose: () => void
  onSaved: () => void
}) {
  const { open, providers, meta, onClose, onSaved } = props
  const [form] = Form.useForm<AddModelFormValues>()
  const [providerSelect, setProviderSelect] = useState<number | typeof NEW_PROVIDER | undefined>()
  // 新建供应商
  const [newName, setNewName] = useState('')
  const [newBaseUrl, setNewBaseUrl] = useState('')
  const [newApiKey, setNewApiKey] = useState('')
  // 厂商模板（新建供应商时自动匹配 URL 后缀与生成适配；图片/视频必选）
  const [vendorList, setVendorList] = useState<MarketVendor[]>([])
  const [newVendorKey, setNewVendorKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)
  // 输出大类（联动调用模式）
  const [outputGroup, setOutputGroup] = useState<ModelOutputType>('text')

  const callMode = Form.useWatch('callMode', form)
  const callModeDef = useMemo(
    () => meta?.callModes.find((m) => m.key === callMode),
    [meta, callMode]
  )

  const groupCallModes = useMemo(
    () => (meta?.callModes ?? []).filter((m) => m.output === outputGroup),
    [meta, outputGroup]
  )

  useEffect(() => {
    fetchMarketVendors().then(setVendorList).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (open) {
      form.resetFields()
      setProviderSelect(undefined)
      setOutputGroup('text')
      setNewName('')
      setNewBaseUrl('')
      setNewApiKey('')
      setNewVendorKey('')
      setTestResult(null)
      const def = meta?.callModes.find((m) => m.key === 'text_chat')
      form.setFieldsValue({
        callMode: 'text_chat',
        displayName: '',
        upstreamModelId: '',
        inputTypes: def?.inputs ?? ['text'],
        advancedCapabilities: (def?.advancedCaps as AdvancedCapability[]) ?? [],
        scenarioTags: [],
        specs: {},
        pricingMode: def?.recommendedBilling,
        enabled: false
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meta])

  const selectedProvider = providers.find((p) => p.id === providerSelect) ?? null
  const derivedType = useMemo(() => {
    if (!callModeDef) return 'chat'
    return deriveModelType(callModeDef.output, callModeDef.inputs)
  }, [callModeDef])

  const handleGroupChange = (g: ModelOutputType) => {
    setOutputGroup(g)
    const first = groupCallModes.find((m) => m.output === g) ?? groupCallModes[0]
    if (first) {
      form.setFieldsValue({
        callMode: first.key,
        inputTypes: first.inputs,
        advancedCapabilities: (first.advancedCaps as AdvancedCapability[]) ?? [],
        pricingMode: first.recommendedBilling,
        specs: {}
      })
    }
  }

  /** 选择厂商模板：自动预填名称/Base URL，保存时写入 chatPath/modelsPath/generation（图片/视频生成地址） */
  const applyVendor = (k: string) => {
    setNewVendorKey(k)
    const v = vendorList.find((x) => x.vendor === k)
    if (!v) return
    if (!newName.trim()) setNewName(v.nameSuggestion)
    if (!newBaseUrl.trim()) setNewBaseUrl(v.baseUrl)
  }

  const handleTest = async () => {
    if (providerSelect === NEW_PROVIDER) {
      if (!newBaseUrl.trim() || !newApiKey.trim()) {
        message.warning('请填写新供应商的 Base URL 和 API Key')
        return
      }
      setTesting(true)
      setTestResult(null)
      try {
        const r = await testAdminProvider({
          baseUrl: newBaseUrl.trim(),
          apiKey: newApiKey.trim(),
          model: outputGroup === 'image' ? undefined : 'gpt-3.5-turbo'
        })
        setTestResult({ ok: true, msg: (r.response || '连接成功').slice(0, 120) })
      } catch (err: any) {
        setTestResult({ ok: false, msg: err?.message || '连接失败' })
      } finally {
        setTesting(false)
      }
      return
    }
    if (!selectedProvider) {
      message.warning('请先选择供应商')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testAdminProvider({ providerId: selectedProvider.id })
      setTestResult({ ok: true, msg: (r.response || '连接成功').slice(0, 120) })
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.message || '连接失败' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!providerSelect) {
      message.warning('请选择供应商')
      return
    }
    let providerId: number
    if (providerSelect === NEW_PROVIDER) {
      if (!newName.trim() || !newBaseUrl.trim() || !newApiKey.trim()) {
        message.warning('请完整填写新供应商：名称 / Base URL / API Key')
        return
      }
      try {
        const vendor = vendorList.find((v) => v.vendor === newVendorKey)
        const p = await createAdminProvider({
          name: newName.trim(),
          baseUrl: newBaseUrl.trim(),
          apiKey: newApiKey.trim(),
          ...(vendor
            ? {
                apiStyle: vendor.apiStyle,
                config: {
                  vendorKey: vendor.vendor,
                  chatPath: vendor.chatPath,
                  modelsPath: vendor.modelsPath,
                  generation: vendor.generation
                }
              }
            : {})
        })
        providerId = p.id
        providerId = p.id
      } catch (err: any) {
        message.error('创建供应商失败: ' + (err?.message || '未知错误'))
        return
      }
    } else {
      providerId = providerSelect
    }
    let values: AddModelFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const def = meta?.callModes.find((m) => m.key === values.callMode)
    if (!def) {
      message.warning('请选择调用模式')
      return
    }
    const upstreamModelId = values.upstreamModelId?.trim()
    if (!upstreamModelId) {
      message.warning('请填写上游模型 ID（真实发给 API 的 model 字段）')
      return
    }
    setSaving(true)
    try {
      // 动态规格：仅保留当前调用模式的 specFields
      const specKeys = def.specFields ?? []
      const specs: Record<string, unknown> = {}
      if (values.specs) {
        for (const k of specKeys) {
          if (values.specs[k] !== undefined) specs[k] = values.specs[k]
        }
      }
      // 高级参数 JSON（可选）
      let generationParams: Record<string, unknown> = {}
      if (values.generationParamsText?.trim()) {
        try {
          generationParams = JSON.parse(values.generationParamsText) as Record<string, unknown>
        } catch {
          message.error('高级参数 JSON 格式错误')
          return
        }
      }
      // 视频按秒计费
      let videoPerSecond: Record<string, number> | undefined
      if (values.videoPerSecondList && values.videoPerSecondList.length) {
        videoPerSecond = Object.fromEntries(
          values.videoPerSecondList.map((row) => [row.resolution, row.rate])
        )
      }
      const dto: CreateAdminModelDto = {
        provider: '',
        modelId: upstreamModelId,
        upstreamModelId,
        displayName: values.displayName?.trim() || upstreamModelId,
        enabled: values.enabled,
        providerId,
        callMode: def.key,
        inputTypes: values.inputTypes?.length ? values.inputTypes : def.inputs,
        advancedCapabilities: values.advancedCapabilities ?? [],
        scenarioTags: values.scenarioTags ?? [],
        specs: Object.keys(specs).length ? specs : undefined,
        generationParams: Object.keys(generationParams).length ? generationParams : undefined,
        videoPerSecond,
        costPrice: values.costPrice,
        remark: values.remark?.trim() || undefined,
        minUserLevel: 1,
        capabilities: [],
        sortOrder: 0
      }
      const pricingMode = values.pricingMode
      if (pricingMode === 'per_image') dto.pricePerImage = values.pricePerImage
      else if (pricingMode === 'per_call') dto.pricePerCall = values.pricePerCall
      else if (pricingMode === 'per_minute') dto.pricePerMinute = values.pricePerMinute
      else if (pricingMode === 'per_second') {
        // videoPerSecond 已填
      } else {
        // token
        dto.inputPricePerToken = values.inputPricePerToken
        dto.outputPricePerToken = values.outputPricePerToken
      }
      await createAdminModel(dto)
      message.success('模型已添加' + (values.enabled ? '（已上架）' : '（已下架）'))
      onSaved()
    } catch (err: any) {
      message.error('添加失败: ' + (err?.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="添加大模型"
      open={open}
      onCancel={onClose}
      width={720}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onOk={() => void handleSave()}
    >
      <Form<AddModelFormValues> form={form} layout="vertical">
        {/* 供应商 */}
        <Form.Item label="供应商" required>
          <Select
            placeholder="选择已有供应商，或新建"
            value={providerSelect}
            onChange={(v) => {
              setProviderSelect(v as number | typeof NEW_PROVIDER)
              setTestResult(null)
            }}
            options={[
              ...providers.map((p) => ({ label: p.name + '（' + p.baseUrl + '）', value: p.id })),
              { label: '➕ 新建供应商…', value: NEW_PROVIDER }
            ]}
          />
        </Form.Item>

        {providerSelect === NEW_PROVIDER && (
          <div style={{ marginBottom: 14, padding: 12, border: '1px dashed #444', borderRadius: 8 }}>
            <div style={{ marginBottom: 10, color: '#c7d2fe' }}>新建供应商（同一个 Key，可同时挂对话/图片/视频/语音模型）</div>
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Select
                placeholder="厂商模板（选填；图片/视频模型必选，自动匹配生成地址后缀）"
                value={newVendorKey || undefined}
                onChange={(v) => applyVendor(v ? String(v) : '')}
                allowClear
                options={vendorList.map((v) => ({
                  label: v.nameSuggestion,
                  value: v.vendor
                }))}
              />
              {outputGroup !== 'text' && !newVendorKey && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ padding: '6px 10px' }}
                  message="图片/视频模型请选择厂商模板（如 阿里百炼 DashScope），否则生成地址需在模型编辑里手动配置，测试会失败"
                />
              )}
              <Input
                placeholder="供应商名称，如 阿里百炼"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={64}
              />
              <Input
                placeholder="Base URL，如 https://dashscope.aliyuncs.com/compatible-mode/v1"
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
              />
              <Space.Compact style={{ width: '100%' }}>
                <Input.Password
                  placeholder="API Key（sk-...）"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  autoComplete="new-password"
                />
                <Button icon={<ApiOutlined />} loading={testing} onClick={() => void handleTest()}>
                  测试连接
                </Button>
              </Space.Compact>
            </Space>
          </div>
        )}

        {selectedProvider && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={'已选供应商：' + selectedProvider.name}
            description={
              <Space direction="vertical" size={2} style={{ fontSize: 12 }}>
                <span>Base URL: {selectedProvider.baseUrl}</span>
                <span>API Key: {selectedProvider.apiKeyMasked || '未设置'}</span>
              </Space>
            }
            action={
              <Button size="small" loading={testing} onClick={() => void handleTest()}>
                测试连接
              </Button>
            }
          />
        )}
        {testResult && (
          <Alert
            style={{ marginBottom: 12 }}
            type={testResult.ok ? 'success' : 'error'}
            showIcon
            message={testResult.ok ? '连接成功' : '连接失败'}
            description={testResult.msg}
          />
        )}

        {/* 模型类型 -> 调用模式 */}
        <Form.Item label="模型类型（输出）" required>
          <Select
            value={outputGroup}
            onChange={(v) => handleGroupChange(v as ModelOutputType)}
            options={OUTPUT_GROUPS}
          />
        </Form.Item>
        <Form.Item name="callMode" label="调用模式（细分，自动归类）">
          <CallModePicker callModes={groupCallModes} />
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

        <Form.Item name="displayName" label="显示名" rules={[{ required: true, message: '请输入显示名' }]}>
          <Input maxLength={128} placeholder="用户端显示名称" />
        </Form.Item>
        <Form.Item
          name="upstreamModelId"
          label="上游模型 ID（真实发给 API 的 model 字段）"
          rules={[{ required: true, message: '请输入上游模型 ID' }]}
        >
          <Input maxLength={128} placeholder="如 qwen-plus / wanx2.1-t2i-turbo / qwen-video-plus" />
        </Form.Item>

        <Form.Item name="inputTypes" label="能力标签（输入类型，可调整）">
          <Select
            mode="multiple"
            options={[
              { label: '文字', value: 'text' },
              { label: '图片', value: 'image' },
              { label: '视频', value: 'video' },
              { label: '语音', value: 'audio' }
            ]}
          />
        </Form.Item>
        <Form.Item name="advancedCapabilities" label="高级能力（多选）">
          <Select
            mode="multiple"
            options={ADVANCED_CAP_OPTIONS}
            placeholder="函数调用 / 流式 / 推理 等"
          />
        </Form.Item>
        <Form.Item name="scenarioTags" label="场景标签（用户端显示，第一个作为展示）" initialValue={[]}>
          <ScenarioTagPicker
            scenarioTags={meta?.scenarioTags ?? []}
            displayName={form.getFieldValue('displayName')}
          />
        </Form.Item>
        {callModeDef && (
          <Form.Item label="参数配置（按类型动态）">
            <DynamicSpecForm specFields={callModeDef.specFields} schemas={meta?.specFieldSchemas ?? {}} />
          </Form.Item>
        )}
        <Form.Item label="积分扣除设置">
          <PricingConfigForm def={callModeDef} />
        </Form.Item>
        <Form.Item name="generationParamsText" label="高级参数（JSON，可选）">
          <Input.TextArea
            rows={3}
            placeholder={'如 {"video_resolutions":["720p","1080p"],"video_durations":[5,10]}；留空用供应商生成适配模板'}
          />
        </Form.Item>
        <Form.Item name="enabled" label="上架" valuePropName="checked">
          <Switch checkedChildren="上架" unCheckedChildren="下架" />
        </Form.Item>
        <Form.Item name="remark" label="备注（用户不可见）">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
