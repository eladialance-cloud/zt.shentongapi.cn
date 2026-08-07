// 管理端技能商店（Skill）管理页
//
// Tab1 技能源：新增 GitHub 来源 → 触发解析 → 自动生成技能包
// Tab2 技能包：编辑/提交审核/通过/驳回/上架/下架/健康检查/删除
// API: /admin/skill-store/sources|packages

import { useCallback, useEffect, useRef, useState } from 'react'
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
  Table,
  Tabs,
  Tag,
  Upload,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApiOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  UploadOutlined
} from '@ant-design/icons'
import {
  analyzeSkillSource,
  approveSkillPackage,
  createSkillSource,
  deleteSkillPackage,
  deleteSkillSource,
  healthCheckSkillPackage,
  listSkillPackages,
  listSkillSources,
  publishSkillPackage,
  rejectSkillPackage,
  submitSkillPackageReview,
  unpublishSkillPackage,
  updateSkillPackage,
  uploadSkillSource
} from '@/api/admin-skill-api'
import type {
  AdminSkillPackage,
  AdminSkillSource,
  CreateSkillSourceDto,
  SkillPackageStatus,
  SkillSourceStatus,
  SkillType,
  UpdateSkillPackageDto
} from '@/types/admin-skill'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const SKILL_TYPE_OPTIONS: Array<{ label: string; value: SkillType }> = [
  { label: '技能', value: 'skill' },
  { label: '工作流', value: 'workflow' }
]

const SKILL_TYPE_LABEL: Record<SkillType, string> = {
  skill: '技能',
  workflow: '工作流'
}

const SOURCE_STATUS_TAG: Record<SkillSourceStatus, { color: string; text: string }> = {
  pending: { color: 'default', text: '待解析' },
  analyzing: { color: 'processing', text: '解析中' },
  analyzed: { color: 'green', text: '已解析' },
  failed: { color: 'red', text: '失败' }
}

const PACKAGE_STATUS_TAG: Record<SkillPackageStatus, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  reviewing: { color: 'processing', text: '审核中' },
  approved: { color: 'cyan', text: '已通过' },
  published: { color: 'green', text: '已上架' },
  unpublished: { color: 'default', text: '已下架' },
  failed: { color: 'red', text: '失败' }
}

const SOURCE_STATUS_OPTIONS: Array<{ label: string; value: SkillSourceStatus }> = [
  { label: '待解析', value: 'pending' },
  { label: '解析中', value: 'analyzing' },
  { label: '已解析', value: 'analyzed' },
  { label: '失败', value: 'failed' }
]

const PACKAGE_STATUS_OPTIONS: Array<{ label: string; value: SkillPackageStatus }> = [
  { label: '草稿', value: 'draft' },
  { label: '审核中', value: 'reviewing' },
  { label: '已通过', value: 'approved' },
  { label: '已上架', value: 'published' },
  { label: '已下架', value: 'unpublished' },
  { label: '失败', value: 'failed' }
]

interface SkillSourceFormValues {
  sourceUrl: string
  skillName: string
  skillDesc: string
  skillType: SkillType
}

interface SkillPackageFormValues {
  displayName: string
  description: string
  category?: string
  triggerKeywords?: string[]
}

interface RejectFormValues {
  reason: string
}

export default function AdminSkillStore() {
  const [activeTab, setActiveTab] = useState<'sources' | 'packages'>('sources')

  // ---- 技能源列表 ----
  const [sourceLoading, setSourceLoading] = useState(true)
  const [sources, setSources] = useState<AdminSkillSource[]>([])
  const [sourceTotal, setSourceTotal] = useState(0)
  const [sourcePage, setSourcePage] = useState(1)
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SkillType | ''>('')
  const [sourceStatusFilter, setSourceStatusFilter] = useState<SkillSourceStatus | ''>('')
  const sourcesRef = useRef<AdminSkillSource[]>([])

  // ---- 技能包列表 ----
  const [pkgLoading, setPkgLoading] = useState(true)
  const [packages, setPackages] = useState<AdminSkillPackage[]>([])
  const [pkgTotal, setPkgTotal] = useState(0)
  const [pkgPage, setPkgPage] = useState(1)
  const [pkgTypeFilter, setPkgTypeFilter] = useState<SkillType | ''>('')

  // ---- 新增技能源 ----
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceForm] = Form.useForm<SkillSourceFormValues>()
  const [sourceSaving, setSourceSaving] = useState(false)

  // ---- 本地上传技能源 ----
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadForm] = Form.useForm<SkillSourceFormValues>()
  const [uploadSaving, setUploadSaving] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // ---- 编辑技能包 ----
  const [pkgEditOpen, setPkgEditOpen] = useState(false)
  const [editingPkg, setEditingPkg] = useState<AdminSkillPackage | null>(null)
  const [pkgForm] = Form.useForm<SkillPackageFormValues>()
  const [pkgSaving, setPkgSaving] = useState(false)

  // ---- 驳回技能包 ----
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectPkg, setRejectPkg] = useState<AdminSkillPackage | null>(null)
  const [rejectForm] = Form.useForm<RejectFormValues>()
  const [rejectSaving, setRejectSaving] = useState(false)

  // ---- 解析轮询 ----
  const analyzeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSources = useCallback(async () => {
    setSourceLoading(true)
    try {
      const r = await listSkillSources({
        page: sourcePage,
        pageSize: PAGE_SIZE,
        status: sourceStatusFilter,
        skillType: sourceTypeFilter
      })
      setSources(r.list || [])
      setSourceTotal(r.total || 0)
      sourcesRef.current = r.list || []
    } catch (err) {
      console.error('[AdminSkillStore] sources load failed:', err)
      message.error('加载技能源列表失败')
    } finally {
      setSourceLoading(false)
    }
  }, [sourcePage, sourceStatusFilter, sourceTypeFilter])

  const loadPackages = useCallback(async () => {
    setPkgLoading(true)
    try {
      const r = await listSkillPackages({
        page: pkgPage,
        pageSize: PAGE_SIZE,
        skillType: pkgTypeFilter
      })
      setPackages(r.list || [])
      setPkgTotal(r.total || 0)
    } catch (err) {
      console.error('[AdminSkillStore] packages load failed:', err)
      message.error('加载技能包列表失败')
    } finally {
      setPkgLoading(false)
    }
  }, [pkgPage, pkgTypeFilter])

  useEffect(() => {
    void loadSources()
  }, [loadSources])

  useEffect(() => {
    void loadPackages()
  }, [loadPackages])

  useEffect(() => {
    return () => {
      if (analyzeTimer.current) {
        clearTimeout(analyzeTimer.current)
        analyzeTimer.current = null
      }
    }
  }, [])

  const pollAnalyze = (attempt = 0) => {
    if (analyzeTimer.current) {
      clearTimeout(analyzeTimer.current)
      analyzeTimer.current = null
    }
    if (attempt >= 60) return
    analyzeTimer.current = setTimeout(() => {
      void loadSources()
      void loadPackages()
      const stillRunning = sourcesRef.current.some((s) => s.status === 'analyzing')
      if (stillRunning) pollAnalyze(attempt + 1)
    }, 3000)
  }

  const handleTabChange = (key: string) => {
    setActiveTab(key as 'sources' | 'packages')
  }

  // ---- 新增技能源 ----
  const handleAddSource = () => {
    sourceForm.resetFields()
    sourceForm.setFieldsValue({ skillType: 'skill' })
    setSourceOpen(true)
  }

  const handleCreateSource = async () => {
    try {
      const values = await sourceForm.validateFields()
      setSourceSaving(true)
      const dto: CreateSkillSourceDto = {
        sourceUrl: values.sourceUrl,
        sourceType: 'github',
        skillName: values.skillName,
        skillDesc: values.skillDesc,
        skillType: values.skillType
      }
      const created = await createSkillSource(dto)
      message.success('技能源已添加')
      setSourceOpen(false)
      void loadSources()
      try {
        await analyzeSkillSource(created.id)
        message.info('已触发解析，正在从 GitHub 拉取技能内容...')
        void loadSources()
        pollAnalyze()
      } catch (analyzeErr) {
        console.error('[AdminSkillStore] analyze failed:', analyzeErr)
        message.error('触发解析失败，可在列表中重试')
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminSkillStore] create source failed:', err)
      message.error('新增技能源失败')
    } finally {
      setSourceSaving(false)
    }
  }

  const handleOpenUpload = () => {
    uploadForm.resetFields()
    uploadForm.setFieldsValue({ skillType: 'skill' })
    setUploadFile(null)
    setUploadOpen(true)
  }

  const handleUploadSubmit = async () => {
    try {
      const values = await uploadForm.validateFields()
      if (!uploadFile) {
        message.warning('请先选择 .zip 文件')
        return
      }
      setUploadSaving(true)
      const created = await uploadSkillSource(uploadFile, {
        skillName: values.skillName,
        skillDesc: values.skillDesc,
        skillType: values.skillType
      })
      message.success('技能源已上传')
      setUploadOpen(false)
      void loadSources()
      try {
        await analyzeSkillSource(created.id)
        message.info('已触发解析，正在处理本地技能包...')
        void loadSources()
        pollAnalyze()
      } catch (analyzeErr) {
        console.error('[AdminSkillStore] analyze failed:', analyzeErr)
        message.error('触发解析失败，可在列表中重试')
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminSkillStore] upload failed:', err)
      message.error('上传失败')
    } finally {
      setUploadSaving(false)
    }
  }

  const handleAnalyze = async (item: AdminSkillSource) => {
    try {
      await analyzeSkillSource(item.id)
      message.info('解析已启动')
      void loadSources()
      pollAnalyze()
    } catch (err) {
      console.error('[AdminSkillStore] analyze failed:', err)
      message.error('触发解析失败')
    }
  }

  const handleDeleteSource = async (item: AdminSkillSource) => {
    try {
      await deleteSkillSource(item.id)
      message.success('技能源已删除')
      setSources((prev) => prev.filter((s) => s.id !== item.id))
      setSourceTotal((t) => Math.max(0, t - 1))
      void loadPackages()
    } catch (err) {
      console.error('[AdminSkillStore] delete source failed:', err)
      message.error('删除失败')
    }
  }

  // ---- 编辑技能包 ----
  const handleEditPackage = (item: AdminSkillPackage) => {
    setEditingPkg(item)
    pkgForm.setFieldsValue({
      displayName: item.displayName,
      description: item.description,
      category: item.category || '',
      triggerKeywords: item.triggerKeywords || []
    })
    setPkgEditOpen(true)
  }

  const handleSavePackage = async () => {
    try {
      const values = await pkgForm.validateFields()
      if (!editingPkg) return
      setPkgSaving(true)
      const dto: UpdateSkillPackageDto = {
        displayName: values.displayName,
        description: values.description,
        triggerKeywords: (values.triggerKeywords || []).filter((s) => s && s.trim())
      }
      if (values.category && values.category.trim()) {
        dto.category = values.category.trim()
      }
      await updateSkillPackage(editingPkg.id, dto)
      message.success('技能包已更新')
      setPkgEditOpen(false)
      void loadPackages()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminSkillStore] update package failed:', err)
      message.error('保存失败')
    } finally {
      setPkgSaving(false)
    }
  }

  const handleSubmitReview = async (item: AdminSkillPackage) => {
    try {
      await submitSkillPackageReview(item.id)
      message.success('已提交审核')
      void loadPackages()
    } catch (err) {
      console.error('[AdminSkillStore] submit review failed:', err)
      message.error('提交审核失败')
    }
  }

  const handleApprove = async (item: AdminSkillPackage) => {
    try {
      await approveSkillPackage(item.id)
      message.success('审核已通过')
      void loadPackages()
    } catch (err) {
      console.error('[AdminSkillStore] approve failed:', err)
      message.error('操作失败')
    }
  }

  const handleOpenReject = (item: AdminSkillPackage) => {
    setRejectPkg(item)
    rejectForm.resetFields()
    setRejectOpen(true)
  }

  const handleRejectConfirm = async () => {
    try {
      const values = await rejectForm.validateFields()
      if (!rejectPkg) return
      setRejectSaving(true)
      await rejectSkillPackage(rejectPkg.id, values.reason)
      message.success('已驳回')
      setRejectOpen(false)
      void loadPackages()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminSkillStore] reject failed:', err)
      message.error('驳回失败')
    } finally {
      setRejectSaving(false)
    }
  }

  const handlePublish = async (item: AdminSkillPackage) => {
    try {
      await publishSkillPackage(item.id)
      message.success('已上架')
      void loadPackages()
    } catch (err) {
      console.error('[AdminSkillStore] publish failed:', err)
      message.error('上架失败')
    }
  }

  const handleUnpublish = async (item: AdminSkillPackage) => {
    try {
      await unpublishSkillPackage(item.id)
      message.success('已下架')
      void loadPackages()
    } catch (err) {
      console.error('[AdminSkillStore] unpublish failed:', err)
      message.error('下架失败')
    }
  }

  const handleHealthCheck = async (item: AdminSkillPackage) => {
    try {
      const result = await healthCheckSkillPackage(item.id)
      const ok = Boolean(result && result.ok)
      const detail = result && result.message ? result.message : JSON.stringify(result || {})
      if (ok) {
        message.success(`健康检查通过: ${detail}`)
      } else {
        message.warning(`健康检查异常: ${detail}`)
      }
    } catch (err) {
      console.error('[AdminSkillStore] health check failed:', err)
      message.error('健康检查失败')
    }
  }

  const handleDeletePackage = async (item: AdminSkillPackage) => {
    try {
      await deleteSkillPackage(item.id)
      message.success('技能包已删除')
      setPackages((prev) => prev.filter((p) => p.id !== item.id))
      setPkgTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AdminSkillStore] delete package failed:', err)
      message.error('删除失败')
    }
  }

  const sourceColumns: TableColumnsType<AdminSkillSource> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    {
      title: '技能名',
      dataIndex: 'skillName',
      key: 'skillName',
      width: 140,
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '类型',
      dataIndex: 'skillType',
      key: 'skillType',
      width: 90,
      render: (t: SkillType) => <Tag color={t === 'skill' ? 'blue' : 'magenta'}>{SKILL_TYPE_LABEL[t]}</Tag>
    },
    {
      title: 'GitHub 地址',
      dataIndex: 'sourceUrl',
      key: 'sourceUrl',
      ellipsis: true,
      render: (v: string) => (
        <a href={v} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>
          {v}
        </a>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: SkillSourceStatus) => (
        <Tag color={SOURCE_STATUS_TAG[s].color}>{SOURCE_STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (v?: string) =>
        v ? <span style={{ color: '#f87171', fontSize: 12 }}>{v}</span> : '-'
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <span style={{ color: 'var(--color-text-tertiary)' }}>{t}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: AdminSkillSource) => (
        <>
          {record.status === 'pending' || record.status === 'failed' ? (
            <Button
              type="link"
              size="small"
              icon={<ExperimentOutlined />}
              onClick={() => handleAnalyze(record)}
            >
              解析
            </Button>
          ) : null}
          <Popconfirm
            title="确认删除该技能源?"
            onConfirm={() => handleDeleteSource(record)}
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

  const packageColumns: TableColumnsType<AdminSkillPackage> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    {
      title: '名称',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (v: string, record) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>
          {v || record.name}
        </span>
      )
    },
    {
      title: '技能名',
      dataIndex: 'name',
      key: 'name',
      width: 130,
      render: (v: string) => <span style={{ color: 'var(--color-text-secondary)' }}>{v}</span>
    },
    {
      title: '类型',
      dataIndex: 'skillType',
      key: 'skillType',
      width: 90,
      render: (t: SkillType) => <Tag color={t === 'skill' ? 'blue' : 'magenta'}>{SKILL_TYPE_LABEL[t]}</Tag>
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (v?: string) => (
        v ? <Tag color="cyan">{v}</Tag> : <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s: SkillPackageStatus) => (
        <Tag color={PACKAGE_STATUS_TAG[s].color}>{PACKAGE_STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (v: string) => <span style={{ color: 'var(--color-text-secondary)' }}>{v}</span>
    },
    {
      title: '调用次数',
      dataIndex: 'callCount',
      key: 'callCount',
      width: 90,
      render: (v: number) => <span style={{ color: 'var(--color-text-secondary)' }}>{v.toLocaleString()}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 460,
      fixed: 'right',
      render: (_: unknown, record: AdminSkillPackage) => (
        <>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditPackage(record)}>
            编辑
          </Button>
          {record.status === 'draft' ? (
            <Button
              type="link"
              size="small"
              icon={<SafetyCertificateOutlined />}
              onClick={() => handleSubmitReview(record)}
            >
              提交审核
            </Button>
          ) : null}
          {record.status === 'reviewing' ? (
            <>
              <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record)}>
                通过
              </Button>
              <Button type="link" size="small" icon={<StopOutlined />} onClick={() => handleOpenReject(record)}>
                驳回
              </Button>
            </>
          ) : null}
          {record.status === 'approved' ? (
            <Button type="link" size="small" icon={<ArrowUpOutlined />} onClick={() => handlePublish(record)}>
              上架
            </Button>
          ) : null}
          {record.status === 'published' ? (
            <Button type="link" size="small" icon={<ArrowDownOutlined />} onClick={() => handleUnpublish(record)}>
              下架
            </Button>
          ) : null}
          <Button
            type="link"
            size="small"
            icon={<ExperimentOutlined />}
            onClick={() => handleHealthCheck(record)}
          >
            健康检查
          </Button>
          <Popconfirm
            title="确认删除该技能包?"
            onConfirm={() => handleDeletePackage(record)}
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
          <ApiOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>技能商店管理</h1>
            <div className={styles.subtitle}>技能源导入 / 技能包发布与审核</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void loadSources()
              void loadPackages()
            }}
            className={styles.ghostBtn}
          >
            刷新
          </Button>
          {activeTab === 'sources' ? (
            <>
              <Button
                icon={<UploadOutlined />}
                onClick={handleOpenUpload}
                className={styles.ghostBtn}
              >
                本地上传
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddSource}
                className={styles.primaryBtn}
              >
                新增技能源
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: 'sources', label: '技能源' },
          { key: 'packages', label: '技能包' }
        ]}
      />

      {activeTab === 'sources' ? (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <Select
                placeholder="类型筛选"
                value={sourceTypeFilter}
                onChange={(v) => setSourceTypeFilter(v as SkillType | '')}
                className={styles.filterSelect}
                allowClear
                options={SKILL_TYPE_OPTIONS}
              />
              <Select
                placeholder="状态筛选"
                value={sourceStatusFilter}
                onChange={(v) => setSourceStatusFilter(v as SkillSourceStatus | '')}
                className={styles.filterSelect}
                allowClear
                options={SOURCE_STATUS_OPTIONS}
              />
            </div>
          </div>
          <Spin spinning={sourceLoading}>
            {sources.length === 0 && !sourceLoading ? (
              <Empty description="暂无技能源" style={{ marginTop: 80 }} />
            ) : (
              <div className={styles.tableWrap}>
                <Table<AdminSkillSource>
                  rowKey="id"
                  columns={sourceColumns}
                  dataSource={sources}
                  pagination={false}
                  size="middle"
                  scroll={{ x: 1100 }}
                />
              </div>
            )}
            <div className={styles.paginationWrap}>
              <Pagination
                current={sourcePage}
                pageSize={PAGE_SIZE}
                total={sourceTotal}
                onChange={(p) => setSourcePage(p)}
                showSizeChanger={false}
                showTotal={(t) => `共 ${t} 条`}
              />
            </div>
          </Spin>
        </>
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <Select
                placeholder="类型筛选"
                value={pkgTypeFilter}
                onChange={(v) => setPkgTypeFilter(v as SkillType | '')}
                className={styles.filterSelect}
                allowClear
                options={SKILL_TYPE_OPTIONS}
              />
            </div>
          </div>
          <Spin spinning={pkgLoading}>
            {packages.length === 0 && !pkgLoading ? (
              <Empty description="暂无技能包，请先在技能源页签添加并解析" style={{ marginTop: 80 }} />
            ) : (
              <div className={styles.tableWrap}>
                <Table<AdminSkillPackage>
                  rowKey="id"
                  columns={packageColumns}
                  dataSource={packages}
                  pagination={false}
                  size="middle"
                  scroll={{ x: 1400 }}
                />
              </div>
            )}
            <div className={styles.paginationWrap}>
              <Pagination
                current={pkgPage}
                pageSize={PAGE_SIZE}
                total={pkgTotal}
                onChange={(p) => setPkgPage(p)}
                showSizeChanger={false}
                showTotal={(t) => `共 ${t} 条`}
              />
            </div>
          </Spin>
        </>
      )}

      {/* 新增技能源 Modal */}
      <Modal
        title="新增技能源"
        open={sourceOpen}
        onCancel={() => setSourceOpen(false)}
        onOk={handleCreateSource}
        confirmLoading={sourceSaving}
        okText="添加并解析"
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <Form<SkillSourceFormValues> form={sourceForm} layout="vertical">
          <Form.Item
            name="sourceUrl"
            label="GitHub 仓库 URL"
            rules={[
              { required: true, message: '请输入 GitHub 仓库 URL' },
              {
                pattern: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/,
                message: '请输入合法的 GitHub 仓库 URL'
              }
            ]}
          >
            <Input placeholder="https://github.com/owner/repo" />
          </Form.Item>
          <Form.Item
            name="skillName"
            label="技能名"
            rules={[{ required: true, message: '请输入技能名' }]}
          >
            <Input placeholder="如:web-search" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="skillDesc"
            label="技能描述"
            rules={[{ required: true, message: '请输入技能描述' }]}
          >
            <Input.TextArea rows={3} maxLength={512} showCount placeholder="简要说明技能用途" />
          </Form.Item>
          <Form.Item
            name="skillType"
            label="技能类型"
            rules={[{ required: true, message: '请选择技能类型' }]}
          >
            <Select options={SKILL_TYPE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑技能包 Modal */}
      <Modal
        title={editingPkg ? `编辑技能包 - ${editingPkg.displayName || editingPkg.name}` : '编辑技能包'}
        open={pkgEditOpen}
        onCancel={() => setPkgEditOpen(false)}
        onOk={handleSavePackage}
        confirmLoading={pkgSaving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <Form<SkillPackageFormValues> form={pkgForm} layout="vertical">
          <Form.Item
            name="displayName"
            label="显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="如:网页搜索" maxLength={512} />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={3} maxLength={512} showCount />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input placeholder="如:office / programming" maxLength={32} />
          </Form.Item>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, color: '#e6edf3' }}>触发关键词</label>
            <Form.List name="triggerKeywords">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <div className={styles.keywordRow} key={field.key}>
                      <Form.Item {...field} noStyle>
                        <Input placeholder="如:搜索" style={{ flex: 1 }} />
                      </Form.Item>
                      <Button type="link" danger onClick={() => remove(field.name)}>
                        删除
                      </Button>
                    </div>
                  ))}
                  <Button type="dashed" onClick={() => add('')} icon={<PlusOutlined />} block>
                    添加关键词
                  </Button>
                </>
              )}
            </Form.List>
          </div>
        </Form>
      </Modal>

      {/* 本地上传技能源 Modal */}
      <Modal
        title="本地上传技能源"
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        onOk={handleUploadSubmit}
        confirmLoading={uploadSaving}
        okText="上传并解析"
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <Upload.Dragger
          accept=".zip"
          maxCount={1}
          beforeUpload={(file) => {
            setUploadFile(file as File)
            return false
          }}
          onRemove={() => setUploadFile(null)}
          fileList={uploadFile ? [{ uid: '-1', name: uploadFile.name, status: 'done' }] : []}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined style={{ color: 'var(--color-primary, #4f8cff)' }} />
          </p>
          <p className="ant-upload-text">点击或拖拽 zip 技能包到此处</p>
          <p className="ant-upload-hint">仅支持 .zip（内含 skill.md / 代码文件），单个文件最大 100MB</p>
        </Upload.Dragger>
        <Form<SkillSourceFormValues> form={uploadForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="skillName"
            label="技能名"
            rules={[{ required: true, message: '请输入技能名' }]}
          >
            <Input placeholder="如:web-search" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="skillDesc"
            label="技能描述"
            rules={[{ required: true, message: '请输入技能描述' }]}
          >
            <Input.TextArea rows={3} maxLength={512} showCount placeholder="简要说明技能用途" />
          </Form.Item>
          <Form.Item
            name="skillType"
            label="技能类型"
            rules={[{ required: true, message: '请选择技能类型' }]}
          >
            <Select options={SKILL_TYPE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 驳回 Modal */}
      <Modal
        title={rejectPkg ? `驳回技能包 - ${rejectPkg.displayName || rejectPkg.name}` : '驳回技能包'}
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={handleRejectConfirm}
        confirmLoading={rejectSaving}
        okText="确认驳回"
        cancelText="取消"
        destroyOnClose
      >
        <Form<RejectFormValues> form={rejectForm} layout="vertical">
          <Form.Item
            name="reason"
            label="驳回原因"
            rules={[{ required: true, message: '请输入驳回原因' }]}
          >
            <Input.TextArea rows={3} maxLength={512} showCount placeholder="说明驳回原因，将展示给技能提交方" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
