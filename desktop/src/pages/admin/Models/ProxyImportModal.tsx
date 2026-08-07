// 中转站批量导入 Modal - Task 6
//
// 3 步分步 Modal:
//   Step 1 连接信息: 中转站地址 + API Key + 测试连接 + 结果 Alert
//   Step 2 模型选择: 多选表格(搜索/已存在标记/底部计数)
//   Step 3 加价设置: 加价模式 Radio + 动态字段 + 预览表格 + 确认导入
//
// 价格体系(1 元 = 100 积分):
//   multiplier: 最终积分 = 上游价格(元) × 倍率 × 100
//   fixed:      最终积分 = 上游价格(元) × 100 + 加价(积分)
//   flat:       最终积分 = 固定值(积分)
//
// API:
//   POST /admin/models/proxy/fetch-models  拉取上游模型
//   POST /admin/models/proxy/import        批量导入

import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Radio,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ApiOutlined } from '@ant-design/icons'
import {
  fetchUpstreamModels,
  importModels
} from '@/api/admin-model-api'
import type {
  ImportModelItem,
  ImportModelsDto,
  ImportModelsResult,
  PricingConfig,
  PricingMode,
  UpstreamModel
} from '@/types/admin-model'

/** 保留 4 位小数 */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** 按加价模式计算最终积分价格(与后端一致) */
function calcFinalPrice(
  upstreamInput: number | undefined,
  upstreamOutput: number | undefined,
  mode: PricingMode,
  config: PricingConfig
): { input: number; output: number } {
  const upIn = upstreamInput ?? 0
  const upOut = upstreamOutput ?? 0
  if (mode === 'multiplier') {
    const m = config.multiplier ?? 1
    return {
      input: round4(upIn * m * 100),
      output: round4(upOut * m * 100)
    }
  }
  if (mode === 'fixed') {
    return {
      input: round4(upIn * 100 + (config.fixedInputAdd ?? 0)),
      output: round4(upOut * 100 + (config.fixedOutputAdd ?? 0))
    }
  }
  // flat
  return {
    input: config.flatInputPrice ?? 0,
    output: config.flatOutputPrice ?? 0
  }
}

interface ProxyImportModalProps {
  open: boolean
  onClose: () => void
  /** 导入完成并关闭后触发父组件刷新模型列表 */
  onRefresh: () => void
}

interface TestResult {
  type: 'success' | 'error'
  message: string
}

interface PreviewRow {
  key: string
  modelId: string
  upstreamInput: number | undefined
  upstreamOutput: number | undefined
  finalInput: number
  finalOutput: number
}

const STEPS = [{ title: '连接信息' }, { title: '模型选择' }, { title: '加价设置' }]

export default function ProxyImportModal({
  open,
  onClose,
  onRefresh
}: ProxyImportModalProps) {
  // ----- Step 1: 连接信息 -----
  const [apiEndpoint, setApiEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [models, setModels] = useState<UpstreamModel[]>([])

  // ----- Step 2: 模型选择 -----
  const [current, setCurrent] = useState(0)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')

  // ----- Step 3: 加价设置 -----
  const [pricingMode, setPricingMode] = useState<PricingMode>('multiplier')
  const [multiplier, setMultiplier] = useState(1.5)
  const [fixedInputAdd, setFixedInputAdd] = useState(0)
  const [fixedOutputAdd, setFixedOutputAdd] = useState(0)
  const [flatInputPrice, setFlatInputPrice] = useState(5)
  const [flatOutputPrice, setFlatOutputPrice] = useState(20)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportModelsResult | null>(
    null
  )

  /** 当前加价配置(按模式取字段) */
  const pricingConfig: PricingConfig = useMemo(() => {
    if (pricingMode === 'multiplier') return { multiplier }
    if (pricingMode === 'fixed') return { fixedInputAdd, fixedOutputAdd }
    return { flatInputPrice, flatOutputPrice }
  }, [pricingMode, multiplier, fixedInputAdd, fixedOutputAdd, flatInputPrice, flatOutputPrice])

  /** 搜索过滤后的模型列表 */
  const filteredModels = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase()
    if (!kw) return models
    return models.filter((m) => m.modelId.toLowerCase().includes(kw))
  }, [models, searchKeyword])

  /** 已选且未存在的模型(alreadyExists 已禁用,保险过滤) */
  const selectedModels = useMemo(() => {
    const keySet = new Set(selectedRowKeys)
    return models.filter(
      (m) => keySet.has(m.modelId) && !m.alreadyExists
    )
  }, [models, selectedRowKeys])

  /** 预览表格数据(取前 5 条选中模型) */
  const previewRows: PreviewRow[] = useMemo(() => {
    return selectedModels.slice(0, 5).map((m) => {
      const { input, output } = calcFinalPrice(
        m.upstreamInputPrice,
        m.upstreamOutputPrice,
        pricingMode,
        pricingConfig
      )
      return {
        key: m.modelId,
        modelId: m.modelId,
        upstreamInput: m.upstreamInputPrice,
        upstreamOutput: m.upstreamOutputPrice,
        finalInput: input,
        finalOutput: output
      }
    })
  }, [selectedModels, pricingMode, pricingConfig])

  // ----- 测试连接 -----
  const handleTest = async () => {
    if (!apiEndpoint.trim() || !apiKey.trim()) {
      message.warning('请填写中转站地址和 API Key')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetchUpstreamModels({
        apiEndpoint: apiEndpoint.trim(),
        apiKey: apiKey.trim()
      })
      setModels(res.models || [])
      setSelectedRowKeys([])
      const total = res.models?.length ?? 0
      const existCount = res.models?.filter((m) => m.alreadyExists).length ?? 0
      setTestResult({
        type: 'success',
        message: `连接成功，发现 ${total} 个模型（其中 ${existCount} 个已导入）`
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '连接失败，请检查地址与 API Key'
      setTestResult({ type: 'error', message: msg })
    } finally {
      setTesting(false)
    }
  }

  // ----- 确认导入 -----
  const handleImport = async () => {
    if (selectedModels.length === 0) {
      message.warning('请至少选择一个模型')
      return
    }
    const items: ImportModelItem[] = selectedModels.map((m) => ({
      modelId: m.modelId,
      upstreamInputPrice: m.upstreamInputPrice,
      upstreamOutputPrice: m.upstreamOutputPrice
    }))
    // 加价字段按后端 ImportModelsDto 平铺(不能嵌套 pricingConfig,否则 forbidNonWhitelisted 会 400)
    const dto: ImportModelsDto = {
      apiEndpoint: apiEndpoint.trim(),
      apiKey: apiKey.trim(),
      models: items,
      pricingMode,
      ...(pricingMode === 'multiplier' ? { multiplier: pricingConfig.multiplier } : {}),
      ...(pricingMode === 'fixed'
        ? {
            fixedInputAdd: pricingConfig.fixedInputAdd,
            fixedOutputAdd: pricingConfig.fixedOutputAdd
          }
        : {}),
      ...(pricingMode === 'flat'
        ? {
            flatInputPrice: pricingConfig.flatInputPrice,
            flatOutputPrice: pricingConfig.flatOutputPrice
          }
        : {})
    }
    setImporting(true)
    try {
      const result = await importModels(dto)
      setImportResult(result)
      message.success(`导入完成：成功 ${result.imported} 个，跳过 ${result.skipped} 个`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导入失败'
      message.error(msg)
    } finally {
      setImporting(false)
    }
  }

  // ----- 完成关闭 -----
  const handleDone = () => {
    onClose()
    if (importResult && importResult.imported > 0) {
      onRefresh()
    }
  }

  /** 关闭后重置全部状态 */
  const resetState = () => {
    setCurrent(0)
    setApiEndpoint('')
    setApiKey('')
    setTesting(false)
    setTestResult(null)
    setModels([])
    setSelectedRowKeys([])
    setSearchKeyword('')
    setPricingMode('multiplier')
    setMultiplier(1.5)
    setFixedInputAdd(0)
    setFixedOutputAdd(0)
    setFlatInputPrice(5)
    setFlatOutputPrice(20)
    setImporting(false)
    setImportResult(null)
  }

  // ----- Step 2 表格列 -----
  const modelColumns: TableColumnsType<UpstreamModel> = [
    {
      title: '模型 ID',
      dataIndex: 'modelId',
      key: 'modelId',
      render: (v: string) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
      )
    },
    {
      title: '所属',
      dataIndex: 'ownedBy',
      key: 'ownedBy',
      width: 140,
      render: (v?: string) =>
        v ? <span style={{ color: '#c7d2fe' }}>{v}</span> : <span style={{ color: '#8b949e' }}>-</span>
    },
    {
      title: '上游输入(元/千token)',
      dataIndex: 'upstreamInputPrice',
      key: 'upstreamInputPrice',
      width: 160,
      render: (v?: number) =>
        v !== undefined && v !== null ? (
          <span style={{ color: '#7dd3fc' }}>{v}</span>
        ) : (
          <span style={{ color: '#8b949e' }}>-</span>
        )
    },
    {
      title: '上游输出(元/千token)',
      dataIndex: 'upstreamOutputPrice',
      key: 'upstreamOutputPrice',
      width: 160,
      render: (v?: number) =>
        v !== undefined && v !== null ? (
          <span style={{ color: '#7dd3fc' }}>{v}</span>
        ) : (
          <span style={{ color: '#8b949e' }}>-</span>
        )
    },
    {
      title: '状态',
      dataIndex: 'alreadyExists',
      key: 'alreadyExists',
      width: 100,
      render: (exists: boolean) =>
        exists ? (
          <Tag color="default">已导入</Tag>
        ) : (
          <Tag color="green">新增</Tag>
        )
    }
  ]

  // ----- Step 3 预览表格列 -----
  const previewColumns: TableColumnsType<PreviewRow> = [
    {
      title: '模型 ID',
      dataIndex: 'modelId',
      key: 'modelId',
      render: (v: string) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
      )
    },
    {
      title: '上游输入(元)',
      dataIndex: 'upstreamInput',
      key: 'upstreamInput',
      width: 130,
      render: (v?: number) =>
        v !== undefined && v !== null ? v : '-'
    },
    {
      title: '上游输出(元)',
      dataIndex: 'upstreamOutput',
      key: 'upstreamOutput',
      width: 130,
      render: (v?: number) =>
        v !== undefined && v !== null ? v : '-'
    },
    {
      title: '最终输入(积分/千token)',
      dataIndex: 'finalInput',
      key: 'finalInput',
      width: 170,
      render: (v: number) => <span style={{ color: '#7dd3fc', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '最终输出(积分/千token)',
      dataIndex: 'finalOutput',
      key: 'finalOutput',
      width: 170,
      render: (v: number) => <span style={{ color: '#7dd3fc', fontWeight: 500 }}>{v}</span>
    }
  ]

  // ----- 错误详情列 -----
  const errorColumns: TableColumnsType<{ modelId: string; error: string }> = [
    {
      title: '模型 ID',
      dataIndex: 'modelId',
      key: 'modelId',
      render: (v: string) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
      )
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      render: (v: string) => <span style={{ color: '#fca5a5' }}>{v}</span>
    }
  ]

  // ----- 自定义 footer -----
  const renderFooter = () => {
    if (importResult) {
      return [
        <Button key="done" type="primary" onClick={handleDone}>
          完成
        </Button>
      ]
    }
    if (current === 0) {
      return [
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="test"
          icon={<ApiOutlined />}
          loading={testing}
          onClick={handleTest}
        >
          测试连接
        </Button>,
        <Button
          key="next"
          type="primary"
          disabled={testResult?.type !== 'success'}
          onClick={() => setCurrent(1)}
        >
          下一步
        </Button>
      ]
    }
    if (current === 1) {
      return [
        <Button key="prev" onClick={() => setCurrent(0)}>
          上一步
        </Button>,
        <Button
          key="next"
          type="primary"
          disabled={selectedModels.length === 0}
          onClick={() => setCurrent(2)}
        >
          下一步
        </Button>
      ]
    }
    // current === 2
    return [
      <Button key="prev" onClick={() => setCurrent(1)}>
        上一步
      </Button>,
      <Button
        key="import"
        type="primary"
        loading={importing}
        onClick={handleImport}
      >
        确认导入
      </Button>
    ]
  }

  return (
    <Modal
      title="中转站批量导入"
      open={open}
      onCancel={onClose}
      afterClose={resetState}
      footer={renderFooter()}
      destroyOnClose
      width={880}
      maskClosable={false}
    >
      {importResult ? (
        // ----- 导入结果反馈 -----
        <div>
          <Alert
            type={importResult.errors.length > 0 ? 'warning' : 'success'}
            showIcon
            message={`导入完成：成功 ${importResult.imported} 个，跳过 ${importResult.skipped} 个${
              importResult.errors.length > 0 ? `，错误 ${importResult.errors.length} 个` : ''
            }`}
            style={{ marginBottom: 16 }}
          />
          {importResult.errors.length > 0 && (
            <Table
              rowKey="modelId"
              columns={errorColumns}
              dataSource={importResult.errors}
              pagination={false}
              size="small"
              scroll={{ y: 240 }}
            />
          )}
        </div>
      ) : (
        <div>
          <Steps
            current={current}
            items={STEPS}
            size="small"
            style={{ marginBottom: 24 }}
          />

          {current === 0 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 6, color: '#c7d2fe' }}>
                  中转站地址
                </div>
                <Input
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  placeholder="https://api.xxx.com/v1"
                  autoComplete="off"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 6, color: '#c7d2fe' }}>API Key</div>
                <Input.Password
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-xxx"
                  autoComplete="new-password"
                />
              </div>
              {testResult && (
                <Alert
                  type={testResult.type}
                  showIcon
                  message={testResult.message}
                />
              )}
              <div style={{ marginTop: 12, color: '#8b949e', fontSize: 12 }}>
                说明：点击"测试连接"将拉取中转站可用模型列表，已导入模型会被标记。
              </div>
            </div>
          )}

          {current === 1 && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <Input.Search
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="按模型 ID 搜索"
                  allowClear
                  style={{ width: 280 }}
                />
              </div>
              <Table<UpstreamModel>
                rowKey="modelId"
                columns={modelColumns}
                dataSource={filteredModels}
                pagination={false}
                size="small"
                scroll={{ y: 360 }}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                  getCheckboxProps: (record: UpstreamModel) => ({
                    disabled: record.alreadyExists
                  })
                }}
                footer={() => (
                  <span style={{ color: '#c7d2fe' }}>
                    已选 {selectedModels.length} 个模型待导入
                  </span>
                )}
              />
            </div>
          )}

          {current === 2 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 8, color: '#c7d2fe' }}>加价模式</div>
                <Radio.Group
                  value={pricingMode}
                  onChange={(e) => setPricingMode(e.target.value as PricingMode)}
                >
                  <Space direction="vertical">
                    <Radio value="multiplier">
                      倍率加价（推荐）：最终积分 = 上游价格(元) × 倍率 × 100
                    </Radio>
                    <Radio value="fixed">
                      固定加价：最终积分 = 上游价格(元) × 100 + 加价(积分)
                    </Radio>
                    <Radio value="flat">
                      统一价格：最终积分 = 固定值(积分)
                    </Radio>
                  </Space>
                </Radio.Group>
              </div>

              {pricingMode === 'multiplier' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 6, color: '#c7d2fe' }}>倍率</div>
                  <InputNumber
                    value={multiplier}
                    onChange={(v) => setMultiplier(v ?? 1)}
                    min={0.1}
                    step={0.1}
                    style={{ width: 200 }}
                  />
                  <span style={{ marginLeft: 8, color: '#8b949e', fontSize: 12 }}>
                    如 1.5 表示加价 50%
                  </span>
                </div>
              )}

              {pricingMode === 'fixed' && (
                <div style={{ marginBottom: 16 }}>
                  <Space size="large">
                    <div>
                      <div style={{ marginBottom: 6, color: '#c7d2fe' }}>
                        输入加价(积分/千token)
                      </div>
                      <InputNumber
                        value={fixedInputAdd}
                        onChange={(v) => setFixedInputAdd(v ?? 0)}
                        min={0}
                        style={{ width: 180 }}
                      />
                    </div>
                    <div>
                      <div style={{ marginBottom: 6, color: '#c7d2fe' }}>
                        输出加价(积分/千token)
                      </div>
                      <InputNumber
                        value={fixedOutputAdd}
                        onChange={(v) => setFixedOutputAdd(v ?? 0)}
                        min={0}
                        style={{ width: 180 }}
                      />
                    </div>
                  </Space>
                </div>
              )}

              {pricingMode === 'flat' && (
                <div style={{ marginBottom: 16 }}>
                  <Space size="large">
                    <div>
                      <div style={{ marginBottom: 6, color: '#c7d2fe' }}>
                        统一输入价(积分/千token)
                      </div>
                      <InputNumber
                        value={flatInputPrice}
                        onChange={(v) => setFlatInputPrice(v ?? 0)}
                        min={0}
                        style={{ width: 180 }}
                      />
                    </div>
                    <div>
                      <div style={{ marginBottom: 6, color: '#c7d2fe' }}>
                        统一输出价(积分/千token)
                      </div>
                      <InputNumber
                        value={flatOutputPrice}
                        onChange={(v) => setFlatOutputPrice(v ?? 0)}
                        min={0}
                        style={{ width: 180 }}
                      />
                    </div>
                  </Space>
                </div>
              )}

              <div style={{ marginBottom: 8, color: '#c7d2fe' }}>
                价格预览(最多展示 5 条，共 {selectedModels.length} 个)
              </div>
              <Spin spinning={false}>
                <Table<PreviewRow>
                  rowKey="key"
                  columns={previewColumns}
                  dataSource={previewRows}
                  pagination={false}
                  size="small"
                  scroll={{ x: 760 }}
                />
              </Spin>
              <div style={{ marginTop: 8, color: '#8b949e', fontSize: 12 }}>
                汇率：1 元 = 100 积分。预览价格为前端按当前模式实时计算，最终以导入结果为准。
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
