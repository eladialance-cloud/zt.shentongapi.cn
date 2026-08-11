// 管理端技能商店管理页 - Task 10
//
// 两个 Tab:
//   技能源(GitHub 来源 / 解析 / 删除)
//   技能包(编辑 / 提交审核 / 通过 / 驳回 / 上下架 / 健康检查 / 删除)
// 添加技能源 Modal(提交并解析) + 解析进度 Modal(Steps)
// 技能包编辑 Drawer(displayName / description / category / triggerKeywords / uiConfig)
// API: /admin/skill-store/sources · /admin/skill-store/packages

import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Radio,
  Select,
  Spin,
  Steps,
  Upload,
  Table,
  Tabs,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  MedicineBoxOutlined,
  PlusOutlined,
  ShopOutlined,
  UploadOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import {
  analyzeSkillSource,
  approveSkillPackage,
  createSkillSource,
  healthCheckSkillPackage,
  listSkillPackages,
  listSkillSources,
  publishSkillPackage,
  rejectSkillPackage,
  removeSkillPackage,
  removeSkillSource,
  submitReviewSkillPackage,
  unpublishSkillPackage,
  updateSkillPackage,
  uploadSkillSource,
  batchDeleteSkillPackages,
} from '@/api/admin-skill-store-api'
import { reclassifyAsset } from '@/api/admin-classify-api'
import type {
  AdminSkillPackage,
  AdminSkillSource,
  CreateSkillSourceDto,
  UpdateSkillPackageDto
} from '@/types/admin-skill-store'
import styles from './styles.module.css'

const PAGE_SIZE = 20

type SourceStatus = AdminSkillSource['status']
type SkillType = AdminSkillPackage['skillType']
type StepStatus = 'wait' | 'process' | 'finish' | 'error'

const ANALYZE_STEPS = ['下载源码', '分析与检测', '安装与生成']

const SKILL_TYPE_TAG: Record<SkillType, { color: string; text: string }> = {
  skill: { color: 'blue', text: '技能' },
  workflow: { color: 'magenta', text: '工作流' }
}

const SOURCE_STATUS_TAG: Record<SourceStatus, { color: string; text: string }> = {
  pending: { color: 'default', text: '待解析' },
  analyzing: { color: 'processing', text: '解析中' },
  analyzed: { color: 'success', text: '已解析' },
  failed: { color: 'error', text: '失败' }
}

// Task 4:packages Tab 合并"状态+审核状态"为单一"生命周期"列
function getLifecycleTag(pkg: AdminSkillPackage): { color: string; text: string } {
  if (pkg.status === 'draft') return { color: 'default', text: '草稿' }
  if (pkg.status === 'reviewing' && pkg.reviewStatus === 'pending')
    return { color: 'processing', text: '审核中' }
  if (pkg.status === 'reviewing' && pkg.reviewStatus === 'rejected')
    return { color: 'error', text: '已驳回' }
  if (pkg.status === 'approved') return { color: 'blue', text: '已通过' }
  if (pkg.status === 'published') return { color: 'success', text: '已上架' }
  if (pkg.status === 'unpublished') return { color: 'default', text: '已下架' }
  return { color: 'default', text: '未知' }
}

const CATEGORY_OPTIONS = [
  { label: '视频', value: 'video' },
  { label: '文本', value: 'text' },
  { label: '代码', value: 'code' },
  { label: '数据', value: 'data' },
  { label: '图像', value: 'image' },
  { label: '其他', value: 'other' }
]

interface SourceFormValues {
  sourceUrl: string
  sourceType: 'github'
  skillName: string
  skillDesc: string
  skillType: SkillType
}

interface PackageEditFormValues {
  displayName: string
  description: string
  category?: string
  triggerKeywords: string[]
  icon: string
  color: string
}

function formatTime(v?: string): string {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString()
}

export default function AdminSkillStore() {
  const [activeTab, setActiveTab] = useState<'sources' | 'packages'>('sources')

  // 技能源列表
  const [sources, setSources] = useState<AdminSkillSource[]>([])
  const [sourceLoading, setSourceLoading] = useState(false)
  const [sourcePage, setSourcePage] = useState(1)
  const [sourceTotal, setSourceTotal] = useState(0)

  // 技能包列表
  const [packages, setPackages] = useState<AdminSkillPackage[]>([])
  const [packageLoading, setPackageLoading] = useState(false)
  const [packagePage, setPackagePage] = useState(1)
  const [packageTotal, setPackageTotal] = useState(0)

  // 本地上传技能源 Modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadSubmitting, setUploadSubmitting] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadForm] = Form.useForm<{ skillName: string; skillDesc: string; skillType: 'skill' | 'workflow' }>()
  // 技能包批量删除
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // 添加技能源 Modal
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [sourceSubmitting, setSourceSubmitting] = useState(false)
  const [sourceForm] = Form.useForm<SourceFormValues>()

  // 解析进度 Modal
  const [progressOpen, setProgressOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [analyzedPackage, setAnalyzedPackage] = useState<AdminSkillPackage | null>(null)

  // 技能包编辑 Drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingPackage, setEditingPackage] = useState<AdminSkillPackage | null>(null)
  const [packageSaving, setPackageSaving] = useState(false)
  const [packageForm] = Form.useForm<PackageEditFormValues>()

  // 驳回 Modal
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectingPackage, setRejectingPackage] = useState<AdminSkillPackage | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  // 查看技能源 Modal
  const [viewSource, setViewSource] = useState<AdminSkillSource | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)

  const loadSources = useCallback(async () => {
    setSourceLoading(true)
    try {
      const res = await listSkillSources({ page: sourcePage, pageSize: PAGE_SIZE })
      setSources(res.list || [])
      setSourceTotal(res.total || 0)
    } catch (err) {
      console.error('[SkillStore] load sources failed:', err)
      message.error('加载技能源列表失败')
    } finally {
      setSourceLoading(false)
    }
  }, [sourcePage])

  const loadPackages = useCallback(async () => {
    setPackageLoading(true)
    try {
      const res = await listSkillPackages({ page: packagePage, pageSize: PAGE_SIZE })
      setPackages(res.list || [])
      setPackageTotal(res.total || 0)
    } catch (err) {
      console.error('[SkillStore] load packages failed:', err)
      message.error('加载技能包列表失败')
    } finally {
      setPackageLoading(false)
    }
  }, [packagePage])

  useEffect(() => {
    void loadSources()
  }, [loadSources])

  useEffect(() => {
    if (activeTab === 'packages') {
      void loadPackages()
    }
  }, [loadPackages, activeTab])

  // 触发解析 + 进度 Modal（异步轮询模式）
  const runAnalyze = async (source: AdminSkillSource) => {
    setProgressOpen(true)
    setAnalyzing(true)
    setAnalyzeError(null)
    setAnalyzedPackage(null)
    try {
      await analyzeSkillSource(source.id)
      message.success('解析已启动，请稍候')
      // 开始轮询 source 状态
      const pollInterval = setInterval(async () => {
        try {
          const res = await listSkillSources({ page: sourcePage, pageSize: PAGE_SIZE })
          const updatedSource = res.list?.find((s) => s.id === source.id)
          if (updatedSource) {
            if (updatedSource.status === 'analyzed') {
              clearInterval(pollInterval)
              setAnalyzing(false)
              setAnalyzedPackage(updatedSource as unknown as AdminSkillPackage) // 解析成功
              void loadSources()
            } else if (updatedSource.status === 'failed') {
              clearInterval(pollInterval)
              setAnalyzing(false)
              setAnalyzeError(updatedSource.errorMessage || '解析失败')
              void loadSources()
            }
          }
        } catch (err) {
          console.error('[SkillStore] poll error:', err)
        }
      }, 2000) // 2 秒轮询
    } catch (err) {
      console.error('[SkillStore] trigger analyze failed:', err)
      setAnalyzeError(err instanceof Error ? err.message : '触发解析失败')
      setAnalyzing(false)
      void loadSources()
    }
  }

  // 提交技能源表单:创建 + 解析
  const handleUploadSkill = async () => {
    try {
      const values = await uploadForm.validateFields()
      if (!uploadFile) {
        message.warning('请选择 zip 文件')
        return
      }
      setUploadSubmitting(true)
      const res = await uploadSkillSource(uploadFile, values)
      message.success(`技能源已上传：${res.skillName}`)
      setUploadModalOpen(false)
      uploadForm.resetFields()
      setUploadFile(null)
      void loadSources()
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      console.error('[SkillStore] upload failed:', err)
      message.error((err as { message?: string })?.message || '上传失败')
    } finally {
      setUploadSubmitting(false)
    }
  }

  const handleBatchDeletePackages = async () => {
    const ids = selectedRowKeys as number[]
    if (ids.length === 0) return
    try {
      const res = await batchDeleteSkillPackages(ids)
      if (res.failed > 0) {
        message.warning(`删除完成：成功 ${res.deleted}，失败 ${res.failed}`)
      } else {
        message.success(`已删除 ${res.deleted} 个技能包`)
      }
      setSelectedRowKeys([])
      void loadPackages()
    } catch (err) {
      console.error('[SkillStore] batch delete failed:', err)
      message.error('批量删除失败')
    }
  }

  const handleCreateSource = async () => {
    try {
      const values = await sourceForm.validateFields()
      setSourceSubmitting(true)
      const dto: CreateSkillSourceDto = {
        sourceUrl: values.sourceUrl.trim(),
        sourceType: values.sourceType,
        skillName: values.skillName.trim(),
        skillDesc: values.skillDesc.trim(),
        skillType: values.skillType
      }
      const source = await createSkillSource(dto)
      message.success('技能源已创建，开始解析')
      setSourceModalOpen(false)
      void loadSources()
      void runAnalyze(source)
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SkillStore] create source failed:', err)
      message.error('创建技能源失败')
    } finally {
      setSourceSubmitting(false)
    }
  }

  const handleDeleteSource = async (source: AdminSkillSource) => {
    try {
      await removeSkillSource(source.id)
      message.success('已删除')
      void loadSources()
    } catch (err) {
      console.error('[SkillStore] delete source failed:', err)
      message.error('删除失败')
    }
  }

  // 技能包编辑 Drawer
  const openEditDrawer = (pkg: AdminSkillPackage) => {
    setEditingPackage(pkg)
    packageForm.setFieldsValue({
      displayName: pkg.displayName,
      description: pkg.description,
      category: pkg.category,
      triggerKeywords: pkg.triggerKeywords ?? [],
      icon: pkg.uiConfig?.icon ?? '',
      color: pkg.uiConfig?.color ?? '#A78BFA'
    })
    setDrawerOpen(true)
  }

  const handleSavePackage = async () => {
    if (!editingPackage) return
    try {
      const values = await packageForm.validateFields()
      setPackageSaving(true)
      const dto: UpdateSkillPackageDto = {
        displayName: values.displayName,
        description: values.description,
        category: values.category,
        triggerKeywords: values.triggerKeywords,
        uiConfig: {
          icon: values.icon,
          color: values.color
        }
      }
      await updateSkillPackage(editingPackage.id, dto)
      message.success('已保存')
      setDrawerOpen(false)
      setEditingPackage(null)
      void loadPackages()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SkillStore] save package failed:', err)
      message.error('保存失败')
    } finally {
      setPackageSaving(false)
    }
  }

  const handleSubmitReview = async (pkg: AdminSkillPackage) => {
    try {
      await submitReviewSkillPackage(pkg.id)
      message.success('已提交审核')
      void loadPackages()
    } catch (err) {
      console.error('[SkillStore] submit review failed:', err)
      message.error('提交审核失败')
    }
  }

  const handleApprove = async (pkg: AdminSkillPackage) => {
    try {
      await approveSkillPackage(pkg.id)
      message.success('已通过')
      void loadPackages()
    } catch (err) {
      console.error('[SkillStore] approve failed:', err)
      message.error('审核通过失败')
    }
  }

  const openReject = (pkg: AdminSkillPackage) => {
    setRejectingPackage(pkg)
    setRejectReason('')
    setRejectOpen(true)
  }

  const handleRejectSubmit = async () => {
    if (!rejectingPackage) return
    if (!rejectReason.trim()) {
      message.warning('请输入驳回原因')
      return
    }
    try {
      setRejectSubmitting(true)
      await rejectSkillPackage(rejectingPackage.id, { reason: rejectReason.trim() })
      message.success('已驳回')
      setRejectOpen(false)
      setRejectingPackage(null)
      void loadPackages()
    } catch (err) {
      console.error('[SkillStore] reject failed:', err)
      message.error('驳回失败')
    } finally {
      setRejectSubmitting(false)
    }
  }

  const handlePublish = async (pkg: AdminSkillPackage) => {
    try {
      await publishSkillPackage(pkg.id)
      message.success('已上架')
      void loadPackages()
    } catch (err) {
      console.error('[SkillStore] publish failed:', err)
      message.error('上架失败')
    }
  }

  const handleUnpublish = async (pkg: AdminSkillPackage) => {
    try {
      await unpublishSkillPackage(pkg.id)
      message.success('已下架')
      void loadPackages()
    } catch (err) {
      console.error('[SkillStore] unpublish failed:', err)
      message.error('下架失败')
    }
  }

  const handleHealthCheck = async (pkg: AdminSkillPackage) => {
    try {
      const result = await healthCheckSkillPackage(pkg.id)
      Modal.info({
        title: '健康检查结果',
        content: (
          <div>
            <p>
              状态:
              <Tag
                color={result.healthy ? 'success' : 'error'}
                style={{ marginLeft: 8 }}
              >
                {result.healthy ? '健康' : '异常'}
              </Tag>
            </p>
            <p>详情: {result.detail || '-'}</p>
          </div>
        )
      })
    } catch (err) {
      console.error('[SkillStore] health check failed:', err)
      message.error('健康检查失败')
    }
  }

  const handleDeletePackage = async (pkg: AdminSkillPackage) => {
    try {
      await removeSkillPackage(pkg.id)
      message.success('已删除')
      void loadPackages()
    } catch (err) {
      console.error('[SkillStore] delete package failed:', err)
      message.error('删除失败')
    }
  }

  const handleReclassify = async (pkg: AdminSkillPackage) => {
    try {
      const result = await reclassifyAsset('skill', pkg.id)
      message.success(`已分类：${result.category}`)
      void loadPackages()
    } catch (err) {
      console.error('[SkillStore] reclassify failed:', err)
      message.error((err as Error).message || '重新分类失败（请检查模型配置）')
    }
  }

  const sourceColumns: TableColumnsType<AdminSkillSource> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '来源 URL',
      dataIndex: 'sourceUrl',
      key: 'sourceUrl',
      ellipsis: true,
      render: (v: string) => <span className={styles.urlCell}>{v}</span>
    },
    {
      title: '技能名称',
      dataIndex: 'skillName',
      key: 'skillName',
      render: (v: string) => <span className={styles.nameCell}>{v}</span>
    },
    {
      title: '类型',
      dataIndex: 'skillType',
      key: 'skillType',
      width: 100,
      render: (t: SkillType) => <Tag color={SKILL_TYPE_TAG[t].color}>{SKILL_TYPE_TAG[t].text}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: SourceStatus) => (
        <Tag color={SOURCE_STATUS_TAG[s].color} className={styles.statusTag}>
          {SOURCE_STATUS_TAG[s].text}
        </Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => <span className={styles.muted}>{formatTime(v)}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_: unknown, record: AdminSkillSource) => (
        <>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setViewSource(record)
              setViewModalOpen(true)
            }}
          >
            查看
          </Button>
          {(record.status === 'pending' || record.status === 'failed') && (
            <Button type="link" size="small" onClick={() => void runAnalyze(record)}>
              解析
            </Button>
          )}
          <Popconfirm
            title="确认删除该技能源?"
            onConfirm={() => void handleDeleteSource(record)}
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
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (v: string) => <span className={styles.nameCell}>{v}</span>
    },
    {
      title: '显示名称',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 140,
      render: (v: string) => <span>{v || '-'}</span>
    },
    {
      title: '类型',
      dataIndex: 'skillType',
      key: 'skillType',
      width: 90,
      render: (t: SkillType) => <Tag color={SKILL_TYPE_TAG[t].color}>{SKILL_TYPE_TAG[t].text}</Tag>
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 90,
      render: (v: string) => <span>{v || '-'}</span>
    },
    {
      title: '运行类型',
      dataIndex: 'runtimeType',
      key: 'runtimeType',
      width: 110,
      render: (v: string) => <span className={styles.muted}>{v || '-'}</span>
    },
    {
      title: '生命周期',
      key: 'lifecycle',
      width: 110,
      render: (_: unknown, record: AdminSkillPackage) => {
        const tag = getLifecycleTag(record)
        return (
          <Tag color={tag.color} className={styles.statusTag}>
            {tag.text}
          </Tag>
        )
      }
    },
    {
      title: '调用次数',
      dataIndex: 'callCount',
      key: 'callCount',
      width: 100,
      render: (v: number) => <span className={styles.muted}>{(v || 0).toLocaleString()}</span>
    },
    {
      title: 'AI 分类',
      key: 'reclassify',
      width: 100,
      fixed: 'right',
      render: (_: unknown, record: AdminSkillPackage) => (
        <Button type="link" size="small" icon={<ThunderboltOutlined />} onClick={() => void handleReclassify(record)}>
          重新分类
        </Button>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 320,
      fixed: 'right',
      render: (_: unknown, record: AdminSkillPackage) => (
        <>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(record)}>
            编辑
          </Button>
          {record.status === 'draft' && (
            <Button type="link" size="small" onClick={() => void handleSubmitReview(record)}>
              提交审核
            </Button>
          )}
          {record.status === 'reviewing' && record.reviewStatus === 'pending' && (
            <>
              <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => void handleApprove(record)}>
                通过
              </Button>
              <Button type="link" size="small" danger icon={<CloseOutlined />} onClick={() => openReject(record)}>
                驳回
              </Button>
            </>
          )}
          {record.status === 'approved' && (
            <Button type="link" size="small" icon={<UploadOutlined />} onClick={() => void handlePublish(record)}>
              上架
            </Button>
          )}
          {record.status === 'published' && (
            <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => void handleUnpublish(record)}>
              下架
            </Button>
          )}
          <Button type="link" size="small" icon={<MedicineBoxOutlined />} onClick={() => void handleHealthCheck(record)}>
            健康检查
          </Button>
          <Popconfirm
            title="确认删除该技能包?"
            onConfirm={() => void handleDeletePackage(record)}
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

  // 解析进度 Steps items: 解析中全部 process, 成功全部 finish, 失败时根据 source.errorMessage 判断在哪一步失败
  const stepItems = ANALYZE_STEPS.map((title, idx) => {
    let status: StepStatus = 'wait'
    if (analyzeError) {
      // 根据 error 内容推断失败步骤
      // git/clone 相关 → 第 0 步; 分析/检测相关 → 第 1 步; 其他 → 第 2 步
      const isCloneError = analyzeError.toLowerCase().includes('clone') || analyzeError.toLowerCase().includes('git') || analyzeError.toLowerCase().includes('fetch')
      const isAnalysisError = analyzeError.toLowerCase().includes('analyze') || analyzeError.toLowerCase().includes('manifest') || analyzeError.toLowerCase().includes('skill.md')
      if (isCloneError) {
        status = idx === 0 ? 'error' : 'wait'
      } else if (isAnalysisError) {
        status = idx <= 1 ? 'finish' : (idx === 1 ? 'error' : 'wait')
      } else {
        status = idx < 2 ? 'finish' : 'error'
      }
    } else if (analyzedPackage) {
      status = 'finish'
    } else if (analyzing) {
      status = 'process'
    }
    return { title, status }
  })

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ShopOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>技能商店管理</h1>
            <div className={styles.subtitle}>技能源解析 / 技能包审核与上下架</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button
            icon={<UploadOutlined />}
            onClick={() => setUploadModalOpen(true)}
            className={styles.ghostBtn}
            style={{ marginRight: 8 }}
          >
            本地上传
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setSourceModalOpen(true)}
            className={styles.primaryBtn}
          >
            添加技能源
          </Button>
        </div>
      </div>

      <div className={styles.tabs}>
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'sources' | 'packages')}
          items={[
            {
              key: 'sources',
              label: '技能源',
              children: (
                <Spin spinning={sourceLoading}>
                  {sources.length === 0 && !sourceLoading ? (
                    <Empty description="暂无技能源" style={{ marginTop: 60 }} />
                  ) : (
                    <div className={styles.tableWrap}>
                      <Table<AdminSkillSource>
                        rowKey="id"
                        columns={sourceColumns}
                        dataSource={sources}
                        pagination={false}
                        size="middle"
                        scroll={{ x: 1000 }}
                      />
                    </div>
                  )}
                  <div className={styles.paginationWrap}>
                    <Pagination
                      current={sourcePage}
                      pageSize={PAGE_SIZE}
                      total={sourceTotal}
                      onChange={setSourcePage}
                      showSizeChanger={false}
                      showTotal={(t) => `共 ${t} 条`}
                    />
                  </div>
                </Spin>
              )
            },
            {
              key: 'packages',
              label: '技能包',
              children: (
                <Spin spinning={packageLoading}>
                  {packages.length === 0 && !packageLoading ? (
                    <Empty description="暂无技能包" style={{ marginTop: 60 }} />
                  ) : (
                    <div className={styles.tableWrap}>
                      <div style={{ marginBottom: 12 }}>
                        <Popconfirm
                          title={`确认删除选中的 ${selectedRowKeys.length} 个技能包?`}
                          onConfirm={() => void handleBatchDeletePackages()}
                          okText="删除"
                          okButtonProps={{ danger: true }}
                          disabled={selectedRowKeys.length === 0}
                        >
                          <Button danger icon={<DeleteOutlined />} disabled={selectedRowKeys.length === 0}>
                            批量删除
                          </Button>
                        </Popconfirm>
                      </div>
                      <Table<AdminSkillPackage>
                        rowKey="id"
                        columns={packageColumns}
                        dataSource={packages}
                        rowSelection={{
                          selectedRowKeys,
                          onChange: (keys) => setSelectedRowKeys(keys),
                        }}
                        pagination={false}
                        size="middle"
                        scroll={{ x: 1300 }}
                      />
                    </div>
                  )}
                  <div className={styles.paginationWrap}>
                    <Pagination
                      current={packagePage}
                      pageSize={PAGE_SIZE}
                      total={packageTotal}
                      onChange={setPackagePage}
                      showSizeChanger={false}
                      showTotal={(t) => `共 ${t} 条`}
                    />
                  </div>
                </Spin>
              )
            }
          ]}
        />
      </div>

      {/* 本地上传技能源 Modal */}
      <Modal
        title="本地上传技能源"
        open={uploadModalOpen}
        onCancel={() => {
          setUploadModalOpen(false)
          uploadForm.resetFields()
          setUploadFile(null)
        }}
        onOk={() => void handleUploadSkill()}
        confirmLoading={uploadSubmitting}
        okText="上传并解析"
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <Form<{ skillName: string; skillDesc: string; skillType: 'skill' | 'workflow' }>
          form={uploadForm}
          layout="vertical"
          className={styles.sourceForm}
          initialValues={{ skillType: 'skill' }}
        >
          <Form.Item label="zip 文件" required>
            <Upload.Dragger
              accept=".zip"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => { setUploadFile(file); return false }}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">{uploadFile ? uploadFile.name : '点击或拖拽 zip 文件到此处'}</p>
              <p className="ant-upload-hint">支持含 SKILL.md 的技能包压缩包</p>
            </Upload.Dragger>
          </Form.Item>
          <Form.Item
            name="skillName"
            label="技能名称"
            rules={[{ required: true, message: '请输入技能名称' }]}
          >
            <Input placeholder="如:web-search" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="skillDesc"
            label="技能描述"
            rules={[{ required: true, message: '请输入技能描述' }]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
          <Form.Item
            name="skillType"
            label="技能类型"
            rules={[{ required: true, message: '请选择技能类型' }]}
          >
            <Radio.Group>
              <Radio value="skill">单一技能包</Radio>
              <Radio value="workflow">完整流程</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加技能源 Modal */}
      <Modal
        title="添加技能源"
        open={sourceModalOpen}
        onCancel={() => setSourceModalOpen(false)}
        onOk={handleCreateSource}
        confirmLoading={sourceSubmitting}
        okText="提交并解析"
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <Form<SourceFormValues>
          form={sourceForm}
          layout="vertical"
          className={styles.sourceForm}
          initialValues={{ sourceType: 'github', skillType: 'skill' }}
        >
          <Form.Item
            name="sourceUrl"
            label="来源 URL"
            rules={[
              { required: true, message: '请输入来源 URL' },
              {
                pattern: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/,
                message: '请输入合法的 GitHub 仓库 URL'
              }
            ]}
          >
            <Input placeholder="https://github.com/..." />
          </Form.Item>
          <Form.Item name="sourceType" label="来源类型" rules={[{ required: true }]}>
            <Select options={[{ label: 'GitHub', value: 'github' }]} />
          </Form.Item>
          <Form.Item
            name="skillName"
            label="技能名称"
            rules={[{ required: true, message: '请输入技能名称' }]}
          >
            <Input placeholder="如:web-search" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="skillDesc"
            label="技能描述"
            rules={[{ required: true, message: '请输入技能描述' }]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
          <Form.Item
            name="skillType"
            label="技能类型"
            rules={[{ required: true, message: '请选择技能类型' }]}
          >
            <Radio.Group>
              <Radio value="skill">单一技能包</Radio>
              <Radio value="workflow">完整流程</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>

      {/* 解析进度 Modal */}
      <Modal
        title="解析进度"
        open={progressOpen}
        onCancel={() => {
          if (!analyzing) setProgressOpen(false)
        }}
        footer={null}
        maskClosable={false}
        closable={!analyzing}
        width={640}
      >
        <div className={styles.progressModal}>
          <div className={styles.progressStep}>
            <Steps items={stepItems} />
          </div>
          {analyzing && <div className={styles.muted}>正在解析，请稍候...</div>}
          {analyzeError && (
            <div className={styles.progressError}>
              <Alert type="error" showIcon message="解析失败" description={analyzeError} />
            </div>
          )}
          {analyzedPackage && (
            <div className={styles.progressFooter}>
              <Button
                type="primary"
                onClick={() => {
                  setProgressOpen(false)
                  setActiveTab('packages')
                  void loadPackages()
                }}
              >
                查看技能包详情
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* 技能包编辑 Drawer */}
      <Drawer
        title={editingPackage ? `编辑技能包 - ${editingPackage.name}` : '编辑技能包'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        destroyOnClose
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setDrawerOpen(false)}>关闭</Button>
            <Button type="primary" loading={packageSaving} onClick={handleSavePackage}>
              保存
            </Button>
          </div>
        }
      >
        <div className={styles.packageDetail}>
          <Form<PackageEditFormValues>
            form={packageForm}
            layout="vertical"
            className={styles.detailForm}
          >
            <Form.Item
              name="displayName"
              label="显示名称"
              rules={[{ required: true, message: '请输入显示名称' }]}
            >
              <Input placeholder="显示名称" maxLength={64} />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={4} maxLength={1000} showCount />
            </Form.Item>
            <Form.Item name="category" label="分类">
              <Select options={CATEGORY_OPTIONS} allowClear placeholder="选择分类" />
            </Form.Item>
            <Form.Item name="triggerKeywords" label="触发关键词">
              <Select mode="tags" placeholder="输入关键词后回车" />
            </Form.Item>
            <Form.Item name="icon" label="图标 (icon)">
              <Input placeholder="如图标名称或 emoji" />
            </Form.Item>
            <Form.Item name="color" label="主题颜色">
              <Input type="color" />
            </Form.Item>
          </Form>
        </div>
      </Drawer>

      {/* 驳回 Modal */}
      <Modal
        title="驳回技能包"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={handleRejectSubmit}
        confirmLoading={rejectSubmitting}
        okText="确认驳回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginBottom: 8, color: '#8b949e' }}>驳回原因</div>
        <Input.TextArea
          rows={4}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="请输入驳回原因"
          maxLength={500}
          showCount
        />
      </Modal>

      {/* 查看技能源 Modal */}
      <Modal
        title="技能源详情"
        open={viewModalOpen}
        onCancel={() => setViewModalOpen(false)}
        footer={null}
        width={640}
      >
        {viewSource && (
          <div>
            <p>来源 URL: {viewSource.sourceUrl}</p>
            <p>来源类型: {viewSource.sourceType}</p>
            <p>技能名称: {viewSource.skillName}</p>
            <p>技能描述: {viewSource.skillDesc}</p>
            <p>技能类型: {viewSource.skillType}</p>
            <p>状态: {viewSource.status}</p>
            {viewSource.packageId && (
              <p>已关联技能包 ID: {viewSource.packageId}</p>
            )}
            {viewSource.errorMessage && (
              <p style={{ color: '#cf222e' }}>错误信息: {viewSource.errorMessage}</p>
            )}
            {viewSource.analyzeResult && (
              <div>
                <p>解析结果：</p>
                <pre
                  style={{
                    background: 'rgba(0,0,0,0.04)',
                    padding: 12,
                    borderRadius: 8,
                    overflow: 'auto',
                    maxHeight: 320
                  }}
                >
                  {JSON.stringify(viewSource.analyzeResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
