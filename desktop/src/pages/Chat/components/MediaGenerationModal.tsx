// 文生图/文生视频生成弹窗
// - 模型选择（后端 /media-generation/models，含价格展示）
// - 图片：尺寸；视频：分辨率 + 时长 + 帧率（按模型 generation_params）
// - 提交走 llm-proxy 多模态网关（统一静态 Key + 按后台分类模型定价扣费）：
//   图片 POST /llm-proxy/v1/images/generations（同步）；视频 POST /llm-proxy/v1/videos/generations（异步轮询）
// - 完成后回调 onComplete(job)，父组件以助手媒体消息插入会话

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Select, Input, Button, Form, Alert, Progress, Tag, Tooltip, message } from 'antd'
import { PictureOutlined, VideoCameraOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  listGenerationModels,
  generateImageViaGateway,
  generateVideoViaGateway,
  getVideoJobViaGateway,
  type GenerationModelItem,
  type GenerationModelType,
  type MediaJob,
} from '@/api/media-generation-api'
import { fetchLlmProxyKey } from '@/api/chat-api'
import styles from '../styles.module.css'

interface MediaGenerationModalProps {
  open: boolean
  onClose: () => void
  /** 初始生成类型（点文生图/文生视频按钮进入） */
  defaultType?: 'image' | 'video'
  /** 生成完成回调（图片同步 / 视频轮询完成） */
  onComplete: (job: MediaJob) => void
}

interface FormValues {
  type: GenerationModelType
  modelId: string
  prompt: string
  size?: string
  resolution?: string
  duration?: number
  fps?: number
}

const POLL_INTERVAL = 4000
const MAX_POLL_MS = 10 * 60 * 1000

function formatCost(type: GenerationModelType, model: GenerationModelItem | undefined, values: FormValues): string {
  if (!model) return ''
  if (type === 'image') {
    const p = model.pricePerImage ?? 10
    return `约扣 ${p} 积分/张`
  }
  const res = values.resolution || Object.keys(model.videoPrices || {})[0]
  const dur = values.duration != null ? String(values.duration) : '5'
  const price = res ? model.videoPrices?.[res]?.[dur] : undefined
  return price != null ? `约扣 ${price} 积分` : `未配置该规格价格`
}

export function MediaGenerationModal({ open, onClose, onComplete, defaultType = 'image' }: MediaGenerationModalProps) {
  const [models, setModels] = useState<GenerationModelItem[]>([])
  const [proxyKey, setProxyKey] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [job, setJob] = useState<MediaJob | null>(null)
  const [form] = Form.useForm<FormValues>()
  const type = Form.useWatch('type', form) || defaultType
  const modelId = Form.useWatch('modelId', form)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStart = useRef(0)

  const modelOptions = useMemo(
    () => models.filter((m) => m.type === type),
    [models, type],
  )
  const selectedModel = useMemo(
    () => modelOptions.find((m) => m.id === modelId),
    [modelOptions, modelId],
  )

  /** 打开时加载模型列表 */
  useEffect(() => {
    if (!open) return
    void loadModels()
    void (async () => {
      try {
        const r = await fetchLlmProxyKey()
        setProxyKey(r.llmProxyKey)
      } catch (err) {
        console.error('[MediaGeneration] fetch proxy key failed:', err)
        message.error('获取网关密钥失败，请重新登录')
      }
    })()
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [open])

  const loadModels = async () => {
    setLoadingModels(true)
    try {
      const list = await listGenerationModels()
      setModels(list || [])
      const preferred = list?.find((m) => m.type === defaultType) || list?.[0]
      if (preferred) {
        form.setFieldsValue({ type: preferred.type, modelId: preferred.id })
      } else {
        form.setFieldsValue({ type: defaultType, modelId: undefined })
      }
    } catch (err) {
      console.error('[MediaGeneration] load models failed:', err)
      message.error('加载生成模型失败: ' + ((err as Error).message || '网络错误'))
    } finally {
      setLoadingModels(false)
    }
  }

  /** 切换类型时重置模型 */
  const handleTypeChange = (t: GenerationModelType) => {
    form.setFieldsValue({ modelId: undefined, size: undefined, resolution: undefined, duration: undefined, fps: undefined })
    const first = models.find((m) => m.type === t)
    if (first) form.setFieldsValue({ modelId: first.id })
  }

  const stopPolling = () => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = null
  }

  /** 视频任务轮询 */
  const startPolling = (jobId: number) => {
    stopPolling()
    pollStart.current = Date.now()
    pollTimer.current = setInterval(async () => {
      try {
        const latest = await getVideoJobViaGateway(proxyKey, jobId)
        setJob(latest)
        if (latest.status === 'done' || latest.status === 'failed') {
          stopPolling()
          if (latest.status === 'done') {
            onComplete(latest)
            handleClose()
          } else {
            message.error(`生成失败：${latest.error || '上游任务失败'}（已自动退款）`)
            handleClose()
          }
          return
        }
        if (Date.now() - pollStart.current > MAX_POLL_MS) {
          stopPolling()
          message.warning('生成超时，请到生成记录中查看')
          handleClose()
        }
      } catch (err) {
        console.warn('[MediaGeneration] poll failed:', err)
      }
    }, POLL_INTERVAL)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields().catch(() => null)
    if (!values) return
    setSubmitting(true)
    setJob(null)
    try {
      if (values.type === 'image') {
        const result = await generateImageViaGateway(proxyKey, {
          model: values.modelId,
          prompt: values.prompt,
          size: values.size,
        })
        const first = result?.data?.[0]
        const url = first?.url || (first?.b64_json ? 'data:image/png;base64,' + first.b64_json : '')
        // 网关返回 OpenAI 兼容结果（无任务记录），构造伪 MediaJob 供会话插入
        const pseudoJob: MediaJob = {
          id: Date.now(),
          modelId: values.modelId,
          type: 'image',
          prompt: values.prompt,
          params: { size: values.size },
          status: 'done',
          resultUrls: url ? [url] : [],
          creditsCost: selectedModel?.pricePerImage ?? 10,
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        setJob(pseudoJob)
        onComplete(pseudoJob)
        handleClose()
      } else {
        const vidJob = await generateVideoViaGateway(proxyKey, {
          model: values.modelId,
          prompt: values.prompt,
          resolution: values.resolution,
          duration: values.duration,
          fps: values.fps,
        })
        setJob(vidJob)
        startPolling(vidJob.id)
      }
    } catch (err) {
      console.error('[MediaGeneration] submit failed:', err)
      message.error('生成失败: ' + ((err as Error).message || '网络错误'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    stopPolling()
    setJob(null)
    onClose()
  }

  const resOptions = (selectedModel?.generationParams?.video_resolutions || ['720p', '1080p'])
  const durOptions = (selectedModel?.generationParams?.video_durations || [5, 10])
  const fpsOptions = (selectedModel?.generationParams?.video_fps || [24, 30])
  const sizeOptions = (selectedModel?.generationParams?.image_sizes || ['1024x1024', '512x512'])

  return (
    <Modal
      title={type === 'image' ? '文生图' : '文生视频'}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={560}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ type: defaultType }}
        onValuesChange={(changed) => {
          if (changed.type) handleTypeChange(changed.type)
        }}
      >
        <Form.Item name="type" label="生成类型">
          <Select
            options={[
              { value: 'image', label: <span><PictureOutlined /> 文生图</span> },
              { value: 'video', label: <span><VideoCameraOutlined /> 文生视频</span> },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="modelId"
          label="生成模型"
          rules={[{ required: true, message: '请选择生成模型' }]}
        >
          <Select
            loading={loadingModels}
            placeholder={loadingModels ? '加载模型中...' : (modelOptions.length ? '选择模型' : '未配置生成模型，请到管理后台配置')}
            options={modelOptions.map((m) => ({
              value: m.id,
              label: `${m.name}（${m.provider}）`,
            }))}
            notFoundContent={modelOptions.length ? null : (
              <span>暂无 {type === 'image' ? '文生图' : '文生视频'} 模型</span>
            )}
          />
        </Form.Item>

        <Form.Item
          name="prompt"
          label="提示词"
          rules={[{ required: true, message: '请输入提示词' }]}
        >
          <Input.TextArea
            rows={3}
            maxLength={2000}
            placeholder="描述你想要生成的内容，例如：一只橘猫在草地上奔跑"
          />
        </Form.Item>

        {type === 'image' ? (
          <Form.Item name="size" label="图片尺寸">
            <Select options={sizeOptions.map((s) => ({ value: s, label: s }))} allowClear placeholder="默认" />
          </Form.Item>
        ) : (
          <>
            <Form.Item name="resolution" label="分辨率">
              <Select options={resOptions.map((r) => ({ value: r, label: r.toUpperCase() }))} />
            </Form.Item>
            <Form.Item name="duration" label="时长（秒）">
              <Select options={durOptions.map((d) => ({ value: d, label: `${d} 秒` }))} />
            </Form.Item>
            <Form.Item name="fps" label="帧率">
              <Select options={fpsOptions.map((f) => ({ value: f, label: `${f} fps` }))} />
            </Form.Item>
          </>
        )}

        {selectedModel && (
          <Alert
            type="info"
            showIcon
            icon={<ThunderboltOutlined />}
            message={formatCost(type, selectedModel, form.getFieldsValue())}
            style={{ marginBottom: 16 }}
          />
        )}

        {job && job.status !== 'done' && job.type === 'video' && (
          <div style={{ marginBottom: 16 }}>
            <Progress percent={job.status === 'processing' ? 40 : 10} status="active" />
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {job.status === 'pending' ? '任务已提交，等待处理...' : '视频生成中（约 1-5 分钟），完成后自动插入会话...'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={submitting}
            disabled={!modelId}
            onClick={() => void handleSubmit()}
          >
            开始生成
          </Button>
        </div>
      </Form>
    </Modal>
  )
}

export default MediaGenerationModal
