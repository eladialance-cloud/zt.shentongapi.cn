// 客户端版本管理页 - SubTask 27.1-27.4
//
// 表格:版本号/平台(win/mac)/下载 URL/强制更新/灰度比例/发布时间/操作
// 新增版本模态框:version/platform/downloadUrl/changelog/forceUpdate/grayscalePercent
// 编辑/删除操作
// 客户端检查更新接口模拟:展示当前最新版本 + 各平台统计(安装数/活跃数)
// API: GET/POST/PATCH/DELETE /admin/versions、GET /admin/versions/latest、GET /admin/versions/:id/stats

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AppleOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  WindowsOutlined
} from '@ant-design/icons'
import {
  createVersion,
  deleteVersion,
  getLatestVersion,
  getVersionStats,
  listVersions,
  updateVersion
} from '@/api/admin-version-api'
import type {
  CreateVersionDto,
  LatestVersion,
  UpdateVersionDto,
  VersionItem,
  VersionPlatform,
  VersionStats
} from '@/types/admin-version'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const PLATFORM_OPTIONS: Array<{ label: string; value: VersionPlatform | '' }> = [
  { label: '全部平台', value: '' },
  { label: 'Windows', value: 'win' },
  { label: 'macOS', value: 'mac' }
]

const PLATFORM_TAG: Record<VersionPlatform, { color: string; icon: ReactNode; text: string }> = {
  win: { color: 'blue', icon: <WindowsOutlined />, text: 'Windows' },
  mac: { color: 'purple', icon: <AppleOutlined />, text: 'macOS' }
}

// 内置运行时版本（Task 9.3）
// TODO: 后端 ClientVersionEntity 扩展 runtimeVersions 字段后，改为从版本详情 API 读取
// 当前作为静态参考数据展示各服务运行时版本号
const RUNTIME_VERSIONS: Array<{ name: string; version: string; port: number }> = [
  { name: 'N8N', version: '1.62.0', port: 5678 },
  { name: 'OpenClaw', version: '0.3.0', port: 8080 },
  { name: 'MCP Gateway', version: '0.2.0', port: 3100 }
]

interface VersionFormValues {
  version: string
  platform: VersionPlatform
  downloadUrl: string
  changelog?: string
  forceUpdate: boolean
  grayscalePercent: number
}

// 语义版本校验 x.y.z
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/

export default function AdminVersions() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<VersionItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [platform, setPlatform] = useState<VersionPlatform | ''>('')

  const [latestWin, setLatestWin] = useState<LatestVersion | null>(null)
  const [latestMac, setLatestMac] = useState<LatestVersion | null>(null)
  const [statsList, setStatsList] = useState<VersionStats[]>([])

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<VersionItem | null>(null)
  const [form] = Form.useForm<VersionFormValues>()
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (platform) query.platform = platform
      const result = await listVersions(query)
      const r = result as AdminPaginatedResult<VersionItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[Versions] load failed:', err)
      message.error('加载版本列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, platform])

  const loadLatest = useCallback(async () => {
    try {
      const [win, mac] = await Promise.all([
        getLatestVersion('win'),
        getLatestVersion('mac')
      ])
      setLatestWin(win)
      setLatestMac(mac)
    } catch (err) {
      console.error('[Versions] load latest failed:', err)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const list = await Promise.all(items.map((it) => getVersionStats(it.id)))
      setStatsList(list)
    } catch (err) {
      console.error('[Versions] load stats failed:', err)
    }
  }, [items])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadLatest()
  }, [loadLatest])

  useEffect(() => {
    if (items.length > 0) {
      void loadStats()
    } else {
      setStatsList([])
    }
  }, [items, loadStats])

  const handleSearch = () => {
    setPage(1)
    void loadList()
  }

  const handleReset = () => {
    setPlatform('')
    setPage(1)
  }

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      platform: 'win',
      forceUpdate: false,
      grayscalePercent: 100
    })
    setEditOpen(true)
  }

  const handleEdit = (item: VersionItem) => {
    setEditing(item)
    form.setFieldsValue({
      version: item.version,
      platform: item.platform,
      downloadUrl: item.downloadUrl,
      changelog: item.changelog,
      forceUpdate: item.forceUpdate,
      grayscalePercent: item.grayscalePercent
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      if (!SEMVER_REGEX.test(values.version)) {
        message.error('版本号格式应为 x.y.z (如 1.0.0)')
        return
      }
      setSaving(true)
      if (editing) {
        const dto: UpdateVersionDto = {
          version: values.version,
          platform: values.platform,
          downloadUrl: values.downloadUrl,
          changelog: values.changelog,
          forceUpdate: values.forceUpdate,
          grayscalePercent: values.grayscalePercent
        }
        await updateVersion(editing.id, dto)
        message.success('版本已更新')
      } else {
        const dto: CreateVersionDto = {
          version: values.version,
          platform: values.platform,
          downloadUrl: values.downloadUrl,
          changelog: values.changelog,
          forceUpdate: values.forceUpdate,
          grayscalePercent: values.grayscalePercent
        }
        await createVersion(dto)
        message.success('版本已发布')
      }
      setEditOpen(false)
      void loadList()
      void loadLatest()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[Versions] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: VersionItem) => {
    try {
      await deleteVersion(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((k) => k.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[Versions] delete failed:', err)
      message.error('删除失败')
    }
  }

  const getStats = (id: number): VersionStats | undefined =>
    statsList.find((s) => s.versionId === id)

  const columns: TableColumnsType<VersionItem> = [
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      width: 120,
      render: (v: string, r: VersionItem) => (
        <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
          v{v}
          {r.isLatest && (
            <Tag color="green" style={{ marginLeft: 6 }}>
              最新
            </Tag>
          )}
        </span>
      )
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 120,
      render: (p: VersionPlatform) => (
        <Tag color={PLATFORM_TAG[p].color}>
          {PLATFORM_TAG[p].icon} {PLATFORM_TAG[p].text}
        </Tag>
      )
    },
    {
      title: '下载 URL',
      dataIndex: 'downloadUrl',
      key: 'downloadUrl',
      ellipsis: true,
      render: (v: string) => (
        <a
          href={v}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#7dd3fc' }}
        >
          {v}
        </a>
      )
    },
    {
      title: '强制更新',
      dataIndex: 'forceUpdate',
      key: 'forceUpdate',
      width: 100,
      render: (v: boolean) =>
        v ? (
          <Tag color="red">强制</Tag>
        ) : (
          <Tag color="default">否</Tag>
        )
    },
    {
      title: '灰度比例',
      dataIndex: 'grayscalePercent',
      key: 'grayscalePercent',
      width: 100,
      render: (v: number) => <span style={{ color: '#fbbf24' }}>{v}%</span>
    },
    {
      title: '安装/活跃',
      key: 'stats',
      width: 140,
      render: (_: unknown, r: VersionItem) => {
        const s = getStats(r.id)
        return s ? (
          <span style={{ color: '#94a3b8' }}>
            {s.installCount.toLocaleString()} / {s.activeCount.toLocaleString()}
          </span>
        ) : (
          <span style={{ color: '#8b949e' }}>-</span>
        )
      }
    },
    {
      title: '发布时间',
      dataIndex: 'releasedAt',
      key: 'releasedAt',
      width: 170,
      render: (t?: string) => <span style={{ color: '#8b949e' }}>{t || '-'}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: VersionItem) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该版本?"
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <RocketOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>客户端版本管理</h1>
            <div className={styles.subtitle}>发布/管理桌面客户端版本</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void loadList()
              void loadLatest()
            }}
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
            发布版本
          </Button>
        </div>
      </div>

      {/* 当前最新版本 */}
      <div className={styles.sectionTitle}>
        <CloudDownloadOutlined /> 当前最新版本
      </div>
      <Card className={styles.card} bordered={false} style={{ marginBottom: 20 }}>
        <div className={styles.latestInfo}>
          <div>
            <Tag color="blue">
              <WindowsOutlined /> Windows
            </Tag>
            <span style={{ marginLeft: 8 }}>
              {latestWin ? (
                <>
                  v{latestWin.version}
                  {latestWin.forceUpdate && (
                    <Tag color="red" style={{ marginLeft: 6 }}>
                      强制
                    </Tag>
                  )}
                  {latestWin.releasedAt && (
                    <span style={{ color: '#8b949e', marginLeft: 8 }}>
                      {latestWin.releasedAt}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: '#8b949e' }}>暂无</span>
              )}
            </span>
          </div>
          <div>
            <Tag color="purple">
              <AppleOutlined /> macOS
            </Tag>
            <span style={{ marginLeft: 8 }}>
              {latestMac ? (
                <>
                  v{latestMac.version}
                  {latestMac.forceUpdate && (
                    <Tag color="red" style={{ marginLeft: 6 }}>
                      强制
                    </Tag>
                  )}
                  {latestMac.releasedAt && (
                    <span style={{ color: '#8b949e', marginLeft: 8 }}>
                      {latestMac.releasedAt}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: '#8b949e' }}>暂无</span>
              )}
            </span>
          </div>
          {/* Task 9.3：内置运行时版本展示 */}
          <div>
            <Tag color="cyan">
              <CloudServerOutlined /> 运行时版本
            </Tag>
            <span style={{ marginLeft: 8 }}>
              {RUNTIME_VERSIONS.map((rt, idx) => (
                <span key={rt.name} style={{ marginRight: 12 }}>
                  <span style={{ color: '#94a3b8' }}>{rt.name}:</span>{' '}
                  <span style={{ color: '#7dd3fc' }}>v{rt.version}</span>
                  <span style={{ color: '#64748b', marginLeft: 4 }}>
                    :{rt.port}
                  </span>
                  {idx < RUNTIME_VERSIONS.length - 1 && (
                    <span style={{ color: '#475569', marginLeft: 12 }}>·</span>
                  )}
                </span>
              ))}
            </span>
          </div>
        </div>
      </Card>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="平台"
            value={platform}
            onChange={(v) => setPlatform(v as VersionPlatform | '')}
            className={styles.filterSelect}
            options={PLATFORM_OPTIONS}
            allowClear
          />
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无版本" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<VersionItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1200 }}
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

      {/* 新增/编辑 Modal */}
      <Modal
        title={editing ? `编辑版本 - v${editing.version}` : '发布新版本'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={560}
      >
        <Form<VersionFormValues> form={form} layout="vertical">
          <Form.Item
            name="version"
            label="版本号(语义版本 x.y.z)"
            rules={[
              { required: true, message: '请输入版本号' },
              {
                pattern: SEMVER_REGEX,
                message: '版本号格式应为 x.y.z (如 1.0.0)'
              }
            ]}
          >
            <Input placeholder="如 1.2.0" maxLength={32} />
          </Form.Item>
          <Form.Item
            name="platform"
            label="平台"
            rules={[{ required: true, message: '请选择平台' }]}
          >
            <Select
              options={PLATFORM_OPTIONS.filter((o) => o.value !== '').map((o) => ({
                label: o.label,
                value: o.value as VersionPlatform
              }))}
            />
          </Form.Item>
          <Form.Item
            name="downloadUrl"
            label="下载 URL"
            rules={[{ required: true, message: '请输入下载 URL' }]}
          >
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="changelog" label="更新日志">
            <Input.TextArea rows={4} placeholder="多行更新日志..." maxLength={2000} showCount />
          </Form.Item>
          <Form.Item
            name="forceUpdate"
            label="强制更新"
            valuePropName="checked"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            name="grayscalePercent"
            label="灰度比例(0-100)"
            rules={[{ required: true, message: '请输入灰度比例' }]}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
