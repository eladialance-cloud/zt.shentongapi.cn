// Tab：形象视频（我的数字人形象）—— 2026-09-13 由原「素材管理」页并入素材库
import { useCallback, useEffect, useState } from 'react'
import { Button, Descriptions, Drawer, Empty, Popconfirm, Space, Spin, Table, Tag, Upload, message } from 'antd'
import { ReloadOutlined, UserOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { deleteMyDigitalHuman, listMyDigitalHumans, uploadDigitalHumanVideo } from '@/api/oral-workshop-api'
import type { DigitalHumanAsset } from '@/types/oral-workshop'
import { resolveMediaUrl } from '@/utils/media'
import { fmtTime } from './shared'
export function DigitalTab() {
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
