// 我的-本地详情页：展示已下载内容的完整信息（含提示词/配置/SKILL.md，离线可看）
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DeploymentUnitOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Button, Card, Descriptions, Empty, Popconfirm, Spin, Tag, message } from 'antd'
import * as hermesApi from '@/api/hermes-api'
import * as pluginApi from '@/api/plugin-api'
import * as marketApi from '@/api/market-api'
import type { MarketItemDetail, MarketItemType } from '@/types/market'
import styles from './styles.module.css'
import WorkflowExecutions from './WorkflowExecutions'

const TYPE_META: Record<MarketItemType, { label: string }> = {
  plugin: { label: '插件' },
  workflow: { label: '工作流' },
  agent: { label: 'Agent' },
  skill: { label: '技能包' },
}

const SOURCE_META: Record<string, string> = {
  official: '官方下载',
  custom: '自定义导入',
  chat: '对话安装',
}

/** 拉取官方市场最新版本号(仅官方来源做更新检测) */
async function fetchOfficialLatest(type: MarketItemType, id: number | string): Promise<string | undefined> {
  try {
    if (type === 'agent' || type === 'workflow') {
      const pkg = await marketApi.getDownloadPackage(type, Number(id))
      return pkg.version
    }
    if (type === 'skill') {
      const list = await hermesApi.listSkillMarket()
      return (list || []).find((s) => String(s.id) === String(id))?.version
    }
    if (type === 'plugin') {
      const res = await pluginApi.listMarketPlugins({ page: 1, pageSize: 100 })
      return (res.list || []).find((p) => String(p.id) === String(id))?.version
    }
  } catch (err) {
    console.warn('[LocalDetail] 官方版本比对失败:', err)
  }
  return undefined
}

function TypeIcon({ type }: { type: MarketItemType }) {
  const common = { style: { fontSize: 20 } }
  switch (type) {
    case 'agent':
      return <RobotOutlined {...common} />
    case 'workflow':
      return <DeploymentUnitOutlined {...common} />
    case 'plugin':
      return <AppstoreOutlined {...common} />
    default:
      return <ThunderboltOutlined {...common} />
  }
}

export default function LocalDetail() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<MarketItemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | undefined>(undefined)
  const [updating, setUpdating] = useState(false)

  const loadData = useCallback(async () => {
    if (!type || !id) return
    setLoading(true)
    setError('')
    try {
      const d = await marketApi.getDetail(type as MarketItemType, decodeURIComponent(id))
      setDetail(d)
      if (d.source === 'official') {
        setLatestVersion(await fetchOfficialLatest(type as MarketItemType, d.id))
      } else {
        setLatestVersion(undefined)
      }
    } catch (err) {
      setError((err as Error).message || '加载详情失败')
    } finally {
      setLoading(false)
    }
  }, [type, id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleUninstall = async () => {
    if (!type || !detail) return
    setRemoving(true)
    try {
      const res = await marketApi.uninstall(type as MarketItemType, detail.id)
      if (!res.ok) throw new Error(res.error || '卸载失败')
      message.success(`已卸载「${detail.name}」`)
      navigate('/skill-market')
    } catch (err) {
      message.error('卸载失败: ' + (err as Error).message)
    } finally {
      setRemoving(false)
    }
  }

  const handleUpdate = async () => {
    if (!type || !detail || !latestVersion || latestVersion === detail.version) return
    setUpdating(true)
    try {
      const pkg = await marketApi.getDownloadPackage(type as MarketItemType, Number(detail.id))
      const res = await marketApi.update(type as MarketItemType, Number(detail.id), detail.name, latestVersion, pkg.pkg)
      if (!res.ok) throw new Error(res.error || '更新失败')
      message.success(`「${detail.name}」已更新到 ${latestVersion}`)
      await loadData()
    } catch (err) {
      message.error('更新失败: ' + (err as Error).message)
    } finally {
      setUpdating(false)
    }
  }

  const renderBody = (d: MarketItemDetail) => {
    const payload = d.detail as Record<string, unknown>
    if (d.type === 'agent') {
      return (
        <>
          <Card title="提示词（System Prompt）" style={{ marginBottom: 16 }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 13 }}>
              {String(payload.systemPrompt || payload.prompt || '（无提示词）')}
            </pre>
          </Card>
          <Card title="配置">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="模型">{String(payload.modelId || payload.model || '-')}</Descriptions.Item>
              <Descriptions.Item label="运行时">{String(payload.runtimeType || '-')}</Descriptions.Item>
              <Descriptions.Item label="工具-插件">{Array.isArray(payload.allowedPluginIds) ? (payload.allowedPluginIds as unknown[]).join(', ') : '-'}</Descriptions.Item>
              <Descriptions.Item label="工具-工作流">{Array.isArray(payload.allowedWorkflowIds) ? (payload.allowedWorkflowIds as unknown[]).join(', ') : '-'}</Descriptions.Item>
              <Descriptions.Item label="知识库">{Array.isArray(payload.allowedKnowledgeBaseIds) ? (payload.allowedKnowledgeBaseIds as unknown[]).join(', ') : '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )
    }
    if (d.type === 'skill') {
      const markdown = String(payload.markdown || '')
      return (
        <>
          <Card title="SKILL.md 内容" style={{ marginBottom: 16 }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 13 }}>
              {markdown || '（无内容）'}
            </pre>
          </Card>
          <Card title="Manifest">
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 13 }}>
              {JSON.stringify(payload.manifest ?? {}, null, 2)}
            </pre>
          </Card>
        </>
      )
    }
    if (d.type === 'workflow') {
      const wf = (payload.workflowJson ?? payload) as Record<string, unknown>
      return (
        <>
          <Card title="工作流配置（JSON）" style={{ marginBottom: 16 }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 13 }}>
              {JSON.stringify(wf, null, 2)}
            </pre>
          </Card>
          <Card title="执行历史">
            {typeof d.id === 'number' ? (
              <WorkflowExecutions workflowId={d.id} />
            ) : (
              <Empty description="自定义工作流暂无执行记录" />
            )}
          </Card>
        </>
      )
    }
    // plugin
    const manifest = (payload.manifest ?? payload) as Record<string, unknown>
    return (
      <Card title="插件配置（Manifest）">
        <Descriptions column={1} size="small" bordered>
          {Object.entries(manifest).map(([k, v]) => (
            <Descriptions.Item key={k} label={k}>
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className={styles.pageContainer} style={{ alignItems: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className={styles.pageContainer}>
        <Empty description={error || '未找到本地内容'} style={{ marginTop: 64 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/skill-market')}>
            返回技能市场
          </Button>
        </Empty>
      </div>
    )
  }

  const source = SOURCE_META[detail.source] || '官方下载'
  return (
    <div className={styles.pageContainer}>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/skill-market')} style={{ alignSelf: 'flex-start' }}>
        返回技能市场
      </Button>

      <Card bordered={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-brand-light)', color: 'var(--color-brand)', flexShrink: 0 }}>
            <TypeIcon type={detail.type} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>{detail.name}</span>
              <Tag color="blue">{TYPE_META[detail.type].label}</Tag>
              <Tag color={detail.source === 'official' ? 'gold' : detail.source === 'chat' ? 'green' : 'purple'}>{source}</Tag>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
              版本 {detail.version} · 安装于 {new Date(detail.installedAt).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#8b98a5', wordBreak: 'break-all', marginTop: 2 }}>
              安装位置：{detail.dir}
            </div>
          </div>
          {detail.source === 'official' && latestVersion && latestVersion !== detail.version ? (
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={updating}
              onClick={handleUpdate}
              style={{ marginRight: 8 }}
            >
              更新到 {latestVersion}
            </Button>
          ) : null}
          <Popconfirm title={`确定卸载「${detail.name}」吗？`} onConfirm={handleUninstall} okText="卸载" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button danger icon={<DeleteOutlined />} loading={removing}>
              卸载
            </Button>
          </Popconfirm>
        </div>
        {detail.description ? (
          <div style={{ marginTop: 12, fontSize: 14, color: 'var(--color-text-secondary)' }}>{detail.description}</div>
        ) : null}
      </Card>

      <div style={{ marginTop: 4 }}>{renderBody(detail)}</div>
    </div>
  )
}