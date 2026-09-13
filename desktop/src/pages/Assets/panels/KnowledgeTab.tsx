// Tab：知识库（知识库与文档只读聚合）—— 2026-09-13 由原「素材管理」页并入素材库
import { useCallback, useEffect, useState } from 'react'
import { Button, Drawer, Empty, List, Space, Spin, Tag, message } from 'antd'
import { BookOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import { listDocuments, listKnowledgeBases } from '@/api/knowledge-api'
import type { KnowledgeBase, KnowledgeDocument } from '@/types/knowledge'
import { fmtTime } from './shared'
export function KnowledgeTab() {
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
