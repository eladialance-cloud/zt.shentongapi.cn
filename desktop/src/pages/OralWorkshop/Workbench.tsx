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
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Slider,
  Spin,
  Steps,
  Switch,
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
  Scissors,
  ArrowDown,
  ArrowUp,
  Music2,
  Video,
  Wand2,
  RefreshCw,
  CheckCircle2,
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
  analyzeStyle,
  extractScriptFromVideo,
  extractFileFromUpload,
  generateScript,
  generateTopics,
  productCopy,
  rewriteScript,
  trimMedia,
  listMyDigitalHumans,
  listMyVoices,
  listOralWorkshopTemplates,
  getOralWorkshopMeta,
  uploadDigitalHumanVideo,
  listPublishAccounts,
  createPublishAccount,
  bindPublishAccount,
  listPublishPlatforms,
} from '@/api/oral-workshop-api'
import { uploadFile } from '@/api/file-api'
import { resolveMediaUrl } from '@/utils/media'
import { useOralWorkshopStore } from '@/store/oral-workshop'
import { useCreditsStore } from '@/store/credits'
import {
  SUBTITLE_LANG_OPTIONS,
  subtitleLangLabel,
  type DigitalHumanAsset,
  type OralWorkshopTemplateMeta,
  type StyleAnalysisResult,
  type TopicItem,
  type VoiceAsset,
  type VoicePoolItem,
  type BgmLibraryItem,
  type PersonaPreset,
  type PublishAccount,
  type PublishPlatformItem,
  type RecentJobPreview,
  type PipAssetInput,
} from '@/types/oral-workshop'
import styles from './styles.module.css'

const { TextArea } = Input

/** 媒体上传行：上传后回调 URL，带格式校验 + 内联预览（音频/视频/图片） */
function MediaUploadRow(props: {
  label: string
  value?: string
  accept?: string
  onUpload: (url: string) => void
  onClear: () => void
}) {
  const { label, value, accept, onUpload, onClear } = props
  const previewKind: 'audio' | 'video' | 'image' | 'auto' = accept?.includes('video')
    ? 'video'
    : accept?.includes('audio')
      ? 'audio'
      : accept?.includes('image')
        ? 'image'
        : 'auto'
  const customRequest = async (options: {
    file: File | Blob
    onProgress?: (e: { percent: number }) => void
    onSuccess?: (body: unknown) => void
    onError?: (err: Error) => void
  }) => {
    const file = options.file instanceof File ? options.file : new File([options.file], 'media')
    // 格式校验：按 accept 声明（audio/*、video/*、image/* 或扩展名）校验，不匹配直接拒绝
    const acceptList = (accept ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (acceptList.length > 0) {
      const ftype = (file.type || '').toLowerCase()
      const fname = (file.name || '').toLowerCase()
      const fExt = fname.includes('.') ? '.' + fname.split('.').pop() : ''
      const typeOk = acceptList.some((a) => {
        if (a === 'audio/*') return ftype.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|opus|webm)$/.test(fExt)
        if (a === 'video/*') return ftype.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|flv|m3u8|ts)$/.test(fExt)
        if (a === 'image/*') return ftype.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fExt)
        if (a.startsWith('.')) return fExt === a
        if (a.endsWith('/*')) return ftype.startsWith(a.slice(0, -1))
        return ftype.includes(a) || fname.includes(a)
      })
      if (!typeOk) {
        message.error(label + '：文件格式不符合要求（' + accept + '），请重新选择')
        options.onError?.(new Error('invalid file type'))
        return
      }
    }
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
  const previewUrl = value ? resolveMediaUrl(value) : ''
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
          {previewKind === 'audio' && <audio className={styles.uploadPreview} src={previewUrl} controls preload="none" />}
          {previewKind === 'video' && <video className={styles.uploadPreview} src={previewUrl} controls preload="metadata" />}
          {previewKind === 'image' && <img className={styles.uploadPreview} src={previewUrl} alt={label} />}
          <a href={previewUrl} target="_blank" rel="noreferrer" className={styles.uploadValue}>
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

/** C3：把录音 Blob（webm/opus）解码重编码为 16bit PCM WAV（火山声音复刻兼容格式） */
async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer()
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx()
  const decoded = await ctx.decodeAudioData(arrayBuf)
  const rate = 24000
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate)
  const srcNode = offline.createBufferSource()
  srcNode.buffer = decoded
  srcNode.connect(offline.destination)
  srcNode.start(0)
  const rendered = await offline.startRendering()
  const ch = rendered.getChannelData(0)
  const bytesPerSample = 2
  const wavBytes = ch.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + wavBytes)
  const view = new DataView(buffer)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + wavBytes, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, wavBytes, true)
  for (let i = 0; i < ch.length; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** 人设预设兜底（B1：管理后台维护，工作台加载 meta 后覆盖；后台未配置时用这组默认值） */
const DEFAULT_PERSONA_PRESETS: PersonaPreset[] = [
  { label: '老板型 IP', value: '老板型IP：有格局、敢说真话，讲经营/行业真相' },
  { label: '避坑顾问型', value: '避坑顾问型IP：专业、务实，专注帮用户避坑' },
  { label: '知识干货型', value: '知识干货型IP：严谨专业，输出方法论与清单' },
  { label: '故事经验型', value: '故事经验型IP：以亲身经历切入，讲故事讲复盘' },
  { label: '轻松育娃型', value: '轻松育娃型IP：亲切温暖，分享育儿实操经验' },
]

/** 画中画位置选项（P3 D4/E6：数字人/模板步骤可叠加的图片/视频素材） */
const PIP_POSITION_OPTIONS = [
  { value: 'tl', label: '左上' },
  { value: 'tr', label: '右上' },
  { value: 'bl', label: '左下' },
  { value: 'br', label: '右下' },
  { value: 'center', label: '居中' },
]
const PIP_POSITION_LABELS: Record<string, string> = {
  tl: '左上',
  tr: '右上',
  bl: '左下',
  br: '右下',
  center: '居中',
}

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
  const [styleAnalysisOpen, setStyleAnalysisOpen] = useState(false)
  const [styleAnalysisLoading, setStyleAnalysisLoading] = useState(false)
  const [styleAnalysisResult, setStyleAnalysisResult] = useState<StyleAnalysisResult | null>(null)
  const [styleTopicGenerating, setStyleTopicGenerating] = useState<number | null>(null)
  const [topicsOpen, setTopicsOpen] = useState(false)
  const [topicsKeywords, setTopicsKeywords] = useState('')
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [topics, setTopics] = useState<TopicItem[]>([])
  /** 本轮已生成过的选题标题（再次生成时自动排除，对标参考软件「排除选题」） */
  const [generatedTopics, setGeneratedTopics] = useState<string[]>([])
  const [topicGenerating, setTopicGenerating] = useState<number | null>(null)
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
  // B1：人设预设（管理后台维护，meta 加载后覆盖）
  const [personaPresets, setPersonaPresets] = useState<PersonaPreset[]>(DEFAULT_PERSONA_PRESETS)
  // E3：BGM 库（管理后台维护）
  const [bgmLibrary, setBgmLibrary] = useState<BgmLibraryItem[]>([])
  // F2：最近成片预览（预览提交步骤展示）
  const [recentJob, setRecentJob] = useState<RecentJobPreview | null>(null)
  // A2：选题输入补维度（行业/产品 + 产品卖点）
  const [topicsIndustry, setTopicsIndustry] = useState('')
  const [topicsSellingPoints, setTopicsSellingPoints] = useState('')
  // A4：智能改写弹窗
  const [rewriteOpen, setRewriteOpen] = useState(false)
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteTemplate, setRewriteTemplate] = useState<'rewrite_master' | 'generic_rewrite' | 'rewrite_detailed' | 'rewrite_deep_learn'>('rewrite_master')
  const [rewriteWordCount, setRewriteWordCount] = useState(260)
  const [rewriteReference, setRewriteReference] = useState('')
const [rewriteOriginal, setRewriteOriginal] = useState('')
const [rewriteResult, setRewriteResult] = useState<string | null>(null)
  // A5：产品/营销文案弹窗
  const [productCopyOpen, setProductCopyOpen] = useState(false)
  const [productCopyLoading, setProductCopyLoading] = useState(false)
  const [pcProductName, setPcProductName] = useState('')
  const [pcSellingPoints, setPcSellingPoints] = useState('')
  // A3：上传本地音视频提取文案
  const [extractFileLoading, setExtractFileLoading] = useState(false)
  // C2：参考音频/视频裁剪弹窗
  const [trimOpen, setTrimOpen] = useState(false)
  const [trimLoading, setTrimLoading] = useState(false)
  const [trimSourceUrl, setTrimSourceUrl] = useState('')
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(30)
  // A6：参考范文（AI 生成/改写时学习风格）
  const [referenceText, setReferenceText] = useState('')
  // C3：录音采集（MediaRecorder → WAV → 上传为参考音频，对标参考软件「点击开始录音」）
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const recordingSupported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // D4/E6：画中画素材（图片/视频 + 位置/缩放/时间段，最多 4 个）
  const [pipItems, setPipItems] = useState<PipAssetInput[]>([])
  const [pipOpen, setPipOpen] = useState(false)
  const [pipForm] = Form.useForm()
  // D6：数字人生成方式（自动 / 云端火山 / 本地卡片）
  const [dhGenerationMode, setDhGenerationMode] = useState<'auto' | 'cloud' | 'local'>('auto')
  // D3：多镜头（[{digitalHumanId, seconds}]，长度>1 时后端多镜头拼接）
  const [shots, setShots] = useState<Array<{ digitalHumanId?: number; seconds: number }>>([])
  // D2：上传视频建形象（服务端 ffmpeg 转码中）
  const [dhVideoUploading, setDhVideoUploading] = useState(false)
  // E7：字幕轨 / BGM 轨开关（默认开）
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true)
  const [bgmEnabled, setBgmEnabled] = useState(true)
  // E4：字幕文本覆盖（多行，每行一条；留空=按文案自动分段）
  const [subtitlesOverride, setSubtitlesOverride] = useState('')
  // B3：选题生成深度（浅度=关键词直出；深度=先分析对标风格再生成）
  const [topicDepth, setTopicDepth] = useState<'shallow' | 'deep'>('shallow')
  // F4a：发布账号（工作台管理，详情页一键发布）
  const [publishAccounts, setPublishAccounts] = useState<PublishAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>()
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountForm] = Form.useForm()
  const [accountBounding, setAccountBounding] = useState<number | null>(null)
  /** 发布平台开关（管理后台配置，enabled 才展示） */
  const [publishPlatforms, setPublishPlatforms] = useState<PublishPlatformItem[]>([])

  // 卸载时停止录音（释放麦克风）
  useEffect(
    () => () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    },
    []
  )

  useEffect(() => {
    void listOralWorkshopTemplates()
      .then(setTemplates)
      .catch((err: Error) => message.error('模板列表加载失败: ' + (err?.message ?? err)))
      .finally(() => setTemplatesLoading(false))
    void listMyVoices().then(setVoices).catch(() => setVoices([]))
    void listMyDigitalHumans().then(setDhAssets).catch(() => setDhAssets([]))
    void listPublishAccounts().then(setPublishAccounts).catch(() => setPublishAccounts([]))
    void listPublishPlatforms().then(setPublishPlatforms).catch(() => setPublishPlatforms([]))
    void getOralWorkshopMeta()
      .then((meta) => {
        setVoicePool(meta.voicePool || [])
        setPricing(meta.pricing)
        if (meta.personaPresets?.length) setPersonaPresets(meta.personaPresets)
        setBgmLibrary(meta.bgmLibrary || [])
        setRecentJob(meta.recentJob ?? null)
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

  /** 风格分析：分析对标内容 → 风格分析 + 5 条选题（对标参考软件「深度学习写作风格」） */
  const handleAnalyzeStyle = async () => {
    const ref = benchmarkUrl.trim() || ((form.getFieldValue('scriptInput') as string) ?? '').trim()
    if (!ref) {
      message.warning('请先粘贴对标视频链接/分享文本，或填入已提取的文案')
      return
    }
    setStyleAnalysisLoading(true)
    try {
      const res = await analyzeStyle({ referenceContent: ref.slice(0, 20000) })
      setStyleAnalysisResult(res)
      setStyleAnalysisOpen(true)
    } catch (err) {
      message.error('风格分析失败: ' + (err as Error).message)
    } finally {
      setStyleAnalysisLoading(false)
    }
  }

  /** 风格分析结果中的选题 → 生成完整口播文案 */
  const applyStyleTopic = async (topic: TopicItem, index: number) => {
    if (styleTopicGenerating !== null) return
    setStyleTopicGenerating(index)
    const persona = form.getFieldValue('persona') as string | undefined
    try {
      const res = await generateScript({ topic: topic.title, persona, reference: referenceText.trim() || undefined })
      form.setFieldsValue({ scriptInput: res.text })
      message.success('口播文案已生成并填入，可继续编辑')
      setStyleAnalysisOpen(false)
      setStyleAnalysisResult(null)
    } catch (err) {
      form.setFieldsValue({ scriptInput: topic.title })
      message.warning('文案生成失败，已先填入选题标题：' + (err as Error).message)
      setStyleAnalysisOpen(false)
      setStyleAnalysisResult(null)
    } finally {
      setStyleTopicGenerating(null)
    }
  }

  const handleTopics = async () => {
    if (!topicsKeywords.trim()) {
      message.warning('请输入选题关键词')
      return
    }
    setTopicsLoading(true)
    try {
      const persona = form.getFieldValue('persona') as string | undefined
      let personaOverride = persona
      if (topicDepth === 'deep') {
        // B3：深度模式 — 先分析对标风格，再把风格结论注入人设，让选题更贴合
        const styleRes = await analyzeStyle({ referenceContent: topicsKeywords.trim().slice(0, 20000) })
        const styleNote = '对标风格参考：' + (styleRes.style_analysis || '').slice(0, 200)
        personaOverride = persona ? persona + '\n（' + styleNote + '）' : '（' + styleNote + '）'
      }
      const list = await generateTopics({
        keywords: topicsKeywords.trim(),
        persona: personaOverride,
        count: 5,
        excludedTopics: generatedTopics,
        industryOrProduct: topicsIndustry.trim() || undefined,
        productSellingPoints: topicsSellingPoints.trim() || undefined,
      })
      setTopics(list)
      setGeneratedTopics((prev) => [...prev, ...list.map((t) => t.title)])
    } catch (err) {
      message.error('选题生成失败: ' + (err as Error).message)
    } finally {
      setTopicsLoading(false)
    }
  }

  const applyTopic = async (topic: TopicItem, index: number) => {
    if (topicGenerating !== null) return
    setTopicGenerating(index)
    const persona = form.getFieldValue('persona') as string | undefined
    try {
      const res = await generateScript({ topic: topic.title, persona, reference: referenceText.trim() || undefined })
      form.setFieldsValue({ scriptInput: res.text })
      message.success('口播文案已生成并填入，可继续编辑')
      setTopicsOpen(false)
      setTopics([])
      setTopicsKeywords('')
      setGeneratedTopics([])
    } catch (err) {
      form.setFieldsValue({ scriptInput: topic.title })
      message.warning('文案生成失败，已先填入选题标题：' + (err as Error).message)
      setTopicsOpen(false)
      setTopics([])
      setTopicsKeywords('')
      setGeneratedTopics([])
    } finally {
      setTopicGenerating(null)
    }
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

  /** A3：上传本地音视频文件 → ffmpeg 抽音频 + STT 提取口播文案 */
  const handleExtractFile = async (file: File) => {
    setExtractFileLoading(true)
    try {
      const res = await extractFileFromUpload(file)
      form.setFieldsValue({ scriptInput: res.text })
      message.success('音频/视频文案提取成功，已填入文案（可继续修改）')
    } catch (err) {
      message.error('提取失败: ' + (err as Error).message)
    } finally {
      setExtractFileLoading(false)
    }
    return false
  }

  /** A4：智能改写（选模板/字数/参考范文，结果先展示原文/改写后对比，确认后替换） */
  const handleRewrite = async () => {
    const script = (form.getFieldValue('scriptInput') as string) ?? ''
    if (!script.trim()) {
      message.warning('请先填写待改写的口播文案')
      return
    }
    setRewriteLoading(true)
    try {
      const res = await rewriteScript({
        script: script.trim(),
        templateId: rewriteTemplate,
        wordCount: rewriteWordCount,
        reference: rewriteReference.trim() || undefined,
        persona: (form.getFieldValue('persona') as string | undefined)?.trim(),
        style: (form.getFieldValue('style') as string | undefined)?.trim(),
      })
      setRewriteOriginal(script.trim())
      setRewriteResult(res.text)
      message.success('改写完成，请对比后在下方确认「使用此文案」')
    } catch (err) {
      message.error('改写失败: ' + (err as Error).message)
    } finally {
      setRewriteLoading(false)
    }
  }

  /** A4：确认使用改写结果（替换文案框） */
  const handleApplyRewrite = () => {
    if (!rewriteResult) return
    form.setFieldsValue({ scriptInput: rewriteResult })
    message.success('已替换文案（可继续编辑）')
    setRewriteOpen(false)
    setRewriteResult(null)
    setRewriteOriginal('')
  }

  /** A4：关闭/取消时清空改写对比状态 */
  const handleCloseRewrite = () => {
    setRewriteOpen(false)
    setRewriteResult(null)
    setRewriteOriginal('')
  }

  /** A5：产品/营销文案（产品名称/卖点 → 口播文案） */
  const handleProductCopy = async () => {
    if (!pcProductName.trim() && !pcSellingPoints.trim()) {
      message.warning('请至少填写产品名称或产品卖点')
      return
    }
    setProductCopyLoading(true)
    try {
      const res = await productCopy({
        productName: pcProductName.trim() || undefined,
        sellingPoints: pcSellingPoints.trim() || undefined,
        persona: (form.getFieldValue('persona') as string | undefined)?.trim(),
        style: (form.getFieldValue('style') as string | undefined)?.trim(),
      })
      form.setFieldsValue({ scriptInput: res.text })
      message.success('产品文案已生成并填入（可继续编辑）')
      setProductCopyOpen(false)
    } catch (err) {
      message.error('产品文案生成失败: ' + (err as Error).message)
    } finally {
      setProductCopyLoading(false)
    }
  }

  /** C2：参考音频/视频裁剪（截取时间段 → 返回 URL 填入参考音频） */
  const handleTrim = async () => {
    if (!trimSourceUrl.trim()) {
      message.warning('请填写待裁剪的音视频 URL')
      return
    }
    if (!(trimEnd > trimStart) || trimEnd - trimStart > 300) {
      message.warning('裁剪区间无效（0 ≤ start < end，最长 300 秒）')
      return
    }
    setTrimLoading(true)
    try {
      const res = await trimMedia({ sourceUrl: trimSourceUrl.trim(), startSec: trimStart, endSec: trimEnd })
      refAudioForm.setFieldValue('refAudioUrl', res.url)
      message.success('裁剪完成，已填入参考音频 URL（可试听/提交克隆）')
      setTrimOpen(false)
    } catch (err) {
      message.error('裁剪失败: ' + (err as Error).message)
    } finally {
      setTrimLoading(false)
    }
  }

  const addRefAudio = async () => {
    const values = (await refAudioForm.validateFields()) as { name: string; refAudioUrl: string; emotionRefAudio?: string }
    try {
      await createMyVoice({
        name: values.name,
        refAudioUrl: values.refAudioUrl,
        emotionRefAudio: values.emotionRefAudio?.trim() || undefined,
      })
      message.success('声音已添加，正在后台训练克隆（约 3 分钟），完成后可在列表试听')
      setRefAudioOpen(false)
      refAudioForm.resetFields()
      const list = await listMyVoices()
      setVoices(list)
    } catch (err) {
      message.error('添加声音失败: ' + (err as Error).message)
    }
  }

  const addDigitalHuman = async () => {
    const values = (await dhForm.validateFields()) as { name: string; cloudId: string; description?: string }
    try {
      await createMyDigitalHuman({ name: values.name, cloudId: values.cloudId, description: values.description?.trim() || undefined })
      message.success('形象已添加')
      setDhModalOpen(false)
      dhForm.resetFields()
      const list = await listMyDigitalHumans()
      setDhAssets(list)
    } catch (err) {
      message.error('添加形象失败: ' + (err as Error).message)
    }
  }

  /** D2：上传真人视频 → 服务端 ffmpeg 转码建形象（video 类型形象，加入我的形象列表） */
  const handleUploadDhVideo = async (file: File) => {
    setDhVideoUploading(true)
    try {
      const asset = await uploadDigitalHumanVideo(file)
      setDhAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)])
      form.setFieldValue('digitalHumanId', asset.id)
      message.success('视频形象上传成功，已转码并加入「我的形象」')
    } catch (err) {
      message.error('视频形象上传失败: ' + (err as Error).message)
    } finally {
      setDhVideoUploading(false)
    }
    return false
  }

  /** D3：多镜头增删改/排序 */
  const addShot = () => {
    if (shots.length >= 6) {
      message.warning('最多 6 个镜头')
      return
    }
    setShots((s) => [...s, { digitalHumanId: undefined, seconds: 30 }])
  }
  const updateShot = (i: number, patch: Partial<{ digitalHumanId: number; seconds: number }>) => {
    setShots((s) => s.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  }
  const moveShot = (i: number, dir: -1 | 1) => {
    setShots((s) => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const next = [...s]
      const tmp = next[i]
      next[i] = next[j]
      next[j] = tmp
      return next
    })
  }
  const removeShot = (i: number) => setShots((s) => s.filter((_, j) => j !== i))

  /** F4a：绑定发布账号（待授权 → 已绑定，模拟 OAuth 授权完成） */
  const handleBindAccount = async (id: number) => {
    setAccountBounding(id)
    try {
      const updated = await bindPublishAccount(id)
      setPublishAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)))
      message.success('账号已绑定，可在任务详情页直接发布')
    } catch (err) {
      message.error('绑定失败: ' + (err as Error).message)
    } finally {
      setAccountBounding(null)
    }
  }

  /** F4a：添加发布账号 */
  const handleAddAccount = async () => {
    const values = (await accountForm.validateFields()) as {
      platform: string
      accountName: string
      avatarUrl?: string
      remark?: string
    }
    try {
      const acc = await createPublishAccount({
        platform: values.platform,
        accountName: values.accountName,
        avatarUrl: values.avatarUrl?.trim() || undefined,
        remark: values.remark?.trim() || undefined,
      })
      setPublishAccounts((prev) => [...prev, acc])
      message.success('账号已添加（待授权，点击「绑定授权」完成）')
      setAccountOpen(false)
      accountForm.resetFields()
    } catch (err) {
      message.error('添加账号失败: ' + (err as Error).message)
    }
  }

  /** C3：开始录音（MediaRecorder，停止后自动转 WAV 上传并填入参考音频 URL） */
  const startRecording = async () => {
    if (!recordingSupported) {
      message.warning('当前环境不支持录音（需要浏览器/桌面端麦克风权限）')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recordChunksRef.current = []
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const mime = recorder.mimeType || 'audio/webm'
        const blob = new Blob(recordChunksRef.current, { type: mime })
        if (blob.size > 0) void uploadRecording(blob)
      }
      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    } catch (err) {
      message.error('无法访问麦克风: ' + (err as Error).message)
    }
  }

  /** C3：停止录音并清理计时 */
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    recordTimerRef.current = null
    setRecording(false)
  }

  /** C3：录音转 WAV（24kHz 16bit PCM，火山复刻兼容）后上传，填入参考音频 URL */
  const uploadRecording = async (blob: Blob) => {
    try {
      const wav = await blobToWav(blob)
      const res = await uploadFile(new File([wav], 'record-' + Date.now() + '.wav', { type: 'audio/wav' }))
      refAudioForm.setFieldValue('refAudioUrl', res.url)
      message.success('录音完成并已上传，已填入参考音频 URL（可补充名称后提交克隆）')
    } catch (err) {
      message.error('录音上传失败: ' + (err as Error).message)
    }
  }

  /** D4/E6：添加画中画素材（最多 4 个，随任务提交后叠加到成片） */
  const addPipAsset = async () => {
    if (pipItems.length >= 4) {
      message.warning('画中画素材最多添加 4 个')
      return
    }
    const values = (await pipForm.validateFields()) as {
      url: string
      position?: 'tl' | 'tr' | 'bl' | 'br' | 'center'
      scale?: number
      startSec?: number
      endSec?: number
    }
    if (
      typeof values.startSec === 'number' &&
      typeof values.endSec === 'number' &&
      values.endSec <= values.startSec
    ) {
      message.warning('结束秒必须大于开始秒（或留空表示全片显示）')
      return
    }
    const item: PipAssetInput = {
      url: values.url.trim(),
      position: values.position || 'br',
      scale: values.scale,
      startSec: values.startSec,
      endSec: values.endSec,
    }
    setPipItems((items) => [...items, item])
    pipForm.resetFields()
    setPipOpen(false)
    message.success('画中画素材已添加（提交后随任务生成时叠加）')
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
      void useCreditsStore.getState().fetchBalance()
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
    voiceSpeechRate?: number
    voiceLoudnessRate?: number
    voiceEmotion?: string
    bgmUrl?: string
    bgmVolume?: number
    targetLang?: string
    executionMode?: 'auto' | 'manual' | 'single'
  }) => {
    setSubmitting(true)
    const targetLang = values.targetLang && values.targetLang !== 'zh' ? values.targetLang : undefined
    const validShots = shots
      .filter((s) => s.digitalHumanId)
      .map((s) => ({ digitalHumanId: s.digitalHumanId as number, seconds: s.seconds }))
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
        digitalHumanId: values.digitalHumanId ?? (validShots.length === 1 ? validShots[0].digitalHumanId : undefined),
        dhGenerationMode,
        shots: validShots.length > 1 ? validShots : undefined,
        subtitlesEnabled,
        bgmEnabled,
        subtitlesOverride: subtitlesOverride.trim() || undefined,
        voiceModelVersion: values.voiceModelVersion ?? 'V2',
        voiceSpeechRate: values.voiceSpeechRate,
        voiceLoudnessRate: values.voiceLoudnessRate,
        voiceEmotion: values.voiceEmotion,
        bgmUrl: values.bgmUrl,
        bgmVolume: values.bgmVolume,
        pipAssets: pipItems.length ? pipItems : undefined,
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
      void useCreditsStore.getState().fetchBalance()
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

  /** 平台下拉：优先管理后台 enabled 平台，未加载到时保留写死兜底 */
  const platformOptions =
    publishPlatforms.length > 0
      ? publishPlatforms.filter((p) => p.enabled).map((p) => ({ value: p.platform, label: p.displayName }))
      : [
          { value: 'douyin', label: '抖音' },
          { value: 'kuaishou', label: '快手' },
          { value: 'xiaohongshu', label: '小红书' },
          { value: 'bilibili', label: 'B站' },
          { value: 'weixin', label: '微信视频号' },
        ]

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
            <div className={styles.subtitle}>多步骤创作 · 点击步骤可单独打开，流程中可上一步 / 下一步</div>
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
          onChange={(v) => setCurrent(v)}
          items={steps.map((s) => ({
            title: s.title,
            icon: s.icon,
          }))}
          size="small"
        />
      </div>

      <Card className={styles.card} bodyStyle={{ padding: 20 }}>
        <Form form={form} layout="vertical" onFinish={handleSubmit} onValuesChange={handleDraftChange}>
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
              <Upload accept="audio/*,video/*" showUploadList={false} beforeUpload={(f) => handleExtractFile(f)}>
                <Button loading={extractFileLoading} icon={<UploadIcon size={13} />}>
                  上传音视频提取
                </Button>
              </Upload>
              <Button type="dashed" icon={<Lightbulb size={13} />} onClick={() => setTopicsOpen(true)}>
                选题灵感
              </Button>
              <Button type="dashed" icon={<Sparkles size={13} />} loading={styleAnalysisLoading} onClick={() => void handleAnalyzeStyle()}>
                分析风格
              </Button>
            </div>
            <div className={styles.extractRow} style={{ marginTop: 8 }}>
              <Button
                type="dashed"
                icon={<Wand2 size={13} />}
                onClick={() => {
                  setRewriteOriginal(((form.getFieldValue('scriptInput') as string) ?? '').trim())
                  setRewriteResult(null)
                  setRewriteOpen(true)
                }}
              >
                智能改写
              </Button>
              <Button type="dashed" icon={<Music2 size={13} />} onClick={() => setProductCopyOpen(true)}>
                产品文案
              </Button>
              <Input
                placeholder="参考范文（可选）：粘贴一段爆款文案，选题/改写时学习其风格"
                value={referenceText}
                maxLength={20000}
                onChange={(e) => setReferenceText(e.target.value)}
              />
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
              {personaPresets.map((p) => (
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
                options={voices.map((v) => ({
                  value: v.id,
                  label:
                    v.name +
                    (v.status === 'training'
                      ? '（训练中…）'
                      : v.status === 'failed'
                        ? '（克隆失败）'
                        : v.speakerId
                          ? '（已就绪 ✓）'
                          : ''),
                }))}
              />
            </Form.Item>
            <div className={styles.assetActions}>
              <Button size="small" type="dashed" icon={<Plus size={12} />} onClick={() => setRefAudioOpen(true)}>
                添加参考音频（我的声音）
              </Button>
              <Button size="small" type="dashed" icon={<Scissors size={12} />} onClick={() => setTrimOpen(true)}>
                裁剪参考音频
              </Button>
              {(() => {
                const cur = voices.find((v) => v.id === form.getFieldValue('voiceId'))
                return cur?.demoAudio ? (
                  <Button
                    size="small"
                    icon={<ExternalLink size={12} />}
                    onClick={() => {
                      const audio = new Audio(resolveMediaUrl(cur.demoAudio!))
                      void audio.play().catch(() => message.warning('试听播放失败，请检查音频链接'))
                    }}
                  >
                    试听
                  </Button>
                ) : null
              })()}
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
            <div className={styles.formRow}>
              <Form.Item name="voiceSpeechRate" label="语速" initialValue={0.9} tooltip="0.5（慢）~ 1.5（快），默认 0.9；用户级覆盖后台默认">
                <Slider min={0.5} max={1.5} step={0.05} marks={{ 0.5: '慢', 0.9: '默认', 1.5: '快' }} />
              </Form.Item>
              <Form.Item name="voiceLoudnessRate" label="人声音量增益" initialValue={0} tooltip="-20（轻）~ +20（响），默认 0">
                <Slider min={-20} max={20} step={1} marks={{ '-20': '-20', 0: '0', 20: '+20' }} />
              </Form.Item>
            </div>
            <Form.Item name="voiceEmotion" label="情感（可选）" tooltip="配音情感参数（火山 TTS context_texts 映射），默认无">
              <Select
                placeholder="无（默认）"
                allowClear
                options={[
                  { value: '高兴', label: '高兴' },
                  { value: '愤怒', label: '愤怒' },
                  { value: '悲伤', label: '悲伤' },
                  { value: '害怕', label: '害怕' },
                  { value: '平静', label: '平静' },
                  { value: '无', label: '无' },
                ]}
              />
            </Form.Item>
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
                options={dhAssets.map((d) => ({
                  value: d.id,
                  label: (d.kind === 'video' ? '🎬 ' : '') + d.name + (d.authorized ? '' : '（未授权）'),
                }))}
              />
            </Form.Item>
            {(() => {
              const cur = dhAssets.find((d) => d.id === form.getFieldValue('digitalHumanId'))
              if (!cur) return null
              return (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  {cur.kind === 'video' && cur.videoUrl ? (
                    <video
                      src={resolveMediaUrl(cur.videoUrl)}
                      style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8 }}
                      muted
                      autoPlay
                      loop
                      playsInline
                    />
                  ) : cur.previewUrl ? (
                    <img src={resolveMediaUrl(cur.previewUrl)} alt={cur.name} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8 }} />
                  ) : null}
                  <div>
                    {cur.description && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{cur.description}</div>}
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>形象 ID：{cur.cloudId}</div>
                  </div>
                </div>
              )
            })()}
            <div className={styles.assetActions}>
              <Button size="small" type="dashed" icon={<Plus size={12} />} onClick={() => setDhModalOpen(true)}>
                添加形象 ID
              </Button>
              <Upload accept="video/*" showUploadList={false} beforeUpload={(f) => handleUploadDhVideo(f)}>
                <Button size="small" type="dashed" icon={<Video size={12} />} loading={dhVideoUploading}>
                  上传视频建形象
                </Button>
              </Upload>
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
            <Form.Item
              label="数字人生成方式"
              tooltip="自动=按后台配置（已配火山走云端，否则本地）；云端=强制火山数字人合成；本地=只用本地卡片/上传视频"
              style={{ marginTop: 14 }}
            >
              <Radio.Group value={dhGenerationMode} onChange={(e) => setDhGenerationMode(e.target.value)} optionType="button" buttonStyle="solid">
                <Radio.Button value="auto">自动</Radio.Button>
                <Radio.Button value="cloud">云端（火山）</Radio.Button>
                <Radio.Button value="local">本地</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <div className={styles.uploadGroup} style={{ marginTop: 14 }}>
              <div className={styles.uploadRow} style={{ alignItems: 'center' }}>
                <span className={styles.uploadLabel}>多镜头（可选，最多 6 个）</span>
                <Button size="small" type="dashed" icon={<Plus size={12} />} disabled={shots.length >= 6} onClick={addShot}>
                  添加镜头
                </Button>
              </div>
              {shots.length === 0 ? (
                <div className={styles.uploadHint}>未添加（单镜头模式，使用上方「我的形象」生成）</div>
              ) : (
                shots.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span className={styles.uploadLabel}>{i + 1}</span>
                    <Select
                      size="small"
                      placeholder="选择形象"
                      style={{ minWidth: 170 }}
                      value={s.digitalHumanId}
                      onChange={(v) => updateShot(i, { digitalHumanId: v as number })}
                      options={dhAssets.map((d) => ({ value: d.id, label: (d.kind === 'video' ? '🎬 ' : '') + d.name }))}
                    />
                    <InputNumber
                      size="small"
                      min={2}
                      max={120}
                      value={s.seconds}
                      onChange={(v) => updateShot(i, { seconds: Number(v) || 30 })}
                      style={{ width: 110 }}
                      addonAfter="秒"
                    />
                    <Button type="text" size="small" disabled={i === 0} icon={<ArrowUp size={12} />} onClick={() => moveShot(i, -1)} />
                    <Button type="text" size="small" disabled={i === shots.length - 1} icon={<ArrowDown size={12} />} onClick={() => moveShot(i, 1)} />
                    <Button type="text" size="small" danger icon={<Trash2 size={12} />} onClick={() => removeShot(i)} />
                  </div>
                ))
              )}
            </div>
            <div className={styles.panelHint}>添加 2 个以上镜头将按顺序切分语音、逐个生成再自动拼接成片；每镜头时长 2-120 秒。</div>
            <div className={styles.uploadGroup} style={{ marginTop: 14 }}>
              <div className={styles.uploadRow} style={{ alignItems: 'center' }}>
                <span className={styles.uploadLabel}>画中画素材（可选，最多 4 个）</span>
                <Button size="small" type="dashed" icon={<Plus size={12} />} onClick={() => setPipOpen(true)}>
                  添加画中画
                </Button>
              </div>
              {pipItems.length === 0 ? (
                <div className={styles.uploadHint}>未添加（成片不叠加画中画）</div>
              ) : (
                pipItems.map((pip, i) => (
                  <div key={i} className={styles.uploadRow}>
                    <span className={styles.uploadLabel}>{i + 1}</span>
                    <a href={pip.url} target="_blank" rel="noreferrer" className={styles.uploadValue}>
                      {pip.url.length > 44 ? pip.url.slice(0, 44) + '…' : pip.url}
                    </a>
                    <span className={styles.uploadHint}>
                      {PIP_POSITION_LABELS[pip.position || 'br']} · {Math.round((pip.scale || 0.25) * 100)}%
                      {typeof pip.startSec === 'number' && typeof pip.endSec === 'number'
                        ? ' · ' + pip.startSec + 's-' + pip.endSec + 's'
                        : ''}
                    </span>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<Trash2 size={12} />}
                      onClick={() => setPipItems((items) => items.filter((_, j) => j !== i))}
                    />
                  </div>
                ))
              )}
            </div>
            <div className={styles.panelHint}>画中画支持图片或视频（png/jpg/mp4 等），随任务生成时叠加到成片指定位置。</div>
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
                      {t.cover_image_url ? (
                        <img className={styles.templateCardCover} src={resolveMediaUrl(t.cover_image_url)} alt={t.name} />
                      ) : null}
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
            <Form.Item name="bgmUrl" label="背景音乐（BGM 库）" tooltip="选一段背景音乐叠加到成片；留空=使用模板默认（如模板未配置则无 BGM）">
              <Select
                placeholder="无（使用模板默认）"
                allowClear
                showSearch
                optionFilterProp="label"
                options={[
                  ...bgmLibrary.map((b) => ({ value: b.url, label: b.name + (b.category ? '（' + b.category + '）' : '') })),
                  ...(form.getFieldValue('bgmUrl') && !bgmLibrary.some((b) => b.url === form.getFieldValue('bgmUrl'))
                    ? [{ value: form.getFieldValue('bgmUrl') as string, label: form.getFieldValue('bgmUrl') as string }]
                    : []),
                ]}
              />
            </Form.Item>
            <Form.Item name="bgmVolume" label="BGM 音量" initialValue={0.2} tooltip="背景音乐音量（0-1），默认 0.2">
              <Slider min={0} max={1} step={0.05} marks={{ 0: '静音', 0.2: '默认', 1: '最大' }} />
            </Form.Item>
            <div className={styles.formRow}>
              <Form.Item label="字幕轨" tooltip="关闭后成片不渲染字幕（保留人声/BGM）" style={{ flex: 1 }}>
                <Switch checked={subtitlesEnabled} onChange={setSubtitlesEnabled} checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <Form.Item label="BGM 轨" tooltip="关闭后成片不叠加背景音乐" style={{ flex: 1 }}>
                <Switch checked={bgmEnabled} onChange={setBgmEnabled} checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
            </div>
            <Form.Item label="字幕内容（E4：可选）" tooltip="留空=按口播文案自动分段；填写后每行一条字幕，覆盖自动分段结果（需打开字幕轨）">
              <TextArea
                rows={4}
                placeholder="留空自动分段；可粘贴自定义字幕，每行一条（如：3 个让效率翻倍的 AI 技巧）"
                value={subtitlesOverride}
                maxLength={20000}
                onChange={(e) => setSubtitlesOverride(e.target.value)}
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
            {recentJob && (
              <div style={{ marginBottom: 16 }}>
                <div className={styles.panelHint} style={{ marginBottom: 8 }}>
                  最近成片预览（任务 #{recentJob.id}，可到任务详情继续修改封面/发布）
                </div>
                {recentJob.videoUrl ? (
                  <video className={styles.video} src={resolveMediaUrl(recentJob.videoUrl)} controls preload="metadata" style={{ width: '100%', borderRadius: 8 }} />
                ) : recentJob.coverUrl ? (
                  <img className={styles.cover} src={resolveMediaUrl(recentJob.coverUrl)} alt="最近封面" style={{ width: '100%', borderRadius: 8 }} />
                ) : (
                  <div className={styles.previewEmpty}>
                    <Empty description="暂无最近成片，提交后可在任务列表/详情查看" />
                  </div>
                )}
              </div>
            )}
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
            <div className={styles.summaryCard} style={{ marginTop: 12 }}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>发布账号</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Select
                    size="small"
                    placeholder="选择发布账号（生成后在详情页发布）"
                    style={{ minWidth: 220 }}
                    value={selectedAccountId}
                    onChange={setSelectedAccountId}
                    options={publishAccounts.map((a) => ({
                      value: a.id,
                      label: a.accountName + '（' + a.platform + '）' + (a.status === 'active' ? ' ✓' : ' · 待绑定'),
                    }))}
                  />
                  <Button size="small" type="dashed" icon={<Plus size={12} />} onClick={() => setAccountOpen(true)}>
                    添加账号
                  </Button>
                  <Button size="small" icon={<ExternalLink size={12} />} onClick={() => navigate('/oral-workshop/accounts')}>
                    管理账号
                  </Button>
                  <Button size="small" icon={<Layers size={12} />} onClick={() => navigate('/oral-workshop/materials')}>
                    素材库
                  </Button>
                  {(() => {
                    const acc = publishAccounts.find((a) => a.id === selectedAccountId)
                    return acc && acc.status !== 'active' ? (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        loading={accountBounding === acc.id}
                        onClick={() => void handleBindAccount(acc.id)}
                      >
                        绑定授权
                      </Button>
                    ) : null
                  })()}
                </div>
              </div>
              <div className={styles.panelHint}>任务生成完成后，在任务详情页可一键发布到已绑定账号。</div>
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
        </Form>
      </Card>

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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>学习深度</span>
          <Radio.Group size="small" value={topicDepth} onChange={(e) => setTopicDepth(e.target.value)}>
            <Radio.Button value="shallow">浅度（关键词直出）</Radio.Button>
            <Radio.Button value="deep">深度（先分析对标风格）</Radio.Button>
          </Radio.Group>
          {topicsLoading && topicDepth === 'deep' ? <Spin size="small" /> : null}
        </div>
        {topicsLoading && topicDepth === 'deep' && (
          <div style={{ color: '#57606a', fontSize: 12, marginBottom: 8 }}>正在深入分析账号风格与选题…</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Input
            placeholder="行业或产品（可选）：如 母婴辅食"
            value={topicsIndustry}
            maxLength={500}
            onChange={(e) => setTopicsIndustry(e.target.value)}
          />
          <Input
            placeholder="产品卖点（可选）：如 无添加、高铁米粉"
            value={topicsSellingPoints}
            maxLength={1000}
            onChange={(e) => setTopicsSellingPoints(e.target.value)}
          />
        </div>
        {generatedTopics.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#8b949e', fontSize: 12 }}>
              本轮已生成 {generatedTopics.length} 条，再次生成将自动避开以上选题
            </span>
            <Button size="small" type="text" onClick={() => setGeneratedTopics([])}>
              清空
            </Button>
          </div>
        )}
        <div className={styles.topicList}>
          {topics.map((t, i) => (
            <div
              key={i}
              className={styles.topicItem}
              style={topicGenerating === i ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
              onClick={() => void applyTopic(t, i)}
            >
              <div className={styles.topicTitle}>
                {t.title}
                {topicGenerating === i ? <span className={styles.topicGenerating}>　正在生成口播文案…</span> : null}
              </div>
              <div className={styles.topicMeta}>
                {t.persona_angle ? <Tag>人设角度：{t.persona_angle}</Tag> : null}
                {t.hook ? <Tag color="blue">钩子：{t.hook}</Tag> : null}
                {t.viral_logic ? <Tag color="green">{t.viral_logic}</Tag> : null}
              </div>
            </div>
          ))}
          {!topicsLoading && topics.length === 0 && (
            <div className={styles.topicEmpty}>输入关键词后点击「生成选题」，点击选题自动生成完整口播文案</div>
          )}
        </div>
      </Modal>

      {/* 风格分析弹窗（对标参考软件：先分析博主风格，再基于风格生成选题） */}
      <Modal
        open={styleAnalysisOpen}
        title="对标风格分析"
        onCancel={() => {
          setStyleAnalysisOpen(false)
          setStyleAnalysisResult(null)
        }}
        footer={null}
        width={560}
      >
        {styleAnalysisResult && (
          <div>
            <div style={{ marginBottom: 12, padding: 12, background: '#f6f8fa', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>风格分析</div>
              <div style={{ color: '#57606a', fontSize: 13, whiteSpace: 'pre-wrap' }}>{styleAnalysisResult.style_analysis}</div>
            </div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>推荐选题（点击生成口播文案）</div>
            {styleAnalysisResult.topics.map((t, idx) => (
              <div
                key={idx}
                className={styles.topicItem}
                style={styleTopicGenerating === idx ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
                onClick={() => void applyStyleTopic(t, idx)}
              >
                <div className={styles.topicTitle}>
                  {t.title}
                  {styleTopicGenerating === idx ? <span className={styles.topicGenerating}>　正在生成口播文案…</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
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
          {recordingSupported && (
            <div className={styles.uploadGroup} style={{ marginBottom: 12 }}>
              <div className={styles.uploadRow}>
                <span className={styles.uploadLabel}>录音采集</span>
                {!recording ? (
                  <Button size="small" type="dashed" icon={<Mic size={12} />} onClick={() => void startRecording()}>
                    开始录音
                  </Button>
                ) : (
                  <Button size="small" danger icon={<Mic size={12} />} onClick={stopRecording}>
                    停止录音（{recordSeconds}s）
                  </Button>
                )}
              </div>
              <div className={styles.uploadHint}>点击开始录音（建议 10-60 秒清晰人声），停止后自动转为 WAV 并填入上方参考音频 URL。</div>
            </div>
          )}
          <Form.Item
            name="emotionRefAudio"
            label="情感参考音频 URL（可选）"
            tooltip="C6：附一段带情绪的音频样本（高兴/悲伤/激昂等），声音复刻时优先采用该情绪演绎"
          >
            <Input placeholder="https://…/emotion.mp3（可选，附情绪样本提升复刻表现力）" maxLength={512} />
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
          <Form.Item name="description" label="形象描述（可选）">
            <Input placeholder="如：知性女主播，适合知识口播" maxLength={512} />
          </Form.Item>
          <Form.Item name="previewUrl" label="形象预览图 URL（可选）">
            <Input placeholder="https://…/avatar.jpg" maxLength={512} />
          </Form.Item>
        </Form>
      </Modal>

      {/* D4/E6：画中画素材弹窗 */}
      <Modal
        open={pipOpen}
        title="添加画中画素材"
        onCancel={() => setPipOpen(false)}
        onOk={() => void addPipAsset()}
        okText="添加"
        width={520}
      >
        <Form form={pipForm} layout="vertical">
          <div className={styles.uploadGroup} style={{ marginBottom: 8 }}>
            <Upload
              accept="image/*,video/*"
              showUploadList={false}
              customRequest={
                (async (options: { file: File | Blob; onError?: (err: Error) => void }) => {
                  const file = options.file instanceof File ? options.file : new File([options.file], 'media')
                  try {
                    const res = await uploadFile(file)
                    pipForm.setFieldValue('url', res.url)
                    message.success('素材上传成功')
                  } catch (err) {
                    message.error('素材上传失败: ' + (err as Error).message)
                    options.onError?.(err as Error)
                  }
                }) as never
              }
            >
              <Button size="small" icon={<UploadIcon size={13} />}>
                上传素材
              </Button>
            </Upload>
          </div>
          <Form.Item name="url" label="素材 URL（图片或视频，先上传或粘贴链接）" rules={[{ required: true, message: '请填写素材 URL' }]}>
            <Input placeholder="https://…/logo.png 或 .mp4" maxLength={512} />
          </Form.Item>
          <div className={styles.formRow}>
            <Form.Item name="position" label="位置" initialValue="br">
              <Select options={PIP_POSITION_OPTIONS} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="scale" label="大小（相对成片宽度）" initialValue={0.25} tooltip="0.05（小）~ 1（铺满），默认 25%">
              <InputNumber min={0.05} max={1} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div className={styles.formRow}>
            <Form.Item name="startSec" label="开始秒（可选）">
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="endSec" label="结束秒（可选）">
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* F4a：添加发布账号弹窗 */}
      <Modal
        open={accountOpen}
        title="添加发布账号"
        onCancel={() => setAccountOpen(false)}
        onOk={() => void handleAddAccount()}
        okText="添加"
      >
        <Form form={accountForm} layout="vertical">
          <Form.Item name="platform" label="平台" rules={[{ required: true, message: '请选择平台' }]}>
            <Select
              placeholder="选择平台"
              options={platformOptions}
            />
          </Form.Item>
          <Form.Item name="accountName" label="账号名称" rules={[{ required: true, message: '请输入账号名称' }]}>
            <Input placeholder="如：AI 种草日记" maxLength={128} />
          </Form.Item>
          <Form.Item name="avatarUrl" label="头像 URL（可选）">
            <Input placeholder="https://…/avatar.jpg" maxLength={512} />
          </Form.Item>
          <Form.Item name="remark" label="备注（可选）">
            <Input placeholder="如：主账号 / 备用号" maxLength={255} />
          </Form.Item>
        </Form>
      </Modal>

            {/* 智能改写弹窗（A4：选模板/字数/参考范文，结果对比后确认应用） */}
      <Modal
        open={rewriteOpen}
        title="智能改写"
        onCancel={handleCloseRewrite}
        onOk={() => void handleRewrite()}
        footer={
          rewriteResult
            ? [
                <Button key="rerun" icon={<RefreshCw size={14} />} loading={rewriteLoading} onClick={() => void handleRewrite()}>
                  重新改写
                </Button>,
                <Button key="cancel" onClick={handleCloseRewrite}>
                  取消
                </Button>,
                <Button key="apply" type="primary" icon={<CheckCircle2 size={14} />} onClick={handleApplyRewrite}>
                  使用此文案
                </Button>,
              ]
            : undefined
        }
        okText="开始改写"
        confirmLoading={rewriteLoading}
        width={640}
      >
        {rewriteResult ? (
          <div className={styles.rewriteCompare}>
            <div className={styles.rewriteCompareCol}>
              <div className={styles.rewriteCompareHead}>原文（{Array.from(rewriteOriginal || '').length} 字）</div>
              <p className={styles.rewriteCompareText}>{rewriteOriginal || '--'}</p>
            </div>
            <div className={styles.rewriteCompareCol}>
              <div className={styles.rewriteCompareHead}>改写后（{Array.from(rewriteResult).length} 字）</div>
              <p className={styles.rewriteCompareText}>{rewriteResult}</p>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <Form.Item label="改写模板" style={{ flex: 1, marginBottom: 0 }}>
                <Select
                  value={rewriteTemplate}
                  onChange={setRewriteTemplate}
                  options={[
                    { value: 'rewrite_master', label: '信息保全（默认，保留原意润色）' },
                    { value: 'generic_rewrite', label: '精简口语化（更适合口播）' },
                    { value: 'rewrite_detailed', label: '爆款详细（加长展开）' },
                    { value: 'rewrite_deep_learn', label: '深度学习（参考范文风格）' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="目标字数" style={{ flex: 1, marginBottom: 0 }}>
                <Slider min={100} max={800} step={20} value={rewriteWordCount} onChange={setRewriteWordCount} marks={{ 100: '短', 260: '260', 800: '长' }} />
              </Form.Item>
            </div>
            <Form.Item label="参考范文（可选，深度学习模板生效）">
              <TextArea
                rows={4}
                placeholder="粘贴一段参考范文，AI 学习其风格与结构…"
                value={rewriteReference}
                maxLength={20000}
                onChange={(e) => setRewriteReference(e.target.value)}
              />
            </Form.Item>
            <div className={styles.panelHint}>改写的是当前文案框中的内容；生成后可在对比区确认「使用此文案」替换，或「重新改写」。</div>
          </>
        )}
      </Modal>

{/* 产品/营销文案弹窗（A5） */}
      <Modal
        open={productCopyOpen}
        title="产品 / 营销文案"
        onCancel={() => setProductCopyOpen(false)}
        onOk={() => void handleProductCopy()}
        okText="生成口播文案"
        confirmLoading={productCopyLoading}
        width={560}
      >
        <Form layout="vertical">
          <Form.Item label="产品名称" rules={[{ required: false }]}>
            <Input
              placeholder="如：有机高铁米粉"
              value={pcProductName}
              maxLength={200}
              onChange={(e) => setPcProductName(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="产品卖点（可多条，逗号分隔）">
            <TextArea
              rows={4}
              placeholder="如：无添加蔗糖、高铁高钙、冲泡即食…"
              value={pcSellingPoints}
              maxLength={2000}
              onChange={(e) => setPcSellingPoints(e.target.value)}
            />
          </Form.Item>
        </Form>
        <div className={styles.panelHint}>至少填写产品名称或卖点之一；生成结果直接填入文案框。</div>
      </Modal>

      {/* 参考音频/视频裁剪弹窗（C2） */}
      <Modal
        open={trimOpen}
        title="裁剪参考音频/视频"
        onCancel={() => setTrimOpen(false)}
        onOk={() => void handleTrim()}
        okText="裁剪并填入"
        confirmLoading={trimLoading}
        width={560}
      >
        <Form layout="vertical">
          <Form.Item label="待裁剪音视频 URL（公网 http/https）" required>
            <Input
              placeholder="https://…/ref.mp3"
              value={trimSourceUrl}
              maxLength={512}
              onChange={(e) => setTrimSourceUrl(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="裁剪区间（秒，最长 300 秒）">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <InputNumber style={{ flex: 1 }} min={0} value={trimStart} onChange={(v) => setTrimStart(v ?? 0)} />
              <span>~</span>
              <InputNumber style={{ flex: 1 }} min={1} value={trimEnd} onChange={(v) => setTrimEnd(v ?? 30)} />
            </div>
          </Form.Item>
        </Form>
        <div className={styles.panelHint}>裁剪结果会自动填入「添加参考音频」弹窗的 URL，建议截取 10-60 秒清晰人声片段用于声音克隆。</div>
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