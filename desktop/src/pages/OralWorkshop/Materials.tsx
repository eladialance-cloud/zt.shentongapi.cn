/**
 * 口播工坊 · 素材库（对标素材管理页）
 * 上传/登记素材 → 向量化（Qdrant 语义索引）→ 归档管理；AI 混剪建议（字幕关键词 → 素材匹配）
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Empty, Form, Input, Modal, Select, Spin, Table, Tag, Upload, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  Archive,
  ArchiveRestore,
  Clapperboard,
  FileText,
  Library,
  Plus,
  RefreshCw,
  Sparkles,
  Upload as UploadIcon,
} from 'lucide-react'
import {
  createMediaAsset,
  listMediaAssets,
  updateMediaAsset,
  vectorizeMediaAsset,
  type MediaAssetItem,
} from '@/api/media-assets-api'
import { uploadFile } from '@/api/file-api'
import { importJobToMaterials, listOralWorkshopJobs, mixSuggest } from '@/api/oral-workshop-api'
import type { MixSuggestItem, OralWorkshopJob } from '@/types/oral-workshop'
import { resolveMediaUrl } from '@/utils/media'
import styles from './styles.module.css'

const { TextArea } = Input

/** 素材类型展示名 */
const ASSET_TYPE_LABEL: Record<MediaAssetItem['assetType'], string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  file: '文件',
}

/** 向量化状态徽标 */
const VECTOR_STATUS_META: Record<MediaAssetItem['vectorStatus'], { label: string; color: string }> = {
  none: { label: '未向量化', color: 'default' },
  pending: { label: '处理中', color: 'processing' },
  ready: { label: '已就绪', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

/** 画中画位置说明 */
const PIP_POSITION_LABEL: Record<string, string> = {
  tl: '左上',
  tr: '右上',
  bl: '左下',
  br: '右下',
  center: '居中',
}

/** 按文件 MIME 推断素材类型 */
function inferAssetType(mime: string): MediaAssetItem['assetType'] {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

/** 加入画中画的本地记录 key（工作台画中画素材可读取） */
const PIP_STORAGE_KEY = 'oral-workshop-pip-suggestions'

export default function OralWorkshopMaterials() {
  const [list, setList] = useState<MediaAssetItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [vectorizingId, setVectorizingId] = useState<number | null>(null)
  const [archivingId, setArchivingId] = useState<number | null>(null)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlForm] = Form.useForm()
  const [urlSaving, setUrlSaving] = useState(false)

  // AI 混剪建议
  const [jobs, setJobs] = useState<OralWorkshopJob[]>([])
  const [suggestJobId, setSuggestJobId] = useState<number | undefined>()
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<MixSuggestItem[]>([])
  const [importingJobId, setImportingJobId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listMediaAssets({ page, pageSize })
      setList(data.list)
      setTotal(data.total)
    } catch (err) {
      message.error('素材列表加载失败: ' + ((err as Error)?.message ?? err))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  // 任务下拉（简化版：最近 50 条）
  useEffect(() => {
    void listOralWorkshopJobs({ page: 1, pageSize: 50 })
      .then((res) => setJobs(res.list))
      .catch(() => setJobs([]))
  }, [])

  /** 上传素材：uploadFile → createMediaAsset */
  const handleUpload = async (file: File) => {
    try {
      const up = await uploadFile(file)
      await createMediaAsset({
        title: file.name,
        url: up.url,
        assetType: inferAssetType(up.mimeType || file.type || ''),
      })
      message.success('素材已上传并登记（自动发起向量化）')
      void load()
    } catch (err) {
      message.error('上传素材失败: ' + ((err as Error)?.message ?? err))
    }
    return false
  }

  /** 登记 URL 素材 */
  const handleCreateByUrl = async () => {
    const values = (await urlForm.validateFields()) as { title: string; url: string; type?: MediaAssetItem['assetType']; description?: string }
    setUrlSaving(true)
    try {
      await createMediaAsset({
        title: values.title.trim(),
        url: values.url.trim(),
        assetType: values.type,
        description: values.description?.trim() || undefined,
      })
      message.success('素材已登记（自动发起向量化）')
      setUrlOpen(false)
      urlForm.resetFields()
      void load()
    } catch (err) {
      message.error('登记素材失败: ' + ((err as Error)?.message ?? err))
    } finally {
      setUrlSaving(false)
    }
  }

  /** 向量化素材 */
  const handleVectorize = async (id: number) => {
    setVectorizingId(id)
    try {
      await vectorizeMediaAsset(id)
      message.success('向量化任务已提交，稍后刷新查看状态')
      void load()
    } catch (err) {
      message.error('向量化失败: ' + ((err as Error)?.message ?? err))
    } finally {
      setVectorizingId(null)
    }
  }

  /** 归档 / 恢复 */
  const handleArchive = async (item: MediaAssetItem) => {
    setArchivingId(item.id)
    try {
      await updateMediaAsset(item.id, { archived: !item.archived })
      message.success(item.archived ? '素材已恢复' : '素材已归档')
      void load()
    } catch (err) {
      message.error('更新素材失败: ' + ((err as Error)?.message ?? err))
    } finally {
      setArchivingId(null)
    }
  }

  /** AI 混剪建议 */
  const handleSuggest = async () => {
    if (!suggestJobId) {
      message.warning('请先选择任务')
      return
    }
    setSuggestLoading(true)
    setSuggestions([])
    try {
      const items = await mixSuggest(suggestJobId)
      setSuggestions(items)
      if (!items.length) message.info('暂无混剪建议（可先上传/登记素材并完成向量化）')
    } catch (err) {
      message.error('生成混剪建议失败: ' + ((err as Error)?.message ?? err))
    } finally {
      setSuggestLoading(false)
    }
  }

  /** 加入画中画：匹配素材 URL 记到本地，供任务工作台使用 */
  const handleAddPip = (s: MixSuggestItem) => {
    const matched = s.matched?.[0]
    if (!matched?.url) {
      message.warning('该建议暂无匹配素材')
      return
    }
    const prev = JSON.parse(localStorage.getItem(PIP_STORAGE_KEY) || '[]') as Array<Record<string, unknown>>
    localStorage.setItem(
      PIP_STORAGE_KEY,
      JSON.stringify([
        ...prev,
        {
          subtitle: s.subtitle,
          url: matched.url,
          position: s.pipAssets?.[0]?.position ?? 'tr',
          scale: s.pipAssets?.[0]?.scale ?? 1,
          addedAt: new Date().toISOString(),
        },
      ])
    )
    message.success('已加入画中画素材，可在任务工作台「画中画素材」中查看使用')
  }

  /** 一键导入素材库（任务产物 → 素材库） */
  const handleImportMaterials = async (jobId: number) => {
    setImportingJobId(jobId)
    try {
      const res = await importJobToMaterials(jobId)
      message.success(res.imported > 0 ? '已导入 ' + res.imported + ' 个素材到素材库' : '该任务素材已全部导入过（幂等跳过）')
      void load()
    } catch (err) {
      message.error('导入素材失败: ' + ((err as Error)?.message ?? err))
    } finally {
      setImportingJobId(null)
    }
  }

  const columns: ColumnsType<MediaAssetItem> = [
    {
      title: '素材',
      key: 'asset',
      width: 320,
      render: (_, r) => (
        <div className={styles.materialCell}>
          <div className={styles.materialThumb}>
            {r.assetType === 'image' && <img src={resolveMediaUrl(r.url)} alt={r.title} />}
            {r.assetType === 'video' && <video src={resolveMediaUrl(r.url)} controls preload="metadata" />}
            {r.assetType === 'audio' && <audio src={resolveMediaUrl(r.url)} controls preload="none" />}
            {r.assetType === 'file' && <FileText size={20} />}
          </div>
          <div className={styles.materialInfo}>
            <div className={styles.materialTitle}>{r.title || '未命名素材'}</div>
            {r.tags?.length ? (
              <div className={styles.materialTags}>
                {r.tags.slice(0, 3).map((t) => (
                  <Tag key={t} color="gold">#{t}</Tag>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'assetType',
      width: 90,
      render: (t: MediaAssetItem['assetType']) => <Tag>{ASSET_TYPE_LABEL[t] ?? t}</Tag>,
    },
    {
      title: '向量化',
      dataIndex: 'vectorStatus',
      width: 110,
      render: (s: MediaAssetItem['vectorStatus']) => <Tag color={VECTOR_STATUS_META[s]?.color}>{VECTOR_STATUS_META[s]?.label ?? s}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, r) => (
        <div className={styles.rowActions}>
          <Button
            size="small"
            icon={<RefreshCw size={12} />}
            loading={vectorizingId === r.id}
            disabled={r.vectorStatus === 'pending'}
            onClick={() => void handleVectorize(r.id)}
          >
            {r.vectorStatus === 'none' ? '向量化' : r.vectorStatus === 'ready' ? '重新向量化' : '向量化'}
          </Button>
          <Button
            size="small"
            icon={r.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            loading={archivingId === r.id}
            onClick={() => void handleArchive(r)}
          >
            {r.archived ? '恢复' : '归档'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}>
            <Library size={17} strokeWidth={2} />
          </span>
          <div>
            <h1 className={styles.title}>素材库</h1>
            <div className={styles.subtitle}>上传/登记素材并向量化，供 AI 混剪建议与素材中心语义检索使用</div>
          </div>
        </div>
        <div className={styles.headActions}>
          <Upload accept="image/*,video/*,audio/*" showUploadList={false} beforeUpload={(f) => handleUpload(f)}>
            <Button type="primary" icon={<UploadIcon size={14} />}>
              上传素材
            </Button>
          </Upload>
          <Button icon={<Plus size={14} />} onClick={() => setUrlOpen(true)}>
            登记 URL
          </Button>
        </div>
      </header>

      <Card className={styles.card} title={<span className={styles.cardTitle}>素材列表</span>} style={{ marginBottom: 16 }}>
        <Table
          className={styles.darkTable}
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (t) => '共 ' + t + ' 个素材',
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
          }}
          locale={{ emptyText: <Empty description="暂无素材，点击右上角上传或登记" /> }}
        />
      </Card>

      <Card
        className={styles.card}
        title={<span className={styles.cardTitle}>AI 混剪建议</span>}
        extra={
          <Button
            icon={<Sparkles size={14} />}
            type="primary"
            loading={suggestLoading}
            disabled={!suggestJobId}
            onClick={() => void handleSuggest()}
          >
            生成建议
          </Button>
        }
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <Select
            placeholder="选择任务（生成建议前请先向量化素材）"
            style={{ minWidth: 260 }}
            value={suggestJobId}
            onChange={setSuggestJobId}
            options={jobs.map((j) => ({
              value: j.id,
              label: '任务 #' + j.id + '（' + (j.status || '') + '）',
            }))}
            showSearch
            optionFilterProp="label"
          />
          {suggestJobId && (
            <Button
              size="small"
              icon={<Clapperboard size={13} />}
              loading={importingJobId === suggestJobId}
              onClick={() => void handleImportMaterials(suggestJobId)}
            >
              一键导入该任务产物到素材库
            </Button>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            提示：素材需先向量化（状态「已就绪」）才能被混剪建议匹配
          </span>
        </div>
        {suggestions.length === 0 ? (
          <Empty description={suggestLoading ? '生成中…' : '选择任务后点击「生成建议」'} />
        ) : (
          <div className={styles.suggestGrid}>
            {suggestions.map((s, i) => {
              const matched = s.matched?.[0]
              return (
                <div key={i} className={styles.suggestCard}>
                  <div className={styles.suggestHead}>
                    <Tag color="blue">{s.keyword || '关键词'}</Tag>
                    <span className={styles.suggestPos}>{PIP_POSITION_LABEL[s.pipAssets?.[0]?.position ?? ''] ?? s.pipAssets?.[0]?.position ?? '右上'}</span>
                  </div>
                  <p className={styles.suggestText}>{s.subtitle}</p>
                  <div className={styles.suggestAsset}>
                    {matched ? (
                      <>
                        {matched.type === 'image' ? (
                          <img src={resolveMediaUrl(matched.url)} alt={matched.name} />
                        ) : (
                          <video src={resolveMediaUrl(matched.url)} muted preload="metadata" />
                        )}
                        <span>{matched.name}</span>
                      </>
                    ) : (
                      <span className={styles.suggestNoMatch}>暂无匹配素材</span>
                    )}
                  </div>
                  <div className={styles.suggestActions}>
                    <Button size="small" type="primary" ghost icon={<Plus size={12} />} disabled={!matched} onClick={() => void handleAddPip(s)}>
                      加入画中画
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Modal
        open={urlOpen}
        title="登记 URL 素材"
        onCancel={() => setUrlOpen(false)}
        onOk={() => void handleCreateByUrl()}
        okText="登记"
        confirmLoading={urlSaving}
      >
        <Form form={urlForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="如：海边日落素材" maxLength={128} />
          </Form.Item>
          <Form.Item name="url" label="素材 URL" rules={[{ required: true, message: '请输入素材 URL' }]}>
            <Input placeholder="https://…" maxLength={1024} />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select
              placeholder="自动推断（可选）"
              allowClear
              options={(Object.keys(ASSET_TYPE_LABEL) as MediaAssetItem['assetType'][]).map((t) => ({
                value: t,
                label: ASSET_TYPE_LABEL[t],
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <TextArea rows={2} placeholder="补充描述，帮助语义检索" maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
