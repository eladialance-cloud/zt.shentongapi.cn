// API Key 管理（SubTask 15.3）
// 表格：别名 / 创建时间 / 最后使用时间 / 操作
// 操作：新增（模态框输入 alias，系统生成 key 一次显示）、显示/隐藏（眼睛图标）、删除（二次确认）
// API: GET /users/api-keys、POST /users/api-keys、DELETE /users/api-keys/:id
// 注意：API Key 在后端 AES 加密存储，显示时后端解密返回

import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Popconfirm,
  Tooltip,
  Empty,
  Spin,
  message,
  Typography,
  type TableColumnsType
} from 'antd'
import {
  PlusOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  DeleteOutlined,
  CopyOutlined
} from '@ant-design/icons'
import {
  listApiKeys,
  createApiKey,
  deleteApiKey
} from '@/api/settings-api'
import type { ApiKey, CreateApiKeyResult } from '@/types/settings'
import styles from './styles.module.css'

const { Text } = Typography

/** 格式化时间 */
function formatTime(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function ApiKeys() {
  const [loading, setLoading] = useState(true)
  const [keys, setKeys] = useState<ApiKey[]>([])
  /** 显示完整 key 的行 id 集合 */
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm] = Form.useForm<{ alias: string }>()
  /** 一次性展示的新建 key */
  const [newKey, setNewKey] = useState<CreateApiKeyResult | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listApiKeys()
      setKeys(list || [])
    } catch (err) {
      console.error('[ApiKeys] load failed:', err)
      message.error('加载 API Key 列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleToggleVisible = (id: number) => {
    setVisibleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleOpenCreate = () => {
    createForm.resetFields()
    setNewKey(null)
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setCreating(true)
      const result = await createApiKey({ alias: values.alias })
      setNewKey(result)
      // 刷新列表
      void loadData()
      message.success('API Key 已创建')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[ApiKeys] create failed:', err)
      message.error('创建 API Key 失败: ' + (err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success('已复制到剪贴板')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteApiKey(id)
      message.success('API Key 已删除')
      setKeys((prev) => prev.filter((k) => k.id !== id))
    } catch (err) {
      console.error('[ApiKeys] delete failed:', err)
      message.error('删除失败: ' + (err as Error).message)
    }
  }

  const columns: TableColumnsType<ApiKey> = [
    {
      title: '别名',
      dataIndex: 'alias',
      key: 'alias',
      width: 180
    },
    {
      title: 'API Key',
      key: 'apiKey',
      render: (_, record) => {
        const visible = visibleIds.has(record.id)
        const full = record.apiKey || record.maskedKey || '—'
        const display = visible
          ? full
          : record.maskedKey
            ? record.maskedKey
            : full.slice(0, 8) + '••••••••'
        return (
          <span className={styles.keyCell}>
            <span style={{ marginRight: 8 }}>{display}</span>
            <Tooltip title={visible ? '隐藏' : '显示'}>
              <Button
                type="text"
                size="small"
                icon={
                  visible ? <EyeInvisibleOutlined /> : <EyeOutlined />
                }
                onClick={() => handleToggleVisible(record.id)}
              />
            </Tooltip>
            <Tooltip title="复制">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => handleCopy(full)}
                disabled={!full || full === '—'}
              />
            </Tooltip>
          </span>
        )
      }
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatTime(v)
    },
    {
      title: '最后使用时间',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      width: 180,
      render: (v: string | null) => formatTime(v)
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Popconfirm
          title="确定删除该 API Key 吗？"
          description="删除后使用该 Key 的应用将无法访问"
          onConfirm={() => handleDelete(record.id)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <Spin spinning={loading}>
      <Card className={styles.card} bordered={false}>
        <div className={styles.cardBody}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16
            }}
          >
            <div>
              <h2 className={styles.sectionTitle}>API Key 管理</h2>
              <div className={styles.sectionDesc}>
                用于第三方应用访问 API，请妥善保管
              </div>
            </div>
            <Button
              type="primary"
              className={styles.primaryBtn}
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
            >
              新增
            </Button>
          </div>

          {keys.length === 0 && !loading ? (
            <div className={styles.emptyWrap}>
              <Empty description="暂无 API Key" />
            </div>
          ) : (
            <Table<ApiKey>
              rowKey="id"
              columns={columns}
              dataSource={keys}
              pagination={false}
              size="middle"
            />
          )}
        </div>
      </Card>

      {/* 新增 API Key 模态框 */}
      <Modal
        title="新增 API Key"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false)
          setNewKey(null)
          createForm.resetFields()
        }}
        confirmLoading={creating}
        okText={newKey ? '完成' : '创建'}
        cancelText="取消"
        okButtonProps={{ disabled: !!newKey }}
        destroyOnClose
      >
        {!newKey ? (
          <Form form={createForm} layout="vertical">
            <Form.Item
              label="别名"
              name="alias"
              rules={[
                { required: true, message: '请输入别名' },
                { max: 64, message: '别名最多 64 个字符' }
              ]}
            >
              <Input placeholder="如 生产环境调用" />
            </Form.Item>
          </Form>
        ) : (
          <div>
            <Text>API Key 已生成，请立即保存（仅显示一次）：</Text>
            <div className={styles.keyOnceBox}>
              <span className={styles.keyOnceValue}>{newKey.apiKey}</span>
              <Tooltip title="复制">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(newKey.apiKey)}
                />
              </Tooltip>
            </div>
            <div className={styles.warningText}>
              ⚠️ 出于安全考虑，关闭后将无法再次查看完整 Key
            </div>
          </div>
        )}
      </Modal>
    </Spin>
  )
}
