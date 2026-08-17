// 我的 - MCP 服务器
// 列表 + 自定义添加 + 环境变量配置 / 探测 / 详情 / 删除

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  message,
} from 'antd'
import type { TableProps } from 'antd'
import {
  ApiOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { mcpApi } from '@/api/mcp-api'
import type { McpServer } from '@/api/mcp-api'
import * as marketApi from '@/api/market-api'
import EnvModal from './EnvModal'
import type { EnvTemplateItem } from './EnvModal'
import styles from './styles.module.css'

const TRANSPORT_OPTIONS = [
  { label: 'stdio', value: 'stdio' },
  { label: 'http', value: 'http' },
  { label: 'streamable-http', value: 'streamable-http' },
]

const TRANSPORT_TAG: Record<string, { color: string; text: string }> = {
  stdio: { color: 'cyan', text: 'stdio' },
  http: { color: 'blue', text: 'http' },
  'streamable-http': { color: 'geekblue', text: 'streamable-http' },
}

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待连接' },
  connected: { color: 'green', text: '已连接' },
  failed: { color: 'red', text: '连接失败' },
  disabled: { color: 'default', text: '已禁用' },
}

interface AddFormValues {
  name: string
  description?: string
  transportType: 'stdio' | 'http' | 'streamable-http'
  command?: string
  argsInput?: string
  url?: string
  envJson?: string
  enabled?: boolean
}

interface LocalDetailInfo {
  homepage?: string
  sourceUrl?: string
  license?: string
  envTemplate?: EnvTemplateItem[]
}

export default function InstalledMcp() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [addForm] = Form.useForm<AddFormValues>()
  const [enablingIds, setEnablingIds] = useState<Set<number>>(new Set())
  const [probingIds, setProbingIds] = useState<Set<number>>(new Set())
  const [envServerId, setEnvServerId] = useState<number | null>(null)
  const [envModalOpen, setEnvModalOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailServer, setDetailServer] = useState<McpServer | null>(null)
  const [localDetail, setLocalDetail] = useState<LocalDetailInfo | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await mcpApi.listServers()
      setServers(list || [])
    } catch (err) {
      console.error('[InstalledMcp] load failed:', err)
      message.error('加载 MCP 服务器列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 自定义添加 */
  const handleCreate = async () => {
    try {
      const values = await addForm.validateFields()

      let env: Record<string, string> | undefined
      if (values.envJson && values.envJson.trim()) {
        try {
          env = JSON.parse(values.envJson) as Record<string, string>
        } catch {
          message.error('环境变量 JSON 格式错误')
          return
        }
      }

      const args = values.argsInput
        ? values.argsInput.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined

      const payload: Partial<McpServer> = {
        name: values.name,
        description: values.description || undefined,
        transportType: values.transportType,
        enabled: values.enabled !== undefined ? values.enabled : true,
      }
      if (values.transportType === 'stdio') {
        payload.command = values.command
        payload.args = args && args.length > 0 ? args : undefined
      } else {
        payload.url = values.url
      }
      if (env) payload.env = env

      setCreating(true)
      await mcpApi.createServer(payload)
      message.success('MCP 服务器已添加')
      setAddOpen(false)
      addForm.resetFields()
      await loadData()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[InstalledMcp] create failed:', err)
      message.error('添加失败: ' + (err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const closeAdd = () => {
    setAddOpen(false)
    addForm.resetFields()
  }

  /** 启用/禁用 */
  const handleToggleEnabled = async (server: McpServer, enabled: boolean) => {
    setEnablingIds((prev) => new Set(prev).add(server.id))
    try {
      await mcpApi.updateServer(server.id, { enabled })
      message.success(enabled ? '已启用' : '已禁用')
      await loadData()
    } catch (err) {
      console.error('[InstalledMcp] toggle enabled failed:', err)
      message.error('操作失败: ' + (err as Error).message)
    } finally {
      setEnablingIds((prev) => {
        const next = new Set(prev)
        next.delete(server.id)
        return next
      })
    }
  }

  /** 探测连接 */
  const handleProbe = async (server: McpServer) => {
    setProbingIds((prev) => new Set(prev).add(server.id))
    try {
      const res = await mcpApi.probeServer(server.id)
      if (res.reachable) {
        const latency = res.latencyMs != null ? '，延迟 ' + res.latencyMs + 'ms' : ''
        message.success('连接正常（' + (res.toolCount ?? 0) + ' 个工具' + latency + '）')
      } else {
        message.error('连接失败: ' + (res.errorMessage || '未知错误'))
      }
    } catch (err) {
      console.error('[InstalledMcp] probe failed:', err)
      message.error('探测失败: ' + (err as Error).message)
    } finally {
      setProbingIds((prev) => {
        const next = new Set(prev)
        next.delete(server.id)
        return next
      })
      void loadData()
    }
  }

  /** 详情（服务器信息 + 官方来源时补本地 mcp.json 详情） */
  const openDetail = async (server: McpServer) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailServer(null)
    setLocalDetail(null)
    try {
      const s = await mcpApi.getServer(server.id)
      setDetailServer(s)
      if (s.source === 'official' && s.catalogId != null) {
        try {
          const d = await marketApi.getDetail('mcp', s.catalogId)
          const raw = (d.detail || {}) as Record<string, unknown>
          setLocalDetail({
            homepage: typeof raw.homepage === 'string' ? raw.homepage : undefined,
            sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : undefined,
            license: typeof raw.license === 'string' ? raw.license : undefined,
            envTemplate: Array.isArray(raw.envTemplate)
              ? (raw.envTemplate as EnvTemplateItem[])
              : undefined,
          })
        } catch (err) {
          console.warn('[InstalledMcp] 本地 mcp.json 详情读取失败:', err)
        }
      }
    } catch (err) {
      console.error('[InstalledMcp] load detail failed:', err)
      message.error('加载详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  /** 删除 */
  const handleDelete = async (server: McpServer) => {
    try {
      await mcpApi.deleteServer(server.id)
      message.success('已删除「' + server.name + '」')
      await loadData()
    } catch (err) {
      console.error('[InstalledMcp] delete failed:', err)
      message.error('删除失败: ' + (err as Error).message)
    }
  }

  const columns: TableProps<McpServer>['columns'] = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (_: unknown, record: McpServer) => (
        <div>
          <div className={styles.nameCellTitle}>{record.name}</div>
          {record.description && (
            <div className={styles.nameCellDesc} title={record.description}>
              {record.description}
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            {record.source === 'official' ? (
              <span className={styles.sourceBadgeOfficial}>官方</span>
            ) : record.source === 'chat' ? (
              <span className={styles.sourceBadgeCustom}>对话安装</span>
            ) : (
              <span className={styles.sourceBadgeCustom}>自定义</span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '传输方式',
      dataIndex: 'transportType',
      key: 'transportType',
      width: 140,
      render: (_: unknown, record: McpServer) => {
        const meta = TRANSPORT_TAG[record.transportType || record.transport || 'stdio']
        return <Tag color={meta.color}>{meta.text}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const meta = STATUS_TAG[status] || { color: 'default', text: '未知' }
        return <Tag color={meta.color}>{meta.text}</Tag>
      },
    },
    {
      title: '工具数',
      dataIndex: 'toolCount',
      key: 'toolCount',
      width: 90,
      render: (count: number | undefined) => count ?? '-',
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (_: unknown, record: McpServer) => (
        <Switch
          checked={record.enabled}
          loading={enablingIds.has(record.id)}
          onChange={(checked) => handleToggleEnabled(record, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 250,
      render: (_: unknown, record: McpServer) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={() => {
              setEnvServerId(record.id)
              setEnvModalOpen(true)
            }}
          >
            配置 env
          </Button>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            loading={probingIds.has(record.id)}
            onClick={() => handleProbe(record)}
          >
            探测
          </Button>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openDetail(record)}
          >
            详情
          </Button>
          <Popconfirm
            title={'确定删除服务器「' + record.name + '」吗？'}
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ]

  const statusMeta = (status?: string) =>
    STATUS_TAG[status || ''] || { color: 'default', text: '未知' }
  const transportMeta = (s: McpServer) =>
    TRANSPORT_TAG[s.transportType || s.transport || 'stdio']

  return (
    <div className={styles.installedPage}>
        {/* 顶部：数量 + 自定义添加 */}
        <div className={styles.installedToolbar}>
          <div className={styles.toolbarInfo}>
            <ApiOutlined className={styles.toolbarIcon} />
            共 {servers.length} 个 MCP 服务器
          </div>
          <Button
            className={styles.addBtn}
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddOpen(true)}
          >
            自定义添加
          </Button>
        </div>

        <Spin spinning={loading}>
          {servers.length === 0 && !loading ? (
            <Empty
              description="还没有安装 MCP，去官方下载"
              style={{ marginTop: 64 }}
            />
          ) : (
            <Table<McpServer>
              className={styles.table}
              rowKey="id"
              columns={columns}
              dataSource={servers}
              pagination={false}
              size="middle"
            />
          )}
        </Spin>

        {/* 添加服务器弹窗 */}
        <Modal
          title="添加 MCP 服务器"
          open={addOpen}
          onCancel={closeAdd}
          onOk={handleCreate}
          confirmLoading={creating}
          okText="添加"
          cancelText="取消"
          width={620}
          styles={{ body: { paddingTop: 24 } }}
        >
          <Form<AddFormValues>
            form={addForm}
            layout="vertical"
            initialValues={{ transportType: 'stdio', enabled: true }}
          >
            <Form.Item
              name="name"
              label="名称"
              rules={[{ required: true, message: '请输入名称' }]}
            >
              <Input placeholder="例如：我的文件服务" maxLength={64} />
            </Form.Item>

            <Form.Item name="description" label="描述">
              <Input.TextArea rows={2} maxLength={500} showCount />
            </Form.Item>

            <Form.Item
              name="transportType"
              label="传输方式"
              rules={[{ required: true, message: '请选择传输方式' }]}
            >
              <Select options={TRANSPORT_OPTIONS} />
            </Form.Item>

            <Form.Item noStyle shouldUpdate>
              {({ getFieldValue }) =>
                getFieldValue('transportType') === 'stdio' ? (
                  <>
                    <Form.Item
                      name="command"
                      label="启动命令"
                      rules={[{ required: true, message: '请输入启动命令' }]}
                    >
                      <Input placeholder="例如：npx @modelcontextprotocol/server-filesystem" />
                    </Form.Item>
                    <Form.Item
                      name="argsInput"
                      label="参数"
                      extra="逗号分隔，例如：--port=3000,--host=127.0.0.1"
                    >
                      <Input placeholder="--port=3000,--host=127.0.0.1" />
                    </Form.Item>
                  </>
                ) : (
                  <Form.Item
                    name="url"
                    label="服务地址"
                    rules={[{ required: true, message: '请输入服务地址' }]}
                  >
                    <Input placeholder="http://localhost:3000/mcp" />
                  </Form.Item>
                )
              }
            </Form.Item>

            <Form.Item
              name="envJson"
              label="环境变量"
              extra='JSON 格式，例如：{"API_KEY":"xxx"}'
            >
              <Input.TextArea
                rows={3}
                placeholder='{"API_KEY":"xxx"}'
                className={styles.jsonTextarea}
              />
            </Form.Item>

            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Modal>

        {/* 环境变量配置 */}
        <EnvModal
          open={envModalOpen}
          serverId={envServerId}
          onClose={() => setEnvModalOpen(false)}
          onSaved={() => void loadData()}
        />

        {/* 详情抽屉 */}
        <Drawer
          title="MCP 服务器详情"
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          width={520}
          styles={{ body: { paddingTop: 12 } }}
        >
          <Spin spinning={detailLoading}>
            {detailServer && (
              <div>
                <div className={styles.detailHeader}>
                  <span className={styles.detailName}>{detailServer.name}</span>
                  {detailServer.source === 'official' ? (
                    <span className={styles.sourceBadgeOfficial}>官方</span>
                  ) : (
                    <span className={styles.sourceBadgeCustom}>自定义</span>
                  )}
                  <Tag color={statusMeta(detailServer.status).color}>
                    {statusMeta(detailServer.status).text}
                  </Tag>
                </div>

                <div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>传输方式</span>
                    <span className={styles.detailValue}>
                      <Tag color={transportMeta(detailServer).color}>
                        {transportMeta(detailServer).text}
                      </Tag>
                    </span>
                  </div>
                  {detailServer.description && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>描述</span>
                      <span className={styles.detailValue}>
                        {detailServer.description}
                      </span>
                    </div>
                  )}
                  {detailServer.command && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>命令</span>
                      <span className={styles.detailValue}>{detailServer.command}</span>
                    </div>
                  )}
                  {detailServer.args && detailServer.args.length > 0 && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>参数</span>
                      <span className={styles.detailValue}>
                        {detailServer.args.join(' ')}
                      </span>
                    </div>
                  )}
                  {detailServer.url && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>地址</span>
                      <span className={styles.detailValue}>{detailServer.url}</span>
                    </div>
                  )}
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>环境变量</span>
                    <span className={styles.detailValue}>
                      {detailServer.env && Object.keys(detailServer.env).length > 0
                        ? Object.keys(detailServer.env).join(', ')
                        : '无'}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>工具数量</span>
                    <span className={styles.detailValue}>
                      {detailServer.toolCount ?? '-'}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>最近连接</span>
                    <span className={styles.detailValue}>
                      {detailServer.lastConnectedAt || '从未连接'}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>创建时间</span>
                    <span className={styles.detailValue}>{detailServer.createdAt}</span>
                  </div>
                </div>

                {localDetail && (
                  <div className={styles.detailSection}>
                    <div className={styles.detailSectionTitle}>官方包信息</div>
                    {localDetail.homepage && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>主页</span>
                        <a
                          className={styles.detailValueLink}
                          href={localDetail.homepage}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {localDetail.homepage}
                        </a>
                      </div>
                    )}
                    {localDetail.sourceUrl && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>源码</span>
                        <a
                          className={styles.detailValueLink}
                          href={localDetail.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {localDetail.sourceUrl}
                        </a>
                      </div>
                    )}
                    {localDetail.license && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>许可证</span>
                        <span className={styles.detailValue}>
                          {localDetail.license}
                        </span>
                      </div>
                    )}
                    {localDetail.envTemplate && localDetail.envTemplate.length > 0 && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>环境变量模板</span>
                        <span className={styles.detailValue}>
                          {localDetail.envTemplate.map((t) => (
                            <div key={t.key} className={styles.envTemplateRow}>
                              <span className={styles.envTemplateKey}>{t.key}</span>
                              {' · '}
                              {t.label}
                              {t.required ? ' *' : ''}
                              {t.secret ? '（密文）' : ''}
                            </div>
                          ))}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Spin>
        </Drawer>
    </div>
  )
}
