// 大模型接入（自定义 OpenAI 兼容端点，仅存本机）
import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { LlmIntegration, LlmIntegrationModel } from '@shared/types'
import {
  listLlmIntegrations,
  saveLlmIntegration,
  removeLlmIntegration,
  testLlmIntegration,
  newLlmIntegrationId,
} from '@/api/llm-integrations-api'
import styles from './styles.module.css'

interface IntegrationFormValues {
  name: string
  baseUrl: string
  apiKey: string
  models: Array<{ id: string; name?: string; modelType?: 'chat' | 'vision' }>
}

export default function SettingsLlmIntegrations() {
  const [form] = Form.useForm<IntegrationFormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [integrations, setIntegrations] = useState<LlmIntegration[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setIntegrations(await listLlmIntegrations())
    } catch (err) {
      console.error('[LlmIntegrations] load failed:', err)
      message.error('加载大模型接入失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue({
      name: '',
      baseUrl: '',
      apiKey: '',
      models: [{ id: '', name: '', modelType: 'chat' }],
    })
    setModalOpen(true)
  }

  const openEdit = (item: LlmIntegration) => {
    setEditingId(item.id)
    form.setFieldsValue({
      name: item.name,
      baseUrl: item.baseUrl,
      apiKey: item.apiKey || '',
      models: item.models.map((m) => ({
        id: m.id,
        name: m.name ?? '',
        modelType: m.modelType || 'chat',
      })),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    let values: IntegrationFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const models: LlmIntegrationModel[] = (values.models || [])
      .filter((m) => m && typeof m.id === 'string' && m.id.trim())
      .map((m) => ({
        id: m.id.trim(),
        name: m.name?.trim() || undefined,
        modelType: m.modelType === 'vision' ? 'vision' : 'chat',
      }))
    if (models.length === 0) {
      message.warning('请至少填写一个模型 ID')
      return
    }
    setSaving(true)
    try {
      const integration: LlmIntegration = {
        id: editingId || newLlmIntegrationId(),
        name: values.name.trim(),
        baseUrl: values.baseUrl.trim(),
        apiKey: (values.apiKey || '').trim(),
        models,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const result = await saveLlmIntegration(integration)
      if (!result.ok) {
        message.error(result.error || '保存失败')
        return
      }
      setIntegrations(result.integrations)
      setModalOpen(false)
      message.success('大模型接入已保存')
    } catch (err) {
      console.error('[LlmIntegrations] save failed:', err)
      message.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      const result = await removeLlmIntegration(id)
      if (!result.ok) {
        message.error(result.error || '删除失败')
        return
      }
      setIntegrations(result.integrations)
      message.success('已删除')
    } catch (err) {
      console.error('[LlmIntegrations] remove failed:', err)
      message.error('删除失败: ' + (err as Error).message)
    }
  }

  const handleTest = async (item: LlmIntegration) => {
    if (!item.models.length) {
      message.warning('该接入未配置模型，无法测试')
      return
    }
    setTesting(true)
    try {
      const result = await testLlmIntegration(item.baseUrl, item.apiKey, item.models[0].id)
      if (result.ok) {
        message.success('连接成功（' + item.models[0].id + '）')
      } else {
        message.error('连接失败: ' + (result.message || '未知错误'))
      }
    } catch (err) {
      console.error('[LlmIntegrations] test failed:', err)
      message.error('测试失败: ' + (err as Error).message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Spin spinning={loading}>
      <Card className={styles.card} bordered={false}>
        <div className={styles.cardBody}>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            自定义大模型接入
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 12 }}>
            填写任意 OpenAI 兼容接口（Base URL + API Key + 模型 ID），配置后即可在对话页顶部模型下拉框中
            选择使用；调用直连你的接口，不经过平台中转、不扣积分，Key 仅保存在本机。
          </Typography.Paragraph>

          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增接入
            </Button>
          </Space>

          {integrations.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有自定义大模型接入"
            >
              <Button type="primary" icon={<ApiOutlined />} onClick={openCreate}>
                立即添加
              </Button>
            </Empty>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {integrations.map((item) => (
                <Card
                  key={item.id}
                  size="small"
                  style={{ width: '100%' }}
                  title={
                    <Space>
                      <ApiOutlined style={{ color: 'var(--color-primary)' }} />
                      <span>{item.name}</span>
                      {item.models.length > 0 && (
                        <Tag color="blue">{item.models.length} 个模型</Tag>
                      )}
                    </Space>
                  }
                  extra={
                    <Space size={4}>
                      <Button
                        size="small"
                        icon={<ThunderboltOutlined />}
                        loading={testing}
                        onClick={() => void handleTest(item)}
                      >
                        测试
                      </Button>
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEdit(item)}
                      >
                        编辑
                      </Button>
                      <Popconfirm
                        title="删除该大模型接入？"
                        okText="删除"
                        cancelText="取消"
                        onConfirm={() => void handleRemove(item.id)}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  }
                >
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    <div style={{ marginBottom: 6 }}>
                      Base URL：<span style={{ color: 'var(--color-text-secondary)' }}>{item.baseUrl}</span>
                    </div>
                    <Space size={4} wrap>
                      {item.models.map((m) => (
                        <Tag key={m.id}>
                          {m.name || m.id}
                          {m.modelType === 'vision' ? '（识图）' : ''}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                </Card>
              ))}
            </Space>
          )}
        </div>
      </Card>

      <Modal
        title={editingId ? '编辑大模型接入' : '新增大模型接入'}
        open={modalOpen}
        onOk={() => void handleSave()}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={640}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label="接入名称"
            rules={[{ required: true, message: '请填写接入名称' }]}
          >
            <Input placeholder="如：我的 OpenAI / DeepSeek" maxLength={40} />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL（OpenAI 兼容）"
            extra="例如 https://api.openai.com/v1 或 https://api.deepseek.com/v1"
            rules={[{ required: true, message: '请填写 Base URL' }]}
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key（仅保存在本机）"
            rules={[{ required: true, message: '请填写 API Key' }]}
          >
            <Input.Password placeholder="sk-..." autoComplete="off" />
          </Form.Item>
          <Form.Item label="模型列表" required style={{ marginBottom: 4 }}>
            <Form.List
              name="models"
              rules={[
                {
                  validator: async (_, models) => {
                    if (!models || models.length === 0 || models.some((m: { id?: string }) => !m?.id?.trim())) {
                      throw new Error('请至少填写一个模型 ID')
                    }
                  },
                },
              ]}
            >
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {fields.map((field, index) => (
                    <Space key={field.key} align="baseline" style={{ display: 'flex' }}>
                      <Form.Item
                        name={[field.name, 'id']}
                        rules={[{ required: true, message: '模型 ID 必填' }]}
                        style={{ marginBottom: 0, width: 200 }}
                      >
                        <Input placeholder="模型 ID（如 gpt-4o）" />
                      </Form.Item>
                      <Form.Item name={[field.name, 'name']} style={{ marginBottom: 0, width: 140 }}>
                        <Input placeholder="显示名（可选）" />
                      </Form.Item>
                      <Form.Item name={[field.name, 'modelType']} style={{ marginBottom: 0, width: 100 }}>
                        <Select
                          options={[
                            { label: '文本', value: 'chat' },
                            { label: '识图', value: 'vision' },
                          ]}
                        />
                      </Form.Item>
                      {fields.length > 1 && (
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      )}
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => add({ id: '', name: '', modelType: 'chat' })}
                    block
                  >
                    添加模型
                  </Button>
                </Space>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  )
}
