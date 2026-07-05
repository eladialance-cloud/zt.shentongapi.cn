// 工作流模板列表页
// 布局：顶部标题 + 筛选/搜索 + 模板卡片网格
// 调用 GET /workflow/templates?category=&keyword=

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Select, Spin, Tag, message } from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  PlayCircleOutlined,
  PictureOutlined
} from '@ant-design/icons'
import * as workflowApi from '@/api/workflow-api'
import type {
  WorkflowTemplate,
  WorkflowCategory,
  WorkflowTemplateQuery
} from '@/types/workflow'
import styles from './styles.module.css'

/** 分类选项 */
const CATEGORY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '全部分类', value: '' },
  { label: '自动化', value: 'automation' },
  { label: '集成', value: 'integration' },
  { label: '数据处理', value: 'data_processing' },
  { label: '其他', value: 'other' }
]

/** 分类标签 className 映射 */
function categoryTagClass(category: string): string {
  switch (category) {
    case 'automation':
      return styles.categoryTagAutomation
    case 'integration':
      return styles.categoryTagIntegration
    case 'data_processing':
      return styles.categoryTagData
    default:
      return ''
  }
}

/** 分类中文显示 */
function categoryLabel(category: string): string {
  switch (category) {
    case 'automation':
      return '自动化'
    case 'integration':
      return '集成'
    case 'data_processing':
      return '数据处理'
    default:
      return '其他'
  }
}

export default function WorkflowList() {
  const navigate = useNavigate()

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<string>('')
  const [keyword, setKeyword] = useState('')

  /** 加载模板列表 */
  const loadTemplates = useCallback(
    async (query: WorkflowTemplateQuery = {}) => {
      setLoading(true)
      try {
        const result = await workflowApi.listTemplates(query)
        setTemplates(result.list || [])
      } catch (err) {
        console.error('[Workflow] load templates failed:', err)
        message.error('加载工作流模板失败')
        setTemplates([])
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // 初始加载
  useEffect(() => {
    void loadTemplates({})
  }, [loadTemplates])

  /** 分类切换 */
  const handleCategoryChange = (value: string) => {
    setCategory(value)
    void loadTemplates({ category: value || undefined, keyword: keyword || undefined })
  }

  /** 搜索 */
  const handleSearch = (value: string) => {
    setKeyword(value)
    void loadTemplates({
      category: (category as WorkflowCategory) || undefined,
      keyword: value || undefined
    })
  }

  /** 使用模板 → 跳转详情 */
  const handleUseTemplate = (template: WorkflowTemplate) => {
    navigate(`/workflow/${template.id}`)
  }

  /** 新建工作流 → 跳转 N8N 编辑器 */
  const handleNewWorkflow = () => {
    navigate('/workflow/editor')
  }

  /** 返回 */
  const handleBack = () => {
    navigate('/dashboard')
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <ThunderboltOutlined />
          <span>工作流模板</span>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回
          </Button>
          <Button
            type="primary"
            className={styles.newBtn}
            icon={<PlusOutlined />}
            onClick={handleNewWorkflow}
          >
            新建工作流
          </Button>
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
          placeholder="搜索工作流名称或描述..."
          allowClear
          enterButton={<><SearchOutlined /> 搜索</>}
          onSearch={handleSearch}
        />
      </div>

      {/* 模板卡片网格 */}
      <Spin spinning={loading}>
        {templates.length === 0 && !loading ? (
          <div className={styles.emptyState}>
            <ThunderboltOutlined className={styles.emptyStateIcon} />
            <div className={styles.emptyStateText}>暂无工作流模板</div>
          </div>
        ) : (
          <div className={styles.templateGrid}>
            {templates.map((tpl) => (
              <div key={tpl.id} className={styles.templateCard}>
                {/* 预览图 */}
                <div className={styles.cardPreview}>
                  {tpl.previewImage ? (
                    <img src={tpl.previewImage} alt={tpl.name} />
                  ) : (
                    <PictureOutlined className={styles.cardPreviewPlaceholder} />
                  )}
                </div>

                {/* 卡片内容 */}
                <div className={styles.cardBody}>
                  <div className={styles.cardTitle}>
                    <span>{tpl.name}</span>
                    <Tag className={`${styles.categoryTag} ${categoryTagClass(tpl.category)}`}>
                      {categoryLabel(tpl.category)}
                    </Tag>
                  </div>
                  <div className={styles.cardDescription}>{tpl.description}</div>
                  <div className={styles.cardMeta}>
                    <span className={styles.usageCount}>已使用 {tpl.usageCount ?? 0} 次</span>
                    {tpl.pricePerExecution != null && tpl.pricePerExecution > 0 && (
                      <span className={styles.creditsCost}>
                        {tpl.pricePerExecution} 积分/次
                      </span>
                    )}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className={styles.cardFooter}>
                  <Button
                    type="primary"
                    className={styles.useBtn}
                    icon={<PlayCircleOutlined />}
                    onClick={() => handleUseTemplate(tpl)}
                    block
                  >
                    使用模板
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
