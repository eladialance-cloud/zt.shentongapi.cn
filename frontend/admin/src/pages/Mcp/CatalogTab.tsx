// MCP 官方目录 Tab - 列表 / 新建 / 编辑 / 上架切换 / 删除
//
// 端点契约：
//   GET    /admin/mcp-catalog?keyword=&category=&enabled=&page=&pageSize=   官方目录列表
//   GET    /admin/mcp-catalog/:id                                           条目详情
//   POST   /admin/mcp-catalog                                               创建条目
//   PUT    /admin/mcp-catalog/:id                                           更新条目
//   POST   /admin/mcp-catalog/:id/toggle                                    切换上架
//   DELETE /admin/mcp-catalog/:id                                           删除条目

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Select,
  Switch,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { adminMcpCatalogApi } from '@/api/admin-mcp-api'
import { reclassifyAsset } from '@/api/admin-classify-api'
import type {
  EnvTemplateItem,
  McpCatalog,
  McpCatalogQuery,
  McpRuntime,
  McpSecurityLevel,
  McpTransportType
} from '@/types/admin-mcp'
import styles from './styles.module.css'
import { TabContent, editDeleteActions, renderName, renderNumber } from './components'
import { EnvTemplateEditor } from './EnvTemplateEditor'

const PAGE_SIZE = 10

/* ===== 常量映射 ===== */

const CATEGORY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '数据库', value: 'database' },
  { label: '搜索', value: 'search' },
  { label: '浏览器', value: 'browser' },
  { label: '代码仓库', value: 'git' },
  { label: '文件', value: 'files' },
  { label: '消息', value: 'messaging' },
  { label: 'AI', value: 'ai' },
  { label: '运维', value: 'devops' },
  { label: '其他', value: 'other' }
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label])
)

const CATEGORY_COLOR: Record<string, string> = {
  database: 'blue',
  search: 'cyan',
  browser: 'purple',
  git: 'orange',
  files: 'green',
  messaging: 'magenta',
  ai: 'volcano',
  devops: 'geekblue',
  other: 'default'
}

const RUNTIME_OPTIONS: Array<{ label: string; value: McpRuntime }> = [
  { label: 'node', value: 'node' },
  { label: 'python', value: 'python' },
  { label: 'docker', value: 'docker' },
  { label: 'http', value: 'http' }
]

const RUNTIME_COLOR: Record<McpRuntime, string> = {
  node: 'green',
  python: 'blue',
  docker: 'purple',
  http: 'orange'
}

const SECURITY_LEVEL_OPTIONS: Array<{ label: string; value: McpSecurityLevel }> = [
  { label: '官方', value: 'official' },
  { label: '社区', value: 'community' }
]

const SECURITY_LEVEL_TAG: Record<McpSecurityLevel, { color: string; text: string }> = {
  official: { color: 'green', text: '官方' },
  community: { color: 'default', text: '社区' }
}

const TRANSPORT_OPTIONS: Array<{ label: string; value: McpTransportType }> = [
  { label: 'stdio', value: 'stdio' },
  { label: 'http', value: 'http' },
  { label: 'streamable-http', value: 'streamable-http' }
]

const TRANSPORT_COLOR: Record<McpTransportType, string> = {
  stdio: 'cyan',
  http: 'blue',
  'streamable-http': 'geekblue'
}

const ENABLED_OPTIONS = [
  { label: '启用', value: 'true' },
  { label: '下架', value: 'false' }
]

/** 命令白名单提示 */
const COMMAND_HINT = '仅支持 npx/uvx/docker/python/python3/node 单个命令词，参数填到下方'

/** 按运行时给出命令占位提示 */
function commandPlaceholder(runtime: McpRuntime | undefined) {
  const head = runtime === 'python' ? 'uvx' : runtime === 'docker' ? 'docker' : runtime === 'node' ? 'npx' : 'npx'
  return `如:${head}（仅支持 npx/uvx/docker/python/python3/node 单个命令词，参数填到下方）`
}

interface CatalogFormValues {
  name: string
  category?: string
  description?: string
  runtime: McpRuntime
  securityLevel: McpSecurityLevel
  transportType: McpTransportType
  command?: string
  argsInput?: string
  url?: string
  envTemplate?: EnvTemplateItem[]
  icon?: string
  homepage?: string
  sourceUrl?: string
  license?: string
  version?: string
  sortOrder?: number
  enabled?: boolean
}

/** 官方目录 Tab */
export function CatalogTab() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<McpCatalog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | ''>('')
  const [enabledFilter, setEnabledFilter] = useState<string | ''>('')

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<McpCatalog | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<CatalogFormValues>()
  const runtime = Form.useWatch('runtime', form)
  const transportType = Form.useWatch('transportType', form)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: McpCatalogQuery = {}
      if (keyword) query.keyword = keyword
      if (categoryFilter) query.category = categoryFilter
      if (enabledFilter) query.enabled = enabledFilter
      query.page = page
      query.pageSize = PAGE_SIZE
      const result = await adminMcpCatalogApi.list(query)
      setList(result.list || [])
      setTotal(result.total || 0)
      if ((result.list || []).length === 0 && page > 1) setPage(1)
    } catch (err) {
      console.error('[CatalogTab] load list failed:', err)
      message.error('加载官方目录失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, categoryFilter, enabledFilter, page])

  useEffect(() => {
    void loadList()
  }, [loadList])

  /* ===== 操作 ===== */

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      runtime: 'node',
      securityLevel: 'official',
      transportType: 'stdio',
      enabled: true,
      argsInput: '',
      envTemplate: []
    })
    setEditOpen(true)
  }

  const handleEdit = (item: McpCatalog) => {
    setEditing(item)
    form.resetFields()
    form.setFieldsValue({
      name: item.name,
      category: item.category,
      description: item.description,
      runtime: item.runtime,
      securityLevel: item.securityLevel,
      transportType: item.transportType,
      command: item.command,
      argsInput: (item.args || []).join(', '),
      url: item.url,
      envTemplate: item.envTemplate || [],
      icon: item.icon,
      homepage: item.homepage,
      sourceUrl: item.sourceUrl,
      license: item.license,
      version: item.version,
      sortOrder: item.sortOrder,
      enabled: item.enabled ?? true
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const isStdio = values.transportType === 'stdio'
      const isHttp = values.transportType === 'http' || values.transportType === 'streamable-http'
      const dto: Omit<McpCatalog, 'id'> = {
        name: values.name,
        category: values.category || '',
        description: values.description || '',
        tags: editing?.tags || [],
        icon: values.icon || '',
        homepage: values.homepage || '',
        sourceUrl: values.sourceUrl || '',
        license: values.license || '',
        runtime: values.runtime,
        securityLevel: values.securityLevel,
        transportType: values.transportType,
        command: isStdio ? (values.command || '') : undefined,
        args: isStdio
          ? (values.argsInput || '').split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined,
        envTemplate: values.envTemplate || [],
        url: isHttp ? (values.url || '') : undefined,
        version: values.version || '',
        enabled: values.enabled,
        sortOrder: values.sortOrder
      }
      if (editing) {
        await adminMcpCatalogApi.update(editing.id, dto)
        message.success('已更新')
      } else {
        await adminMcpCatalogApi.create(dto)
        message.success('已创建')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[CatalogTab] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item: McpCatalog) => {
    try {
      await adminMcpCatalogApi.toggle(item.id)
      message.success('已更新上架状态')
      void loadList()
    } catch (err) {
      console.error('[CatalogTab] toggle failed:', err)
      message.error('切换上架失败')
    }
  }

  const handleDelete = async (item: McpCatalog) => {
    try {
      await adminMcpCatalogApi.remove(item.id)
      message.success('已删除')
      void loadList()
    } catch (err) {
      console.error('[CatalogTab] delete failed:', err)
      message.error('删除失败')
    }
  }

  const handleReclassify = async (item: McpCatalog) => {
    try {
      const result = await reclassifyAsset('mcp', item.id)
      message.success(`已分类：${result.category}`)
      void loadList()
    } catch (err) {
      console.error('[CatalogTab] reclassify failed:', err)
      message.error((err as Error).message || '重新分类失败（请检查模型配置）')
    }
  }

  /* ===== 表格列 ===== */

  const columns: TableColumnsType<McpCatalog> = [
    { title: '名称', dataIndex: 'name', key: 'name', render: renderName },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (v?: string) =>
        v ? <Tag color={CATEGORY_COLOR[v] || 'default'}>{CATEGORY_LABEL[v] || v}</Tag> : <span style={{ color: '#64748b' }}>-</span>
    },
    {
      title: '运行时',
      dataIndex: 'runtime',
      key: 'runtime',
      width: 90,
      render: (v?: McpRuntime) =>
        v ? <Tag color={RUNTIME_COLOR[v]}>{v}</Tag> : <span style={{ color: '#64748b' }}>-</span>
    },
    {
      title: '传输方式',
      dataIndex: 'transportType',
      key: 'transportType',
      width: 130,
      render: (v?: McpTransportType) =>
        v ? <Tag color={TRANSPORT_COLOR[v]}>{v}</Tag> : <span style={{ color: '#64748b' }}>-</span>
    },
    {
      title: '安全分级',
      dataIndex: 'securityLevel',
      key: 'securityLevel',
      width: 100,
      render: (v?: McpSecurityLevel) =>
        v ? <Tag color={SECURITY_LEVEL_TAG[v].color}>{SECURITY_LEVEL_TAG[v].text}</Tag> : <span style={{ color: '#64748b' }}>-</span>
    },
    {
      title: '上架',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (_: unknown, record: McpCatalog) => (
        <Switch size="small" checked={!!record.enabled} onChange={() => handleToggle(record)} />
      )
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80,
      render: (v?: number) =>
        v === undefined || v === null ? <span style={{ color: '#64748b' }}>-</span> : renderNumber(v)
    },
    {
      title: '下载数',
      dataIndex: 'downloadCount',
      key: 'downloadCount',
      width: 100,
      render: (v?: number) =>
        v === undefined || v === null ? <span style={{ color: '#64748b' }}>-</span> : renderNumber(v)
    },
    {
      title: 'AI 分类',
      key: 'reclassify',
      width: 100,
      fixed: 'right',
      render: (_: unknown, record: McpCatalog) => (
        <Button type="link" size="small" icon={<ThunderboltOutlined />} onClick={() => void handleReclassify(record)}>
          重新分类
        </Button>
      ),
    },
    editDeleteActions(handleEdit, handleDelete, '确认删除该目录条目?')
  ]

  /* ===== 渲染 ===== */

  return (
    <>
      <TabContent<McpCatalog>
        loading={loading}
        data={list}
        columns={columns}
        scrollX={1200}
        emptyText="暂无目录条目"
        toolbar={
          <>
            <div className={styles.toolbarLeft}>
              <Input
                placeholder="搜索名称"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={() => { setPage(1); void loadList() }}
                prefix={<SearchOutlined style={{ color: '#64748b' }} />}
                className={styles.searchBox}
                allowClear
                onClear={() => { setKeyword(''); setPage(1) }}
              />
              <Select
                placeholder="分类"
                value={categoryFilter || undefined}
                onChange={(v) => { setCategoryFilter((v || '') as string); setPage(1) }}
                className={styles.filterSelect}
                allowClear
                options={CATEGORY_OPTIONS}
              />
              <Select
                placeholder="上架状态"
                value={enabledFilter || undefined}
                onChange={(v) => { setEnabledFilter((v || '') as string); setPage(1) }}
                className={styles.filterSelect}
                allowClear
                options={ENABLED_OPTIONS}
              />
            </div>
            <div className={styles.toolbarRight}>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} className={styles.primaryBtn}>
                新建
              </Button>
            </div>
          </>
        }
        pagination={
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
        }
      />

      {/* ===== 新建/编辑 Modal ===== */}
      <Modal
        title={editing ? `编辑 - ${editing.name}` : '新建目录条目'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={760}
      >
        <Form<CatalogFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如:Filesystem Server" maxLength={128} />
          </Form.Item>
          <div className={styles.formRow}>
            <Form.Item name="category" label="分类" className={styles.formItem}>
              <Select options={CATEGORY_OPTIONS} placeholder="选择分类" allowClear />
            </Form.Item>
            <Form.Item
              name="runtime"
              label="运行时"
              className={styles.formItem}
              rules={[{ required: true, message: '请选择运行时' }]}
            >
              <Select options={RUNTIME_OPTIONS} />
            </Form.Item>
            <Form.Item
              name="securityLevel"
              label="安全分级"
              className={styles.formItem}
              rules={[{ required: true, message: '请选择安全分级' }]}
            >
              <Select options={SECURITY_LEVEL_OPTIONS} />
            </Form.Item>
          </div>
          <div className={styles.formRow}>
            <Form.Item
              name="transportType"
              label="传输方式"
              className={styles.formItem}
              rules={[{ required: true, message: '请选择传输方式' }]}
            >
              <Select options={TRANSPORT_OPTIONS} />
            </Form.Item>
            <Form.Item name="version" label="版本" className={styles.formItem}>
              <Input placeholder="如:1.0.0" maxLength={32} />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序" className={styles.formItem}>
              <InputNumber style={{ width: '100%' }} min={0} placeholder="数值越小越靠前" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          {transportType === 'stdio' && (
            <>
              <Form.Item
                name="command"
                label="命令"
                tooltip={COMMAND_HINT}
                rules={[{ required: true, message: '请输入命令' }]}
              >
                <Input
                  placeholder={commandPlaceholder(runtime)}
                  maxLength={64}
                />
              </Form.Item>
              <Form.Item name="argsInput" label="参数 (逗号分隔)">
                <Input placeholder="如:-y, @modelcontextprotocol/server-filesystem" maxLength={512} />
              </Form.Item>
            </>
          )}
          {(transportType === 'http' || transportType === 'streamable-http') && (
            <Form.Item
              name="url"
              label="URL"
              rules={[{ required: true, message: '请输入 URL' }]}
            >
              <Input placeholder="https://example.com/mcp" maxLength={512} />
            </Form.Item>
          )}
          <EnvTemplateEditor />
          <div className={styles.formRow}>
            <Form.Item name="icon" label="图标" className={styles.formItem}>
              <Input placeholder="图标 URL 或 emoji" maxLength={256} />
            </Form.Item>
            <Form.Item name="homepage" label="主页" className={styles.formItem}>
              <Input placeholder="https://" maxLength={256} />
            </Form.Item>
          </div>
          <div className={styles.formRow}>
            <Form.Item name="sourceUrl" label="源码地址" className={styles.formItem}>
              <Input placeholder="https://github.com/..." maxLength={256} />
            </Form.Item>
            <Form.Item name="license" label="协议" className={styles.formItem}>
              <Input placeholder="如:MIT" maxLength={64} />
            </Form.Item>
          </div>
          <Form.Item name="enabled" label="上架" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
