// MCP 管理页 - 服务配置 / 工具注册 / 资源注册 / 调用日志
//
// 表格:服务配置(名称/描述/类型/传输方式/状态/工具数/操作)
//      工具注册(工具名/显示名/描述/分类/启用/调用次数/操作)
//      资源注册(URI/类型/显示名/描述/启用/操作)
//      调用日志(时间/服务ID/工具名/调用类型/状态/耗时/用户ID)
// API: /admin/mcp/*

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Switch,
  Tabs,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  ToolOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  createMcpResource,
  createMcpServer,
  createMcpTool,
  deleteMcpResource,
  deleteMcpServer,
  deleteMcpTool,
  discoverMcpTools,
  listMcpCallLogs,
  listMcpResources,
  listMcpServers,
  listMcpTools,
  updateMcpResource,
  updateMcpServer,
  updateMcpTool
} from '@/api/admin-mcp-api'
import type {
  McpCallLog,
  McpCallLogQuery,
  McpCallStatus,
  McpCallType,
  McpListResult,
  McpResourceQuery,
  McpResourceRegistry,
  McpResourceType,
  McpServerConfig,
  McpServerQuery,
  McpServerStatus,
  McpServiceType,
  McpToolQuery,
  McpToolRegistry,
  McpTransportType
} from '@/types/admin-mcp'
import styles from './styles.module.css'
import { TabContent, editDeleteActions, renderEnabled, renderDescription, renderName, renderDisplayName, renderNumber } from './components'
import { KvEditor } from './KvEditor'
import { CatalogTab } from './CatalogTab'

const LOG_PAGE_SIZE = 20

/* ===== 常量映射 ===== */

const TRANSPORT_OPTIONS: Array<{ label: string; value: McpTransportType }> = [
  { label: 'stdio', value: 'stdio' },
  { label: 'http', value: 'http' },
  { label: 'streamable-http', value: 'streamable-http' }
]

const TRANSPORT_LABEL: Record<McpTransportType, string> = {
  stdio: 'stdio',
  http: 'http',
  'streamable-http': 'streamable-http'
}

const TRANSPORT_COLOR: Record<McpTransportType, string> = {
  stdio: 'cyan',
  http: 'blue',
  'streamable-http': 'geekblue'
}

const SERVICE_TYPE_OPTIONS: Array<{ label: string; value: McpServiceType }> = [
  { label: 'OpenClaw', value: 'openclaw' },
  { label: 'Codex', value: 'codex' },
  { label: 'N8N', value: 'n8n' },
  { label: '自定义', value: 'custom' }
]

const SERVICE_TYPE_LABEL: Record<McpServiceType, string> = {
  openclaw: 'OpenClaw',
  codex: 'Codex',
  n8n: 'N8N',
  custom: '自定义'
}

const SERVICE_TYPE_COLOR: Record<McpServiceType, string> = {
  openclaw: 'blue',
  codex: 'purple',
  n8n: 'magenta',
  custom: 'default'
}

const SERVER_STATUS_TAG: Record<McpServerStatus, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待连接' },
  connected: { color: 'green', text: '已连接' },
  failed: { color: 'red', text: '连接失败' },
  disabled: { color: 'default', text: '已禁用' }
}

const RESOURCE_TYPE_OPTIONS: Array<{ label: string; value: McpResourceType }> = [
  { label: 'Agent', value: 'agent' },
  { label: 'Workflow', value: 'workflow' },
  { label: 'Data', value: 'data' },
  { label: 'File', value: 'file' },
  { label: 'Prompt', value: 'prompt' }
]

const RESOURCE_TYPE_LABEL: Record<McpResourceType, string> = {
  agent: 'Agent',
  workflow: 'Workflow',
  data: 'Data',
  file: 'File',
  prompt: 'Prompt'
}

const RESOURCE_TYPE_COLOR: Record<McpResourceType, string> = {
  agent: 'blue',
  workflow: 'magenta',
  data: 'cyan',
  file: 'orange',
  prompt: 'purple'
}

const CALL_TYPE_LABEL: Record<McpCallType, string> = {
  tool: '工具',
  resource: '资源'
}

const CALL_TYPE_COLOR: Record<McpCallType, string> = {
  tool: 'blue',
  resource: 'green'
}

const CALL_STATUS_TAG: Record<McpCallStatus, { color: string; text: string }> = {
  success: { color: 'green', text: '成功' },
  failed: { color: 'red', text: '失败' },
  timeout: { color: 'orange', text: '超时' }
}

const SERVER_STATUS_OPTIONS = [
  { label: '待连接', value: 'pending' },
  { label: '已连接', value: 'connected' },
  { label: '连接失败', value: 'failed' },
  { label: '已禁用', value: 'disabled' }
]

const CALL_TYPE_OPTIONS = [
  { label: '工具', value: 'tool' },
  { label: '资源', value: 'resource' }
]

const CALL_STATUS_OPTIONS = [
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
  { label: '超时', value: 'timeout' }
]

/* ===== KV 编辑器组件 ===== */

interface KvPair {
  key: string
  value: string
}

function parseKv(obj: Record<string, string> | undefined): KvPair[] {
  if (!obj || Object.keys(obj).length === 0) return []
  return Object.entries(obj).map(([key, value]) => ({ key, value }))
}

function serializeKv(pairs: KvPair[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const p of pairs) {
    if (p.key.trim()) result[p.key.trim()] = p.value
  }
  return result
}

/* ===== 表单值类型 ===== */

interface ServerFormValues {
  name: string
  description: string
  transportType: McpTransportType
  command?: string
  argsText?: string
  serviceType: McpServiceType
  enabled: boolean
  url?: string
  envKv?: KvPair[]
  headersKv?: KvPair[]
}

interface ToolFormValues {
  serverId: number
  toolName: string
  displayName: string
  description: string
  category: string
  isEnabled: boolean
  inputSchemaText: string
}

interface ResourceFormValues {
  serverId: number
  resourceUri: string
  resourceType: McpResourceType
  displayName: string
  description: string
  isEnabled: boolean
  metadataText: string
}

/* ===== 主组件 ===== */

export default function AdminMcp() {
  const [activeTab, setActiveTab] = useState('servers')

  /* --- 服务配置 --- */
  const [serverLoading, setServerLoading] = useState(true)
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [serverKeyword, setServerKeyword] = useState('')
  const [serverTypeFilter, setServerTypeFilter] = useState<McpServiceType | ''>('')
  const [serverStatusFilter, setServerStatusFilter] = useState<McpServerStatus | ''>('')

  const [serverEditOpen, setServerEditOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null)
  const [serverForm] = Form.useForm<ServerFormValues>()
  const [serverSaving, setServerSaving] = useState(false)
  const [discovering, setDiscovering] = useState<number | null>(null)

  /* --- 工具注册 --- */
  const [toolLoading, setToolLoading] = useState(false)
  const [tools, setTools] = useState<McpToolRegistry[]>([])
  const [toolKeyword, setToolKeyword] = useState('')
  const [toolServerFilter, setToolServerFilter] = useState<number | undefined>(undefined)

  const [toolEditOpen, setToolEditOpen] = useState(false)
  const [editingTool, setEditingTool] = useState<McpToolRegistry | null>(null)
  const [toolForm] = Form.useForm<ToolFormValues>()
  const [toolSaving, setToolSaving] = useState(false)

  /* --- 资源注册 --- */
  const [resourceLoading, setResourceLoading] = useState(false)
  const [resources, setResources] = useState<McpResourceRegistry[]>([])
  const [resourceKeyword, setResourceKeyword] = useState('')
  const [resourceServerFilter, setResourceServerFilter] = useState<number | undefined>(undefined)

  const [resourceEditOpen, setResourceEditOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<McpResourceRegistry | null>(null)
  const [resourceForm] = Form.useForm<ResourceFormValues>()
  const [resourceSaving, setResourceSaving] = useState(false)

  /* --- 调用日志 --- */
  const [logLoading, setLogLoading] = useState(false)
  const [logs, setLogs] = useState<McpCallLog[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logServerFilter, setLogServerFilter] = useState<number | undefined>(undefined)
  const [logUserFilter, setLogUserFilter] = useState<number | undefined>(undefined)
  const [logCallTypeFilter, setLogCallTypeFilter] = useState<McpCallType | ''>('')
  const [logStatusFilter, setLogStatusFilter] = useState<McpCallStatus | ''>('')

  /* ===== 数据加载 ===== */

  const loadServers = useCallback(async () => {
    setServerLoading(true)
    try {
      const query: McpServerQuery = {}
      if (serverKeyword) query.keyword = serverKeyword
      if (serverTypeFilter) query.serviceType = serverTypeFilter
      if (serverStatusFilter) query.status = serverStatusFilter
      const result = await listMcpServers(query)
      const r = result as McpListResult<McpServerConfig>
      setServers(r.list || [])
    } catch (err) {
      console.error('[AdminMcp] load servers failed:', err)
      message.error('加载服务列表失败')
    } finally {
      setServerLoading(false)
    }
  }, [serverKeyword, serverTypeFilter, serverStatusFilter])

  const loadTools = useCallback(async () => {
    setToolLoading(true)
    try {
      const query: McpToolQuery = {}
      if (toolServerFilter) query.serverId = toolServerFilter
      if (toolKeyword) query.keyword = toolKeyword
      const result = await listMcpTools(query)
      const r = result as McpListResult<McpToolRegistry>
      setTools(r.list || [])
    } catch (err) {
      console.error('[AdminMcp] load tools failed:', err)
      message.error('加载工具列表失败')
    } finally {
      setToolLoading(false)
    }
  }, [toolKeyword, toolServerFilter])

  const loadResources = useCallback(async () => {
    setResourceLoading(true)
    try {
      const query: McpResourceQuery = {}
      if (resourceServerFilter) query.serverId = resourceServerFilter
      if (resourceKeyword) query.keyword = resourceKeyword
      const result = await listMcpResources(query)
      const r = result as McpListResult<McpResourceRegistry>
      setResources(r.list || [])
    } catch (err) {
      console.error('[AdminMcp] load resources failed:', err)
      message.error('加载资源列表失败')
    } finally {
      setResourceLoading(false)
    }
  }, [resourceKeyword, resourceServerFilter])

  const loadLogs = useCallback(async () => {
    setLogLoading(true)
    try {
      const query: McpCallLogQuery = {
        page: logPage,
        pageSize: LOG_PAGE_SIZE
      }
      if (logServerFilter) query.serverId = logServerFilter
      if (logUserFilter) query.userId = logUserFilter
      if (logCallTypeFilter) query.callType = logCallTypeFilter
      if (logStatusFilter) query.status = logStatusFilter
      const result = await listMcpCallLogs(query)
      setLogs(result.list || [])
      setLogTotal(result.total || 0)
    } catch (err) {
      console.error('[AdminMcp] load logs failed:', err)
      message.error('加载日志失败')
    } finally {
      setLogLoading(false)
    }
  }, [logPage, logServerFilter, logUserFilter, logCallTypeFilter, logStatusFilter])

  useEffect(() => {
    if (activeTab === 'servers') void loadServers()
  }, [loadServers, activeTab])

  useEffect(() => {
    if (activeTab === 'tools') void loadTools()
  }, [loadTools, activeTab])

  useEffect(() => {
    if (activeTab === 'resources') void loadResources()
  }, [loadResources, activeTab])

  useEffect(() => {
    if (activeTab === 'logs') void loadLogs()
  }, [loadLogs, activeTab])

  /* ===== 通用删除 ===== */

  const handleDelete = async <T extends { id: number },>(
    item: T,
    fn: (id: number) => Promise<unknown>,
    label: string,
    reload: () => void,
  ) => {
    try {
      await fn(item.id)
      message.success('已删除')
      reload()
    } catch (err) {
      console.error(`[AdminMcp] delete ${label} failed:`, err)
      message.error('删除失败')
    }
  }

  /* ===== 服务操作 ===== */

  const handleAddServer = () => {
    setEditingServer(null)
    serverForm.resetFields()
    serverForm.setFieldsValue({
      transportType: 'stdio',
      serviceType: 'custom',
      enabled: true,
      argsText: '',
      envKv: [],
      headersKv: []
    })
    setServerEditOpen(true)
  }

  const handleEditServer = (item: McpServerConfig) => {
    setEditingServer(item)
    serverForm.setFieldsValue({
      name: item.name,
      description: item.description,
      transportType: item.transportType,
      command: item.command,
      argsText: (item.args || []).join('\n'),
      serviceType: item.serviceType,
      enabled: item.enabled,
      url: item.url,
      envKv: parseKv(item.env),
      headersKv: parseKv(item.headers)
    })
    setServerEditOpen(true)
  }

  /** 通用保存：验证表单 → create/update → 关闭 → 刷新 */
  const handleSave = async (
    form: { validateFields: () => Promise<any> },
    editing: { id: number } | null,
    createFn: (dto: any) => Promise<unknown>,
    updateFn: (id: number, dto: any) => Promise<unknown>,
    setSaving: (v: boolean) => void,
    setOpen: (v: boolean) => void,
    reload: () => void,
    buildDto: (values: any) => unknown,
    successCreate = '已创建',
    successUpdate = '已更新',
  ) => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const dto = buildDto(values)
      if (editing) {
        await updateFn(editing.id, dto)
        message.success(successUpdate)
      } else {
        await createFn(dto)
        message.success(successCreate)
      }
      setOpen(false)
      reload()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminMcp] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  /** 安全解析 JSON，失败时返回 null */
  const tryParseJson = (text: string | undefined, errMsg: string, onError: () => void): Record<string, unknown> | null => {
    try {
      return text ? JSON.parse(text) : {}
    } catch {
      message.error(errMsg)
      onError()
      return null
    }
  }

  const handleSaveServer = () => handleSave(
    serverForm, editingServer, createMcpServer, updateMcpServer,
    setServerSaving, setServerEditOpen, () => void loadServers(),
    (values: ServerFormValues) => ({
      name: values.name,
      description: values.description,
      transportType: values.transportType,
      command: values.command || '',
      args: values.argsText ? values.argsText.split('\n').map((s: string) => s.trim()).filter(Boolean) : [],
      env: values.envKv ? serializeKv(values.envKv) : {},
      url: values.url || '',
      headers: values.headersKv ? serializeKv(values.headersKv) : {},
      serviceType: values.serviceType,
      enabled: values.enabled,
    }),
    '服务已创建', '服务已更新',
  )

  const handleSaveTool = async () => {
    try {
      const values = await toolForm.validateFields()
      setToolSaving(true)
      const inputSchema = tryParseJson(values.inputSchemaText, 'inputSchema 不是合法 JSON', () => setToolSaving(false))
      if (!inputSchema) return
      const dto = {
        serverId: values.serverId,
        toolName: values.toolName,
        displayName: values.displayName,
        description: values.description,
        category: values.category || '',
        isEnabled: values.isEnabled,
        inputSchema,
      }
      if (editingTool) {
        await updateMcpTool(editingTool.id, dto)
        message.success('工具已更新')
      } else {
        await createMcpTool(dto)
        message.success('工具已注册')
      }
      setToolEditOpen(false)
      void loadTools()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminMcp] save tool failed:', err)
      message.error('保存失败')
    } finally {
      setToolSaving(false)
    }
  }

  const handleSaveResource = async () => {
    try {
      const values = await resourceForm.validateFields()
      setResourceSaving(true)
      const metadata = tryParseJson(values.metadataText, 'metadata 不是合法 JSON', () => setResourceSaving(false))
      if (!metadata) return
      const dto = {
        serverId: values.serverId,
        resourceUri: values.resourceUri,
        resourceType: values.resourceType,
        displayName: values.displayName,
        description: values.description,
        isEnabled: values.isEnabled,
        metadata,
      }
      if (editingResource) {
        await updateMcpResource(editingResource.id, dto)
        message.success('资源已更新')
      } else {
        await createMcpResource(dto)
        message.success('资源已注册')
      }
      setResourceEditOpen(false)
      void loadResources()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminMcp] save resource failed:', err)
      message.error('保存失败')
    } finally {
      setResourceSaving(false)
    }
  }

  const handleDeleteServer = (item: McpServerConfig) => handleDelete(item, deleteMcpServer, 'server', () => void loadServers())

  const handleDiscover = async (item: McpServerConfig) => {
    setDiscovering(item.id)
    try {
      const discovered = await discoverMcpTools(item.id)
      message.success(`发现 ${discovered.length} 个工具`)
      void loadServers()
    } catch (err) {
      console.error('[AdminMcp] discover failed:', err)
      message.error('发现工具失败')
    } finally {
      setDiscovering(null)
    }
  }

  /* ===== 工具操作 ===== */

  const handleAddTool = () => {
    setEditingTool(null)
    toolForm.resetFields()
    toolForm.setFieldsValue({
      serverId: servers.length > 0 ? servers[0].id : undefined,
      isEnabled: true,
      inputSchemaText: '{}',
      category: ''
    })
    setToolEditOpen(true)
  }

  const handleEditTool = (item: McpToolRegistry) => {
    setEditingTool(item)
    toolForm.setFieldsValue({
      serverId: item.serverId,
      toolName: item.toolName,
      displayName: item.displayName,
      description: item.description,
      category: item.category,
      isEnabled: item.isEnabled,
      inputSchemaText: item.inputSchema ? JSON.stringify(item.inputSchema, null, 2) : '{}'
    })
    setToolEditOpen(true)
  }

  const handleDeleteTool = (item: McpToolRegistry) => handleDelete(item, deleteMcpTool, 'tool', () => void loadTools())

  /* ===== 资源操作 ===== */

  const handleAddResource = () => {
    setEditingResource(null)
    resourceForm.resetFields()
    resourceForm.setFieldsValue({
      serverId: servers.length > 0 ? servers[0].id : undefined,
      resourceType: 'agent',
      isEnabled: true,
      metadataText: '{}'
    })
    setResourceEditOpen(true)
  }

  const handleEditResource = (item: McpResourceRegistry) => {
    setEditingResource(item)
    resourceForm.setFieldsValue({
      serverId: item.serverId,
      resourceUri: item.resourceUri,
      resourceType: item.resourceType,
      displayName: item.displayName,
      description: item.description,
      isEnabled: item.isEnabled,
      metadataText: item.metadata ? JSON.stringify(item.metadata, null, 2) : '{}'
    })
    setResourceEditOpen(true)
  }

  const handleDeleteResource = (item: McpResourceRegistry) => handleDelete(item, deleteMcpResource, 'resource', () => void loadResources())

  /* ===== 表格列定义 ===== */

  const serverColumns: TableColumnsType<McpServerConfig> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', key: 'name', render: renderName },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, render: renderDescription },
    { title: '服务类型', dataIndex: 'serviceType', key: 'serviceType', width: 110, render: (t: McpServiceType) => <Tag color={SERVICE_TYPE_COLOR[t]}>{SERVICE_TYPE_LABEL[t]}</Tag> },
    { title: '传输方式', dataIndex: 'transportType', key: 'transportType', width: 130, render: (t: McpTransportType) => <Tag color={TRANSPORT_COLOR[t]}>{TRANSPORT_LABEL[t]}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (s: McpServerStatus) => <Tag color={SERVER_STATUS_TAG[s].color}>{SERVER_STATUS_TAG[s].text}</Tag> },
    { title: '工具数', dataIndex: 'toolCount', key: 'toolCount', width: 80, render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v}</span> },
    { title: '系统', dataIndex: 'isSystem', key: 'isSystem', width: 70, render: (v: boolean) => v ? <Tag color="gold">系统</Tag> : <Tag>用户</Tag> },
    { title: '操作', key: 'action', width: 260, fixed: 'right', render: (_: unknown, record: McpServerConfig) => (
      <>
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditServer(record)}>编辑</Button>
        <Button type="link" size="small" icon={<ThunderboltOutlined />} loading={discovering === record.id} onClick={() => handleDiscover(record)}>发现</Button>
        {!record.isSystem && (
          <Popconfirm title="确认删除该服务?" onConfirm={() => handleDeleteServer(record)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        )}
      </>
    ) },
  ]

  const toolColumns: TableColumnsType<McpToolRegistry> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '工具名', dataIndex: 'toolName', key: 'toolName', render: renderName },
    { title: '显示名', dataIndex: 'displayName', key: 'displayName', render: renderDisplayName },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, render: renderDescription },
    { title: '分类', dataIndex: 'category', key: 'category', width: 100, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <span style={{ color: '#64748b' }}>-</span> },
    { title: '启用', dataIndex: 'isEnabled', key: 'isEnabled', width: 70, render: renderEnabled },
    { title: '调用次数', dataIndex: 'callCount', key: 'callCount', width: 90, render: renderNumber },
    editDeleteActions(handleEditTool, handleDeleteTool, '确认删除该工具?'),
  ]

  const resourceColumns: TableColumnsType<McpResourceRegistry> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'URI', dataIndex: 'resourceUri', key: 'resourceUri', render: renderName },
    { title: '类型', dataIndex: 'resourceType', key: 'resourceType', width: 110, render: (t: McpResourceType) => <Tag color={RESOURCE_TYPE_COLOR[t]}>{RESOURCE_TYPE_LABEL[t]}</Tag> },
    { title: '显示名', dataIndex: 'displayName', key: 'displayName', render: renderDisplayName },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, render: renderDescription },
    { title: '启用', dataIndex: 'isEnabled', key: 'isEnabled', width: 70, render: renderEnabled },
    editDeleteActions(handleEditResource, handleDeleteResource, '确认删除该资源?'),
  ]

  const logColumns: TableColumnsType<McpCallLog> = [
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (v: string) => <span style={{ color: '#94a3b8' }}>{v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'}</span> },
    { title: '服务 ID', dataIndex: 'serverId', key: 'serverId', width: 80 },
    { title: '工具/资源', dataIndex: 'toolName', key: 'toolName', render: (v: string, record: McpCallLog) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v || record.resourceUri || '-'}</span> },
    { title: '调用类型', dataIndex: 'callType', key: 'callType', width: 90, render: (t: McpCallType) => <Tag color={CALL_TYPE_COLOR[t]}>{CALL_TYPE_LABEL[t]}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: McpCallStatus) => <Tag color={CALL_STATUS_TAG[s].color}>{CALL_STATUS_TAG[s].text}</Tag> },
    { title: '耗时', dataIndex: 'durationMs', key: 'durationMs', width: 90, render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v ? `${v}ms` : '-'}</span> },
    { title: '用户 ID', dataIndex: 'userId', key: 'userId', width: 80 },
    { title: '错误信息', dataIndex: 'errorMessage', key: 'errorMessage', ellipsis: true, render: (v: string) => <span style={{ color: '#f87171', fontSize: 12 }}>{v || '-'}</span> },
  ]

  /* ===== 渲染 ===== */

  return (
    <div className={styles.page}>
      {/* 顶部标题 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ToolOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>MCP 管理</h1>
            <div className={styles.subtitle}>服务配置 / 工具注册 / 资源注册 / 调用日志</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              if (activeTab === 'servers') void loadServers()
              else if (activeTab === 'tools') void loadTools()
              else if (activeTab === 'resources') void loadResources()
              else if (activeTab === 'logs') void loadLogs()
            }}
            className={styles.ghostBtn}
          >
            刷新
          </Button>
          {activeTab === 'servers' && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddServer}
              className={styles.primaryBtn}
            >
              新建服务
            </Button>
          )}
          {activeTab === 'tools' && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddTool}
              className={styles.primaryBtn}
            >
              注册工具
            </Button>
          )}
          {activeTab === 'resources' && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddResource}
              className={styles.primaryBtn}
            >
              注册资源
            </Button>
          )}
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'catalog', label: '官方目录' },
          { key: 'servers', label: '服务配置' },
          { key: 'tools', label: '工具注册' },
          { key: 'resources', label: '资源注册' },
          { key: 'logs', label: '调用日志' }
        ]}
      />

      {/* 官方目录 Tab */}
      {activeTab === 'catalog' && <CatalogTab />}

      {/* 服务配置 Tab */}
      {activeTab === 'servers' && (
        <TabContent<McpServerConfig>
          loading={serverLoading}
          data={servers}
          columns={serverColumns}
          scrollX={1200}
          emptyText="暂无服务"
          toolbar={
            <div className={styles.toolbarLeft}>
              <Input
                placeholder="搜索服务名称"
                value={serverKeyword}
                onChange={(e) => setServerKeyword(e.target.value)}
                onPressEnter={() => void loadServers()}
                prefix={<SearchOutlined style={{ color: '#64748b' }} />}
                className={styles.searchBox}
                allowClear
                onClear={() => setServerKeyword('')}
              />
              <Select
                placeholder="服务类型"
                value={serverTypeFilter || undefined}
                onChange={(v) => setServerTypeFilter((v || '') as McpServiceType | '')}
                className={styles.filterSelect}
                allowClear
                options={SERVICE_TYPE_OPTIONS}
              />
              <Select
                placeholder="状态"
                value={serverStatusFilter || undefined}
                onChange={(v) => setServerStatusFilter((v || '') as McpServerStatus | '')}
                className={styles.filterSelect}
                allowClear
                options={SERVER_STATUS_OPTIONS}
              />
            </div>
          }
        />
      )}

      {/* 工具注册 Tab */}
      {activeTab === 'tools' && (
        <TabContent<McpToolRegistry>
          loading={toolLoading}
          data={tools}
          columns={toolColumns}
          scrollX={1000}
          emptyText="暂无工具"
          toolbar={
            <div className={styles.toolbarLeft}>
              <Input
                placeholder="搜索工具名称"
                value={toolKeyword}
                onChange={(e) => setToolKeyword(e.target.value)}
                onPressEnter={() => void loadTools()}
                prefix={<SearchOutlined style={{ color: '#64748b' }} />}
                className={styles.searchBox}
                allowClear
                onClear={() => setToolKeyword('')}
              />
              <Select
                placeholder="按服务筛选"
                value={toolServerFilter}
                onChange={(v) => setToolServerFilter(v as number | undefined)}
                className={styles.filterSelect}
                allowClear
                options={servers.map((s) => ({ label: s.name, value: s.id }))}
              />
            </div>
          }
        />
      )}

      {/* 资源注册 Tab */}
      {activeTab === 'resources' && (
        <TabContent<McpResourceRegistry>
          loading={resourceLoading}
          data={resources}
          columns={resourceColumns}
          scrollX={1000}
          emptyText="暂无资源"
          toolbar={
            <div className={styles.toolbarLeft}>
              <Input
                placeholder="搜索资源 URI"
                value={resourceKeyword}
                onChange={(e) => setResourceKeyword(e.target.value)}
                onPressEnter={() => void loadResources()}
                prefix={<SearchOutlined style={{ color: '#64748b' }} />}
                className={styles.searchBox}
                allowClear
                onClear={() => setResourceKeyword('')}
              />
              <Select
                placeholder="按服务筛选"
                value={resourceServerFilter}
                onChange={(v) => setResourceServerFilter(v as number | undefined)}
                className={styles.filterSelect}
                allowClear
                options={servers.map((s) => ({ label: s.name, value: s.id }))}
              />
            </div>
          }
        />
      )}

      {/* 调用日志 Tab */}
      {activeTab === 'logs' && (
        <TabContent<McpCallLog>
          loading={logLoading}
          data={logs}
          columns={logColumns}
          scrollX={1100}
          emptyText="暂无日志"
          toolbar={
            <div className={styles.toolbarLeft}>
              <Select
                placeholder="按服务筛选"
                value={logServerFilter}
                onChange={(v) => { setLogServerFilter(v as number | undefined); setLogPage(1) }}
                className={styles.filterSelect}
                allowClear
                options={servers.map((s) => ({ label: s.name, value: s.id }))}
              />
              <Input
                placeholder="用户 ID"
                value={logUserFilter !== undefined ? String(logUserFilter) : ''}
                onChange={(e) => { const v = e.target.value.trim(); setLogUserFilter(v ? Number(v) : undefined) }}
                onPressEnter={() => { setLogPage(1); void loadLogs() }}
                className={styles.searchBox}
                allowClear
                onClear={() => setLogUserFilter(undefined)}
              />
              <Select
                placeholder="调用类型"
                value={logCallTypeFilter || undefined}
                onChange={(v) => { setLogCallTypeFilter((v || '') as McpCallType | ''); setLogPage(1) }}
                className={styles.filterSelect}
                allowClear
                options={CALL_TYPE_OPTIONS}
              />
              <Select
                placeholder="状态"
                value={logStatusFilter || undefined}
                onChange={(v) => { setLogStatusFilter((v || '') as McpCallStatus | ''); setLogPage(1) }}
                className={styles.filterSelect}
                allowClear
                options={CALL_STATUS_OPTIONS}
              />
            </div>
          }
          pagination={
            <div className={styles.paginationWrap}>
              <Pagination
                current={logPage}
                pageSize={LOG_PAGE_SIZE}
                total={logTotal}
                onChange={(p) => setLogPage(p)}
                showSizeChanger={false}
                showTotal={(t) => `共 ${t} 条`}
              />
            </div>
          }
        />
      )}

      {/* ===== 服务 Modal ===== */}
      <Modal
        title={editingServer ? `编辑服务 - ${editingServer.name}` : '新建服务'}
        open={serverEditOpen}
        onCancel={() => setServerEditOpen(false)}
        onOk={handleSaveServer}
        confirmLoading={serverSaving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={720}
      >
        <Form<ServerFormValues> form={serverForm} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如:web-search-server" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <div className={styles.formRow}>
            <Form.Item
              name="transportType"
              label="传输方式"
              className={styles.formItem}
              rules={[{ required: true, message: '请选择传输方式' }]}
            >
              <Select options={TRANSPORT_OPTIONS} />
            </Form.Item>
            <Form.Item
              name="serviceType"
              label="服务类型"
              className={styles.formItem}
              rules={[{ required: true, message: '请选择服务类型' }]}
            >
              <Select options={SERVICE_TYPE_OPTIONS} />
            </Form.Item>
          </div>
          <Form.Item name="command" label="命令 (command)">
            <Input placeholder="如:npx -y @anthropic-ai/mcp-server" />
          </Form.Item>
          <Form.Item
            name="argsText"
            label="参数 (每行一个)"
            tooltip="args 数组，每行一个参数"
          >
            <Input.TextArea
              rows={3}
              placeholder={'--port\n3000\n--debug'}
              className={styles.jsonArea}
            />
          </Form.Item>
          <Form.Item name="url" label="URL (http/streamable-http 使用)">
            <Input placeholder="https://example.com/mcp" />
          </Form.Item>
          <Form.Item
            name="enabled"
            label="启用"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          {/* env KV */}
          <KvEditor label="环境变量 (env)" addText="+ 添加环境变量" keyPlaceholder="KEY" />
          {/* headers KV */}
          <KvEditor label="请求头 (headers)" addText="+ 添加请求头" keyPlaceholder="Header-Name" />
        </Form>
      </Modal>

      {/* ===== 工具 Modal ===== */}
      <Modal
        title={editingTool ? `编辑工具 - ${editingTool.toolName}` : '注册工具'}
        open={toolEditOpen}
        onCancel={() => setToolEditOpen(false)}
        onOk={handleSaveTool}
        confirmLoading={toolSaving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <Form<ToolFormValues> form={toolForm} layout="vertical">
          <Form.Item
            name="serverId"
            label="所属服务"
            rules={[{ required: true, message: '请选择服务' }]}
          >
            <Select
              options={servers.map((s) => ({
                label: s.name,
                value: s.id
              }))}
              placeholder="选择服务"
            />
          </Form.Item>
          <Form.Item
            name="toolName"
            label="工具名"
            rules={[{ required: true, message: '请输入工具名' }]}
          >
            <Input placeholder="如:web_search" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input placeholder="如:网页搜索" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input placeholder="如:search" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="inputSchemaText"
            label="Input Schema (JSON)"
            tooltip="工具输入参数的 JSON Schema"
          >
            <Input.TextArea
              rows={6}
              placeholder='{"type":"object","properties":{}}'
              className={styles.jsonArea}
            />
          </Form.Item>
          <Form.Item
            name="isEnabled"
            label="启用"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 资源 Modal ===== */}
      <Modal
        title={
          editingResource
            ? `编辑资源 - ${editingResource.resourceUri}`
            : '注册资源'
        }
        open={resourceEditOpen}
        onCancel={() => setResourceEditOpen(false)}
        onOk={handleSaveResource}
        confirmLoading={resourceSaving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <Form<ResourceFormValues> form={resourceForm} layout="vertical">
          <Form.Item
            name="serverId"
            label="所属服务"
            rules={[{ required: true, message: '请选择服务' }]}
          >
            <Select
              options={servers.map((s) => ({
                label: s.name,
                value: s.id
              }))}
              placeholder="选择服务"
            />
          </Form.Item>
          <Form.Item
            name="resourceUri"
            label="资源 URI"
            rules={[{ required: true, message: '请输入资源 URI' }]}
          >
            <Input placeholder="如:agent://coder" maxLength={256} />
          </Form.Item>
          <div className={styles.formRow}>
            <Form.Item
              name="resourceType"
              label="资源类型"
              className={styles.formItem}
              rules={[{ required: true, message: '请选择资源类型' }]}
            >
              <Select options={RESOURCE_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item
              name="isEnabled"
              label="启用"
              className={styles.formItem}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </div>
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input placeholder="如:代码助手" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Form.Item
            name="metadataText"
            label="Metadata (JSON)"
            tooltip="资源的元数据 JSON"
          >
            <Input.TextArea
              rows={4}
              placeholder='{"key":"value"}'
              className={styles.jsonArea}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
