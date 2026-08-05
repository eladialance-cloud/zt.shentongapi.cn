// 官方知识库管理页
//
// Tab 1 官方知识库：行业筛选 + 表格 + 新建/编辑/上传文档/发布下架/删除
// Tab 2 行业分类：行业维护
// API: /admin/knowledge-bases + /admin/industries

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Upload,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined
} from '@ant-design/icons'
import {
  createIndustry,
  createOfficialKnowledgeBase,
  deleteIndustry,
  deleteOfficialKbDocument,
  deleteOfficialKnowledgeBase,
  getKnowledgeEngineStatus,
  listIndustries,
  listOfficialKbDocuments,
  listOfficialKnowledgeBases,
  publishOfficialKnowledgeBase,
  unpublishOfficialKnowledgeBase,
  updateIndustry,
  updateOfficialKnowledgeBase,
  uploadOfficialKbDocument
} from '@/api/admin-knowledge-api'
import type {
  CreateIndustryDto,
  CreateOfficialKnowledgeBaseDto,
  IndustryCategory,
  OfficialKbDocument,
  OfficialKnowledgeBase,
  PublishStatus
} from '@/types/admin-knowledge'
import styles from './knowledge-styles.module.css'

const { TextArea } = Input

const STATUS_LABELS: Record<PublishStatus, string> = {
  draft: '草稿',
  published: '已发布',
  unpublished: '已下架'
}

const STATUS_COLORS: Record<PublishStatus, string> = {
  draft: 'default',
  published: 'green',
  unpublished: 'orange'
}

const DOC_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  done: '已完成',
  error: '失败',
  failed: '同步失败',
  completed: '已同步',
  '': '-'
}

export default function KnowledgeBasesPage() {
  // ===== 官方知识库列表 =====
  const [list, setList] = useState<OfficialKnowledgeBase[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [industryFilter, setIndustryFilter] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [engineStatus, setEngineStatus] = useState<{ configured: boolean; reachable: boolean } | null>(null)

  // ===== 行业分类 =====
  const [industries, setIndustries] = useState<IndustryCategory[]>([])
  const [industryLoading, setIndustryLoading] = useState(false)

  // ===== 弹窗 =====
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form] = Form.useForm<CreateOfficialKnowledgeBaseDto>()
  const [industryModalOpen, setIndustryModalOpen] = useState(false)
  const [editingIndustryId, setEditingIndustryId] = useState<number | null>(null)
  const [industryForm] = Form.useForm<CreateIndustryDto>()
  const [docModal, setDocModal] = useState<OfficialKnowledgeBase | null>(null)
  const [docs, setDocs] = useState<OfficialKbDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const loadIndustries = useCallback(async () => {
    setIndustryLoading(true)
    try {
      const data = await listIndustries()
      setIndustries(data)
    } catch (err) {
      message.error('加载行业分类失败')
      console.error(err)
    } finally {
      setIndustryLoading(false)
    }
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listOfficialKnowledgeBases({
        page,
        pageSize,
        keyword: keyword || undefined,
        industryId: industryFilter
      })
      setList(data.list)
      setTotal(data.total)
    } catch (err) {
      message.error('加载官方知识库失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, industryFilter])

  const loadEngineStatus = useCallback(async () => {
    try {
      const data = await getKnowledgeEngineStatus()
      setEngineStatus(data)
    } catch {
      setEngineStatus(null)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    loadIndustries()
    loadEngineStatus()
  }, [loadIndustries, loadEngineStatus])

  // ===== 新建 / 编辑官方知识库 =====
  const handleAdd = () => {
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue({ visibility: 'public' })
    setModalOpen(true)
  }

  const handleEdit = (record: OfficialKnowledgeBase) => {
    setEditingId(record.id)
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      industryId: record.industryId,
      visibility: record.visibility
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingId) {
        await updateOfficialKnowledgeBase(editingId, values)
        message.success('更新成功')
      } else {
        await createOfficialKnowledgeBase(values)
        message.success('创建成功')
      }
      setModalOpen(false)
      loadList()
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error('操作失败')
      console.error(err)
    }
  }

  const handlePublish = async (record: OfficialKnowledgeBase) => {
    try {
      if (record.publishStatus === 'published') {
        await unpublishOfficialKnowledgeBase(record.id)
        message.success('已下架')
      } else {
        await publishOfficialKnowledgeBase(record.id)
        message.success('已发布')
      }
      loadList()
    } catch (err) {
      message.error('操作失败')
      console.error(err)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteOfficialKnowledgeBase(id)
      message.success('删除成功')
      loadList()
    } catch (err) {
      message.error('删除失败')
      console.error(err)
    }
  }

  // ===== 文档管理 =====
  const openDocs = async (record: OfficialKnowledgeBase) => {
    setDocModal(record)
    setDocs([])
    setDocsLoading(true)
    try {
      const data = await listOfficialKbDocuments(record.id)
      setDocs(data)
    } catch (err) {
      message.error('加载文档失败')
      console.error(err)
    } finally {
      setDocsLoading(false)
    }
  }

  const handleUpload = async (file: File) => {
    if (!docModal) return
    setUploading(true)
    try {
      await uploadOfficialKbDocument(docModal.id, file)
      message.success('上传成功，正在同步引擎')
      openDocs(docModal)
      loadList()
    } catch (err) {
      message.error('上传失败')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteDoc = async (doc: OfficialKbDocument) => {
    if (!docModal) return
    try {
      await deleteOfficialKbDocument(docModal.id, doc.id)
      message.success('删除成功')
      openDocs(docModal)
      loadList()
    } catch (err) {
      message.error('删除失败')
      console.error(err)
    }
  }

  // ===== 行业分类 =====
  const handleAddIndustry = () => {
    setEditingIndustryId(null)
    industryForm.resetFields()
    setIndustryModalOpen(true)
  }

  const handleEditIndustry = (record: IndustryCategory) => {
    setEditingIndustryId(record.id)
    industryForm.setFieldsValue({ name: record.name, sortOrder: record.sortOrder })
    setIndustryModalOpen(true)
  }

  const handleIndustrySubmit = async () => {
    try {
      const values = await industryForm.validateFields()
      if (editingIndustryId) {
        await updateIndustry(editingIndustryId, values)
        message.success('更新成功')
      } else {
        await createIndustry(values)
        message.success('创建成功')
      }
      setIndustryModalOpen(false)
      loadIndustries()
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error('操作失败')
      console.error(err)
    }
  }

  const handleDeleteIndustry = async (id: number) => {
    try {
      await deleteIndustry(id)
      message.success('删除成功')
      loadIndustries()
    } catch (err) {
      message.error('删除失败')
      console.error(err)
    }
  }

  const kbColumns: TableColumnsType<OfficialKnowledgeBase> = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 220,
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>
    },
    {
      title: '行业',
      dataIndex: 'industryName',
      width: 120,
      render: (v?: string) => (v ? <Tag color="blue">{v}</Tag> : '-')
    },
    {
      title: '文档数',
      dataIndex: 'documentCount',
      width: 90,
      render: (v: number) => v || 0
    },
    {
      title: '引擎同步',
      dataIndex: 'engineKbId',
      width: 110,
      render: (v?: string) => (v ? <Tag color="green">已同步</Tag> : <Tag color="orange">未同步</Tag>)
    },
    {
      title: '状态',
      dataIndex: 'publishStatus',
      width: 100,
      render: (v: PublishStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag>
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-')
    },
    {
      title: '操作',
      width: 260,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => openDocs(record)}>文档</Button>
          <Button type="link" size="small" onClick={() => handlePublish(record)}>
            {record.publishStatus === 'published' ? '下架' : '发布'}
          </Button>
          <Popconfirm title="确认删除此官方知识库？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const industryColumns: TableColumnsType<IndustryCategory> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      width: 100,
      render: (v: number) => <span style={{ color: '#94a3b8' }}>{v}</span>
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString()
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditIndustry(record)}>编辑</Button>
          <Popconfirm title="确认删除该行业分类？" onConfirm={() => handleDeleteIndustry(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const docColumns: TableColumnsType<OfficialKbDocument> = [
    {
      title: '文件名',
      dataIndex: 'name',
      ellipsis: true,
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      width: 110,
      render: (v: number) => {
        if (!v) return '-'
        return v > 1024 * 1024 ? `${(v / 1024 / 1024).toFixed(2)} MB` : `${(v / 1024).toFixed(1)} KB`
      }
    },
    {
      title: '引擎状态',
      dataIndex: 'engineStatus',
      width: 120,
      render: (v?: string) => {
        const key = v || ''
        const color = key === 'completed' || key === 'done' ? 'green' : key === 'failed' || key === 'error' ? 'red' : key === 'processing' ? 'blue' : 'default'
        return <Tag color={color}>{(DOC_STATUS_LABELS[key] ?? key) || '-'}</Tag>
      }
    },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Popconfirm title="确认删除该文档？" onConfirm={() => handleDeleteDoc(record)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <BookOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>官方知识库</h1>
            <div className={styles.subtitle}>按行业维护官方知识库，用户端可在线调用（引擎：MaxKB）</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          {engineStatus && !engineStatus.configured && (
            <Tag color="orange">引擎未配置（部署 MaxKB 后配 MAXKB_BASE_URL / MAXKB_API_KEY）</Tag>
          )}
          {engineStatus && engineStatus.configured && (
            <Tag color={engineStatus.reachable ? 'green' : 'red'}>
              {engineStatus.reachable ? '引擎已连接' : '引擎不可达'}
            </Tag>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => { loadList(); loadIndustries(); loadEngineStatus(); }} loading={loading}>刷新</Button>
        </div>
      </div>

      <Tabs
        defaultActiveKey="bases"
        items={[
          {
            key: 'bases',
            label: '官方知识库',
            children: (
              <>
                <div className={styles.toolbar}>
                  <div className={styles.toolbarLeft}>
                    <Select
                      allowClear
                      placeholder="全部行业"
                      style={{ width: 180 }}
                      value={industryFilter}
                      onChange={(v?: number) => { setIndustryFilter(v); setPage(1) }}
                      options={industries.map((c) => ({ label: c.name, value: c.id }))}
                    />
                    <Input.Search
                      placeholder="搜索名称"
                      allowClear
                      style={{ width: 220 }}
                      onSearch={(v) => { setKeyword(v); setPage(1) }}
                    />
                  </div>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建知识库</Button>
                </div>
                <Spin spinning={loading}>
                  {list.length === 0 && !loading ? (
                    <Empty description="暂无官方知识库" style={{ marginTop: 60 }} />
                  ) : (
                    <div className={styles.tableWrap}>
                      <Table
                        columns={kbColumns}
                        dataSource={list}
                        rowKey="id"
                        pagination={{
                          current: page,
                          pageSize,
                          total,
                          showSizeChanger: true,
                          showTotal: (t) => `共 ${t} 条`,
                          onChange: (p, ps) => { setPage(p); setPageSize(ps) }
                        }}
                        size="middle"
                      />
                    </div>
                  )}
                </Spin>
              </>
            )
          },
          {
            key: 'industries',
            label: '行业分类',
            children: (
              <>
                <div className={styles.toolbar}>
                  <div className={styles.toolbarLeft}>
                    <span style={{ color: '#94a3b8' }}>维护官方知识库的行业归类，用户端按行业浏览</span>
                  </div>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddIndustry}>新增行业</Button>
                </div>
                <Spin spinning={industryLoading}>
                  {industries.length === 0 && !industryLoading ? (
                    <Empty description="暂无行业分类" style={{ marginTop: 60 }} />
                  ) : (
                    <div className={styles.tableWrap}>
                      <Table columns={industryColumns} dataSource={industries} rowKey="id" pagination={false} size="middle" />
                    </div>
                  )}
                </Spin>
              </>
            )
          }
        ]}
      />

      {/* 新建 / 编辑官方知识库 */}
      <Modal
        title={editingId ? '编辑官方知识库' : '新建官方知识库'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：广告法合规库" maxLength={128} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="可选" maxLength={512} />
          </Form.Item>
          <Form.Item name="industryId" label="所属行业">
            <Select
              allowClear
              placeholder="选择行业分类"
              options={industries.map((c) => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>
          <Form.Item name="visibility" label="可见性">
            <Select
              options={[
                { label: '公开', value: 'public' },
                { label: '私有', value: 'private' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 行业分类弹窗 */}
      <Modal
        title={editingIndustryId ? '编辑行业' : '新增行业'}
        open={industryModalOpen}
        onOk={handleIndustrySubmit}
        onCancel={() => setIndustryModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={industryForm} layout="vertical">
          <Form.Item name="name" label="行业名称" rules={[{ required: true, message: '请输入行业名称' }]}>
            <Input placeholder="如：医疗健康" maxLength={64} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序（数字越小越靠前）">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 文档管理 */}
      <Modal
        title={`文档管理：${docModal?.name ?? ''}`}
        open={!!docModal}
        onCancel={() => setDocModal(null)}
        footer={null}
        width={760}
        destroyOnClose
      >
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Upload
            showUploadList={false}
            beforeUpload={(file) => {
              handleUpload(file)
              return false
            }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={uploading} disabled={!docModal?.engineKbId}>上传文档</Button>
          </Upload>
        </div>
        {!docModal?.engineKbId && (
          <div style={{ marginBottom: 12, color: '#d97706' }}>
            该知识库尚未同步引擎数据集（引擎未配置时发布前会自动重试），暂无法上传文档。
          </div>
        )}
        <Spin spinning={docsLoading}>
          {docs.length === 0 && !docsLoading ? (
            <Empty description="暂无文档" />
          ) : (
            <Table columns={docColumns} dataSource={docs} rowKey="id" pagination={false} size="small" />
          )}
        </Spin>
      </Modal>
    </div>
  )
}
