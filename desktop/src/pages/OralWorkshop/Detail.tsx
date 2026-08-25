/**
 * 口播工坊 · 任务详情（M6-2）
 * 7 步进度条（2s 轮询） + 每步产物 + 成片预览/下载 + 导出发布包
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Empty, Modal, Popconfirm, Spin, Steps, Tag, message } from 'antd'
import {
  ArrowLeft,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  PackageOpen,
  Palette,
  XCircle,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  cancelOralWorkshopJob,
  exportOralWorkshopPackage,
  getOralWorkshopJob,
} from '@/api/oral-workshop-api'
import { useOralWorkshopStore } from '@/store/oral-workshop'
import CoverDesigner from './CoverDesigner'
import { resolveMediaUrl } from '@/utils/media'
import type { OralWorkshopJob, OralWorkshopStepStatus, PublishPackage } from '@/types/oral-workshop'
import styles from './styles.module.css'

export const STEP_LABELS: Record<string, string> = {
  extract: '文案抽取',
  rewrite: 'LLM 改写',
  voiceClone: '声音克隆',
  digitalHuman: '数字人合成',
  videoEdit: '视频合成',
  titleCover: '标题封面',
  publishReady: '发布就绪',
}

export function stepStatusToAntd(status: OralWorkshopStepStatus): 'wait' | 'process' | 'finish' | 'error' {
  if (status === 'done') return 'finish'
  if (status === 'running') return 'process'
  if (status === 'failed') return 'error'
  return 'wait'
}

export function statusText(status: string): string {
  const map: Record<string, string> = {
    pending: '排队中',
    processing: '生成中',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return map[status] ?? status
}

export default function OralWorkshopDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const jobId = Number(id)
  const { setLastJob } = useOralWorkshopStore()
  const [job, setJob] = useState<OralWorkshopJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [pkg, setPkg] = useState<PublishPackage | null>(null)
  const [coverDesignerOpen, setCoverDesignerOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!jobId) return
    try {
      const data = await getOralWorkshopJob(jobId)
      setJob(data)
      setLastJob(data)
    } catch (err) {
      // 轮询失败静默，避免每 2 秒刷一条错误 toast
      const e = err as Error
      if (!opts?.silent) message.error('任务详情加载失败: ' + (e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [jobId, setLastJob])

  // 生成中轮询（2s），done/failed/cancelled 停止
  useEffect(() => {
    void load()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const s = job?.status
      if (s === 'done' || s === 'failed' || s === 'cancelled') {
        if (timerRef.current) clearInterval(timerRef.current)
        return
      }
      void load({ silent: true })
    }, 2000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [load, job?.status])

  const handleCancel = async () => {
    try {
      await cancelOralWorkshopJob(jobId)
      message.success('任务已取消，预扣 Credits 已退还')
      void load()
    } catch (err) {
      const e = err as Error
      message.error('取消失败: ' + (e?.message ?? e))
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const p = await exportOralWorkshopPackage(jobId)
      setPkg(p)
    } catch (err) {
      const e = err as Error
      message.error('导出失败: ' + (e?.message ?? e))
    } finally {
      setExporting(false)
    }
  }

  const handleCopy = async () => {
    if (!pkg) return
    const text = [pkg.title, pkg.subtitle, pkg.description]
      .filter(Boolean)
      .concat(pkg.topic_tags.map((t) => '#' + t))
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      message.success('发布文案已复制')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.centerBox}>
          <Spin />
          <p className={styles.centerHint}>正在加载任务详情…</p>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className={styles.page}>
        <Empty description="任务不存在" />
      </div>
    )
  }

  const stepsItems = (job.steps ?? []).map((s) => ({
    title: STEP_LABELS[s.step] ?? s.step,
    description: s.status === 'failed' ? (s.error ?? '执行失败') : undefined,
    status: stepStatusToAntd(s.status),
  }))

  const isRunning = job.status === 'pending' || job.status === 'processing'
  const processIdx = stepsItems.findIndex((i) => i.status === 'process')
  const failedIdx = stepsItems.findIndex((i) => i.status === 'error')
  const firstNotDone = stepsItems.findIndex((i) => i.status === 'wait' || i.status === 'process')
  const stepsCurrent = processIdx >= 0 ? processIdx : failedIdx >= 0 ? failedIdx : firstNotDone

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <Button
            type="text"
            icon={<ArrowLeft size={16} />}
            className={styles.backBtn}
            onClick={() => navigate('/oral-workshop')}
          />
          <span className={styles.titleIcon}>
            <Clapperboard size={17} strokeWidth={2} />
          </span>
          <div>
            <h1 className={styles.title}>任务 #{job.id}</h1>
            <div className={styles.subtitle}>
              状态：<Tag color={job.status === 'done' ? 'success' : job.status === 'failed' ? 'error' : 'processing'}>{statusText(job.status)}</Tag>
              {job.creditsCost > 0 && <span className={styles.costTag}>实扣 {job.creditsCost} Credits</span>}
            </div>
          </div>
        </div>
        <div className={styles.headActions}>
          {isRunning && (
            <Popconfirm title="确定取消该任务？预扣 Credits 将退还。" onConfirm={() => void handleCancel()}>
              <Button icon={<XCircle size={14} />}>取消任务</Button>
            </Popconfirm>
          )}
          {job.status === 'done' && (
            <Button
              type="primary"
              icon={<PackageOpen size={14} />}
              loading={exporting}
              onClick={() => void handleExport()}
              className={styles.primaryBtn}
            >
              导出发布包
            </Button>
          )}
        </div>
      </header>

      <Card className={styles.card} title={<span className={styles.cardTitle}>流水线进度</span>}>
        {stepsItems.length ? (
          <Steps items={stepsItems} current={stepsCurrent} status={job.status === 'failed' ? 'error' : isRunning ? 'process' : 'finish'} size="small" responsive />
        ) : (
          <Empty description="暂无步骤数据" />
        )}
        {job.error && <div className={styles.errorBar}>错误：{job.error}</div>}
      </Card>

      <div className={styles.detailGrid}>
        <Card className={styles.card} title={<span className={styles.cardTitle}>成片预览</span>}>
          {job.videoUrl ? (
            <video className={styles.video} src={resolveMediaUrl(job.videoUrl)} controls preload="metadata" />
          ) : (
            <div className={styles.previewEmpty}>
              <Empty description={isRunning ? '合成中，请稍候…' : '暂无成片'} />
            </div>
          )}
          {job.videoUrl && (
            <div className={styles.previewActions}>
              <a href={resolveMediaUrl(job.videoUrl)} target="_blank" rel="noreferrer">
                <Button icon={<ExternalLink size={14} />}>新窗口打开</Button>
              </a>
              <a href={resolveMediaUrl(job.videoUrl)} download>
                <Button icon={<Download size={14} />}>下载</Button>
              </a>
            </div>
          )}
        </Card>

        <Card className={styles.card} title={<span className={styles.cardTitle}>产物与文案</span>}>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>改写后文案</span>
            <p className={styles.metaText}>{job.rewrittenScript || job.scriptInput || '--'}</p>
          </div>
          {job.audioUrl && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>人声轨</span>
              <audio className={styles.audio} src={resolveMediaUrl(job.audioUrl)} controls preload="none" />
            </div>
          )}
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>封面</span>
            {job.coverUrl ? (
              <img className={styles.cover} src={resolveMediaUrl(job.coverUrl)} alt="封面" />
            ) : (
              <div className={styles.previewEmpty} style={{ minHeight: 60 }}>
                <Empty description="暂无封面" />
              </div>
            )}
            <div className={styles.coverActions}>
              <Button size="small" icon={<Palette size={13} />} onClick={() => setCoverDesignerOpen(true)}>
                设计封面
              </Button>
              {job.coverH1 && <Tag color="gold">{job.coverH1}</Tag>}
              {job.coverH2 && <Tag>{job.coverH2}</Tag>}
            </div>
          </div>
          {job.persona && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>人设</span>
              <span className={styles.metaValue}>{job.persona}</span>
            </div>
          )}
        </Card>
      </div>


      <Card
        className={styles.card}
        title={<span className={styles.cardTitle}>步骤执行详情</span>}
        style={{ marginTop: 16 }}
      >
        {(job.steps ?? []).map((s) => {
          const rj = s.resultJson ?? {}
          const lines = Object.entries(rj)
            .filter(([k]) => !['skippedAt', 'skip_reason'].includes(k))
            .map(([k, v]) => {
              const val = typeof v === 'string' ? v : JSON.stringify(v)
              return (
                <div key={k} className={styles.stepResultLine}>
                  <strong>{k}:</strong> {String(val).length > 220 ? String(val).slice(0, 220) + '…' : String(val)}
                </div>
              )
            })
          return (
            <div key={s.step} className={styles.stepResult}>
              <div className={styles.stepResultHead}>
                <span className={styles.stepResultName}>{STEP_LABELS[s.step] ?? s.step}</span>
                <Tag color={s.status === 'done' ? 'green' : s.status === 'failed' ? 'red' : s.status === 'running' ? 'blue' : 'default'}>
                  {s.status}
                </Tag>
                {s.retryCount > 0 && <Tag color="orange">重试 {s.retryCount} 次</Tag>}
              </div>
              {lines.length > 0 ? lines : <div className={styles.stepResultEmpty}>{s.status === 'pending' ? '等待执行' : '无产物'}</div>}
              {s.error && <div className={styles.errorBar}>错误：{s.error}</div>}
            </div>
          )
        })}
      </Card>

      <CoverDesigner
        jobId={jobId}
        videoUrl={job.videoUrl}
        coverUrl={job.coverUrl}
        coverH1={job.coverH1}
        coverH2={job.coverH2}
        open={coverDesignerOpen}
        onClose={() => setCoverDesignerOpen(false)}
        onSaved={(updated) => {
          setJob(updated)
          setLastJob(updated)
        }}
      />

      <Modal
        open={Boolean(pkg)}
        title="发布包已生成"
        onCancel={() => setPkg(null)}
        footer={[
          <Button key="copy" icon={<Copy size={14} />} onClick={() => void handleCopy()}>
            复制发布文案
          </Button>,
          <Button key="close" type="primary" onClick={() => setPkg(null)}>
            完成
          </Button>,
        ]}
      >
        {pkg && (
          <div className={styles.pkgBox}>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>主标题</span>
              <span className={styles.metaValue}>{pkg.title}</span>
            </div>
            {pkg.subtitle && (
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>副标题</span>
                <span className={styles.metaValue}>{pkg.subtitle}</span>
              </div>
            )}
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>发布描述</span>
              <p className={styles.metaText}>{pkg.description}</p>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>话题标签</span>
              <span className={styles.metaValue}>
                {pkg.topic_tags.map((t) => (
                  <Tag key={t} color="gold">
                    #{t}
                  </Tag>
                ))}
              </span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>建议发布时间</span>
              <span className={styles.metaValue}>
                {new Date(pkg.suggested_time).toLocaleString('zh-CN', { hour12: false })}
              </span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>目标平台</span>
              <span className={styles.metaValue}>{pkg.target_platforms.join(' / ')}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
