// 插件市场页
// 布局：顶部标题 + Tab 导航 + 筛选/搜索 + 插件卡片网格
// 调用 GET /plugins/market?category=&keyword=

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Select, Spin, Tag, message } from 'antd'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  DownloadOutlined,
  MessageOutlined,
  SearchOutlined,
  StarOutlined,
  FireOutlined,
  DollarOutlined
} from '@ant-design/icons'
import * as pluginApi from '@/api/plugin-api'
import type { Plugin, PluginType, PluginMarketQuery } from '@/types/plugin'
import styles from './styles.module.css'

/** 分类选项 */
const CATEGORY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '全部分类', value: '' },
  { label: '工具', value: 'tool' },
  { label: '连接器', value: 'connector' },
  { label: '知识库', value: 'knowledge_base' },
  { label: '工作流', value: 'workflow' }
]

/** 类型标签 className 映射 */
function typeTagClass(type: PluginType): string {
  switch (type) {
    case 'tool':
      return styles.typeTagTool
    case 'connector':
      return styles.typeTagConnector
    case 'knowledge_base':
      return styles.typeTagKb
    case 'workflow':
      return styles.typeTagWorkflow
    default:
      return ''
  }
}

/** 类型中文显示 */
function typeLabel(type: PluginType): string {
  switch (type) {
    case 'tool':
      return '工具'
    case 'connector':
      return '连接器'
    case 'knowledge_base':
      return '知识库'
    case 'workflow':
      return '工作流'
    default:
      return type
  }
}

export default function PluginMarket() {
  const navigate = useNavigate()

  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<string>('')
  const [keyword, setKeyword] = useState('')
  const [installingIds, setInstallingIds] = useState<Set<number>>(new Set())

  /** 加载市场列表 */
  const loadPlugins = useCallback(async (query: PluginMarketQuery = {}) => {
    setLoading(true)
    try {
      const result = await pluginApi.listMarketPlugins(query)
      setPlugins(result.list || [])
    } catch (err) {
      console.error('[PluginMarket] load failed:', err)
      message.error('加载插件市场失败')
      setPlugins([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlugins({})
  }, [loadPlugins])

  /** 分类切换 */
  const handleCategoryChange = (value: string) => {
    setCategory(value)
    void loadPlugins({ category: value || undefined, keyword: keyword || undefined })
  }

  /** 搜索 */
  const handleSearch = (value: string) => {
    setKeyword(value)
    void loadPlugins({
      category: (category as PluginType) || undefined,
      keyword: value || undefined
    })
  }

  /** 安装插件 */
  const handleInstall = async (plugin: Plugin) => {
    setInstallingIds((prev) => new Set(prev).add(plugin.id))
    try {
      await pluginApi.installPlugin(plugin.id)
      message.success(`插件 ${plugin.name} 安装成功`)
      // 刷新列表（更新 isInstalled）
      void loadPlugins({
        category: (category as PluginType) || undefined,
        keyword: keyword || undefined
      })
    } catch (err) {
      console.error('[PluginMarket] install failed:', err)
      message.error('安装失败: ' + (err as Error).message)
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev)
        next.delete(plugin.id)
        return next
      })
    }
  }

  /** 使用插件 → 跳转对话页 */
  const handleUse = (plugin: Plugin) => {
    message.info(`即将使用插件 ${plugin.name}，请在对话页选择该插件`)
    navigate('/chat')
  }

  /** 返回 */
  const handleBack = () => {
    navigate('/dashboard')
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <AppstoreOutlined />
          <span>插件市场</span>
        </div>
        <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回
        </Button>
      </div>

      {/* Tab 导航 */}
      <div className={styles.tabNav}>
        <div
          className={`${styles.tabItem} ${styles.tabItemActive}`}
          onClick={() => navigate('/plugins')}
        >
          插件市场
        </div>
        <div className={styles.tabItem} onClick={() => navigate('/plugins/installed')}>
          已安装
        </div>
        <div className={styles.tabItem} onClick={() => navigate('/plugins/logs')}>
          调用记录
        </div>
      </div>

      {/* 筛选 + 搜索 */}
      <div className={styles.filterBar}>
        <Select
          value={category}
          onChange={handleCategoryChange}
          options={CATEGORY_OPTIONS}
          style={{ width: 160 }}
          placeholder="选择分类"
        />
        <Input.Search
          className={styles.searchInput}
          placeholder="搜索插件名称或描述..."
          allowClear
          enterButton={<><SearchOutlined /> 搜索</>}
          onSearch={handleSearch}
        />
      </div>

      {/* 插件卡片网格 */}
      <Spin spinning={loading}>
        {plugins.length === 0 && !loading ? (
          <div className={styles.emptyState}>
            <AppstoreOutlined className={styles.emptyStateIcon} />
            <div className={styles.emptyStateText}>暂无插件</div>
          </div>
        ) : (
          <div className={styles.pluginGrid}>
            {plugins.map((plugin) => (
              <div key={plugin.id} className={styles.pluginCard}>
                <div className={styles.cardBody}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardTitle}>
                      <span>{plugin.name}</span>
                      {plugin.isOfficial && (
                        <span className={styles.officialBadge}>官方</span>
                      )}
                    </div>
                    <Tag className={`${styles.typeTag} ${typeTagClass(plugin.type)}`}>
                      {typeLabel(plugin.type)}
                    </Tag>
                  </div>
                  <div className={styles.cardDescription}>{plugin.description}</div>
                  <div className={styles.cardMeta}>
                    <span className={styles.metaItem}>
                      <StarOutlined className={styles.ratingValue} />
                      <span className={styles.ratingValue}>
                        {plugin.rating?.toFixed(1) ?? '-'}
                      </span>
                    </span>
                    <span className={styles.metaItem}>
                      <FireOutlined />
                      {plugin.callCount ?? 0} 次
                    </span>
                    {plugin.pricing?.pricePerCall != null &&
                      plugin.pricing.pricePerCall > 0 && (
                        <span className={styles.metaItem}>
                          <DollarOutlined />
                          <span className={styles.creditsValue}>
                            {plugin.pricing.pricePerCall} 积分/次
                          </span>
                        </span>
                      )}
                    <span className={styles.metaItem}>作者: {plugin.author}</span>
                    <span className={styles.metaItem}>v{plugin.version}</span>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  {plugin.isInstalled ? (
                    <Button
                      className={styles.installBtnInstalled}
                      disabled
                      block
                    >
                      已安装
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      className={styles.installBtn}
                      icon={<DownloadOutlined />}
                      loading={installingIds.has(plugin.id)}
                      onClick={() => handleInstall(plugin)}
                      block
                    >
                      安装
                    </Button>
                  )}
                  <Button
                    className={styles.useBtn}
                    icon={<MessageOutlined />}
                    onClick={() => handleUse(plugin)}
                  >
                    使用
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Spin>
    </div>
  )
}
