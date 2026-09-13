/**
 * 素材管理（对标 RRClaw 素材管理 5 Tab）
 *
 * 统一聚合已有能力，零后端改造：
 *  - 合成视频：口播工坊任务产物（/oral-workshop/jobs，成片 videoUrl）
 *  - 融合素材：素材库（/media-assets，图片/视频，含语义索引状态）
 *  - 形象视频：我的数字人形象（/oral-workshop/digital-humans，支持上传真人视频建形象）
 *  - 音频素材：我的声音（/oral-workshop/voices，声音克隆产物）
 *  - 知识库：知识库与文档（/knowledge/bases、/knowledge/bases/:id/documents）
 *
 * 设计原则：只读聚合 + 轻量操作（预览/下载/删除/登记/上传），不复制业务实现。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Button, Card, Descriptions, Drawer, Empty, Form, Input, List, message, Modal, Popconfirm,
  Space, Spin, Table, Tabs, Tag, Upload,
} from 'antd'
import {
  AudioOutlined, BookOutlined, DownloadOutlined, FileTextOutlined, FolderOpenOutlined,
  InboxOutlined, PlusOutlined, ReloadOutlined, UserOutlined, VideoCameraOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import {
  createMyVoice, deleteMyDigitalHuman, deleteMyVoice, listMyDigitalHumans, listMyVoices,
  listOralWorkshopJobs, uploadDigitalHumanVideo,
} from '@/api/oral-workshop-api'
import type { DigitalHumanAsset, OralWorkshopJob, VoiceAsset } from '@/types/oral-workshop'
import {
  createMediaAsset, listMediaAssets, updateMediaAsset, type MediaAssetItem,
} from '@/api/media-assets-api'
import { listDocuments, listKnowledgeBases } from '@/api/knowledge-api'
import type { KnowledgeBase, KnowledgeDocument } from '@/types/knowledge'
import { resolveMediaUrl } from '@/utils/media'
import { MATERIAL_TABS } from './tabs'

const { TextArea } = Input

/** 素材类型展示 */
const TYPE_LABEL: Record<string, string> = { image: '图片', video: '视频', audio: '音频', file: '文件' }

function fmtTime(v?: string | Date | null): string {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('zh-CN', { hour12: false })
}

// ============ Tab 1：合成视频（口播工坊成片） ============
function ComposeTab() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OralWorkshopJob[]>([])
  const [playing, setPlaying] = useState<OralWorkshopJob | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listOralWorkshopJobs({ page: 1, pageSize: 50 })
      setRows((res.list ?? []).filter((j) => j.videoUrl))
    } catch (err) {
      message.error('合成视频加载失败：' + ((err as Error)?.message ?? err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
      </div>
      {rows.length === 0 && !loading ? (
        <Empty description="暂无合成视频（在口播工坊完成「渲染成片」后出现在这里）" />
      ) : (
        <Table<OralWorkshopJob>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: '成片', key: 'v', width: 300,
              render: (_v, r) => (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <video src={resolveMediaUrl(r.videoUrl!)} style={{ width: 120, height: 68, borderRadius: 6, objectFit: 'cover', background: '#000' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>任务 #{r.id}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{r.persona || r.scriptInput?.slice(0, 20) || '未命名'}</div>
                  </div>
                </div>
              ),
            },
            { title: '状态', dataIndex: 'status', width: 100, render: (s: string) => <Tag color={s === 'done' ? 'green' : 'default'}>{s}</Tag> },
            { title: '积分', dataIndex: 'creditsCost', width: 80 },
            { title: '完成时间', dataIndex: 'updatedAt', width: 170, render: (v: string) => fmtTime(v) },
            {
              title: '操作', key: 'a', width: 160,
              render: (_v, r) => (
                <Space size={4}>
                  <Button size="small" type="link" onClick={() => setPlaying(r)}>预览</Button>
                  <Button size="small" type="link" icon={<DownloadOutlined />} href={resolveMediaUrl(r.videoUrl!)} target="_blank" download>下载</Button>
                </Space>
              ),
            },
          ]}
        />
      )}
      <Modal open={!!playing} title={`预览 · 任务 #${playing?.id ?? ''}`} footer={null} onCancel={() => setPlaying(null)} width={720} destroyOnHidden>
        {playing?.videoUrl && (
          <video src={resolveMediaUrl(playing.videoUrl)} controls autoPlay style={{ width: '100%', borderRadius: 8, background: '#000' }} />
        )}
      </Modal>
    </Spin>
  )
}

// ============ Tab 2：融合素材（素材库图片/视频） ============
function FusionTab() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MediaAssetItem[]>([])
  const [urlOpen, setUrlOpen] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listMediaAssets({ page: 1, pageSize: 100 })
      setRows((res.list ?? []).filter((a) => a.assetType === 'image' || a.assetType === 'video'))
    } catch (err) {
      message.error('融合素材加载失败：' + ((err as Error)?.message ?? err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return
    setSaving(true)
    try {
      await createMediaAsset({ title: v.title.trim(), url: v.url.trim(), assetType: v.assetType, description: v.description?.trim() || undefined })
      message.success('素材已登记')
      setUrlOpen(false)
      form.resetFields()
      void load()
    } catch (err) {
      message.error('登记失败：' + ((err as Error)?.message ?? err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setUrlOpen(true)}>登记素材</Button>
      </div>
      {rows.length === 0 && !loading ? (
        <Empty description="暂无融合素材，点击「登记素材」或到口播工坊导入任务产物" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {rows.map((a) => (
            <Card
              key={a.id}
              size="small"
              hoverable
              cover={
                a.assetType === 'image'
                  ? <img src={resolveMediaUrl(a.url)} alt={a.title} style={{ height: 120, objectFit: 'cover' }} />
                  : <video src={resolveMediaUrl(a.url)} muted preload="metadata" style={{ height: 120, width: '100%', objectFit: 'cover', background: '#000' }} />
              }
              actions={[
                <Popconfirm key="d" title="确认删除该素材？" onConfirm={async () => { await updateMediaAsset(a.id, { archived: true }).catch(() => undefined); message.success('已归档'); void load() }}>
                  <span style={{ fontSize: 12 }}>归档</span>
                </Popconfirm>,
              ]}
            >
              <Card.Meta
                title={<span style={{ fontSize: 13 }}>{a.title}</span>}
                description={
                  <Space size={4}>
                    <Tag color={a.assetType === 'image' ? 'blue' : 'purple'}>{TYPE_LABEL[a.assetType] ?? a.assetType}</Tag>
                    {a.vectorStatus === 'ready' && <Tag color="cyan">已索引</Tag>}
                  </Space>
                }
              />
            </Card>
          ))}
        </div>
      )}
      <Modal open={urlOpen} title="登记素材" onCancel={() => setUrlOpen(false)} onOk={() => void submit()} okText="登记" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}><Input maxLength={128} /></Form.Item>
          <Form.Item name="url" label="素材地址" rules={[{ required: true, message: '请输入素材地址' }]}><Input placeholder="https://…" maxLength={1024} /></Form.Item>
          <Form.Item name="description" label="描述（帮助语义检索）"><TextArea rows={2} maxLength={500} /></Form.Item>
        </Form>
      </Modal>
    </Spin>
  )
}

// ============ Tab 3：形象视频（数字人形象） ============
function DigitalTab() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DigitalHumanAsset[]>([])
  const [preview, setPreview] = useState<DigitalHumanAsset | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listMyDigitalHumans())
    } catch (err) {
      message.error('形象视频加载失败：' + ((err as Error)?.message ?? err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const onUpload = async (file: File) => {
    try {
      message.loading({ content: '视频转码中…', key: 'dh' })
      const asset = await uploadDigitalHumanVideo(file)
      message.success({ content: '形象已创建', key: 'dh' })
      void load()
      setPreview(asset)
    } catch (err) {
      message.error({ content: '上传失败：' + ((err as Error)?.message ?? err), key: 'dh' })
    }
    return false
  }

  const KIND_LABEL: Record<string, string> = { cloud: '云端形象', video: '真人视频', image: '照片形象', avatar: '预置形象' }

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        <Upload accept="video/*" showUploadList={false} beforeUpload={(f) => onUpload(f)}>
          <Button type="primary" icon={<VideoCameraOutlined />}>上传真人视频建形象</Button>
        </Upload>
      </div>
      {rows.length === 0 && !loading ? (
        <Empty description="暂无形象视频，上传一段清晰正面口播视频即可创建" />
      ) : (
        <Table<DigitalHumanAsset>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: '形象', key: 'a', width: 320,
              render: (_v, r) => (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {r.previewUrl ? (
                    <img src={resolveMediaUrl(r.previewUrl)} alt={r.name} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: 6, background: 'var(--color-fill-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UserOutlined />
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{r.description || '未填写描述'}</div>
                  </div>
                </div>
              ),
            },
            { title: '类型', dataIndex: 'kind', width: 110, render: (k: string) => <Tag color="geekblue">{KIND_LABEL[k] ?? k}</Tag> },
            { title: '状态', dataIndex: 'status', width: 100, render: (s: string) => <Tag>{s}</Tag> },
            { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v: string) => fmtTime(v) },
            {
              title: '操作', key: 'o', width: 140,
              render: (_v, r) => (
                <Space size={4}>
                  <Button size="small" type="link" onClick={() => setPreview(r)}>预览</Button>
                  <Popconfirm title="确认删除该形象？" onConfirm={async () => { await deleteMyDigitalHuman(r.id).catch(() => undefined); message.success('已删除'); void load() }}>
                    <Button size="small" type="link" danger>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      )}
      <Drawer open={!!preview} title={preview?.name} width={420} onClose={() => setPreview(null)}>
        {preview && (
          <>
            {preview.videoUrl && <video src={resolveMediaUrl(preview.videoUrl)} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />}
            {preview.imageUrl && <img src={resolveMediaUrl(preview.imageUrl)} alt={preview.name} style={{ width: '100%', borderRadius: 8 }} />}
            <Descriptions column={1} size="small" bordered style={{ marginTop: 12 }}>
              <Descriptions.Item label="类型">{KIND_LABEL[preview.kind] ?? preview.kind}</Descriptions.Item>
              <Descriptions.Item label="云端 ID">{preview.cloudId || '-'}</Descriptions.Item>
              <Descriptions.Item label="授权">{preview.authorized ? '已授权' : '未授权'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{fmtTime(preview.createdAt)}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>
    </Spin>
  )
}

// ============ Tab 4：音频素材（我的声音 / 声音克隆） ============
function AudioTab() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<VoiceAsset[]>([])
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listMyVoices())
    } catch (err) {
      message.error('音频素材加载失败：' + ((err as Error)?.message ?? err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return
    setSaving(true)
    try {
      await createMyVoice({ name: v.name.trim(), refAudioUrl: v.refAudioUrl.trim(), emotionRefAudio: v.emotionRefAudio?.trim() || undefined })
      message.success('声音克隆任务已提交')
      setOpen(false)
      form.resetFields()
      void load()
    } catch (err) {
      message.error('提交失败：' + ((err as Error)?.message ?? err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        <Button type="primary" icon={<AudioOutlined />} onClick={() => setOpen(true)}>声音克隆</Button>
      </div>
      {rows.length === 0 && !loading ? (
        <Empty description="暂无音频素材，上传 10-60 秒清晰人声参考音频即可克隆" />
      ) : (
        <Table<VoiceAsset>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: '名称', dataIndex: 'name', render: (n: string, r) => (<div><div style={{ fontWeight: 600 }}>{n}</div><div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>speaker: {r.speakerId || '生成中'}</div></div>) },
            { title: '试听', key: 'd', width: 240, render: (_v, r) => (r.demoAudio || r.refAudioUrl) ? <audio src={resolveMediaUrl(r.demoAudio || r.refAudioUrl)} controls style={{ width: 220, height: 32 }} /> : '-' },
            { title: '状态', dataIndex: 'status', width: 100, render: (s: string) => <Tag color={s === 'ready' || s === 'done' ? 'green' : 'processing'}>{s}</Tag> },
            { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v: string) => fmtTime(v) },
            {
              title: '操作', key: 'o', width: 90,
              render: (_v, r) => (
                <Popconfirm title="确认删除该声音？" onConfirm={async () => { await deleteMyVoice(r.id).catch(() => undefined); message.success('已删除'); void load() }}>
                  <Button size="small" type="link" danger>删除</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      )}
      <Modal open={open} title="声音克隆" onCancel={() => setOpen(false)} onOk={() => void submit()} okText="提交克隆" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="声音名称" rules={[{ required: true, message: '请输入名称' }]}><Input maxLength={64} placeholder="如：我的声音-男声" /></Form.Item>
          <Form.Item name="refAudioUrl" label="参考音频地址" rules={[{ required: true, message: '请输入参考音频地址' }]} tooltip="10-60 秒清晰人声，建议无明显背景噪音">
            <Input placeholder="https://…（或先在口播工坊上传成音）" />
          </Form.Item>
          <Form.Item name="emotionRefAudio" label="情感参考音频（可选）"><Input placeholder="https://…" /></Form.Item>
        </Form>
      </Modal>
    </Spin>
  )
}

// ============ Tab 5：知识库 ============
function KnowledgeTab() {
  const [loading, setLoading] = useState(true)
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [active, setActive] = useState<KnowledgeBase | null>(null)
  const [docs, setDocs] = useState<KnowledgeDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setBases(await listKnowledgeBases())
    } catch (err) {
      message.error('知识库加载失败：' + ((err as Error)?.message ?? err))
      setBases([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!active) { setDocs([]); return }
    setDocsLoading(true)
    void listDocuments(active.id)
      .then((d) => setDocs(d ?? []))
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false))
  }, [active])

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
      </div>
      {bases.length === 0 && !loading ? (
        <Empty description="暂无知识库（在「知识库」页面创建）" />
      ) : (
        <List
          bordered
          dataSource={bases}
          renderItem={(b) => (
            <List.Item
              actions={[<Button key="v" size="small" type="link" onClick={() => setActive(b)}>查看文档</Button>]}
            >
              <List.Item.Meta
                avatar={<BookOutlined style={{ fontSize: 20, color: 'var(--color-brand)' }} />}
                title={b.name}
                description={b.description || `创建于 ${fmtTime(b.createdAt)}`}
              />
            </List.Item>
          )}
        />
      )}
      <Drawer open={!!active} title={`知识库 · ${active?.name ?? ''}`} width={560} onClose={() => setActive(null)}>
        <Spin spinning={docsLoading}>
          {docs.length === 0 && !docsLoading ? (
            <Empty description="该知识库暂无文档" />
          ) : (
            <List
              bordered
              dataSource={docs}
              renderItem={(d) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<FileTextOutlined />}
                    title={d.fileName}
                    description={
                      <Space size={4}>
                        <Tag color={d.chunkStatus === 'completed' ? 'green' : d.chunkStatus === 'failed' ? 'red' : 'processing'}>{d.chunkStatus}</Tag>
                        <span style={{ fontSize: 12 }}>{fmtTime(d.createdAt)}</span>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Drawer>
    </Spin>
  )
}

export default function MaterialsPage() {
  const TAB_CHILDREN: Record<string, ReactNode> = {
    compose: <ComposeTab />,
    fusion: <FusionTab />,
    digital: <DigitalTab />,
    audio: <AudioTab />,
    knowledge: <KnowledgeTab />,
  }
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <FolderOpenOutlined style={{ fontSize: 20, color: 'var(--color-brand)' }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>素材管理</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>统一管理合成视频、融合素材、形象视频、音频素材与知识库</div>
        </div>
      </div>
      <Card bordered={false}>
        <Tabs
          defaultActiveKey="compose"
          items={MATERIAL_TABS.map((t) => ({ key: t.key, label: t.label, children: TAB_CHILDREN[t.key] }))}
        />
      </Card>
    </div>
  )
}
