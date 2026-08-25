/**
 * 口播工坊 · 创作工作台（多步骤向导，对标参考软件 UI）
 * ① 文案与选题（含学习对标-提取文案 / 选题灵感）
 * ② 人设与风格（IP 大脑预设 + 自定义）
 * ③ 配音（我的声音 / 上传成音）
 * ④ 数字人形象（我的形象 / 上传视频）
 * ⑤ 模板（卡片选择）+ 双语字幕
 * ⑥ 预览提交（汇总 → 创建任务 → 进入 7 步流水线）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Spin,
  Steps,
  Tag,
  Upload,
  message,
} from 'antd'
import {
  Clapperboard,
  Coins,
  FileText,
  Layers,
  Lightbulb,
  Mic,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload as UploadIcon,
  User,
  ExternalLink,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  ORAL_WORKSHOP_ESTIMATED_CREDITS,
  batchCreateOralWorkshopJobs,
  createMyDigitalHuman,
  createMyVoice,
  createOralWorkshopJob,
  deleteMyDigitalHuman,
  deleteMyVoice,
  extractScriptFromVideo,
  generateTopics,
  listMyDigitalHumans,
  listMyVoices,
  listOralWorkshopTemplates,
  getOralWorkshopMeta,
} from '@/api/oral-workshop-api'
import { uploadFile } from '@/api/file-api'
import { useOralWorkshopStore } from '@/store/oral-workshop'
import {
  SUBTITLE_LANG_OPTIONS,
  subtitleLangLabel,
  type DigitalHumanAsset,
  type OralWorkshopTemplateMeta,
  type TopicItem,
  type VoiceAsset,
  type VoicePoolItem,
} from '@/types/oral-workshop'
import styles from './styles.module.css'

const { TextArea } = Input

/** 媒体上传行：上传后回调 URL，可预览/清除 */
function MediaUploadRow(props: {
  label: string
  value?: string
  accept?: string
  onUpload: (url: string) => void
  onClear: () => void
}) {
  const { label, value, accept, onUpload, onClear } = props
  const customRequest = async (options: {
    file: File | Blob
    onProgress?: (e: { percent: number }) => void
    onSuccess?: (body: unknown) => void
    onError?: (err: Error) => void
  }) => {
    const file = options.file instanceof File ? options.file : new File([options.file], 'media')
    try {
      const res = await uploadFile(file, (percent) => options.onProgress?.({ percent }))
      onUpload(res.url)
      message.success(label + '上传成功')
      options.onSuccess?.(null)
    } catch (err) {
      message.error(label + '上传失败: ' + (err as Error).message)
      options.onError?.(err as Error)
    }
  }
  return (
    <div className={styles.uploadRow}>
      <span className={styles.uploadLabel}>{label}</span>
      <Upload accept={accept} showUploadList={false} customRequest={customRequest as never}>
        <Button size="small" icon={<UploadIcon size={13} />}>
          上传
        </Button>
      </Upload>
      {value ? (
        <>
          <a href={value} target="_blank" rel="noreferrer" className={styles.uploadValue}>
            {value.length > 44 ? value.slice(0, 44) + '…' : value}
          </a>
          <Button type="text" size="small" icon={<Trash2 size={12} />} onClick={onClear}>
            清除
          </Button>
        </>
      ) : (
        <span className={styles.uploadHint}>未上传</span>
      )}
    </div>
  )
}

/** IP 大脑预设人设（点击即选，可自定义覆盖） */
const PERSONA_PRESETS = [
  { label: '老板型 IP', value: '老板型IP：有格局、敢说真话，讲经营/行业真相' },
  { label: '避坑顾问型', value: '避坑顾问型IP：专业、务实，专注帮用户避坑' },
  { label: '知识干货型', value: '知识干货型IP：严谨专业，输出方法论与清单' },
  { label: '故事经验型', value: '故事经验型IP：以亲身经历切入，讲故事讲复盘' },
  { label: '轻松育娃型', value: '轻松育娃型IP：亲切温暖，分享育儿实操经验' },
]

export default function OralWorkshopWorkbench() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const { draft, setDraft } = useOralWorkshopStore()
  const [current, setCurrent] = useState(0)
  const [templates, setTemplates] = useState<OralWorkshopTemplateMeta[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 对标参考软件新增：我的声音 / 我的形象 / 上传素材 / 选题灵感 / 学习对标
  const [voices, setVoices] = useState<VoiceAsset[]>([])
  const [dhAssets, setDhAssets] = useState<DigitalHumanAsset[]>([])
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [videoUrl, setVideoUrl] = useState<string | undefined>()
  const [topicsOpen, setTopicsOpen] = useState(false)
  const [topicsKeywords, setTopicsKeywords] = useState('')
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [topics, setTopics] = useState<TopicItem[]>([])
  const [dhModalOpen, setDhModalOpen] = useState(false)
  const [dhForm] = Form.useForm()
  const [refAudioOpen, setRefAudioOpen] = useState(false)
  const [refAudioForm] = Form.useForm()
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchTopics, setBatchTopics] = useState('')
  const [batchTemplateIds, setBatchTemplateIds] = useState<number[]>([])
  const [batchVoiceIds, setBatchVoiceIds] = useState<number[]>([])
  const [batchVoiceVersion, setBatchVoiceVersion] = useState<'V1' | 'V2' | undefined>('V2')
  const [voicePool, setVoicePool] = useState<VoicePoolItem[]>([])
  const [pricing, setPricing] = useState<{ baseCredits: number; voiceV1: number; voiceV2: number; dhV1: number; dhV2: number }>({
    baseCredits: 5,
    voiceV1: 0,
    voiceV2: 0,
    dhV1: 0,
    dhV2: 0
  })
  const [batchDhIds, setBatchDhIds] = useState<number[]>([])
  const [batchSpeakerId, setBatchSpeakerId] = useState<string | undefined>()
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  // 学习对标（提取文案）
  const [benchmarkUrl, setBenchmarkUrl] = useState('')
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)

  useEffect(() => {
    void listOralWorkshopTemplates()
      .then(setTemplates)
      .catch((err: Error) => message.error('模板列表加载失败: ' + (err?.message ?? err)))
      .finally(() => setTemplatesLoading(false))
    void listMyVoices().then(setVoices).catch(() => setVoices([]))
    void listMyDigitalHumans().then(setDhAssets).catch(() => setDhAssets([]))
    void getOralWorkshopMeta()
      .then((meta) => {
        setVoicePool(meta.voicePool || [])
        setPricing(meta.pricing)
      })
      .catch(() => undefined)
  }, [])

  // 草稿回填（localStorage 持久化，仅在挂载时执行一次，避免与自动保存形成回环）
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    form.setFieldsValue({
      scriptInput: draft.scriptInput,
      goal: draft.goal,
      targetAudience: draft.targetAudience,
      style: draft.style,
      persona: draft.persona,
      templateId: draft.templateId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, draft])

  // 草稿自动保存：表单变化防抖 800ms 写入 localStorage（对标参考软件 autoSave）
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleDraftChange = (_changed: unknown, allValues: Record<string, unknown>) => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      setDraft({
        scriptInput: typeof allValues.scriptInput === 'string' ? allValues.scriptInput : '',
        goal: typeof allValues.goal === 'string' ? allValues.goal : '',
        targetAudience: typeof allValues.targetAudience === 'string' ? allValues.targetAudience : '',
        style: typeof allValues.style === 'string' ? allValues.style : '',
        persona: typeof allValues.persona === 'string' ? allValues.persona : '',
        templateId: typeof allValues.templateId === 'number' ? allValues.templateId : null,
      })
    }, 800)
  }

  const scriptChars = Form.useWatch('scriptInput', form)?.length ?? 0

  const handleTopics = async () => {
    if (!topicsKeywords.trim()) {
      message.warning('请输入选题关键词')
      return
    }
    setTopicsLoading(true)
    try {
      const persona = form.getFieldValue('persona') as string | undefined
      const list = await generateTopics({ keywords: topicsKeywords.trim(), persona, count: 5 })
      setTopics(list)
    } catch (err) {
      message.error('选题生成失败: ' + (err as Error).message)
    } finally {
      setTopicsLoading(false)
    }
  }

  const applyTopic = (topic: TopicItem) => {
    form.setFieldsValue({ scriptInput: topic.title })
    setTopicsOpen(false)
    setTopics([])
    setTopicsKeywords('')
  }

  /** 学习对标：从对标视频 URL 提取文案并回填 */
  const handleExtractScript = async () => {
    if (!benchmarkUrl.trim()) {
      message.warning('请输入对标视频链接')
      return
    }
    setBenchmarkLoading(true)
    try {
      const res = await extractScriptFromVideo(benchmarkUrl.trim())
      form.setFieldsValue({ scriptInput: res.text })
      message.success('文案提取成功，已填入文案（可继续修改）')
    } catch (err) {
      message.error('提取失败: ' + (err as Error).message)
    } finally {
      setBenchmarkLoading(false)
    }
  }

  const addRefAudio = async () => {
    const values = (await refAudioForm.validateFields()) as { name: string; refAudioUrl: string }
    try {
      await createMyVoice({ name: values.name, refAudioUrl: values.refAudioUrl })
      message.success('声音已添加')
      setRefAudioOpen(false)
      refAudioForm.resetFields()
      const list = await listMyVoices()
      setVoices(list)
    } catch (err) {
      message.error('添加声音失败: ' + (err as Error).message)
    }
  }

  const addDigitalHuman = async () => {
    const values = (await dhForm.validateFields()) as { name: string; cloudId: string }
    try {
      await createMyDigitalHuman({ name: values.name, cloudId: values.cloudId })
      message.success('形象已添加')
      setDhModalOpen(false)
      dhForm.resetFields()
      const list = await listMyDigitalHumans()
      setDhAssets(list)
    } catch (err) {
      message.error('添加形象失败: ' + (err as Error).message)
    }
  }

  const batchTopicCount = batchTopics.split('\n').map((s) => s.trim()).filter(Boolean).length
  const batchEstimated =
    batchTopicCount * (batchTemplateIds.length || 1) * (batchVoiceIds.length || 1) * (batchDhIds.length || 1)

  const handleBatchSubmit = async () => {
    const topics = batchTopics.split('\n').map((s) => s.trim()).filter(Boolean)
    if (topics.length === 0) {
      message.warning('请先粘贴文案列表（每行一条）')
      return
    }
    if (batchEstimated > 50) {
      message.warning('组合数超过 50，请减少文案/模板/声音/形象的组合')
      return
    }
    setBatchSubmitting(true)
    try {
      const res = await batchCreateOralWorkshopJobs({
        topics,
        goal: form.getFieldValue('goal') as string | undefined,
        targetAudience: form.getFieldValue('targetAudience') as string | undefined,
        style: form.getFieldValue('style') as string | undefined,
        persona: form.getFieldValue('persona') as string | undefined,
        templateIds: batchTemplateIds.length ? batchTemplateIds : undefined,
        voiceIds: batchVoiceIds.length ? batchVoiceIds : undefined,
        digitalHumanIds: batchDhIds.length ? batchDhIds : undefined,
      voiceModelVersion: batchVoiceVersion || undefined,
      speakerId: batchSpeakerId || undefined,
        batchTxnId: 'ow-batch-' + Date.now(),
      })
      if (res.skipped > 0) {
        message.warning('批量完成：成功 ' + res.created.length + ' 单，失败 ' + res.skipped + ' 单，详见任务列表')
      } else {
        message.success('批量创建 ' + res.created.length + ' 个任务成功')
      }
      setBatchOpen(false)
      setBatchTopics('')
      setBatchTemplateIds([])
      setBatchVoiceIds([])
      setBatchDhIds([])
      navigate('/oral-workshop')
    } catch (err) {
      message.error('批量创建失败: ' + (err as Error).message)
    } finally {
      setBatchSubmitting(false)
    }
  }

  const handleSubmit = async (values: {
    scriptInput: string
    goal?: string
    targetAudience?: string
    style?: string
    persona?: string
    templateId?: number
    voiceId?: number
    speakerId?: string
    digitalHumanId?: number
    voiceModelVersion?: 'V1' | 'V2'
    targetLang?: string
    executionMode?: 'auto' | 'manual' | 'single'
  }) => {
    setSubmitting(true)
    const targetLang = values.targetLang && values.targetLang !== 'zh' ? values.targetLang : undefined
    try {
      const job = await createOralWorkshopJob({
        scriptInput: values.scriptInput,
        goal: values.goal,
        targetAudience: values.targetAudience,
        style: values.style,
        persona: values.persona,
        templateId: values.templateId ?? undefined,
        voiceId: values.voiceId,
        speakerId: values.speakerId,
        digitalHumanId: values.digitalHumanId,
        voiceModelVersion: values.voiceModelVersion ?? 'V2',
        audioUrl,
        videoUrl,
        bilingual: !!targetLang,
        targetLang,
        executionMode: values.executionMode ?? 'auto',
        clientTxnId: 'ow-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      })
      setDraft({
        scriptInput: values.scriptInput,
        goal: values.goal ?? '',
        targetAudience: values.targetAudience ?? '',
        style: values.style ?? '',
        persona: values.persona ?? '',
        templateId: values.templateId ?? null,
      })
      message.success('任务已创建，进入详情页跟踪 7 步流水线')
      navigate('/oral-workshop/' + job.id)
    } catch (err) {
      const e = err as Error
      message.error('创建失败: ' + (e?.message ?? e))
    } finally {
      setSubmitting(false)
    }
  }

  const steps = useMemo(
    () => [
      { title: '文案与选题', icon: <FileText size={15} /> },
      { title: '人设与风格', icon: <User size={15} /> },
      { title: '配音', icon: <Mic size={15} /> },
      { title: '数字人形象', icon: <Clapperboard size={15} /> },
      { title: '模板', icon: <Layers size={15} /> },
      { title: '预览提交', icon: <Send size={15} /> },
    ],
    []
  )

  const selectedTemplate = templates.find((t) => Number(t.template_id.replace(/^t/, '')) === form.getFieldValue('templateId'))
  const summary = {
    script: (form.getFieldValue('scriptInput') as string) ?? '',
    persona: (form.getFieldValue('persona') as string) ?? '',
    audience: (form.getFieldValue('targetAudience') as string) ?? '',
    style: (form.getFieldValue('style') as string) ?? '',
    voice: voices.find((v) => v.id === form.getFieldValue('voiceId'))?.name,
    dh: dhAssets.find((d) => d.id === form.getFieldValue('digitalHumanId'))?.name,
    template: selectedTemplate?.name,
  }

  const goNext = async () => {
    if (current === 0 && scriptChars === 0) {
      message.warning('请先填写口播文案（可选题灵感 / 学习对标生成）')
      return
    }
    setCurrent((c) => Math.min(c + 1, steps.length - 1))
  }
  const goPrev = () => setCurrent((c) => Math.max(c - 1, 0))

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}>
            <Mic size={17} strokeWidth={2} />
          </span>
          <div>
            <h1 className={styles.title}>口播工坊</h1>
            <div className={styles.subtitle}>多步骤创作 · 文案 → 人设 → 配音 → 形象 → 模板 → 成片</div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button icon={<Lightbulb size={14} />} onClick={() => setTopicsOpen(true)}>
            选题灵感
          </Button>
          <Button icon={<Layers size={14} />} onClick={() => setBatchOpen(true)}>
            批量生成
          </Button>
        </div>
      </header>

      <div className={styles.wizardNav}>
        <Steps
          current={current}
          items={steps.map((s) => ({
            title: s.title,
            icon: s.icon,
          }))}
          size="small"
        />
      </div>

      <Card className={styles.card} bodyStyle={{ padding: 20 }}>
        {/* ① 文案与选题 */}
        {current === 0 && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>
              <FileText size={15} /> 口播文案 / 选题
            </div>
            <div className={styles.extractRow}>
              <Input
                placeholder="学习对标：粘贴对标视频链接（抖音/快手/B站…）自动提取文案"
                value={benchmarkUrl}
                maxLength={512}
                onChange={(e) => setBenchmarkUrl(e.target.value)}
                onPressEnter={() => void handleExtractScript()}
                prefix={<ExternalLink size={13} />}
              />
              <Button loading={benchmarkLoading} onClick={() => void handleExtractScript()}>
                提取文案
              </Button>
              <Button type="dashed" icon={<Lightbulb size={13} />} onClick={() => setTopicsOpen(true)}>
                选题灵感
              </Button>
            </div>
            <Form.Item name="scriptInput" rules={[{ required: true, message: '请输入口播文案或选题' }]}>
              <TextArea
                rows={10}
                maxLength={20000}
                placeholder="粘贴您的文案或选题，例如：3 个让你效率翻倍的 AI 技巧…"
                showCount
              />
            </Form.Item>
            <div className={styles.panelHint}>支持直接粘贴文案，或通过「选题灵感 / 学习对标」一键生成。</div>
          </div>
        )}

        {/* ② 人设与风格 */}
        {current === 1 && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>
              <User size={15} /> IP 大脑 · 人设与风格
            </div>
            <div className={styles.presetGrid}>
              {PERSONA_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={
                    styles.presetChip +
                    (form.getFieldValue('persona') === p.value ? ' ' + styles.presetChipActive : '')
                  }
                  onClick={() => form.setFieldsValue({ persona: p.value })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Form.Item name="persona" label="人设（可自定义覆盖预设）">
              <Input placeholder="如：资深 AI 产品经理，犀利点评行业真相" maxLength={512} />
            </Form.Item>
            <div className={styles.formRow}>
              <Form.Item name="targetAudience" label="目标受众（可选）" className={styles.formCol}>
                <Input placeholder="如：职场新人 / 宝妈 / 创业者" maxLength={255} />
              </Form.Item>
              <Form.Item name="style" label="口播风格（可选）" className={styles.formCol}>
                <Input placeholder="如：口语化、有网感、干货型" maxLength={512} />
              </Form.Item>
            </div>
            <Form.Item name="goal" label="创作目标（可选）">
              <Input placeholder="如：涨粉 / 带货 / 知识科普" maxLength={2000} />
            </Form.Item>
          </div>
        )}

        {/* ③ 配音 */}
        {current === 2 && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>
              <Mic size={15} /> 配音
            </div>
                            <Form.Item name="voiceModelVersion" label="配音音质" initialValue="V2" extra="V1=标准（快、省）；V2=高清（更自然，默认）">
                  <Select
                    options={[
                      { value: 'V1', label: 'V1（标准）' },
                      { value: 'V2', label: 'V2（高清）' }
                    ]}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item name="speakerId" label="官方音色（seed-tts-2.0 音色池）" extra={voicePool.length ? `共 ${voicePool.length} 个官方音色（管理后台维护）` : '管理后台未配置音色池，可手输音色 ID'}>
              <Select
                placeholder="选择官方音色（留空=用 V1/V2 档默认音色）"
                allowClear
                showSearch
                optionFilterProp="label"
                options={[
                  ...voicePool.map((v) => ({
                    value: v.speakerId,
                    label: (v.name ? v.name + '（' + v.speakerId + '）' : v.speakerId) + (v.resourceId && v.resourceId !== 'seed-tts-2.0' ? ' [' + v.resourceId + ']' : '')
                  })),
                  ...(form.getFieldValue('speakerId') && !voicePool.some((v) => v.speakerId === form.getFieldValue('speakerId'))
                    ? [{ value: form.getFieldValue('speakerId') as string, label: form.getFieldValue('speakerId') as string }]
                    : [])
                ]}
              />
            </Form.Item>
            <Form.Item name="voiceId" label="我的声音（火山克隆）">
              <Select
                placeholder="选择克隆声音（留空=预设/系统语音/上传成音）"
                allowClear
                options={voices.map((v) => ({ value: v.id, label: v.name + (v.speakerId ? ' ✓' : '') }))}
              />
            </Form.Item>
            <div className={styles.assetActions}>
              <Button size="small" type="dashed" icon={<Plus size={12} />} onClick={() => setRefAudioOpen(true)}>
                添加参考音频（我的声音）
              </Button>
              {voices.some((v) => v.id === form.getFieldValue('voiceId')) && (
                <Button
                  size="small"
                  type="text"
                  danger
                  onClick={async () => {
                    const vid = form.getFieldValue('voiceId') as number
                    await deleteMyVoice(vid).catch(() => undefined)
                    setVoices(await listMyVoices().catch(() => []))
                    form.setFieldValue('voiceId', undefined)
                  }}
                >
                  删除当前声音
                </Button>
              )}
            </div>
            <div className={styles.uploadGroup}>
              <MediaUploadRow
                label="上传成音"
                accept="audio/*"
                value={audioUrl}
                onUpload={setAudioUrl}
                onClear={() => setAudioUrl(undefined)}
              />
            </div>
            <div className={styles.panelHint}>未配置火山克隆时自动使用上传成音或本地语音兜底。</div>
            <div className={styles.panelHint}>
              预计消耗：基础 {pricing.baseCredits} + 配音 {form.getFieldValue('voiceModelVersion') === 'V1' ? pricing.voiceV1 : pricing.voiceV2}
              = {pricing.baseCredits + (form.getFieldValue('voiceModelVersion') === 'V1' ? pricing.voiceV1 : pricing.voiceV2)} 积分（数字人档位在下一步另行计费）
            </div>
          </div>
        )}

        {/* ④ 数字人形象 */}
        {current === 3 && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>
              <Clapperboard size={15} /> 数字人形象
            </div>
            <Form.Item name="digitalHumanId" label="我的形象（火山数字人）">
              <Select
                placeholder="选择数字人形象（留空=上传视频/卡片兜底）"
                allowClear
                options={dhAssets.map((d) => ({ value: d.id, label: d.name + (d.authorized ? '' : '（未授权）') }))}
              />
            </Form.Item>
            <div className={styles.assetActions}>
              <Button size="small" type="dashed" icon={<Plus size={12} />} onClick={() => setDhModalOpen(true)}>
                添加形象 ID
              </Button>
              {dhAssets.some((d) => d.id === form.getFieldValue('digitalHumanId')) && (
                <Button
                  size="small"
                  type="text"
                  danger
                  onClick={async () => {
                    const did = form.getFieldValue('digitalHumanId') as number
                    await deleteMyDigitalHuman(did).catch(() => undefined)
                    setDhAssets(await listMyDigitalHumans().catch(() => []))
                    form.setFieldValue('digitalHumanId', undefined)
                  }}
                >
                  删除当前形象
                </Button>
              )}
            </div>
            <div className={styles.uploadGroup}>
              <MediaUploadRow
                label="上传数字人/绿幕视频"
                accept="video/*"
                value={videoUrl}
                onUpload={setVideoUrl}
                onClear={() => setVideoUrl(undefined)}
              />
            </div>
            <div className={styles.panelHint}>未配置火山数字人时自动使用上传视频或本地卡片兜底。</div>
          </div>
        )}

        {/* ⑤ 模板 */}
        {current === 4 && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>
              <Layers size={15} /> 视频模板
            </div>
            {templatesLoading ? (
              <div className={styles.templateLoading}>
                <Spin /> 模板加载中…
              </div>
            ) : (
              <div className={styles.templateGrid}>
                {templates.map((t) => {
                  const id = Number(t.template_id.replace(/^t/, ''))
                  const active = form.getFieldValue('templateId') === id
                  return (
                    <div
                      key={t.template_id}
                      className={styles.templateCard + (active ? ' ' + styles.templateCardActive : '')}
                      onClick={() => form.setFieldsValue({ templateId: active ? undefined : id })}
                    >
                      <div className={styles.templateCardName}>{t.name}</div>
                      <div className={styles.templateCardMeta}>
                        {t.width}x{t.height} · {t.duration}s
                      </div>
                      {t.description && <div className={styles.templateCardDesc}>{t.description}</div>}
                      {active && <Tag color="blue" className={styles.templateCardTag}>已选</Tag>}
                    </div>
                  )
                })}
              </div>
            )}
            <Form.Item
              name="targetLang"
              label="字幕语言"
              tooltip="仅中文=单语字幕；选择英语或其他语言/方言=LLM 翻译渲染双语对照字幕（对标参考软件 30 种语言 + 9 种方言）"
            >
              <Select
                placeholder="仅中文（默认）"
                options={SUBTITLE_LANG_OPTIONS}
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </div>
        )}

        {/* ⑥ 预览提交 */}
        {current === 5 && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>
              <Send size={15} /> 预览与提交
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>口播文案</span>
                <span className={styles.summaryValue}>
                  {summary.script ? summary.script.slice(0, 120) + (summary.script.length > 120 ? '…' : '') : '—'}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>人设</span>
                <span className={styles.summaryValue}>{summary.persona || '—'}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>受众 / 风格</span>
                <span className={styles.summaryValue}>
                  {summary.audience || '—'} / {summary.style || '—'}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>配音</span>
                <span className={styles.summaryValue}>{summary.voice || (audioUrl ? '上传成音' : '系统默认')}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>数字人</span>
                <span className={styles.summaryValue}>{summary.dh || (videoUrl ? '上传视频' : '系统兜底')}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>模板</span>
                <span className={styles.summaryValue}>{summary.template || '默认模板'}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>字幕</span>
                <span className={styles.summaryValue}>{subtitleLangLabel(form.getFieldValue('targetLang'))}</span>
              </div>
            </div>
            <div className={styles.execModeRow}>
              <Form.Item
                name="executionMode"
                label="执行模式"
                initialValue="auto"
                tooltip="自动=创建后流水线全自动执行；手动=每步完成后等待您点击「执行下一步」；单步=只执行当前一步"
              >
                <Radio.Group
                  options={[
                    { value: 'auto', label: '自动执行' },
                    { value: 'manual', label: '手动逐步' },
                    { value: 'single', label: '单步执行' },
                  ]}
                  optionType="button"
                  buttonStyle="solid"
                />
              </Form.Item>
            </div>
            <div className={styles.submitRow}>
              <div className={styles.estimate}>
                <Coins size={14} />
                <span>预估扣费</span>
                <Tag color="gold">{ORAL_WORKSHOP_ESTIMATED_CREDITS} Credits</Tag>
                <span className={styles.estimateHint}>预扣后按实际结算，失败自动退还</span>
              </div>
              <Button
                type="primary"
                htmlType="submit"
                icon={<Send size={15} />}
                loading={submitting}
                disabled={scriptChars === 0}
                className={styles.primaryBtn}
              >
                生成口播视频
              </Button>
            </div>
          </div>
        )}

        {/* 底部导航 */}
        <div className={styles.wizardFooter}>
          <Button disabled={current === 0} onClick={goPrev}>
            上一步
          </Button>
          {current < steps.length - 1 ? (
            <Button type="primary" onClick={() => void goNext()}>
              下一步
            </Button>
          ) : (
            <Button
              type="primary"
              htmlType="submit"
              icon={<Sparkles size={14} />}
              loading={submitting}
              onClick={() => void form.submit()}
            >
              生成口播视频
            </Button>
          )}
        </div>
      </Card>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={handleDraftChange}
        style={{ display: 'none' }}
      />

      {/* 选题灵感弹窗 */}
      <Modal
        open={topicsOpen}
        title="选题灵感（关键词选题）"
        onCancel={() => setTopicsOpen(false)}
        footer={null}
        width={560}
      >
        <div className={styles.topicInputRow}>
          <Input
            placeholder="输入行业/关键词，如：AI 工具、副业、家庭教育…"
            value={topicsKeywords}
            maxLength={200}
            onChange={(e) => setTopicsKeywords(e.target.value)}
            onPressEnter={() => void handleTopics()}
          />
          <Button type="primary" loading={topicsLoading} onClick={() => void handleTopics()}>
            生成选题
          </Button>
        </div>
        <div className={styles.topicList}>
          {topics.map((t, i) => (
            <div key={i} className={styles.topicItem} onClick={() => applyTopic(t)}>
              <div className={styles.topicTitle}>{t.title}</div>
              <div className={styles.topicMeta}>
                {t.persona_angle ? <Tag>人设角度：{t.persona_angle}</Tag> : null}
                {t.hook ? <Tag color="blue">钩子：{t.hook}</Tag> : null}
                {t.viral_logic ? <Tag color="green">{t.viral_logic}</Tag> : null}
              </div>
            </div>
          ))}
          {!topicsLoading && topics.length === 0 && (
            <div className={styles.topicEmpty}>输入关键词后点击「生成选题」，点击选题自动填入文案</div>
          )}
        </div>
      </Modal>

      {/* 添加参考音频弹窗 */}
      <Modal
        open={refAudioOpen}
        title="添加参考音频（我的声音）"
        onCancel={() => setRefAudioOpen(false)}
        onOk={() => void addRefAudio()}
      >
        <Form form={refAudioForm} layout="vertical">
          <Form.Item name="name" label="声音名称" rules={[{ required: true, message: '请输入声音名称' }]}>
            <Input placeholder="如：我的带货声线" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="refAudioUrl"
            label="参考音频 URL（先在上方上传成音，把得到的链接粘到这里；建议 10-60 秒清晰人声）"
            rules={[{ required: true, message: '请输入参考音频 URL' }]}
          >
            <Input placeholder="https://…/ref.mp3" maxLength={512} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加形象 ID 弹窗 */}
      <Modal
        open={dhModalOpen}
        title="添加数字人形象"
        onCancel={() => setDhModalOpen(false)}
        onOk={() => void addDigitalHuman()}
      >
        <Form form={dhForm} layout="vertical">
          <Form.Item name="name" label="形象名称" rules={[{ required: true, message: '请输入形象名称' }]}>
            <Input placeholder="如：主播小美" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="cloudId"
            label="火山数字人形象 ID"
            rules={[{ required: true, message: '请输入火山形象 ID' }]}
          >
            <Input placeholder="如：5f6a9e3c…" maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量生成弹窗 */}
      <Modal
        open={batchOpen}
        title="批量生成（文案 × 模板 × 声音 × 形象 矩阵）"
        onCancel={() => setBatchOpen(false)}
        onOk={() => void handleBatchSubmit()}
        okText="开始批量生成"
        confirmLoading={batchSubmitting}
        width={680}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>文案列表（每行一条）</div>
          <TextArea
            rows={6}
            placeholder={'第一行\n第二行\n第三行'}
            value={batchTopics}
            maxLength={20000}
            onChange={(e) => setBatchTopics(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>模板（可多选）</div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="留空 = 全部模板"
            value={batchTemplateIds}
            onChange={setBatchTemplateIds}
            options={templates.map((t) => ({
              value: Number(t.template_id.replace(/^t/, '')),
              label: t.name,
            }))}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>声音（可多选）</div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="留空 = 默认声音"
            value={batchVoiceIds}
            onChange={setBatchVoiceIds}
            options={voices.map((v) => ({ value: v.id, label: v.name }))}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>配音音质</div>
          <Select
            style={{ width: '100%' }}
            placeholder="留空 = 后台默认"
            value={batchVoiceVersion}
            onChange={setBatchVoiceVersion}
            options={[
              { value: 'V1', label: 'V1（标准）' },
              { value: 'V2', label: 'V2（高清）' },
            ]}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>官方音色（可选，覆盖档位默认音色）</div>
          <Select
            style={{ width: '100%' }}
            placeholder="选择官方音色 = 批量统一用该音色"
            allowClear
            showSearch
            optionFilterProp="label"
            value={batchSpeakerId}
            onChange={setBatchSpeakerId}
            options={voicePool.map((v) => ({
              value: v.speakerId,
              label: (v.name ? v.name + '（' + v.speakerId + '）' : v.speakerId) + (v.resourceId && v.resourceId !== 'seed-tts-2.0' ? ' [' + v.resourceId + ']' : '')
            }))}
          />
        </div>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>数字人形象（可多选）</div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="留空 = 默认形象"
            value={batchDhIds}
            onChange={setBatchDhIds}
            options={dhAssets.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        <div style={{ marginTop: 12, color: '#888' }}>
          组合数：{batchEstimated}（超过 50 将被拦截）
        </div>
      </Modal>
    </div>
  )
}