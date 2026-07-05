// Agent 分类标签管理页 - SubTask 20.4
//
// 展示 5 个固定分类(office/programming/copywriting/data_analysis/other)+ 各分类 Agent 数量
// 可重命名 display name(前端硬编码默认值,后端存储于 category 元数据)
// API: GET /admin/agents/categories, PATCH /admin/agents/categories/:category

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Spin,
  Tag,
  message
} from 'antd'
import { AppstoreOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  listAgentCategories,
  updateAgentCategoryDisplay
} from '@/api/admin-agent-api'
import type { AgentCategory, AgentCategoryMeta } from '@/types/admin-agent'
import styles from './styles.module.css'

/** 前端硬编码默认显示名映射 */
const DEFAULT_DISPLAY: Record<AgentCategory, string> = {
  office: '办公',
  programming: '编程',
  copywriting: '文案',
  data_analysis: '数据分析',
  other: '其他'
}

const CATEGORY_DESC: Record<AgentCategory, string> = {
  office: '文档处理、邮件、日程等办公场景',
  programming: '代码生成、调试、代码审查等编程场景',
  copywriting: '文案撰写、营销内容、SEO 等场景',
  data_analysis: '数据清洗、统计分析、报表等场景',
  other: '其他类型 Agent'
}

const ALL_CATEGORIES: AgentCategory[] = [
  'office',
  'programming',
  'copywriting',
  'data_analysis',
  'other'
]

interface RenameFormValues {
  displayName: string
}

export default function AdminAgentCategories() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AgentCategoryMeta[]>([])

  const [renameTarget, setRenameTarget] = useState<AgentCategoryMeta | null>(null)
  const [renameForm] = Form.useForm<RenameFormValues>()
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listAgentCategories()
      // 合并前端硬编码默认值,确保 5 个固定分类都展示
      const existingMap = new Map<AgentCategory, AgentCategoryMeta>()
      data.forEach((c) => existingMap.set(c.category, c))
      const merged: AgentCategoryMeta[] = ALL_CATEGORIES.map((cat) => {
        const existing = existingMap.get(cat)
        return existing
          ? existing
          : {
              category: cat,
              displayName: DEFAULT_DISPLAY[cat],
              agentCount: 0
            }
      })
      setItems(merged)
    } catch (err) {
      console.error('[AgentCategories] load failed:', err)
      message.error('加载分类列表失败')
      // 失败时仍展示默认 5 个分类
      setItems(
        ALL_CATEGORIES.map((cat) => ({
          category: cat,
          displayName: DEFAULT_DISPLAY[cat],
          agentCount: 0
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleRename = (item: AgentCategoryMeta) => {
    setRenameTarget(item)
    renameForm.setFieldsValue({ displayName: item.displayName })
  }

  const handleSave = async () => {
    if (!renameTarget) return
    try {
      const values = await renameForm.validateFields()
      setSaving(true)
      await updateAgentCategoryDisplay(renameTarget.category, values.displayName)
      message.success('已更新显示名')
      setItems((prev) =>
        prev.map((c) =>
          c.category === renameTarget.category
            ? { ...c, displayName: values.displayName }
            : c
        )
      )
      setRenameTarget(null)
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AgentCategories] save failed:', err)
      message.error('更新失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <AppstoreOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Agent 分类标签管理</h1>
            <div className={styles.subtitle}>查看 5 个固定分类与 Agent 数量,可重命名显示名</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadList}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无数据" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.statsGrid}>
            {items.map((c) => (
              <Card key={c.category} className={styles.statCard} bordered={false}>
                <div className={styles.statCardBody}>
                  <div className={`${styles.statIcon} ${styles.statIconBlue}`}>
                    <AppstoreOutlined />
                  </div>
                  <div className={styles.statInfo} style={{ flex: 1 }}>
                    <span className={styles.statLabel}>
                      <Tag color="blue" style={{ marginRight: 6 }}>{c.category}</Tag>
                      {c.displayName}
                    </span>
                    <span className={styles.statValue}>{c.agentCount}</span>
                    <span style={{ fontSize: 12, color: '#8b949e' }}>个 Agent</span>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      {CATEGORY_DESC[c.category]}
                    </div>
                  </div>
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleRename(c)}
                  >
                    重命名
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>

      <Modal
        title={`重命名分类 - ${renameTarget?.category || ''}`}
        open={!!renameTarget}
        onCancel={() => setRenameTarget(null)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form<RenameFormValues> form={renameForm} layout="vertical">
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input placeholder="如:办公" maxLength={32} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
