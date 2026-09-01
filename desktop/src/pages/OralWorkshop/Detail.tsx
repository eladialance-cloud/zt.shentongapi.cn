/**
 * 口播工坊 · 任务详情（M6-2）
 * 7 步进度条（2s 轮询） + 每步产物 + 成片预览/下载 + 导出发布包
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Input, Modal, Popconfirm, Radio, Select, Spin, Steps, Tag, Tooltip, message } from 'antd'
import {
  ArrowLeft,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  PackageOpen,
  Palette,
  PlayCircle,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  advanceOralWorkshopJob,
  cancelOralWorkshopJob,
  exportOralWorkshopPackage,
  getOralWorkshopJob,
  getPublishPackage,
  listPublishAccounts,
  importJobToMaterials,
  publishJob,
  writePublishResult,
} from '@/api/oral-workshop-api'
import { useOralWorkshopStore } from '@/store/oral-workshop'
import { useCreditsStore } from '@/store/credits'
import CoverDesigner from './CoverDesigner'
import { resolveMediaUrl } from '@/utils/media'
import {
  subtitleLangLabel,
  type OralWorkshopJob,
  type OralWorkshopStepStatus,
  type PublishAccount,
  type PublishPackage,
} from '@/types/oral-workshop'
import styles from './styles.module.css'

const { TextArea } = Input

/** 平台展示名（与工作台/账号页一致） */
export const PUBLISH_PLATFORM_NAMES: Record<string, string> = {
  douyin: '抖音',
  kuaishou: '快手',
  xiaohongshu: '小红书',
  bilibili: 'B站',
  weixin: '微信视频号',
}

/** 平台展示名（未收录回退平台码） */
function platformName(platform: string): string {
  return PUBLISH_PLATFORM_NAMES[platform] ?? platform
}

/** 账号登录态标记（F5：online/expired/offline） */
function accountLoginMark(a: PublishAccount): string {
  if (a.loginStatus === 'online') return ' ✓在线'
  if (a.loginStatus === 'expired') return ' ⚠️登录过期'
  if (a.loginStatus === 'offline') return ' · 离线'
  return ''
}

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

/** 发布状态（F5：create_publish_plans.publish_status） */
export const PUBLISH_STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'orange' },
  unpublish: { label: '未发布', color: 'default' },
  publishing: { label: '发布中', color: 'processing' },
  success: { label: '已发布', color: 'success' },
  failed: { label: '发布失败', color: 'error' },
  partial: { label: '部分成功', color: 'warning' },
}

export function publishStatusMeta(status: string | null): { label: string; color: string } {
  if (!status) return { label: '', color: 'default' }
  return PUBLISH_STATUS_META[status] ?? { label: status, color: 'default' }
}

export default function OralWorkshopDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const jobId = Number(id)
  const { setLastJob } = useOralWorkshopStore()
  const [job, setJob] = useState<OralWorkshopJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [pkg, setPkg] = useState<PublishPackage | null>(null)
  const [coverDesignerOpen, setCoverDesignerOpen] = useState(false)
  // F4a：发布账号
  const [accounts, setAccounts] = useState<PublishAccount[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
  const [publishing, setPublishing] = useState(false)
  // F5：发布方式（直接发布 / 保存为草稿）与发布模式（手动 / 后台执行）
  const [publishAsDraft, setPublishAsDraft] = useState(false)
  const [publishMode, setPublishMode] = useState<'manual' | 'auto'>('manual')
  const [publishTitle, setPublishTitle] = useState('')
  const [publishDescription, setPublishDescription] = useState('')
  const [aiTags, setAiTags] = useState<string[]>([])
  const [aiGenerating, setAiGenerating] = useState(false)
  const [publishResult, setPublishResult] = useState<{ type: 'success' | 'warning' | 'error'; summary: string } | null>(null)
  const [importingMaterials, setImportingMaterials] = useState(false)
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

  // F4a：加载发布账号（一次）
  useEffect(() => {
    void listPublishAccounts().then(setAccounts).catch(() => setAccounts([]))
  }, [])

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
      void useCreditsStore.getState().fetchBalance()
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

  /** 素材中心联动：把任务产物一键导入素材库 */
  const handleImportMaterials = async () => {
    if (!job) return
    setImportingMaterials(true)
    try {
      const res = await importJobToMaterials(job.id)
      message.success(res.imported > 0 ? '已导入 ' + res.imported + ' 个素材到素材库' : '素材已全部导入过（幂等跳过）')
    } catch (err) {
      const e = err as Error
      message.error('导入素材失败: ' + (e?.message ?? e))
    } finally {
      setImportingMaterials(false)
    }
  }

  /** F4a：发布任务到已绑定账号 */
  const handlePublish = async (asDraft = publishAsDraft) => {
    if (!selectedAccountIds.length) {
      message.warning('请先选择发布账号')
      return
    }
    const mode = asDraft ? 'draft' : publishMode
    setPublishing(true)
    setPublishResult(null)
    try {
      const res = await publishJob(jobId, {
        accountIds: selectedAccountIds,
        mode,
        title: publishTitle.trim() || undefined,
        description: publishDescription.trim() || undefined,
      })
      // 兼容新旧返回形状：planIds（新契约）/ planId（单账号旧版）
      const raw = res as unknown as {
        planIds?: number[]
        summary?: string
        planId?: number
        results?: Array<{ accountId: number; platform: string; status: string }>
      }
      const planIds = Array.isArray(raw.planIds) && raw.planIds.length ? raw.planIds : [raw.planId ?? res.planId]
      const allResults = raw.results ?? res.results ?? []
      const okCount = allResults.filter((r) => r.status === 'success').length
      const totalCount = selectedAccountIds.length

      if (asDraft) {
        setPublishResult({ type: 'success', summary: '已保存为草稿（未发布），可稍后一键正式发布' })
        message.success('已保存为草稿')
      } else {
        let type: 'success' | 'warning' | 'error' = 'error'
        if (okCount >= totalCount) type = 'success'
        else if (okCount > 0) type = 'warning'
        const summary = raw.summary ?? res.summary
        setPublishResult({ type, summary })
        if (type === 'success') message.success(summary)
        else if (type === 'warning') message.warning(summary)
        else message.error(summary)
        // 手动模式：逐个打开平台发布页 + 回写发布结果
        if (mode === 'manual') {
          const opener = (window as unknown as {
            electronAPI?: { platformAccount?: { openPublish?: (platform: string, opts: { title?: string; description?: string; tags?: string[] }) => Promise<void> } }
          }).electronAPI?.platformAccount?.openPublish
          for (let i = 0; i < selectedAccountIds.length; i++) {
            const acc = activeAccounts.find((a) => a.id === selectedAccountIds[i])
            if (!acc) continue
            try {
              if (opener) {
                await opener(acc.platform, {
                  title: publishTitle.trim() || undefined,
                  description: publishDescription.trim() || undefined,
                  tags: aiTags ?? [],
                })
              }
            } catch (err) {
              message.warning('打开平台发布页失败: ' + ((err as Error)?.message ?? err))
            }
            try {
              await writePublishResult(jobId, {
                planId: planIds[i] ?? planIds[0] ?? 0,
                results: [{ accountId: acc.id, platform: acc.platform, status: 'success' }],
              })
            } catch (err) {
              message.warning('发布结果回写失败: ' + ((err as Error)?.message ?? err))
            }
          }
        }
      }
      void load({ silent: true })
    } catch (err) {
      message.error('发布失败: ' + ((err as Error)?.message ?? err))
    } finally {
      setPublishing(false)
    }
  }

  /** F5：AI 生成发布标题/描述（getPublishPackage → 回填） */
  const handleAiGenerate = async () => {
    setAiGenerating(true)
    try {
      const ai = await getPublishPackage(jobId)
      setPublishTitle(ai.title || '')
      setPublishDescription(ai.description || '')
      setAiTags(ai.tags ?? [])
      message.success('已生成发布标题/描述，可修改后发布')
    } catch (err) {
      message.error('AI 生成失败: ' + ((err as Error)?.message ?? err))
    } finally {
      setAiGenerating(false)
    }
  }

  /** F6：导出草稿（标题/副标题/描述/视频链接 JSON 打包） */
  const handleExportDraft = () => {
    const draft = {
      title: job?.coverH1 || '',
      subtitle: job?.coverH2 || '',
      description: (job?.rewrittenScript || job?.scriptInput || '').slice(0, 500),
      videoUrl: job?.videoUrl ? resolveMediaUrl(job.videoUrl) : '',
      coverUrl: job?.coverUrl ? resolveMediaUrl(job.coverUrl) : '',
      createdAt: job?.createdAt,
    }
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'oral-workshop-draft-' + jobId + '.json'
    a.click()
    URL.revokeObjectURL(url)
    message.success('草稿已导出（JSON）')
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

  // F5：发布账号选项（仅展示已绑定账号）+ 小红书风控判定
  const activeAccounts = accounts.filter((a) => a.status === 'active')
  const hasRiskPlatform = activeAccounts.some((a) => selectedAccountIds.includes(a.id) && a.platform === 'xiaohongshu')

  const handleAdvance = async () => {
    setAdvancing(true)
    try {
      await advanceOralWorkshopJob(jobId)
      message.success('已放行下一步，正在执行…')
      await load({ silent: true })
    } catch (err) {
      const e = err as Error
      message.error('执行下一步失败: ' + (e?.message ?? e))
    } finally {
      setAdvancing(false)
    }
  }
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
              {job.publishStatus ? (
                <span className={styles.costTag}>
                  发布：<Tag color={publishStatusMeta(job.publishStatus).color}>{publishStatusMeta(job.publishStatus).label}</Tag>
                </span>
              ) : null}
              {job.creditsCost > 0 && <span className={styles.costTag}>实扣 {job.creditsCost} Credits</span>}
              {job.targetLang && job.targetLang !== 'zh' && (
                <span className={styles.costTag}>字幕：{subtitleLangLabel(job.targetLang)} 双语</span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.headActions}>
          {isRunning && job.executionMode !== 'auto' && job.waitingStep && (
            <Button
              type="primary"
              icon={<PlayCircle size={14} />}
              loading={advancing}
              onClick={() => void handleAdvance()}
              className={styles.primaryBtn}
            >
              执行下一步（{STEP_LABELS[job.waitingStep] ?? job.waitingStep}）
            </Button>
          )}
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
        {job.executionMode !== 'auto' && job.waitingStep && (
          <div className={styles.waitingBar}>
            手动/单步模式：等待执行「{STEP_LABELS[job.waitingStep] ?? job.waitingStep}」，点击右上角「执行下一步」继续
          </div>
        )}
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
              <Tooltip title="设计并保存后会覆盖流水线自动生成的封面（重新合成任务会再次自动生成）">
                <Button size="small" icon={<Palette size={13} />} onClick={() => setCoverDesignerOpen(true)}>
                  设计封面
                </Button>
              </Tooltip>
              {job.coverUrl && (
                <a href={resolveMediaUrl(job.coverUrl)} download="cover.png">
                  <Button size="small" icon={<Download size={13} />}>导出封面</Button>
                </a>
              )}
              <Button size="small" icon={<Download size={13} />} onClick={handleExportDraft}>
                导出草稿
              </Button>
              <Button size="small" icon={<PackageOpen size={13} />} loading={importingMaterials} onClick={() => void handleImportMaterials()}>
                导入素材库
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

      {job.status === 'done' && (
        <Card
          id="oral-publish-card"
          className={styles.card}
          title={<span className={styles.cardTitle}>发布到账号</span>}
          style={{ marginTop: 16 }}
        >
          {job.publishStatus === 'draft' && (
            <div className={styles.waitingBar} style={{ marginBottom: 12 }}>
              <Tag color="orange">草稿</Tag> 已保存为发布草稿，完善标题/描述后可一键正式发布
              <Button
                type="primary"
                size="small"
                icon={<Send size={13} />}
                loading={publishing}
                disabled={!selectedAccountIds.length}
                onClick={() => void handlePublish(false)}
                style={{ marginLeft: 10 }}
              >
                一键正式发布
              </Button>
            </div>
          )}
          {hasRiskPlatform && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="小红书发布风控提示"
              description="小红书对自动化发布限制严格，建议选择手动发布，发布后前往创作者中心确认。"
            />
          )}
          <div className={styles.publishFormRow}>
            <span className={styles.metaLabel} style={{ width: 72, flexShrink: 0 }}>发布账号</span>
            <div style={{ flex: 1, minWidth: 260 }}>
              <Select
                mode="multiple"
                placeholder="选择发布账号（可多选，仅展示已绑定账号）"
                style={{ width: '100%' }}
                value={selectedAccountIds}
                onChange={setSelectedAccountIds}
                options={activeAccounts.map((a) => ({
                  value: a.id,
                  label: platformName(a.platform) + ' ' + a.accountName + accountLoginMark(a),
                }))}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                未找到账号？
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, marginLeft: 4 }}
                  onClick={() => navigate('/oral-workshop/accounts')}
                >
                  去绑定账号 →
                </Button>
              </div>
            </div>
          </div>
          <div className={styles.publishFormRow}>
            <span className={styles.metaLabel} style={{ width: 72, flexShrink: 0 }}>发布方式</span>
            <div style={{ flex: 1 }}>
              <Radio.Group value={publishAsDraft} onChange={(e) => setPublishAsDraft(e.target.value as boolean)}>
                <Radio value={false}>直接发布</Radio>
                <Radio value={true}>保存为草稿</Radio>
              </Radio.Group>
              {!publishAsDraft && (
                <span style={{ marginLeft: 16 }}>
                  <Select
                    value={publishMode}
                    onChange={setPublishMode}
                    style={{ minWidth: 180 }}
                    options={[
                      { value: 'manual', label: '🖐️ 手动发布（默认）' },
                      { value: 'auto', label: '🌙 后台执行' },
                    ]}
                  />
                </span>
              )}
              {!publishAsDraft && publishMode === 'auto' && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  后台执行仅 B站 / 快手支持，其余平台请选择手动发布。
                </div>
              )}
            </div>
          </div>
          <div className={styles.publishFormRow}>
            <span className={styles.metaLabel} style={{ width: 72, flexShrink: 0 }}>标题描述</span>
            <div style={{ flex: 1 }}>
              <Input
                value={publishTitle}
                maxLength={50}
                placeholder="发布标题（可选，可 AI 生成或手动填写）"
                onChange={(e) => setPublishTitle(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <TextArea
                value={publishDescription}
                maxLength={500}
                showCount
                rows={3}
                placeholder="发布描述（可选，可 AI 生成）"
                onChange={(e) => setPublishDescription(e.target.value)}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button icon={<Sparkles size={14} />} loading={aiGenerating} onClick={() => void handleAiGenerate()}>
                  AI 生成
                </Button>
                <Button
                  type="primary"
                  icon={<Send size={14} />}
                  loading={publishing}
                  disabled={!selectedAccountIds.length}
                  onClick={() => void handlePublish(false)}
                >
                  {publishAsDraft ? '保存为草稿' : '发布'}
                </Button>
              </div>
            </div>
          </div>
          {publishResult && (
            <Alert
              type={publishResult.type}
              showIcon
              closable
              style={{ marginTop: 12 }}
              message={publishResult.summary}
              onClose={() => setPublishResult(null)}
            />
          )}
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            手动模式将在保存发布计划后打开平台发布页，由你确认后发布，并自动回写发布结果。
          </div>
        </Card>
      )}

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
        coverConfig={job.coverConfig}
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
          <Button
            key="goto"
            icon={<Send size={14} />}
            onClick={() => {
              setPkg(null)
              setTimeout(() => {
                document.getElementById('oral-publish-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 60)
            }}
          >
            前往发布
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
