/**
 * McpConfig — MCP 基座管理页面
 *
 * Tab 结构：「服务器」（Server CRUD）|「工具」（ToolList）
 * 订阅 IPC service:status-changed 实时显示 MCP Gateway 连接状态。
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Spin, Tag, message, Popconfirm, Tooltip, Tabs, Select, Segmented } from 'antd'
import {
  ApiOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  SaveOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import { mcpApi } from '@/api/mcp-api'
import type { McpServer } from '@/api/mcp-api'
import { onServiceStatusChanged, getServiceStatus } from '@/api/service-manager-api'
import type { ServiceStatus } from '@/types/service-manager'
import {
  OWNER_TYPE_LABELS,
  OWNER_TYPE_TAG_COLOR,
  isActionAllowed
} from '@/types/resource'
import type { OwnerType } from '@/types/resource'
import ServerForm from './ServerForm'
import ToolList from './ToolList'
import styles from './styles.module.css'

/** Task 13: 三级资源归属筛选选项（全部/官方/团队/我的） */
const OWNER_TYPE_SEGMENTS: Array<{ label: string; value: 'all' | OwnerType }> = [
  { label: '全部', value: 'all' },
  { label: '官方', value: 'official' },
  { label: '团队', value: 'team' },
  { label: '我的', value: 'user' }
]

const TRANSPORT_TAG: Record<string, { color: string; text: string }> = {
  stdio: { color: 'cyan', text: 'stdio' },
  http: { color: 'blue', text: 'http' },
  'streamable-http': { color: 'geekblue', text: 'streamable-http' },
}

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  connected: { color: 'green', text: '已连接' },
  pending: { color: 'orange', text: '待连接' },
  failed: { color: 'red', text: '连接失败' },
  disabled: { color: 'default', text: '已禁用' },
}

/** MCP Gateway 服务状态 → Tag 配置 */
const GATEWAY_STATUS_TAG: Record<ServiceStatus, { color: string; text: string }> = {
  running: { color: 'green', text: '运行中' },
  stopped: { color: 'red', text: '已停止' },
  starting: { color: 'orange', text: '启动中' },
  error: { color: 'red', text: '错误' },
  unknown: { color: 'default', text: '未知' },
}

export default function McpConfig() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServer | null>(null)
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set())

  // Tab + 工具浏览
  const [activeTab, setActiveTab] = useState<'servers' | 'tools'>('servers')
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)

  // MCP Gateway 服务状态
  const [gatewayStatus, setGatewayStatus] = useState<ServiceStatus>('unknown')

  // Task 13: 三级资源归属筛选（'all' = 不过滤）
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<'all' | OwnerType>('all')

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      // Task 13: 透传 ownerType 过滤参数（后端未支持前会忽略）
      const query =
        ownerTypeFilter === 'all' ? {} : { ownerType: ownerTypeFilter }
      const list = await mcpApi.listServers(query)
      setServers(list || [])
      // 如果尚未选择服务器，默认选第一个
      if (list && list.length > 0 && selectedServerId === null) {
        setSelectedServerId(list[0].id)
      }
    } catch (err) {
      console.error('[McpConfig] load servers failed:', err)
      message.error('加载 MCP 服务器列表失败')
    } finally {
      setLoading(false)
    }
  }, [selectedServerId, ownerTypeFilter])

  useEffect(() => {
    void loadServers()
  }, [loadServers])

  /** Task 13: 三级资源归属筛选切换 */
  const handleOwnerTypeChange = (value: 'all' | OwnerType) => {
    setOwnerTypeFilter(value)
  }

  // Task 13: 另存为我的 / 发布到团队 占位处理（待后端支持）
  const handleSaveAsMine = (server: McpServer) => {
    // TODO(backend): 调用 POST /mcp/servers/:id/fork
    message.info(`「${server.name}」另存为我的：功能开发中（待后端支持）`)
  }
  const handlePublishToTeam = (server: McpServer) => {
    // TODO(backend): 调用 POST /mcp/servers/:id/publish-to-team
    message.info(`「${server.name}」发布到团队：功能开发中（待后端支持）`)
  }

  // 订阅 MCP 服务状态变更
  useEffect(() => {
    let mounted = true
    // 初始获取 MCP 服务状态
    void (async () => {
      try {
        const info = await getServiceStatus('mcp')
        if (mounted) setGatewayStatus(info.status)
      } catch {
        // electronAPI 不可用时忽略
      }
    })()

    const unsub = onServiceStatusChanged((payload) => {
      if (!mounted) return
      if (payload.name === 'mcp') {
        setGatewayStatus(payload.status)
      }
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [])

  const handleAdd = () => {
    setEditingServer(null)
    setFormOpen(true)
  }

  const handleEdit = (server: McpServer) => {
    setEditingServer(server)
    setFormOpen(true)
  }

  const handleDelete = async (server: McpServer) => {
    try {
      await mcpApi.deleteServer(server.id)
      message.success(`已删除 ${server.name}`)
      setServers((prev) => prev.filter((s) => s.id !== server.id))
      // 如果删除的是当前选中的服务器，重置选择
      if (selectedServerId === server.id) {
        setSelectedServerId(null)
      }
    } catch (err) {
      console.error('[McpConfig] delete failed:', err)
      message.error('删除失败')
    }
  }

  const handleTestConnection = async (server: McpServer) => {
    setTestingIds((prev) => new Set(prev).add(server.id))
    try {
      await mcpApi.getServer(server.id)
      message.success(`${server.name} 连接正常`)
    } catch (err) {
      console.error('[McpConfig] test connection failed:', err)
      message.error(`${server.name} 连接失败`)
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev)
        next.delete(server.id)
        return next
      })
    }
  }

  /** 从服务器卡片跳转到工具 Tab */
  const handleViewTools = (server: McpServer) => {
    setSelectedServerId(server.id)
    setActiveTab('tools')
  }

  const handleFormSuccess = () => {
    setFormOpen(false)
    void loadServers()
  }

  const gatewayTag = GATEWAY_STATUS_TAG[gatewayStatus] || GATEWAY_STATUS_TAG.unknown

  return (
    <div className={styles.page}>
      {/* 头部 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}><ApiOutlined /></span>
          <div>
            <h1 className={styles.title}>MCP 工具配置</h1>
            <div className={styles.subtitle}>管理 MCP 服务器配置与工具调用</div>
          </div>
        </div>
        <div className={styles.headerActions}>
          {/* MCP Gateway 状态 Tag */}
          <Tooltip title={`MCP Gateway 服务状态：${gatewayTag.text}`}>
            <Tag
              color={gatewayTag.color}
              style={{ margin: 0, padding: '2px 12px', fontSize: 13 }}
            >
              MCP Gateway: {gatewayTag.text}
            </Tag>
          </Tooltip>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadServers}
            className={styles.ghostBtn}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            className={styles.primaryBtn}
          >
            添加服务器
          </Button>
        </div>
      </div>

      {/* Tab 结构 */}
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'servers' | 'tools')}
        items={[
          {
            key: 'servers',
            label: (
              <span>
                <ApiOutlined /> 服务器
              </span>
            ),
            children: (
              <Spin spinning={loading}>
                {/* Task 13: 三级资源归属筛选（全部/官方/团队/我的） */}
                <div className={styles.ownerFilter}>
                  <Segmented
                    value={ownerTypeFilter}
                    onChange={(val) => handleOwnerTypeChange(val as 'all' | OwnerType)}
                    options={OWNER_TYPE_SEGMENTS}
                  />
                </div>

                {servers.length === 0 && !loading ? (
                  <div className={styles.emptyWrap}>
                    <Empty description="暂无 MCP 服务器配置">
                      <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                        添加一个服务器
                      </Button>
                    </Empty>
                  </div>
                ) : (
                  <div className={styles.cardGrid}>
                    {servers.map((server) => {
                      const transportInfo = TRANSPORT_TAG[server.transportType || server.transport || 'stdio'] || TRANSPORT_TAG.stdio
                      const statusInfo = STATUS_TAG[server.status || (server.enabled ? 'connected' : 'disabled')] || STATUS_TAG.pending
                      const isTesting = testingIds.has(server.id)
                      // Task 13: 解析资源归属类型（后端未返回字段时默认 'user'）
                      const ownerType: OwnerType = server.ownerType || 'user'

                      return (
                        <div key={server.id} className={styles.serverCard}>
                          {/* 卡片头部 */}
                          <div className={styles.cardHeader}>
                            <div className={styles.cardTitleWrap}>
                              <ApiOutlined className={styles.cardIcon} />
                              <span className={styles.cardName}>{server.name}</span>
                              {/* Task 13: 资源来源标签 */}
                              <Tag
                                color={OWNER_TYPE_TAG_COLOR[ownerType]}
                                style={{ marginLeft: 4, fontSize: 11 }}
                              >
                                {OWNER_TYPE_LABELS[ownerType]}
                              </Tag>
                            </div>
                            <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
                          </div>

                          {/* 描述 */}
                          {server.description && (
                            <p className={styles.cardDesc}>{server.description}</p>
                          )}

                          {/* 元信息 */}
                          <div className={styles.cardMeta}>
                            <Tag color={transportInfo.color} bordered={false}>
                              {transportInfo.text}
                            </Tag>
                            {server.command && (
                              <span className={styles.metaText}>
                                <ToolOutlined /> {server.command}
                              </span>
                            )}
                            {server.url && (
                              <span className={styles.metaText}>
                                <ApiOutlined /> {server.url}
                              </span>
                            )}
                          </div>

                          {/* 时间信息 */}
                          <div className={styles.cardTime}>
                            {server.lastConnectedAt ? (
                              <Tooltip title={`最后连接: ${server.lastConnectedAt}`}>
                                <span>
                                  <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />
                                  {server.lastConnectedAt}
                                </span>
                              </Tooltip>
                            ) : (
                              <span>
                                <ClockCircleOutlined style={{ color: 'var(--color-text-tertiary)' }} />
                                未连接
                              </span>
                            )}
                          </div>

                          {/* Task 13: 操作按钮按归属类型动态显示 */}
                          <div className={styles.cardActions}>
                            {isActionAllowed('viewTools', ownerType) && (
                              <Button
                                size="small"
                                type="primary"
                                ghost
                                icon={<ToolOutlined />}
                                onClick={() => handleViewTools(server)}
                              >
                                查看工具
                              </Button>
                            )}
                            {isActionAllowed('testConnection', ownerType) && (
                              <Button
                                size="small"
                                ghost
                                icon={<ThunderboltOutlined />}
                                loading={isTesting}
                                onClick={() => handleTestConnection(server)}
                              >
                                测试连接
                              </Button>
                            )}
                            {isActionAllowed('saveAsMine', ownerType) && (
                              <Button
                                size="small"
                                type="text"
                                icon={<SaveOutlined />}
                                onClick={() => handleSaveAsMine(server)}
                              >
                                另存为我的
                              </Button>
                            )}
                            {isActionAllowed('edit', ownerType) && (
                              <Button
                                size="small"
                                type="text"
                                icon={<EditOutlined />}
                                onClick={() => handleEdit(server)}
                              >
                                编辑
                              </Button>
                            )}
                            {isActionAllowed('publishToTeam', ownerType) && (
                              <Button
                                size="small"
                                type="text"
                                icon={<ShareAltOutlined />}
                                onClick={() => handlePublishToTeam(server)}
                              >
                                发布到团队
                              </Button>
                            )}
                            {isActionAllowed('delete', ownerType) && (
                              <Popconfirm
                                title={`确认删除服务器 "${server.name}" 吗？`}
                                onConfirm={() => handleDelete(server)}
                                okText="删除"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                              >
                                <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                                  删除
                                </Button>
                              </Popconfirm>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Spin>
            ),
          },
          {
            key: 'tools',
            label: (
              <span>
                <ToolOutlined /> 工具
              </span>
            ),
            children: (
              <div>
                {/* 服务器选择器 */}
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                    选择服务器：
                  </span>
                  <Select
                    style={{ width: 300 }}
                    placeholder="请选择 MCP 服务器"
                    value={selectedServerId ?? undefined}
                    onChange={(val: number) => setSelectedServerId(val)}
                    options={servers.map((s) => ({
                      label: `${s.name} (${s.transportType || s.transport || 'stdio'})`,
                      value: s.id,
                    }))}
                    notFoundContent="暂无服务器，请先在「服务器」Tab 中添加"
                  />
                </div>
                {/* 工具列表 */}
                {selectedServerId !== null ? (
                  <ToolList
                    serverId={selectedServerId}
                    serverName={servers.find((s) => s.id === selectedServerId)?.name}
                  />
                ) : (
                  <div className={styles.emptyWrap}>
                    <Empty description="请先选择一个 MCP 服务器" />
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />

      {/* 服务器编辑弹窗 */}
      {formOpen && (
        <ServerForm
          open={formOpen}
          editing={editingServer}
          onClose={() => setFormOpen(false)}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  )
}
