// 知识库列表页
// 布局：顶部标题 + 新建按钮 + 知识库卡片网格
// 调用 GET /knowledge/bases、POST /knowledge/bases、DELETE /knowledge/bases/:id

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Spin,
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  BookOutlined,
  DeleteOutlined,
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined
} from '@ant-design/icons'
import * as kbApi from '@/api/knowledge-api'
import type { KnowledgeBase, CreateKnowledgeBaseDto } from '@/types/knowledge'
import styles from './styles.module.css'

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function KnowledgeList() {
  const navigate = useNavigate()
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<CreateKnowledgeBaseDto>()
  const [creating, setCreating] = useState(false)

  /** 加载知识库列表 */
  const loadBases = useCallback(async () => {
    setLoading(true)
    try {
      const list = await kbApi.listKnowledgeBases()
      setBases(list || [])
    } catch (err) {
      console.error('[KnowledgeList] load failed:', err)
      message.error('加载知识库列表失败')
      setBases([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBases()
  }, [loadBases])

  /** 新建知识库 */
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setCreating(true)
      await kbApi.createKnowledgeBase(values)
      message.success('知识库创建成功')
      setCreateOpen(false)
      createForm.resetFields()
      void loadBases()
    } catch (err) {
      // validateFields 失败不弹错
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[KnowledgeList] create failed:', err)
      message.error('创建知识库失败: ' + (err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  /** 删除知识库 */
  const handleDelete = async (kb: KnowledgeBase) => {
    try {
      await kbApi.deleteKnowledgeBase(kb.id)
      message.success(`知识库 ${kb.name} 已删除`)
      setBases((prev) => prev.filter((k) => k.id !== kb.id))
    } catch (err) {
      console.error('[KnowledgeList] delete failed:', err)
      message.error('删除失败: ' + (err as Error).message)
    }
  }

  /** 进入文档管理 */
  const handleEnter = (kb: KnowledgeBase) => {
    navigate(`/knowledge/${kb.id}/documents`)
  }

  /** 进入检索测试 */
  const handleSearch = (kb: KnowledgeBase) => {
    navigate(`/knowledge/${kb.id}/search`)
  }

  /** 返回 */
  const handleBack = () => {
    navigate('/dashboard')
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <BookOutlined />
          <span>知识库</span>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回
          </Button>
          <Button
            type="primary"
            className={styles.newBtn}
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建知识库
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {bases.length === 0 && !loading ? (
          <div className={styles.emptyState}>
            <BookOutlined className={styles.emptyStateIcon} />
            <div className={styles.emptyStateText}>暂无知识库，点击右上角"新建知识库"开始</div>
          </div>
        ) : (
          <div className={styles.kbGrid}>
            {bases.map((kb) => (
              <div key={kb.id} className={styles.kbCard}>
                <div className={styles.kbCardIcon}>
                  <BookOutlined />
                </div>
                <div className={styles.kbCardBody}>
                  <div className={styles.kbCardTitle}>{kb.name}</div>
                  <div className={styles.kbCardDescription}>
                    {kb.description || '暂无描述'}
                  </div>
                  <div className={styles.kbCardMeta}>
                    <span>
                      <FileTextOutlined style={{ marginRight: 4 }} />
                      {kb.documentCount ?? 0} 个文档
                    </span>
                    <span>创建于 {formatTime(kb.createdAt)}</span>
                  </div>
                </div>
                <div className={styles.kbCardFooter}>
                  <Button
                    type="primary"
                    className={styles.enterBtn}
                    onClick={() => handleEnter(kb)}
                    block
                  >
                    进入详情
                  </Button>
                  <Button
                    className={styles.backBtn}
                    icon={<SearchOutlined />}
                    onClick={() => handleSearch(kb)}
                  />
                  <Popconfirm
                    title="确定删除该知识库吗？"
                    description="删除后将清除所有文档与向量索引"
                    onConfirm={() => handleDelete(kb)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      className={styles.deleteBtn}
                      icon={<DeleteOutlined />}
                      danger
                    />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
      </Spin>

      {/* 新建知识库弹窗 */}
      <Modal
        title="新建知识库"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false)
          createForm.resetFields()
        }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            label="名称"
            name="name"
            rules={[
              { required: true, message: '请输入知识库名称' },
              { max: 64, message: '名称最多 64 个字符' }
            ]}
          >
            <Input placeholder="请输入知识库名称" />
          </Form.Item>
          <Form.Item
            label="描述"
            name="description"
            rules={[{ max: 256, message: '描述最多 256 个字符' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="可选，知识库用途描述"
              maxLength={256}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
