/**
 * 口播工坊 · 素材与混剪（收敛版）
 *
 * 素材的「上传 / 登记 / 向量化 / 归档」统一在「素材库」页维护（两库规则 R4：口播工坊只读输入库）。
 * 本页只保留口播工坊特有的两件事：
 *   1) AI 混剪建议（字幕关键词 → 输入库素材匹配）→「加入画中画」进入待用队列；
 *   2) 一键把某次任务的产物导入「生成素材库」。
 * 下方素材列表为只读视图（便于对照匹配结果），右上角可跳转素材库维护原料。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Empty, Select, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import { Clapperboard, ExternalLink, FileText, Library, Plus, Sparkles } from 'lucide-react'
// 统一走素材库 API 客户端（两库口径同源；原 @/api/media-assets-api 副本已删除）
import { listMediaAssets } from '@/api/media-asset-api'
import type { MediaAsset as MediaAssetItem } from '@/api/media-asset-api'
import { importJobToMaterials, listOralWorkshopJobs, mixSuggest } from '@/api/oral-workshop-api'
import type { MixSuggestItem, OralWorkshopJob } from '@/types/oral-workshop'
import { resolveMediaUrl } from '@/utils/media'
import { addPipSuggestion, readPipSuggestions, toPipSuggestion } from './pip-suggestions'
import styles from './styles.module.css'

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

export default function OralWorkshopMaterials() {
  const navigate = useNavigate()
  const [list, setList] = useState<MediaAssetItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // AI 混剪建议
  const [jobs, setJobs] = useState<OralWorkshopJob[]>([])
  const [suggestJobId, setSuggestJobId] = useState<number | undefined>()
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<MixSuggestItem[]>([])
  const [importingJobId, setImportingJobId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 两库规则 R4：口播工坊（画中画/混剪）取材只读「用户输入库」
      const data = await listMediaAssets({ library: 'input', page, pageSize })
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

  /** 待用画中画建议条数（口播工坊写入 → 任务工作台消费，这里只做提示） */
  const [pipQueued, setPipQueued] = useState(0)

  useEffect(() => {
    setPipQueued(readPipSuggestions().length)
  }, [])

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
      if (!items.length) message.info('暂无混剪建议（请先在素材库上传素材并完成向量化）')
    } catch (err) {
      message.error('生成混剪建议失败: ' + ((err as Error)?.message ?? err))
    } finally {
      setSuggestLoading(false)
    }
  }

  /** 加入画中画：把匹配素材写入待用队列（读写唯一口径见 pip-suggestions.ts） */
  const handleAddPip = (s: MixSuggestItem) => {
    const entry = toPipSuggestion({
      subtitle: s.subtitle,
      keyword: s.keyword,
      matched: s.matched?.[0],
      pip: s.pipAssets?.[0],
      jobId: suggestJobId,
    })
    if (!entry) {
      message.warning('该建议暂无匹配素材，无法加入画中画')
      return
    }
    const next = addPipSuggestion(entry)
    setPipQueued(next.length)
    message.success('已加入画中画待用队列（' + next.length + ' 条），可在任务工作台画中画弹窗中一键使用')
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
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}>
            <Library size={17} strokeWidth={2} />
          </span>
          <div>
            <h1 className={styles.title}>素材与混剪</h1>
            <div className={styles.subtitle}>
              口播工坊取材只读「用户输入库」；上传 / 向量化 / 归档请在素材库维护，本页负责混剪建议与任务产物入库
            </div>
          </div>
        </div>
        <div className={styles.headActions}>
          {pipQueued > 0 && (
            <Button icon={<Clapperboard size={14} />} onClick={() => navigate('/oral-workshop/workbench')}>
              画中画待用 {pipQueued} 条
            </Button>
          )}
          <Button type="primary" icon={<ExternalLink size={14} />} onClick={() => navigate('/assets')}>
            去素材库维护原料
          </Button>
        </div>
      </header>

      <Card
        className={styles.card}
        title={<span className={styles.cardTitle}>可取材素材（只读 · 用户输入库）</span>}
        extra={
          <Button size="small" type="link" icon={<ExternalLink size={12} />} onClick={() => navigate('/assets')}>
            管理
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
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
          locale={{ emptyText: <Empty description="输入库暂无素材，请先到「素材库」上传或登记" /> }}
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
            提示：素材需先在素材库向量化（状态「已就绪」）才能被混剪建议匹配；「加入画中画」后到任务工作台的画中画弹窗一键使用
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
    </div>
  )
}
