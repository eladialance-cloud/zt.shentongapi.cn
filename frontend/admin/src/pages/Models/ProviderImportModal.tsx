// 添加第三方供应商 + 读取上游模型 + 逐模型定价导入 Modal (v0.7.0)
//
// 流程：
//   Step 0 连接信息: 名称 + Base URL + API Key + [测试连接]
//   Step 1 读取模型: [读取模型列表] -> 勾选(已存在禁用)
//   Step 2 逐模型定价: 每行显示名/模型类型/输入积分/输出积分/启用 -> [确认导入]
//
// 价格单位：积分/千token（1 元 = 100 积分）。上游返回价格为元/千token时按 x100 预填。
//
// API:
//   POST /admin/models/providers                 新增供应商
//   POST /admin/models/providers/test            测试连接
//   POST /admin/models/providers/:id/fetch-models 读取上游模型
//   POST /admin/models/providers/:id/import      勾选逐模型定价导入

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Key } from 'react'
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ApiOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  createAdminProvider,
  fetchProviderModels,
  importProviderModels,
  removeAdminProvider,
  testAdminProvider,
} from '@/api/admin-model-api'
import type {
  AdminProviderItem,
  ImportProviderModelItem,
  ImportProviderModelsResult,
  UpstreamModel
} from '@/types/admin-model'
import {
  INPUT_TYPE_OPTIONS,
  OUTPUT_TYPE_OPTIONS,
  type ModelInputType,
  type ModelOutputType
} from '@/utils/model-type'

const STEPS = [{ title: '连接信息' }, { title: '读取模型' }, { title: '逐模型定价' }]

/** 每个勾选模型的定价配置（类型=输出类型、能力=输入类型） */
interface PricingRow {
  displayName: string
  outputType: ModelOutputType
  inputTypes: ModelInputType[]
  inputPricePer1k: number
  outputPricePer1k: number
  enabled: boolean
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
  const [models, setModels] = useState<UpstreamModel[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  // Step 2 逐模型定价
  const [pricingMap, setPricingMap] = useState<Record<string, PricingRow>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportProviderModelsResult | null>(null)

  /** 进入 Modal 时重置状态 */
  const resetFlow = (fromProvider?: AdminProviderItem | null) => {
    if (fromProvider) {
      setProviderId(fromProvider.id)
      setStep(1)
      createdInFlow.current = false
    } else {
      setProviderId(null)
      setStep(0)
      createdInFlow.current = false
    }
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
        ...(testModel.trim() ? { model: testModel.trim() } : {})
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
    try {
      const r = await fetchProviderModels(providerId)
      setModels(r.models || [])
      const prefill: Record<string, PricingRow> = {}
      for (const m of r.models || []) {
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

  const modelColumns: TableColumnsType<UpstreamModel> = [
    { title: '模型 ID', dataIndex: 'modelId', key: 'modelId' },
    {
      title: '上游参考价(元/千token)',
      key: 'price',
      width: 220,
      render: (_, m) => {
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

  const pricingColumns: TableColumnsType<UpstreamModel> = [
    { title: '模型 ID(上游)', dataIndex: 'modelId', key: 'modelId', width: 200 },
    {
      title: '显示名',
      key: 'displayName',
      width: 200,
      render: (_, m) => (
        <Input
          value={pricingMap[m.modelId]?.displayName ?? m.modelId}
          onChange={(e) => updatePricing(m.modelId, { displayName: e.target.value })}
          maxLength={128}
        />
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
        />
      ),
    },
    {
      title: '输入积分(千token)',
      key: 'input',
      width: 150,
      render: (_, m) => (
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
      render: (_, m) => (
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
    setImporting(true)
    setImportResult(null)
    try {
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

  return (
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
            <div style={{ marginBottom: 6, color: '#c7d2fe' }}>供应商名称</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如: DeepSeek 中转 / 汇智 API"
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
            <div style={{ marginBottom: 6, color: '#c7d2fe' }}>API Key（调用第三方 API 的真实凭据）</div>
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
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={fetching}
              onClick={handleFetchModels}
            >
              读取模型列表
            </Button>
            <Input
              placeholder="搜索模型 ID"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
          </Space>
          {fetchError && <Alert type="error" showIcon message={fetchError} style={{ marginBottom: 12 }} />}
          {models.length > 0 && (
            <Table<UpstreamModel>
              rowKey="modelId"
              columns={modelColumns}
              dataSource={filteredModels}
              pagination={false}
              size="small"
              scroll={{ y: 340 }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: (keys) => setSelectedKeys(keys),
                getCheckboxProps: (record: UpstreamModel) => ({
                  disabled: record.alreadyExists,
                }),
              }}
              footer={() => (
                <span style={{ color: '#c7d2fe' }}>已选 {selectedModels.length} 个模型待导入</span>
              )}
            />
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <Alert
            type="info"
            showIcon
            message="逐模型定价（积分/千token，1 元 = 100 积分）"
            description="每个勾选的模型可单独配置最终积分单价与模型类型；用户端选择模型时会显示该积分价格，使用后按实际 token 扣除。"
            style={{ marginBottom: 12 }}
          />
          <Table<UpstreamModel>
            rowKey="modelId"
            columns={pricingColumns}
            dataSource={selectedModels}
            pagination={false}
            size="small"
            scroll={{ x: 940, y: 340 }}
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
  )
}
