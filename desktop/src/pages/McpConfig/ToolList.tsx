/**
 * ToolList — MCP 工具浏览器 + 工具调用测试
 *
 * 接收 serverId，调用 mcpApi.listTools 获取工具列表。
 * 每个工具卡片展示 name / description / inputSchema。
 * 点击"测试"按钮打开 Modal，根据 inputSchema 动态生成表单，
 * 提交后调用 mcpApi.callTool 并展示 JSON 结果。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Modal,
  Spin,
  Empty,
  Input,
  Button,
  message,
  Tooltip,
  Tag,
  Form,
  InputNumber,
  Switch,
  Select,
  Typography,
} from 'antd'
import {
  ThunderboltOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import { mcpApi } from '@/api/mcp-api'
import type { McpTool } from '@/api/mcp-api'
import ToolCallPanel from '@/components/ToolCallPanel'
import styles from './styles.module.css'

const { Text, Paragraph } = Typography

interface ToolListProps {
  serverId: number
  serverName?: string
}

/** JSON Schema 属性描述 */
interface SchemaProperty {
  type?: string
  description?: string
  default?: unknown
  enum?: unknown[]
}

/** 从 inputSchema 提取表单字段定义 */
interface FormFieldDef {
  name: string
  type: 'string' | 'number' | 'integer' | 'boolean' | 'enum'
  description?: string
  required: boolean
  defaultValue?: unknown
  enumOptions?: { label: string; value: string }[]
}

/**
 * 将 JSON Schema 的 properties 解析为表单字段定义列表
 */
function parseSchemaFields(schema: Record<string, unknown> | undefined): FormFieldDef[] {
  if (!schema || typeof schema !== 'object') return []
  const properties = schema.properties as Record<string, SchemaProperty> | undefined
  if (!properties) return []
  const requiredList = (schema.required as string[] | undefined) || []

  const fields: FormFieldDef[] = []
  for (const [key, prop] of Object.entries(properties)) {
    if (!prop || typeof prop !== 'object') continue
    const rawType = prop.type || 'string'
    const hasEnum = Array.isArray(prop.enum) && prop.enum.length > 0

    let fieldType: FormFieldDef['type']
    if (hasEnum) {
      fieldType = 'enum'
    } else if (rawType === 'integer' || rawType === 'number') {
      fieldType = rawType as 'integer' | 'number'
    } else if (rawType === 'boolean') {
      fieldType = 'boolean'
    } else {
      fieldType = 'string'
    }

    fields.push({
      name: key,
      type: fieldType,
      description: prop.description,
      required: requiredList.includes(key),
      defaultValue: prop.default,
      enumOptions: hasEnum
        ? (prop.enum as unknown[]).map((v) => ({
            label: String(v),
            value: String(v),
          }))
        : undefined,
    })
  }
  return fields
}

export default function ToolList({ serverId, serverName }: ToolListProps) {
  const [tools, setTools] = useState<McpTool[]>([])
  const [loading, setLoading] = useState(true)
  const [testTool, setTestTool] = useState<McpTool | null>(null)
  const [calling, setCalling] = useState(false)
  const [callResult, setCallResult] = useState<string | null>(null)
  const [form] = Form.useForm<Record<string, unknown>>()

  const loadTools = useCallback(async () => {
    setLoading(true)
    try {
      const list = await mcpApi.listTools(serverId)
      setTools(list || [])
    } catch (err) {
      console.error('[ToolList] load tools failed:', err)
      message.error('加载工具列表失败')
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  /** 打开测试 Modal */
  const handleOpenTest = useCallback((tool: McpTool) => {
    setTestTool(tool)
    setCallResult(null)
    // 初始化表单默认值
    const fields = parseSchemaFields(tool.inputSchema)
    const initialValues: Record<string, unknown> = {}
    for (const f of fields) {
      if (f.defaultValue !== undefined) {
        initialValues[f.name] = f.defaultValue
      }
    }
    form.setFieldsValue(initialValues as Record<string, unknown> as never)
  }, [form])

  /** 关闭测试 Modal */
  const handleCloseTest = useCallback(() => {
    setTestTool(null)
    setCallResult(null)
    form.resetFields()
  }, [form])

  /** 提交工具调用 */
  const handleCallTool = useCallback(async () => {
    if (!testTool) return
    let args: Record<string, unknown>
    try {
      const values = await form.validateFields()
      args = values
    } catch {
      return // 表单校验失败
    }

    setCalling(true)
    setCallResult(null)
    try {
      const result = await mcpApi.callTool(serverId, testTool.name, args)
      setCallResult(JSON.stringify(result, null, 2))
      message.success('调用成功')
    } catch (err) {
      console.error('[ToolList] call tool failed:', err)
      const errMsg = err instanceof Error ? err.message : String(err)
      setCallResult(`错误: ${errMsg}`)
      message.error('调用失败')
    } finally {
      setCalling(false)
    }
  }, [testTool, serverId, form])

  /** 复制结果 */
  const handleCopyResult = useCallback(() => {
    if (callResult) {
      void navigator.clipboard.writeText(callResult)
      message.success('已复制到剪贴板')
    }
  }, [callResult])

  /** 测试 Modal 的表单字段 */
  const testFormFields = useMemo(() => {
    if (!testTool) return []
    return parseSchemaFields(testTool.inputSchema)
  }, [testTool])

  return (
    <div className={styles.toolListContainer}>
      {/* 左侧：工具列表 */}
      <div className={styles.toolListLeft}>
        <div className={styles.toolListHeader}>
          <ToolOutlined />
          <span>工具列表 ({tools.length})</span>
        </div>
        <Spin spinning={loading}>
          {tools.length === 0 && !loading ? (
            <Empty description="暂无工具" />
          ) : (
            <div className={styles.toolList}>
              {tools.map((tool) => (
                <div
                  key={tool.name}
                  className={styles.toolItem}
                >
                  <div className={styles.toolItemName}>
                    <CheckCircleOutlined />
                    <span>{tool.name}</span>
                  </div>
                  {tool.description && (
                    <div className={styles.toolItemDesc}>{tool.description}</div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<ThunderboltOutlined />}
                      onClick={() => handleOpenTest(tool)}
                    >
                      测试
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Spin>
      </div>

      {/* 右侧：说明区域（未选择测试工具时） */}
      <div className={styles.toolListRight}>
        <div className={styles.toolDetailCard}>
          <div className={styles.toolDetailName}>
            <ToolOutlined />
            <span>MCP 工具浏览器</span>
          </div>
          <Paragraph style={{ color: 'var(--color-text-secondary)', marginTop: 12 }}>
            {serverName
              ? `当前服务器：${serverName}`
              : `当前服务器 ID：${serverId}`}
          </Paragraph>
          <Paragraph style={{ color: 'var(--color-text-tertiary)' }}>
            从左侧选择工具点击"测试"按钮，可打开调用面板并动态生成参数表单。
            调用结果将以 JSON 格式展示。
          </Paragraph>
          {tools.length > 0 && (
            <div className={styles.schemaSection}>
              <div className={styles.schemaTitle}>
                <span>可用工具概览</span>
                <Tag color="cyan">{tools.length} 个</Tag>
              </div>
              <pre className={styles.schemaPre}>
                {tools
                  .map(
                    (t) =>
                      `${t.name}${t.description ? ` — ${t.description}` : ''}`
                  )
                  .join('\n')}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* 工具调用测试 Modal */}
      <Modal
        title={`测试工具 - ${testTool?.name || ''}`}
        open={!!testTool}
        onCancel={handleCloseTest}
        footer={null}
        width={720}
        destroyOnClose
        styles={{
          body: { background: 'var(--color-bg-container)', padding: 20 },
        }}
      >
        {testTool && (
          <div>
            {/* 工具描述 */}
            {testTool.description && (
              <Paragraph style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                {testTool.description}
              </Paragraph>
            )}

            {/* Input Schema 展示 */}
            {testTool.inputSchema && (
              <div className={styles.schemaSection} style={{ marginBottom: 16 }}>
                <div className={styles.schemaTitle}>
                  <span>输入参数 Schema</span>
                  <Tag color="cyan">JSON Schema</Tag>
                </div>
                <pre className={styles.schemaPre}>
                  {JSON.stringify(testTool.inputSchema, null, 2)}
                </pre>
              </div>
            )}

            {/* 动态表单 */}
            <Form form={form} layout="vertical">
              {testFormFields.length === 0 ? (
                <Text type="secondary">该工具无需输入参数。</Text>
              ) : (
                testFormFields.map((field) => (
                  <Form.Item
                    key={field.name}
                    name={field.name}
                    label={
                      <span>
                        {field.name}
                        {field.required && (
                          <span style={{ color: '#ff0080', marginLeft: 4 }}>*</span>
                        )}
                      </span>
                    }
                    tooltip={field.description}
                    rules={
                      field.required
                        ? [{ required: true, message: `请输入 ${field.name}` }]
                        : []
                    }
                  >
                    {field.type === 'boolean' ? (
                      <Switch />
                    ) : field.type === 'enum' ? (
                      <Select options={field.enumOptions} placeholder={`选择 ${field.name}`} />
                    ) : field.type === 'integer' || field.type === 'number' ? (
                      <InputNumber style={{ width: '100%' }} placeholder={`输入 ${field.name}`} />
                    ) : (
                      <Input placeholder={`输入 ${field.name}`} />
                    )}
                  </Form.Item>
                ))
              )}
            </Form>

            {/* 调用按钮 */}
            <div className={styles.callPanelActions}>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={calling}
                onClick={handleCallTool}
              >
                执行调用
              </Button>
            </div>

            {/* v0.3.1: 调用结果使用 ToolCallPanel 共享组件 */}
            {callResult && (
              <div className={styles.callResultSection}>
                <div className={styles.callResultTitle}>
                  <span>调用结果</span>
                  <Tooltip title="复制结果">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={handleCopyResult}
                    />
                  </Tooltip>
                </div>
                <ToolCallPanel
                  toolName={testTool.name}
                  input={(() => {
                    try { return form.getFieldsValue() } catch { return {} }
                  })()}
                  output={(() => {
                    try { return JSON.parse(callResult) } catch { return callResult }
                  })()}
                  status={callResult.startsWith('错误') ? 'error' : 'success'}
                  timestamp={new Date().toLocaleString('zh-CN')}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
