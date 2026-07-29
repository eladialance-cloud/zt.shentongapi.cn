import { useEffect, useState, useCallback } from 'react'
import {
  Button,
  Switch,
  Tag,
  Space,
  Modal,
  Input,
  Select,
  message,
  Form,
  Divider,
  Popconfirm,
  Typography,
  Card
} from 'antd'
import {
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DeleteOutlined,
  SaveOutlined
} from '@ant-design/icons'
import {
  listBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  updateBlockOrder,
  type LandingBlock,
  type CreateBlockDto
} from '@/api/admin-landing-api'
import styles from './styles.module.css'

const { TextArea } = Input
const { Text } = Typography

const BLOCK_TYPE_LABELS: Record<LandingBlock['type'], string> = {
  hero: 'Hero 横幅',
  stats: '统计数据',
  cards: '卡片组',
  steps: '步骤',
  list: '列表',
  markdown: 'Markdown'
}

const BLOCK_TYPE_COLORS: Record<LandingBlock['type'], string> = {
  hero: 'blue',
  stats: 'green',
  cards: 'purple',
  steps: 'orange',
  list: 'cyan',
  markdown: 'default'
}

const BLOCK_TYPES = Object.keys(BLOCK_TYPE_LABELS) as LandingBlock['type'][]

export default function LandingBlocks() {
  const [blocks, setBlocks] = useState<LandingBlock[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editData, setEditData] = useState<Record<string, any>>({})
  const [editName, setEditName] = useState('')
  const [form] = Form.useForm()

  const fetchBlocks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listBlocks()
      data.sort((a, b) => a.sortOrder - b.sortOrder)
      setBlocks(data)
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id)
      }
    } catch (err: any) {
      message.error(err?.message || '加载内容块失败')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    fetchBlocks()
  }, [fetchBlocks])

  const selectedBlock = blocks.find((b) => b.id === selectedId) || null

  // 当选中块变化时，加载编辑数据
  useEffect(() => {
    if (selectedBlock) {
      setEditData(JSON.parse(JSON.stringify(selectedBlock.data || {})))
      setEditName(selectedBlock.name)
    } else {
      setEditData({})
      setEditName('')
    }
  }, [selectedId, selectedBlock])

  // 切换启用/禁用
  const handleToggleEnabled = async (block: LandingBlock, enabled: boolean) => {
    try {
      await updateBlock(block.id, { isEnabled: enabled })
      setBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? { ...b, isEnabled: enabled } : b))
      )
      message.success(`${enabled ? '已启用' : '已禁用'}: ${block.name}`)
    } catch (err: any) {
      message.error(err?.message || '操作失败')
    }
  }

  // 上移/下移
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= blocks.length) return

    const newBlocks = [...blocks]
    ;[newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]]
    const orders = newBlocks.map((b, i) => ({ id: b.id, sortOrder: i }))

    // 乐观更新
    setBlocks(newBlocks)

    try {
      await updateBlockOrder(orders)
      message.success('排序已更新')
    } catch (err: any) {
      message.error(err?.message || '排序失败')
      // 回滚
      fetchBlocks()
    }
  }

  // 保存编辑
  const handleSave = async () => {
    if (!selectedBlock) return
    setSaving(true)
    try {
      const updated = await updateBlock(selectedBlock.id, {
        name: editName,
        data: editData
      })
      setBlocks((prev) =>
        prev.map((b) => (b.id === selectedBlock.id ? updated : b))
      )
      message.success('保存成功')
    } catch (err: any) {
      message.error(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 删除块
  const handleDelete = async (block: LandingBlock) => {
    try {
      await deleteBlock(block.id)
      setBlocks((prev) => prev.filter((b) => b.id !== block.id))
      if (selectedId === block.id) {
        setSelectedId(null)
      }
      message.success(`已删除: ${block.name}`)
    } catch (err: any) {
      message.error(err?.message || '删除失败')
    }
  }

  // 新增块
  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      const dto: CreateBlockDto = {
        id: values.id,
        name: values.name,
        type: values.type,
        data: getDefaultValueForType(values.type)
      }
      const created = await createBlock(dto)
      setBlocks((prev) => [...prev, created])
      setSelectedId(created.id)
      setModalOpen(false)
      form.resetFields()
      message.success('创建成功')
    } catch (err: any) {
      if (err?.errorFields) return // 表单校验错误
      message.error(err?.message || '创建失败')
    }
  }

  // 根据类型返回默认 data
  function getDefaultValueForType(type: LandingBlock['type']): Record<string, any> {
    switch (type) {
      case 'hero':
        return {
          title: '',
          subtitle: '',
          description: '',
          cta_primary: { text: '', link: '' },
          cta_secondary: { text: '', link: '' }
        }
      case 'stats':
        return { items: [{ value: '', label: '' }] }
      case 'cards':
        return { title: '', subtitle: '', cards: [{ icon: '', title: '', desc: '' }] }
      case 'steps':
        return { title: '', subtitle: '', steps: [{ title: '', desc: '' }] }
      case 'list':
        return { items: [] }
      case 'markdown':
        return { content: '' }
      default:
        return {}
    }
  }

  // 更新 editData 的辅助函数
  const updateField = (path: string, value: any) => {
    setEditData((prev) => {
      const next = { ...prev }
      const keys = path.split('.')
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
          obj[keys[i]] = {}
        }
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  const updateArrayItem = (arrayPath: string, index: number, field: string, value: string) => {
    setEditData((prev) => {
      const next = { ...prev }
      const keys = arrayPath.split('.')
      let obj = next
      for (const k of keys) {
        if (!obj[k]) obj[k] = []
        obj = obj[k]
      }
      if (!Array.isArray(obj)) return next
      obj[index] = { ...obj[index], [field]: value }
      return next
    })
  }

  const addArrayItem = (arrayPath: string, template: Record<string, any>) => {
    setEditData((prev) => {
      const next = { ...prev }
      const keys = arrayPath.split('.')
      let obj = next
      for (const k of keys) {
        if (!obj[k]) obj[k] = []
        obj = obj[k]
      }
      if (!Array.isArray(obj)) return next
      obj.push({ ...template })
      return next
    })
  }

  const removeArrayItem = (arrayPath: string, index: number) => {
    setEditData((prev) => {
      const next = { ...prev }
      const keys = arrayPath.split('.')
      let obj = next
      for (const k of keys) {
        if (!obj[k]) obj[k] = []
        obj = obj[k]
      }
      if (!Array.isArray(obj)) return next
      obj.splice(index, 1)
      return next
    })
  }

  // 渲染动态表单
  const renderEditor = () => {
    if (!selectedBlock) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)' }}>
          请从左侧选择一个内容块进行编辑
        </div>
      )
    }

    const type = selectedBlock.type

    return (
      <div className={styles.editor}>
        <div className={styles.editorHeader}>
          <Space>
            <Tag color={BLOCK_TYPE_COLORS[type]}>{BLOCK_TYPE_LABELS[type]}</Tag>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              ID: {selectedBlock.id}
            </Text>
          </Space>
          <Popconfirm
            title="确定删除此内容块？"
            onConfirm={() => handleDelete(selectedBlock)}
            okText="删除"
            cancelText="取消"
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </div>

        <Form layout="vertical" style={{ maxWidth: 640 }}>
          <Form.Item label="块名称">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="内容块名称"
            />
          </Form.Item>

          <Divider style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          {/* Hero 类型 */}
          {type === 'hero' && (
            <>
              <Form.Item label="标题">
                <Input
                  value={editData.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="主标题"
                />
              </Form.Item>
              <Form.Item label="副标题">
                <Input
                  value={editData.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  placeholder="副标题"
                />
              </Form.Item>
              <Form.Item label="描述">
                <TextArea
                  value={editData.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={3}
                  placeholder="描述文本"
                />
              </Form.Item>
              <Form.Item label="主按钮文字">
                <Input
                  value={editData.cta_primary?.text || ''}
                  onChange={(e) => updateField('cta_primary.text', e.target.value)}
                  placeholder="如：立即体验"
                />
              </Form.Item>
              <Form.Item label="主按钮链接">
                <Input
                  value={editData.cta_primary?.link || ''}
                  onChange={(e) => updateField('cta_primary.link', e.target.value)}
                  placeholder="如：/register"
                />
              </Form.Item>
              <Form.Item label="次按钮文字">
                <Input
                  value={editData.cta_secondary?.text || ''}
                  onChange={(e) => updateField('cta_secondary.text', e.target.value)}
                  placeholder="如：了解更多"
                />
              </Form.Item>
              <Form.Item label="次按钮链接">
                <Input
                  value={editData.cta_secondary?.link || ''}
                  onChange={(e) => updateField('cta_secondary.link', e.target.value)}
                  placeholder="如：/about"
                />
              </Form.Item>
            </>
          )}

          {/* Stats 类型 */}
          {type === 'stats' && (
            <>
              {(editData.items || []).map((item: any, index: number) => (
                <div key={index} className={styles.arrayField}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)' }}>统计项 {index + 1}</Text>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeArrayItem('items', index)}
                    />
                  </Space>
                  <Form.Item label="数值" style={{ marginTop: 8, marginBottom: 8 }}>
                    <Input
                      value={item.value || ''}
                      onChange={(e) => updateArrayItem('items', index, 'value', e.target.value)}
                      placeholder="如：1000+"
                    />
                  </Form.Item>
                  <Form.Item label="标签" style={{ marginBottom: 0 }}>
                    <Input
                      value={item.label || ''}
                      onChange={(e) => updateArrayItem('items', index, 'label', e.target.value)}
                      placeholder="如：注册用户"
                    />
                  </Form.Item>
                </div>
              ))}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={() => addArrayItem('items', { value: '', label: '' })}
              >
                添加统计项
              </Button>
            </>
          )}

          {/* Cards 类型 */}
          {type === 'cards' && (
            <>
              <Form.Item label="标题">
                <Input
                  value={editData.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="卡片组标题"
                />
              </Form.Item>
              <Form.Item label="副标题">
                <Input
                  value={editData.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  placeholder="卡片组副标题"
                />
              </Form.Item>
              {(editData.cards || []).map((card: any, index: number) => (
                <div key={index} className={styles.arrayField}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)' }}>卡片 {index + 1}</Text>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeArrayItem('cards', index)}
                    />
                  </Space>
                  <Form.Item label="图标" style={{ marginTop: 8, marginBottom: 8 }}>
                    <Input
                      value={card.icon || ''}
                      onChange={(e) => updateArrayItem('cards', index, 'icon', e.target.value)}
                      placeholder="图标名称或 emoji"
                    />
                  </Form.Item>
                  <Form.Item label="标题" style={{ marginBottom: 8 }}>
                    <Input
                      value={card.title || ''}
                      onChange={(e) => updateArrayItem('cards', index, 'title', e.target.value)}
                      placeholder="卡片标题"
                    />
                  </Form.Item>
                  <Form.Item label="描述" style={{ marginBottom: 0 }}>
                    <TextArea
                      value={card.desc || ''}
                      onChange={(e) => updateArrayItem('cards', index, 'desc', e.target.value)}
                      rows={2}
                      placeholder="卡片描述"
                    />
                  </Form.Item>
                </div>
              ))}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={() => addArrayItem('cards', { icon: '', title: '', desc: '' })}
              >
                添加卡片
              </Button>
            </>
          )}

          {/* Steps 类型 */}
          {type === 'steps' && (
            <>
              <Form.Item label="标题">
                <Input
                  value={editData.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="步骤组标题"
                />
              </Form.Item>
              <Form.Item label="副标题">
                <Input
                  value={editData.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  placeholder="步骤组副标题"
                />
              </Form.Item>
              {(editData.steps || []).map((step: any, index: number) => (
                <div key={index} className={styles.arrayField}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)' }}>步骤 {index + 1}</Text>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeArrayItem('steps', index)}
                    />
                  </Space>
                  <Form.Item label="标题" style={{ marginTop: 8, marginBottom: 8 }}>
                    <Input
                      value={step.title || ''}
                      onChange={(e) => updateArrayItem('steps', index, 'title', e.target.value)}
                      placeholder="步骤标题"
                    />
                  </Form.Item>
                  <Form.Item label="描述" style={{ marginBottom: 0 }}>
                    <TextArea
                      value={step.desc || ''}
                      onChange={(e) => updateArrayItem('steps', index, 'desc', e.target.value)}
                      rows={2}
                      placeholder="步骤描述"
                    />
                  </Form.Item>
                </div>
              ))}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={() => addArrayItem('steps', { title: '', desc: '' })}
              >
                添加步骤
              </Button>
            </>
          )}

          {/* List / Markdown 类型：直接编辑 JSON */}
          {(type === 'list' || type === 'markdown') && (
            <Form.Item label="数据 (JSON)">
              <TextArea
                value={JSON.stringify(editData, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value)
                    setEditData(parsed)
                  } catch {
                    // 解析失败时不更新，允许用户继续编辑
                  }
                }}
                rows={16}
                style={{ fontFamily: 'monospace', fontSize: 13 }}
                placeholder='{"content": "..."}'
              />
            </Form.Item>
          )}
        </Form>

        {selectedBlock && (
          <div style={{ marginTop: 16, paddingBottom: 24 }}>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
              size="large"
            >
              保存
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 24, height: '100%' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: 'rgba(255,255,255,0.85)' }}>Landing 页内容管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新增内容块
        </Button>
      </div>

      <div className={styles.container}>
        {/* 左侧：内容块列表 */}
        <div className={styles.blockList}>
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className={`${styles.blockItem} ${selectedId === block.id ? styles.blockItemActive : ''}`}
              onClick={() => setSelectedId(block.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 14,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {block.name}
                </div>
                <div style={{ marginTop: 4 }}>
                  <Tag color={BLOCK_TYPE_COLORS[block.type]} style={{ marginRight: 4 }}>
                    {BLOCK_TYPE_LABELS[block.type]}
                  </Tag>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <Switch
                  size="small"
                  checked={block.isEnabled}
                  onChange={(checked, e) => {
                    e.stopPropagation()
                    handleToggleEnabled(block, checked)
                  }}
                />
                <Space size={2}>
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowUpOutlined />}
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleMove(index, 'up')
                    }}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={index === blocks.length - 1}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleMove(index, 'down')
                    }}
                  />
                </Space>
              </div>
            </div>
          ))}
          {blocks.length === 0 && !loading && (
            <Card size="small" style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
              暂无内容块，点击右上角新增
            </Card>
          )}
        </div>

        {/* 右侧：编辑器 */}
        {renderEditor()}
      </div>

      {/* 新增内容块 Modal */}
      <Modal
        title="新增内容块"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="id"
            label="块 ID"
            rules={[
              { required: true, message: '请输入块 ID' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '只能包含字母、数字、下划线和连字符' }
            ]}
          >
            <Input placeholder="如：hero-section" />
          </Form.Item>
          <Form.Item
            name="name"
            label="块名称"
            rules={[{ required: true, message: '请输入块名称' }]}
          >
            <Input placeholder="如：首页横幅" />
          </Form.Item>
          <Form.Item
            name="type"
            label="块类型"
            rules={[{ required: true, message: '请选择块类型' }]}
          >
            <Select placeholder="选择类型">
              {BLOCK_TYPES.map((t) => (
                <Select.Option key={t} value={t}>
                  {BLOCK_TYPE_LABELS[t]}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
