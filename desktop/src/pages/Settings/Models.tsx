// 模型设置（Phase 4：每类默认模型）
// 分类默认模型：文本对话 chat / 图片识图 vision / 文生图 image（含图生图）/ 视频生成 video / 语音合成 tts
// 作用：llm-proxy 多模态网关在请求未显式指定模型时，按分类使用这里的默认模型；
//       OpenClaw/Hermes/N8N 工作流（文案/识图/绘画/视频/语音）未指定模型时自动走分类默认。
//
// API：
//   GET  /models                          全量启用模型（含 modelType/modelId）
//   GET  /chat/accounting/default-models  读取当前每类默认
//   POST /chat/accounting/default-models  保存每类默认（null = 清除）

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Card,
  Form,
  Select,
  Button,
  Spin,
  Divider,
  Alert,
  message
} from 'antd'
import {
  RobotOutlined,
  EyeOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  SaveOutlined
} from '@ant-design/icons'
import {
  listAllModels,
  getDefaultModels,
  setDefaultModels,
  type AllModelOption,
  type UserDefaultModels
} from '@/api/chat-api'
import { useSystemStore } from '@/store/system'
import { NetworkError } from '@/utils/errors'
import styles from './styles.module.css'

/** 分类定义：key = 存储字段，match = 模型分类匹配 */
const CATEGORY_DEFS: Array<{
  key: keyof UserDefaultModels
  label: string
  desc: string
  icon: React.ReactNode
  match: (t: string) => boolean
}> = [
  {
    key: 'chat',
    label: '文本对话 chat',
    desc: '对话/文案/问答，OpenClaw 未指定模型时使用',
    icon: <RobotOutlined />,
    match: (t) => t === 'chat' || t === 'vision' || t === 'reasoning'
  },
  {
    key: 'vision',
    label: '图片识图 vision',
    desc: '看图问答/图片解析；对话含图片且对话模型不支持视觉时自动切换',
    icon: <EyeOutlined />,
    match: (t) => t === 'vision'
  },
  {
    key: 'image',
    label: '文生图 image（含图生图）',
    desc: 'AI 绘画，按张计费',
    icon: <PictureOutlined />,
    match: (t) => t === 'image' || t === 'image_edit'
  },
  {
    key: 'video',
    label: '视频生成 video',
    desc: '文生视频/图生视频，异步任务，按分辨率×时长矩阵计费',
    icon: <VideoCameraOutlined />,
    match: (t) => t === 'video'
  },
  {
    key: 'tts',
    label: '语音合成 tts',
    desc: '文字转语音，按次计费',
    icon: <AudioOutlined />,
    match: (t) => t === 'tts'
  }
]

export default function SettingsModels() {
  const [form] = Form.useForm<UserDefaultModels>()
  const backendAvailable = useSystemStore((s) => s.backendAvailable)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<AllModelOption[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [list, defaults] = await Promise.all([
        listAllModels(),
        getDefaultModels()
      ])
      setModels(list || [])
      form.setFieldsValue({
        chat: defaults?.chat ?? undefined,
        vision: defaults?.vision ?? undefined,
        image: defaults?.image ?? undefined,
        video: defaults?.video ?? undefined,
        tts: defaults?.tts ?? undefined
      })
    } catch (err) {
      console.error('[SettingsModels] load failed:', err)
      if (!(err instanceof NetworkError) || backendAvailable) {
        message.error('加载模型设置失败')
      }
    } finally {
      setLoading(false)
    }
  }, [form, backendAvailable])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const dto: UserDefaultModels = {
        chat: values.chat || null,
        vision: values.vision || null,
        image: values.image || null,
        video: values.video || null,
        tts: values.tts || null
      }
      await setDefaultModels(dto)
      // 方案 B：通知主进程同步 Hermes / ST-Claw 配置（失败不阻断保存）
      try {
        window.electronAPI?.modelDefaultsSync?.(dto)
      } catch (err) {
        console.warn('[SettingsModels] modelDefaultsSync failed:', err)
      }
      message.success('默认模型已保存')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SettingsModels] save failed:', err)
      message.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const defaultValues = Form.useWatch([], form) as Partial<UserDefaultModels> | undefined

  /** 分类下拉选项：该分类的启用模型 + 已停用但被选中的默认模型 */
  const categoryOptions = useMemo(() => {
    const map = new Map<string, Array<{ label: string; value: string }>>()
    for (const def of CATEGORY_DEFS) {
      const list = models.filter((m) => def.match((m.modelType || 'chat').toLowerCase()))
      const current = defaultValues?.[def.key]
      if (current && !list.some((m) => m.modelId === current)) {
        list.push({
          id: -1,
          name: current + '（已停用或已下架）',
          provider: '',
          modelType: '',
          modelId: current
        })
      }
      map.set(
        def.key,
        list.map((m) => ({
          label: m.name + '（' + (m.modelId || m.id) + '）' + (m.provider ? ' · ' + m.provider : ''),
          value: m.modelId || String(m.id)
        }))
      )
    }
    return map
  }, [models, defaultValues])

  return (
    <Spin spinning={loading}>
      <Card className={styles.card} bordered={false}>
        <div className={styles.cardBody}>
          <Alert
            type="info"
            showIcon
            message="每类默认模型"
            description="OpenClaw / Hermes / N8N 工作流调用 llm-proxy 网关时，未显式指定模型将按分类使用这里的默认模型（如文案推理用文本对话、图片生成用文生图）；不设置则取管理后台排序权重最靠前的该分类模型。"
            style={{ marginBottom: 16 }}
          />
          <Form form={form} layout="vertical">
            {CATEGORY_DEFS.map((def) => (
              <Form.Item key={def.key} name={def.key} label={
                <span>
                  {def.icon} {def.label}
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginLeft: 8 }}>
                    {def.desc}
                  </span>
                </span>
              }>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="不指定（使用后台默认排序第一）"
                  options={categoryOptions.get(def.key) || []}
                />
              </Form.Item>
            ))}
            <Divider style={{ margin: '8px 0 16px' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={() => void handleSave()}
              >
                保存默认模型
              </Button>
            </div>
          </Form>
        </div>
      </Card>
    </Spin>
  )
}
