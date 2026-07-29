// OSS 存储配置管理页
//
// 功能：Table + Modal Form
// 列：名称 / 提供商 / Bucket / Region / CDN域名 / 默认 / 启用 / 操作
// 操作：编辑 / 删除 / 测试连接 / 查看统计
// API: GET/POST/PATCH/DELETE /admin/oss/configs, test, stats

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CloudOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  BarChartOutlined
} from '@ant-design/icons'
import {
  createOssConfig,
  deleteOssConfig,
  getOssStorageStats,
  listOssConfigs,
  testOssConnection,
  updateOssConfig
} from '@/api/admin-oss-api'
import type {
  AdminOssConfig,
  AdminOssQuery,
  CreateAdminOssConfigDto,
  OssProvider,
  OssStorageStats,
  UpdateAdminOssConfigDto
} from '@/types/admin-oss'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const PROVIDER_OPTIONS: Array<{ label: string; value: OssProvider }> = [
  { label: '腾讯云 COS', value: 'tencent' },
  { label: '阿里云 OSS', value: 'aliyun' },
  { label: '七牛云', value: 'qiniu' },
  { label: 'AWS S3', value: 'aws' },
  { label: 'MinIO', value: 'minio' }
]

const PROVIDER_LABEL: Record<OssProvider, string> = {
  tencent: '腾讯云 COS',
  aliyun: '阿里云 OSS',
  qiniu: '七牛云',
  aws: 'AWS S3',
  minio: 'MinIO'
}

const PROVIDER_COLOR: Record<OssProvider, string> = {
  tencent: 'blue',
  aliyun: 'orange',
  qiniu: 'green',
  aws: 'gold',
  minio: 'purple'
}

interface OssFormValues {
  name: string
  provider: OssProvider
  bucket: string
  region: string
  endpoint?: string
  accessKey: string
  secretKey: string
  domain?: string
  isDefault: boolean
  isEnabled: boolean
}

/** 格式化字节为可读字符串 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
}

export default function AdminOss() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminOssConfig[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  // 新增/编辑
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminOssConfig | null>(null)
  const [form] = Form.useForm<OssFormValues>()
  const [saving, setSaving] = useState(false)

  // 测试连接
  const [testingId, setTestingId] = useState<number | null>(null)

  // 统计弹窗
  const [statsOpen, setStatsOpen] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsData, setStatsData] = useState<OssStorageStats | null>(null)
  const [statsConfigName, setStatsConfigName] = useState('')

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: AdminOssQuery = { page, pageSize: PAGE_SIZE }
      const result = await listOssConfigs(query)
      const r = result as AdminPaginatedResult<AdminOssConfig>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AdminOss] load failed:', err)
      message.error('加载 OSS 配置列表失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      provider: 'tencent',
      isDefault: false,
      isEnabled: true
    })
    setEditOpen(true)
  }

  const handleEdit = (item: AdminOssConfig) => {
    setEditing(item)
    form.setFieldsValue({
      name: item.name,
      provider: item.provider,
      bucket: item.bucket,
      region: item.region,
      endpoint: item.endpoint,
      accessKey: item.accessKey,
      secretKey: '',
      domain: item.domain,
      isDefault: item.isDefault,
      isEnabled: item.isEnabled
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        const dto: UpdateAdminOssConfigDto = {
          name: values.name,
          provider: values.provider,
          bucket: values.bucket,
          region: values.region,
          endpoint: values.endpoint,
          accessKey: values.accessKey,
          domain: values.domain,
          isDefault: values.isDefault,
          isEnabled: values.isEnabled
        }
        // 仅在用户输入了新 secretKey 时才提交
        if (values.secretKey && values.secretKey.trim()) {
          dto.secretKey = values.secretKey
        }
        await updateOssConfig(editing.id, dto)
        message.success('OSS 配置已更新')
      } else {
        const dto: CreateAdminOssConfigDto = {
          name: values.name,
          provider: values.provider,
          bucket: values.bucket,
          region: values.region,
          endpoint: values.endpoint,
          accessKey: values.accessKey,
          secretKey: values.secretKey,
          domain: values.domain,
          isDefault: values.isDefault,
          isEnabled: values.isEnabled
        }
        await createOssConfig(dto)
        message.success('OSS 配置已创建')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminOss] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: AdminOssConfig) => {
    try {
      await deleteOssConfig(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((a) => a.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AdminOss] delete failed:', err)
      message.error('删除失败')
    }
  }

  const handleTest = async (item: AdminOssConfig) => {
    setTestingId(item.id)
    try {
      const result = await testOssConnection(item.id)
      if (result.success) {
        message.success(`连接成功${result.durationMs ? ` (${result.durationMs}ms)` : ''}`)
      } else {
        message.error(`连接失败: ${result.message}`)
      }
    } catch (err) {
      console.error('[AdminOss] test failed:', err)
      message.error('测试连接失败')
    } finally {
      setTestingId(null)
    }
  }

  const handleStats = async (item: AdminOssConfig) => {
    setStatsConfigName(item.name)
    setStatsOpen(true)
    setStatsLoading(true)
    setStatsData(null)
    try {
      const stats = await getOssStorageStats(item.id)
      setStatsData(stats)
    } catch (err) {
      console.error('[AdminOss] stats failed:', err)
      message.error('获取统计信息失败')
    } finally {
      setStatsLoading(false)
    }
  }

  const columns: TableColumnsType<AdminOssConfig> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
      )
    },
    {
      title: '提供商',
      dataIndex: 'provider',
      key: 'provider',
      width: 120,
      render: (p: OssProvider) => (
        <Tag color={PROVIDER_COLOR[p]}>{PROVIDER_LABEL[p]}</Tag>
      )
    },
    {
      title: 'Bucket',
      dataIndex: 'bucket',
      key: 'bucket',
      render: (v: string) => <span style={{ color: '#c7d2fe' }}>{v}</span>
    },
    {
      title: 'Region',
      dataIndex: 'region',
      key: 'region',
      width: 130,
      render: (v: string) => <span style={{ color: '#8b949e' }}>{v}</span>
    },
    {
      title: 'CDN 域名',
      dataIndex: 'domain',
      key: 'domain',
      width: 180,
      render: (v?: string) =>
        v ? (
          <span style={{ color: '#7dd3fc', fontSize: 12 }}>{v}</span>
        ) : (
          <span style={{ color: '#475569' }}>-</span>
        )
    },
    {
      title: '默认',
      dataIndex: 'isDefault',
      key: 'isDefault',
      width: 80,
      render: (v: boolean) =>
        v ? <Tag color="gold">默认</Tag> : <span style={{ color: '#475569' }}>-</span>
    },
    {
      title: '启用',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 80,
      render: (v: boolean) =>
        v ? (
          <Tag color="green">启用</Tag>
        ) : (
          <Tag color="default">禁用</Tag>
        )
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_: unknown, record: AdminOssConfig) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Tooltip title="测试连接">
            <Button
              type="link"
              size="small"
              icon={<ThunderboltOutlined />}
              loading={testingId === record.id}
              onClick={() => handleTest(record)}
            >
              测试
            </Button>
          </Tooltip>
          <Tooltip title="存储统计">
            <Button
              type="link"
              size="small"
              icon={<BarChartOutlined />}
              onClick={() => handleStats(record)}
            >
              统计
            </Button>
          </Tooltip>
          <Popconfirm
            title="确认删除该 OSS 配置?"
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
          <CloudOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>OSS 存储配置</h1>
            <div className={styles.subtitle}>管理对象存储配置 / CDN 域名 / 连接测试</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadList}
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
            新增配置
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无 OSS 配置" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminOssConfig>
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
        title={editing ? `编辑 OSS 配置 - ${editing.name}` : '新增 OSS 配置'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <Form<OssFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="如：主存储-腾讯云" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="provider"
            label="提供商"
            rules={[{ required: true, message: '请选择提供商' }]}
          >
            <Select options={PROVIDER_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="bucket"
            label="Bucket"
            rules={[{ required: true, message: '请输入 Bucket 名称' }]}
          >
            <Input placeholder="my-bucket-name" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="region"
            label="Region"
            rules={[{ required: true, message: '请输入区域' }]}
          >
            <Input placeholder="ap-guangzhou" maxLength={64} />
          </Form.Item>
          <Form.Item name="endpoint" label="Endpoint（可选）">
            <Input placeholder="https://cos.ap-guangzhou.myqcloud.com" />
          </Form.Item>
          <Form.Item
            name="accessKey"
            label="Access Key"
            rules={[{ required: true, message: '请输入 Access Key' }]}
          >
            <Input placeholder="AKID..." maxLength={128} />
          </Form.Item>
          <Form.Item
            name="secretKey"
            label="Secret Key"
            rules={
              editing
                ? []
                : [{ required: true, message: '请输入 Secret Key' }]
            }
            extra={editing ? '留空表示不修改' : undefined}
          >
            <Input.Password
              placeholder="编辑时留空不修改"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item name="domain" label="CDN 域名（可选）">
            <Input placeholder="https://cdn.example.com" />
          </Form.Item>
          <div className={styles.switchRow}>
            <Form.Item name="isDefault" label="设为默认" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isEnabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* 存储统计 Modal */}
      <Modal
        title={`存储统计 - ${statsConfigName}`}
        open={statsOpen}
        onCancel={() => setStatsOpen(false)}
        footer={null}
        destroyOnClose
        width={520}
      >
        <Spin spinning={statsLoading}>
          {statsData ? (
            <div className={styles.statsContainer}>
              <div className={styles.statsRow}>
                <span className={styles.statsLabel}>已用存储</span>
                <span className={styles.statsValue}>
                  {formatBytes(statsData.usedStorage)}
                </span>
              </div>
              <div className={styles.statsRow}>
                <span className={styles.statsLabel}>文件总数</span>
                <span className={styles.statsValue}>
                  {statsData.fileCount.toLocaleString()}
                </span>
              </div>
              <div className={styles.statsRow}>
                <span className={styles.statsLabel}>本月上传</span>
                <span className={styles.statsValue}>
                  {statsData.monthlyUploadCount.toLocaleString()} 个
                </span>
              </div>
              <div className={styles.statsRow}>
                <span className={styles.statsLabel}>本月下载流量</span>
                <span className={styles.statsValue}>
                  {formatBytes(statsData.monthlyDownloadTraffic)}
                </span>
              </div>
              <div className={styles.statsRow}>
                <span className={styles.statsLabel}>最近上传</span>
                <span className={styles.statsValue}>
                  {statsData.lastUploadAt || '-'}
                </span>
              </div>
            </div>
          ) : !statsLoading ? (
            <Empty description="暂无统计数据" />
          ) : null}
        </Spin>
      </Modal>
    </div>
  )
}
