/**
 * 口播工坊 · 工作台（M6-2 + 对标参考软件补全）
 * 输入文案 / 人设 / 目标受众 / 风格 → 选题灵感（关键词选题）
 * 我的声音（参考音频） / 我的形象（火山形象 ID） / 上传成音 / 上传数字人视频
 * → 选择模板 → 预估 Credits → 提交任务
 */
import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Modal, Select, Spin, Switch, Tag, Upload, message } from 'antd'
import {
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
  generateTopics,
  listMyDigitalHumans,
  listMyVoices,
  listOralWorkshopTemplates,
} from '@/api/oral-workshop-api'
import { uploadFile } from '@/api/file-api'
import { useOralWorkshopStore } from '@/store/oral-workshop'
import { useCreditsStore } from '@/store/credits'
import { getMembershipStatus } from '@/api/membership-api'
import { LEVEL_COLOR, LEVEL_LABEL, voiceCloneEnabled, type MembershipStatusView } from '@/types/membership'
import type { DigitalHumanAsset, OralWorkshopTemplateMeta, TopicItem, VoiceAsset } from '@/types/oral-workshop'
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

export default function OralWorkshopWorkbench() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const { draft, setDraft } = useOralWorkshopStore()
  const { balance, loaded, fetchBalance } = useCreditsStore()
  const [templates, setTemplates] = useState<OralWorkshopTemplateMeta[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [membership, setMembership] = useState<MembershipStatusView | null>(null)

  // 对标参考软件新增：我的声音 / 我的形象 / 上传素材 / 选题灵感
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
  const [batchDhIds, setBatchDhIds] = useState<number[]>([])
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  useEffect(() => {
    void fetchBalance()
    void getMembershipStatus()
      .then(setMembership)
      .catch(() => setMembership(null))
    void listOralWorkshopTemplates()
      .then(setTemplates)
      .catch((err: Error) => message.error('模板列表加载失败: ' + (err?.message ?? err)))
      .finally(() => setTemplatesLoading(false))
    void listMyVoices().then(setVoices).catch(() => setVoices([]))
    void listMyDigitalHumans().then(setDhAssets).catch(() => setDhAssets([]))
  }, [fetchBalance])

  // 草稿回填（localStorage 持久化）
  useEffect(() => {
    form.setFieldsValue({
      scriptInput: draft.scriptInput,
      goal: draft.goal,
      targetAudience: draft.targetAudience,
      style: draft.style,
      persona: draft.persona,
      templateId: draft.templateId,
    })
  }, [form, draft])

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
    digitalHumanId?: number
    bilingual?: boolean
  }) => {
    setSubmitting(true)
    try {
      const job = await createOralWorkshopJob({
        scriptInput: values.scriptInput,
        goal: values.goal,
        targetAudience: values.targetAudience,
        style: values.style,
        persona: values.persona,
        templateId: values.templateId ?? undefined,
        voiceId: values.voiceId,
        digitalHumanId: values.digitalHumanId,
        audioUrl,
        videoUrl,
        bilingual: values.bilingual,
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}>
            <Mic size={17} strokeWidth={2} />
          </span>
          <div>
            <h1 className={styles.title}>口播工坊</h1>
            <div className={styles.subtitle}>输入文案 → 自动生成数字人口播短视频 → 导出发布包</div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button icon={<Lightbulb size={14} />} onClick={() => setTopicsOpen(true)}>
            选题灵感
          </Button>
          <Button icon={<Layers size={14} />} onClick={() => setBatchOpen(true)}>
            批量生成
          </Button>
          <div className={styles.balancePill}>
            <Coins size={14} />
            <span>Credits 余额</span>
            <strong>{loaded ? balance : '--'}</strong>
          </div>
        </div>
      </header>

      <div className={styles.workbenchGrid}>
        <Card
          className={styles.card}
          title={
            <span className={styles.cardTitle}>
              <FileText size={14} /> 创作输入
            </span>
          }
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              name="scriptInput"
              label="口播文案 / 选题"
              rules={[{ required: true, message: '请输入口播文案或选题' }]}
            >
              <TextArea
                rows={8}
                maxLength={20000}
                placeholder="粘贴您的文案或选题，例如：3 个让你效率翻倍的 AI 技巧…（可点击右上角「选题灵感」生成）"
                showCount
              />
            </Form.Item>
            <div className={styles.formRow}>
              <Form.Item name="persona" label="人设（可选）" className={styles.formCol}>
                <Input placeholder="如：资深 AI 产品经理" maxLength={512} />
              </Form.Item>
              <Form.Item name="targetAudience" label="目标受众（可选）" className={styles.formCol}>
                <Input placeholder="如：职场新人 / 宝妈 / 创业者" maxLength={255} />
              </Form.Item>
            </div>
            <div className={styles.formRow}>
              <Form.Item name="style" label="口播风格（可选）" className={styles.formCol}>
                <Input placeholder="如：口语化、有网感、干货型" maxLength={512} />
              </Form.Item>
              <Form.Item name="goal" label="创作目标（可选）" className={styles.formCol}>
                <Input placeholder="如：涨粉 / 带货 / 知识科普" maxLength={2000} />
              </Form.Item>
            </div>

            <div className={styles.formRow}>
              <Form.Item name="voiceId" label="我的声音（火山克隆）" className={styles.formCol}>
                <Select
                  placeholder="选择克隆声音（留空=预设/系统语音/上传成音）"
                  allowClear
                  options={voices.map((v) => ({ value: v.id, label: v.name + (v.speakerId ? ' ✓' : '') }))}
                />
              </Form.Item>
              <Form.Item name="digitalHumanId" label="我的形象（火山数字人）" className={styles.formCol}>
                <Select
                  placeholder="选择数字人形象（留空=上传视频/卡片兜底）"
                  allowClear
                  options={dhAssets.map((d) => ({ value: d.id, label: d.name + (d.authorized ? '' : '（未授权）') }))}
                />
              </Form.Item>
            </div>
            <div className={styles.assetActions}>
              <Button
                size="small"
                type="dashed"
                icon={<Plus size={12} />}
                onClick={() => setRefAudioOpen(true)}
              >
                添加参考音频（我的声音）
              </Button>
              <Button
                size="small"
                type="dashed"
                icon={<Plus size={12} />}
                onClick={() => setDhModalOpen(true)}
              >
                添加形象 ID
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
                label="上传成音"
                accept="audio/*"
                value={audioUrl}
                onUpload={setAudioUrl}
                onClear={() => setAudioUrl(undefined)}
              />
              <MediaUploadRow
                label="上传数字人/绿幕视频"
                accept="video/*"
                value={videoUrl}
                onUpload={setVideoUrl}
                onClear={() => setVideoUrl(undefined)}
              />
            </div>

            <Form.Item name="templateId" label="模板">
              <Select
                placeholder="选择视频模板（默认 t1 经典黄白）"
                loading={templatesLoading}
                allowClear
                options={templates.map((t) => ({
                  value: Number(t.template_id.replace(/^t/, '')),
                  label:
                    t.name +
                    '  ' +
                    t.width +
                    'x' +
                    t.height +
                    ' · ' +
                    t.duration +
                    's' +
                    (t.description ? ' — ' + t.description : ''),
                }))}
              />
            </Form.Item>
            <Form.Item
              name="bilingual"
              label="双语字幕（中英对照）"
              valuePropName="checked"
              tooltip="开启后字幕渲染中英双行（LLM 翻译），适合出海/国际受众"
            >
              <Switch checkedChildren="中英双行" unCheckedChildren="仅中文" />
            </Form.Item>
            <div className={styles.submitRow}>
              <div className={styles.estimate}>
                <Sparkles size={14} />
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
          </Form>
        </Card>

        <div className={styles.sideCol}>
          <Card className={styles.card} title={<span className={styles.cardTitle}>7 步流水线</span>}>
            <div className={styles.membershipRow}>
              <span className={styles.membershipLabel}>当前会员</span>
              {membership ? (
                <Tag color={LEVEL_COLOR[membership.level]}>{LEVEL_LABEL[membership.level]}</Tag>
              ) : (
                <Tag>--</Tag>
              )}
            </div>
            <ol className={styles.stepsList}>
              <li>extract — 文案抽取</li>
              <li>rewrite — LLM 改写</li>
              <li>voiceClone — 声音克隆</li>
              <li>digitalHuman — 数字人合成</li>
              <li>videoEdit — ffmpeg 合成</li>
              <li>titleCover — 标题 + 封面</li>
              <li>publishReady — 发布就绪</li>
            </ol>
            {membership && !voiceCloneEnabled(membership.features) && (
              <div className={styles.lockHint}>🔒 声音克隆需专业版解锁（免费档使用预设声音）</div>
            )}
            {membership && membership.features.digitalHumans === 0 && (
              <div className={styles.lockHint}>🔒 数字人形象未开放</div>
            )}
            {membership && membership.features.publish === 'export_only' && (
              <div className={styles.lockHint}>📦 当前等级仅支持导出，专业版解锁发布包</div>
            )}
            <div className={styles.notice}>
              <Spin spinning={templatesLoading} size="small" />
              <span>声音克隆与数字人形象需先配置火山方舟密钥；未配置时自动使用上传素材或本地兜底。</span>
            </div>
          </Card>
        </div>
      </div>

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
            <Input placeholder="火山控制台-数字人-形象 ID" maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量生成弹窗（矩阵化：文案 × 模板 × 声音 × 形象） */}
      <Modal
        open={batchOpen}
        title="批量生成（矩阵化建单）"
        onCancel={() => setBatchOpen(false)}
        onOk={() => void handleBatchSubmit()}
        okText={batchSubmitting ? '创建中…' : '开始批量创建'}
        confirmLoading={batchSubmitting}
        width={640}
      >
        <div className={styles.topicInputRow} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <TextArea
            rows={8}
            placeholder={'粘贴多条文案，每行一条（最多 50 条）。\n例：\n3 个让你效率翻倍的 AI 技巧\n普通人如何靠 AI 副业月入过万'}
            value={batchTopics}
            maxLength={50000}
            onChange={(e) => setBatchTopics(e.target.value)}
          />
          <div className={styles.batchCount}>已解析文案：{batchTopicCount} 条</div>
        </div>
        <div className={styles.formRow}>
          <Form.Item label="模板矩阵（可多选）" className={styles.formCol}>
            <Select
              mode="multiple"
              allowClear
              placeholder="不选 = 默认模板"
              value={batchTemplateIds}
              onChange={setBatchTemplateIds}
              options={templates.map((t) => ({
                value: Number(t.template_id.replace(/^t/, '')),
                label: t.name + '  ' + t.width + 'x' + t.height + ' ' + t.duration + 's',
              }))}
            />
          </Form.Item>
        </div>
        <div className={styles.formRow}>
          <Form.Item label="声音矩阵（可多选）" className={styles.formCol}>
            <Select
              mode="multiple"
              allowClear
              placeholder="不选 = 系统语音"
              value={batchVoiceIds}
              onChange={setBatchVoiceIds}
              options={voices.map((v) => ({ value: v.id, label: v.name + (v.speakerId ? ' ✓' : '') }))}
            />
          </Form.Item>
          <Form.Item label="形象矩阵（可多选）" className={styles.formCol}>
            <Select
              mode="multiple"
              allowClear
              placeholder="不选 = 上传视频/卡片兜底"
              value={batchDhIds}
              onChange={setBatchDhIds}
              options={dhAssets.map((d) => ({ value: d.id, label: d.name + (d.authorized ? '' : '（未授权）') }))}
            />
          </Form.Item>
        </div>
        <div className={styles.estimate}>
          <Sparkles size={14} />
          <span>将创建</span>
          <Tag color="gold">{batchEstimated}</Tag>
          <span>个任务，预估消耗</span>
          <Tag color="gold">{batchEstimated * ORAL_WORKSHOP_ESTIMATED_CREDITS} Credits</Tag>
          <span className={styles.estimateHint}>逐单预扣，失败自动退还</span>
        </div>
      </Modal>
    </div>
  )
}
