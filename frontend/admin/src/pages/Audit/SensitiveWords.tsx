// 敏感词管理页 - SubTask 25.1
//
// 表格:词/分类(政治/色情/暴力/广告/其他)/级别(block/replace/review)/创建时间/操作
// 新增模态框:word/category/level/replacement(若 level=replace)
// 批量导入:textarea 每行一个词,选择分类和级别
// API: GET /admin/sensitive-words、POST /admin/sensitive-words、POST /admin/sensitive-words/batch、DELETE /admin/sensitive-words/:id

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  UploadOutlined
} from '@ant-design/icons'
import {
  batchCreateSensitiveWords,
  createSensitiveWord,
  deleteSensitiveWord,
  listSensitiveWords
} from '@/api/admin-audit-api'
import type {
  CreateSensitiveWordDto,
  SensitiveWord,
  SensitiveWordCategory,
  SensitiveWordLevel
} from '@/types/admin-audit'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const CATEGORY_OPTIONS: Array<{ label: string; value: SensitiveWordCategory }> = [
  { label: '政治', value: 'politics' },
  { label: '色情', value: 'porn' },
  { label: '暴力', value: 'violence' },
  { label: '广告', value: 'ad' },
  { label: '其他', value: 'other' }
]

const CATEGORY_LABEL: Record<SensitiveWordCategory, string> = {
  politics: '政治',
  porn: '色情',
  violence: '暴力',
  ad: '广告',
  other: '其他'
}

const CATEGORY_COLOR: Record<SensitiveWordCategory, string> = {
  politics: 'red',
  porn: 'magenta',
  violence: 'volcano',
  ad: 'orange',
  other: 'default'
}

const LEVEL_OPTIONS: Array<{ label: string; value: SensitiveWordLevel }> = [
  { label: '拦截', value: 'block' },
  { label: '替换', value: 'replace' },
  { label: '人工审核', value: 'review' }
]

const LEVEL_LABEL: Record<SensitiveWordLevel, string> = {
  block: '拦截',
  replace: '替换',
  review: '人工审核'
}

const LEVEL_COLOR: Record<SensitiveWordLevel, string> = {
  block: 'red',
  replace: 'blue',
  review: 'orange'
}

interface WordFormValues {
  word: string
  category: SensitiveWordCategory
  level: SensitiveWordLevel
  replacement?: string
}

interface BatchFormValues {
  category: SensitiveWordCategory
  level: SensitiveWordLevel
  text: string
}

export default function AuditSensitiveWords() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<SensitiveWord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState<SensitiveWordCategory | ''>('')
  const [keyword, setKeyword] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [form] = Form.useForm<WordFormValues>()
  const [saving, setSaving] = useState(false)

  const [batchOpen, setBatchOpen] = useState(false)
  const [batchForm] = Form.useForm<BatchFormValues>()
  const [batchSaving, setBatchSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (category) query.category = category
      if (keyword) query.keyword = keyword
      const result = await listSensitiveWords(query)
      const r = result as AdminPaginatedResult<SensitiveWord>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AuditSensitiveWords] load failed:', err)
      message.error('加载敏感词列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, category, keyword])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleSearch = () => {
    setPage(1)
    void loadList()
  }

  const handleReset = () => {
    setCategory('')
    setKeyword('')
    setPage(1)
  }

  const handleAdd = () => {
    form.resetFields()
    form.setFieldsValue({
      category: 'other',
      level: 'block'
    })
    setAddOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const dto: CreateSensitiveWordDto = {
        word: values.word,
        category: values.category,
        level: values.level,
        replacement:
          values.level === 'replace' ? values.replacement : undefined
      }
      await createSensitiveWord(dto)
      message.success('已新增敏感词')
      setAddOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AuditSensitiveWords] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleBatchSave = async () => {
    try {
      const values = await batchForm.validateFields()
      setBatchSaving(true)
      const lines = values.text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      if (lines.length === 0) {
        message.warning('请输入敏感词')
        return
      }
      const dto = {
        words: lines.map((w) => ({
          word: w,
          category: values.category,
          level: values.level
        }))
      }
      const result = await batchCreateSensitiveWords(dto)
      message.success(`已导入 ${result.created} 个敏感词`)
      setBatchOpen(false)
      batchForm.resetFields()
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AuditSensitiveWords] batch failed:', err)
      message.error('批量导入失败')
    } finally {
      setBatchSaving(false)
    }
  }

  const handleDelete = async (item: SensitiveWord) => {
    try {
      await deleteSensitiveWord(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((k) => k.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AuditSensitiveWords] delete failed:', err)
      message.error('删除失败')
    }
  }

  const columns: TableColumnsType<SensitiveWord> = [
    {
      title: '词',
      dataIndex: 'word',
      key: 'word',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (c: SensitiveWordCategory) => (
        <Tag color={CATEGORY_COLOR[c]}>{CATEGORY_LABEL[c]}</Tag>
      )
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 110,
      render: (l: SensitiveWordLevel) => (
        <Tag color={LEVEL_COLOR[l]}>{LEVEL_LABEL[l]}</Tag>
      )
    },
    {
      title: '替换词',
      dataIndex: 'replacement',
      key: 'replacement',
      width: 140,
      render: (v?: string) => <span style={{ color: '#8b949e' }}>{v || '-'}</span>
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_: unknown, record: SensitiveWord) => (
        <Popconfirm
          title="确认删除该敏感词?"
          onConfirm={() => handleDelete(record)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <SafetyCertificateOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>敏感词管理</h1>
            <div className={styles.subtitle}>维护敏感词词库</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadList}
            className={styles.ghostBtn}
          >
            刷新
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() => {
              batchForm.resetFields()
              batchForm.setFieldsValue({ category: 'other', level: 'block' })
              setBatchOpen(true)
            }}
            className={styles.ghostBtn}
          >
            批量导入
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            className={styles.primaryBtn}
          >
            新增词
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="分类"
            value={category}
            onChange={(v) => setCategory(v as SensitiveWordCategory | '')}
            className={styles.filterSelect}
            options={[{ label: '全部分类', value: '' }, ...CATEGORY_OPTIONS]}
            allowClear
          />
          <Input
            placeholder="搜索词"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className={styles.searchBox}
            allowClear
          />
        </div>
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          className={styles.primaryBtn}
        >
          查询
        </Button>
        <Button onClick={handleReset} className={styles.ghostBtn}>
          重置
        </Button>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无敏感词" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<SensitiveWord>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 900 }}
            />
          </div>
        )}
        <div className={styles.paginationWrap}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={(p) => setPage(p)}
            showSizeChanger={false}
            showTotal={(t) => `共 ${t} 条`}
          />
        </div>
      </Spin>

      {/* 新增 Modal */}
      <Modal
        title="新增敏感词"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form<WordFormValues> form={form} layout="vertical">
          <Form.Item
            name="word"
            label="敏感词"
            rules={[{ required: true, message: '请输入敏感词' }]}
          >
            <Input placeholder="请输入敏感词" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="category"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="level"
            label="处理级别"
            rules={[{ required: true, message: '请选择处理级别' }]}
          >
            <Select options={LEVEL_OPTIONS} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.level !== cur.level}>
            {({ getFieldValue }) =>
              getFieldValue('level') === 'replace' ? (
                <Form.Item name="replacement" label="替换词">
                  <Input placeholder="请输入替换词" maxLength={32} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入 Modal */}
      <Modal
        title="批量导入敏感词"
        open={batchOpen}
        onCancel={() => setBatchOpen(false)}
        onOk={handleBatchSave}
        confirmLoading={batchSaving}
        okText="导入"
        cancelText="取消"
        destroyOnClose
        width={520}
      >
        <Form<BatchFormValues> form={batchForm} layout="vertical">
          <Form.Item
            name="category"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="level"
            label="处理级别"
            rules={[{ required: true, message: '请选择处理级别' }]}
          >
            <Select options={LEVEL_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="text"
            label="敏感词列表(每行一个)"
            rules={[{ required: true, message: '请输入敏感词' }]}
          >
            <Input.TextArea
              rows={8}
              placeholder={'敏感词1\n敏感词2\n敏感词3'}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
