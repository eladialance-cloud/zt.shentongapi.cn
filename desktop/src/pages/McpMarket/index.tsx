// MCP 市场 - 官方目录页
// 搜索 + 分类筛选 + 卡片网格（下载 / 已下载去配置）

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  ConfigProvider,
  Empty,
  Input,
  Select,
  Spin,
  Tag,
  theme,
  message,
} from 'antd'
import {
  ApiOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  LoadingOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { mcpApi } from '@/api/mcp-api'
import type { McpCatalogItem } from '@/api/mcp-api'
import * as marketApi from '@/api/market-api'
import { useSystemStore } from '@/store/system'
import { NetworkError } from '@/utils/errors'
import EnvModal from './EnvModal'
import styles from './styles.module.css'

const CATEGORY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '全部分类', value: '' },
  { label: '数据库', value: 'database' },
  { label: '搜索', value: 'search' },
  { label: '浏览器', value: 'browser' },
  { label: '代码仓库', value: 'git' },
  { label: '文件', value: 'files' },
  { label: '消息', value: 'messaging' },
  { label: 'AI', value: 'ai' },
  { label: '运维', value: 'devops' },
  { label: '其他', value: 'other' },
]

const RUNTIME_META: Record<string, { text: string; color: string; bg: string; border: string }> = {
  node: { text: 'node', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.14)', border: 'rgba(34, 197, 94, 0.4)' },
  python: { text: 'python', color: '#7dd3fc', bg: 'rgba(125, 211, 252, 0.12)', border: 'rgba(125, 211, 252, 0.4)' },
  docker: { text: 'docker', color: '#c4b5fd', bg: 'rgba(139, 92, 246, 0.16)', border: 'rgba(139, 92, 246, 0.45)' },
  http: { text: 'http', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.14)', border: 'rgba(251, 146, 60, 0.4)' },
}

export default function McpMarket({ embedded = false }: { embedded?: boolean }) {
  const backendAvailable = useSystemStore((s) => s.backendAvailable)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<McpCatalogItem[]>([])
  const [category, setCategory] = useState('')
  const [keyword, setKeyword] = useState('')
  const [installingIds, setInstallingIds] = useState<Set<number>>(new Set())
  const [envModalOpen, setEnvModalOpen] = useState(false)
  const [envServerId, setEnvServerId] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await mcpApi.listCatalog({
        category: category || undefined,
        keyword: keyword.trim() || undefined,
      })
      setItems(result.list || [])
    } catch (err) {
      console.error('[McpMarket] load failed:', err)
      if (!(err instanceof NetworkError) || backendAvailable) {
        message.error('加载 MCP 目录失败')
      }
    } finally {
      setLoading(false)
    }
  }, [category, keyword, backendAvailable])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 下载安装到本地（官方目录包 + 本地 mcp.json 登记） */
  const handleDownload = async (item: McpCatalogItem) => {
    setInstallingIds((prev) => new Set(prev).add(item.id))
    try {
      const res = await marketApi.installMcp(item.id)
      if (!res.ok) throw new Error(res.error || '本地安装失败')
      message.success('已下载到我的，请配置环境变量后启用')
      await loadData()
    } catch (err) {
      console.error('[McpMarket] install failed:', err)
      message.error('下载失败: ' + (err as Error).message)
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  /** 已安装 → 打开环境变量配置 */
  const openEnv = (item: McpCatalogItem) => {
    if (item.mcpServerId == null) {
      message.warning('该服务尚未完成登记，请稍后重试')
      return
    }
    setEnvServerId(item.mcpServerId)
    setEnvModalOpen(true)
  }

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div className={styles.page}>
        {!embedded && (
          <div className={styles.header}>
            <div className={styles.titleArea}>
              <ApiOutlined className={styles.titleIcon} />
              <div>
                <h1 className={styles.title}>MCP 市场</h1>
                <div className={styles.subtitle}>发现并使用官方 MCP 服务</div>
              </div>
            </div>
          </div>
        )}

        {/* 工具栏：分类 + 搜索 */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <Select
              className={styles.filterSelect}
              value={category}
              onChange={(v) => setCategory(v)}
              options={CATEGORY_OPTIONS}
            />
          </div>
          <div className={styles.toolbarRight}>
            <Input.Search
              className={styles.searchBox}
              placeholder="搜索 MCP 名称 / 描述"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={() => void loadData()}
              allowClear
              enterButton
            />
          </div>
        </div>

        {/* 卡片列表 */}
        <Spin spinning={loading}>
          {items.length === 0 && !loading ? (
            <Empty
              description="官方目录维护中，敬请期待"
              style={{ marginTop: 80 }}
            />
          ) : (
            <div className={styles.mcpGrid}>
              {items.map((item) => (
                <McpCardItem
                  key={item.id}
                  item={item}
                  installing={installingIds.has(item.id)}
                  onDownload={() => handleDownload(item)}
                  onConfigure={() => openEnv(item)}
                />
              ))}
            </div>
          )}
        </Spin>

        <EnvModal
          open={envModalOpen}
          serverId={envServerId}
          onClose={() => setEnvModalOpen(false)}
          onSaved={() => void loadData()}
        />
      </div>
    </ConfigProvider>
  )
}

/** MCP 目录卡片项 */
function McpCardItem({
  item,
  installing,
  onDownload,
  onConfigure,
}: {
  item: McpCatalogItem
  installing: boolean
  onDownload: () => void
  onConfigure: () => void
}) {
  const runtime = RUNTIME_META[item.runtime] || RUNTIME_META.http
  return (
    <Card className={styles.mcpCard} bordered={false}>
      <div className={styles.mcpCardBody}>
        {/* 头部：图标 + 名称 + 状态角标 */}
        <div className={styles.mcpHeader}>
          <div className={styles.mcpIcon}>
            {item.icon ? (
              <img src={item.icon} alt={item.name} className={styles.mcpAvatarImg} />
            ) : (
              <div className={styles.mcpAvatar}>
                {item.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className={styles.mcpAvatarBadge}>
              {item.isInstalled ? (
                <CheckCircleOutlined style={{ color: '#22c55e' }} />
              ) : installing ? (
                <LoadingOutlined />
              ) : (
                <DownloadOutlined />
              )}
            </span>
          </div>
          <div className={styles.mcpNameBlock}>
            <div className={styles.mcpName} title={item.name}>
              {item.name}
            </div>
            {item.tags && item.tags.length > 0 && (
              <div className={styles.mcpTags}>
                {item.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className={styles.mcpTag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 简介（两行截断） */}
        <div className={styles.mcpDesc}>{item.description || '暂无描述'}</div>

        {/* runtime / 安全等级 / 传输方式 */}
        <div className={styles.mcpTagRow}>
          <Tag
            style={{
              color: runtime.color,
              background: runtime.bg,
              borderColor: runtime.border,
              marginRight: 0,
            }}
          >
            {runtime.text}
          </Tag>
          {item.securityLevel === 'official' ? (
            <Tag
              style={{
                color: '#22c55e',
                background: 'rgba(34, 197, 94, 0.14)',
                borderColor: 'rgba(34, 197, 94, 0.4)',
              }}
            >
              官方
            </Tag>
          ) : (
            <Tag>社区</Tag>
          )}
          <Tag>{item.transportType}</Tag>
        </div>

        {/* 底部按钮 */}
        <div className={styles.mcpFooter}>
          {item.isInstalled ? (
            <>
              <Button
                className={styles.installedBtn}
                icon={<CheckCircleOutlined />}
                disabled
              >
                已下载
              </Button>
              <Button
                className={styles.configureBtn}
                icon={<SettingOutlined />}
                onClick={onConfigure}
              >
                去配置
              </Button>
            </>
          ) : (
            <Button
              className={styles.downloadBtn}
              type="primary"
              icon={<DownloadOutlined />}
              loading={installing}
              disabled={installing}
              onClick={onDownload}
            >
              {installing ? '下载中…' : '下载'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
