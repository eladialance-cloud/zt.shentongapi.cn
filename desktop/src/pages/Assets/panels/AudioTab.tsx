// Tab：音频素材（我的声音 / 声音克隆）—— 2026-09-13 由原「素材管理」页并入素材库
import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Form, Input, Modal, Popconfirm, Spin, Table, Tag, message } from 'antd'
import { AudioOutlined, ReloadOutlined } from '@ant-design/icons'
import { createMyVoice, deleteMyVoice, listMyVoices } from '@/api/oral-workshop-api'
import type { VoiceAsset } from '@/types/oral-workshop'
import { resolveMediaUrl } from '@/utils/media'
import { fmtTime } from './shared'
export function AudioTab() {
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
