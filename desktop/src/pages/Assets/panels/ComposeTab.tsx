// Tab：合成视频（口播工坊成片）—— 2026-09-13 由原「素材管理」页并入素材库
import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Tag, Table, Modal, Space, Spin, message } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { listOralWorkshopJobs } from '@/api/oral-workshop-api'
import type { OralWorkshopJob } from '@/types/oral-workshop'
import { resolveMediaUrl } from '@/utils/media'
import { fmtTime } from './shared'
export function ComposeTab() {
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
