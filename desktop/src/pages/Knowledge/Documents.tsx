// 知识库文档管理页
// 布局：知识库信息栏 + 上传区（antd Upload，多文件，进度）+ 文档列表
// 调用 GET /knowledge/bases/:id/documents、POST /knowledge/bases/:id/documents、DELETE /knowledge/bases/:id/documents/:docId

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Popconfirm,
  Progress,
  Spin,
  Table,
  Tag,
  Upload,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import type { UploadFile, UploadProps } from 'antd'
import {
  ArrowLeftOutlined,
  BookOutlined,
  DeleteOutlined,
  InboxOutlined,
  FileTextOutlined,
  SearchOutlined
} from '@ant-design/icons'
import * as kbApi from '@/api/knowledge-api'
import type { KnowledgeBase, KnowledgeDocument, ChunkStatus } from '@/types/knowledge'
import styles from './styles.module.css'

const { Dragger } = Upload

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

/** 分块状态 className */
function chunkStatusClass(status: ChunkStatus): string {
  switch (status) {
    case 'pending':
      return styles.chunkStatusPending
    case 'processing':
      return styles.chunkStatusProcessing
    case 'completed':
      return styles.chunkStatusCompleted
    case 'failed':
      return styles.chunkStatusFailed
    default:
      return ''
  }
}

/** 分块状态中文显示 */
function chunkStatusLabel(status: ChunkStatus): string {
  switch (status) {
    case 'pending':
      return '待处理'
    case 'processing':
      return '处理中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    default:
      return status
  }
}

export default function KnowledgeDocuments() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const kbId = id ? Number(id) : NaN

  const [kb, setKb] = useState<KnowledgeBase | null>(null)
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  /** 加载知识库信息 + 文档列表 */
  const loadData = useCallback(async () => {
    if (!Number.isFinite(kbId)) return
    setLoading(true)
    try {
      // 列表 API 不返回单个知识库详情，先获取所有 bases 找到对应记录
      const [allBases, docs] = await Promise.all([
        kbApi.listKnowledgeBases(),
        kbApi.listDocuments(kbId)
      ])
      const found = allBases.find((b) => b.id === kbId) ?? null
      setKb(found)
      setDocuments(docs || [])
    } catch (err) {
      console.error('[KnowledgeDocuments] load failed:', err)
      message.error('加载文档列表失败')
    } finally {
      setLoading(false)
    }
  }, [kbId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 手动上传（不走 antd 默认行为） */
  const uploadProps: UploadProps = {
    name: 'file',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      // 异步上传
      void (async () => {
        const fileKey = `${file.name}-${file.uid}`
        try {
          setUploadProgress((prev) => ({ ...prev, [fileKey]: 0 }))
          const doc = await kbApi.uploadDocument(kbId, file, (percent) => {
            setUploadProgress((prev) => ({ ...prev, [fileKey]: percent }))
          })
          message.success(`文件 ${file.name} 上传成功`)
          setDocuments((prev) => [...prev, doc])
        } catch (err) {
          console.error('[KnowledgeDocuments] upload failed:', err)
          message.error(`上传 ${file.name} 失败: ${(err as Error).message}`)
        } finally {
          setUploadProgress((prev) => {
            const next = { ...prev }
            delete next[fileKey]
            return next
          })
        }
      })()
      // 返回 false 阻止 antd 自动上传
      return false
    }
  }

  /** 删除文档 */
  const handleDeleteDoc = async (doc: KnowledgeDocument) => {
    try {
      await kbApi.deleteDocument(kbId, doc.id)
      message.success(`文档 ${doc.fileName} 已删除`)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (err) {
      console.error('[KnowledgeDocuments] delete failed:', err)
      message.error('删除失败: ' + (err as Error).message)
    }
  }

  /** 刷新列表（用于轮询分块状态） */
  const handleRefresh = () => {
    void loadData()
  }

  /** 表格列 */
  const columns: TableColumnsType<KnowledgeDocument> = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      render: (v: string) => (
        <span style={{ color: '#e6edf3', fontSize: 13 }}>
          <FileTextOutlined style={{ marginRight: 6, color: '#a5b4fc' }} />
          {v}
        </span>
      )
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 100,
      render: (v: number) => (
        <span style={{ color: '#8b949e' }}>{formatFileSize(v)}</span>
      )
    },
    {
      title: '分块状态',
      dataIndex: 'chunkStatus',
      key: 'chunkStatus',
      width: 110,
      render: (s: ChunkStatus, record: KnowledgeDocument) => (
        <Tag className={chunkStatusClass(s)} title={record.errorMessage}>
          {chunkStatusLabel(s)}
        </Tag>
      )
    },
    {
      title: '分块数',
      dataIndex: 'chunkCount',
      key: 'chunkCount',
      width: 80,
      render: (v: number) => <span style={{ color: '#a5b4fc' }}>{v ?? 0}</span>
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatTime(v)
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: KnowledgeDocument) => (
        <Popconfirm
          title="确定删除该文档吗？"
          description="将同步删除向量索引"
          onConfirm={() => handleDeleteDoc(record)}
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

  if (loading && !kb) {
    return (
      <div className={styles.pageContainer}>
        <Spin
          fullscreen
          tip="加载中..."
          style={{ background: 'rgba(10, 14, 26, 0.85)' }}
        />
      </div>
    )
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <BookOutlined />
          <span>{kb?.name ?? '知识库'} - 文档管理</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<SearchOutlined />}
            onClick={() => navigate(`/knowledge/${kbId}/search`)}
          >
            检索测试
          </Button>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/knowledge')}
          >
            返回列表
          </Button>
        </div>
      </div>

      <div className={styles.docsContainer}>
        {/* 知识库信息栏 */}
        {kb && (
          <div className={styles.kbInfoBar}>
            <BookOutlined style={{ color: '#a5b4fc', fontSize: 18 }} />
            <div style={{ flex: 1 }}>
              <div className={styles.kbInfoName}>{kb.name}</div>
              <div className={styles.kbInfoDescription}>
                {kb.description || '暂无描述'} · 共 {kb.documentCount ?? documents.length} 个文档
              </div>
            </div>
            <Button className={styles.backBtn} onClick={handleRefresh}>
              刷新
            </Button>
          </div>
        )}

        {/* 上传区 */}
        <div className={styles.uploadArea}>
          <div className={styles.sectionTitle}>
            <InboxOutlined />
            上传文档
          </div>
          <Dragger {...uploadProps} className={styles.uploadDragger}>
            <p className={styles.uploadText}>
              <InboxOutlined style={{ fontSize: 36, color: '#a5b4fc' }} />
            </p>
            <p className={styles.uploadText}>点击或拖拽文件到此区域上传</p>
            <p className={styles.uploadHint}>
              支持多文件上传 · 支持 PDF / Word / Markdown / TXT / HTML 等格式
            </p>
          </Dragger>

          {/* 上传进度 */}
          {Object.keys(uploadProgress).length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(uploadProgress).map(([key, percent]) => (
                <div key={key}>
                  <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 2 }}>{key}</div>
                  <Progress
                    percent={percent}
                    size="small"
                    strokeColor={{ from: '#6366f1', to: '#8b5cf6' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 文档列表 */}
        <Spin spinning={loading}>
          <div className={styles.docsTableWrapper}>
            <div className={styles.sectionTitle}>
              <FileTextOutlined />
              文档列表
            </div>
            <Table<KnowledgeDocument>
              columns={columns}
              dataSource={documents}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 20, showSizeChanger: false }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: '暂无文档，请上传' }}
            />
          </div>
        </Spin>
      </div>
    </div>
  )
}
