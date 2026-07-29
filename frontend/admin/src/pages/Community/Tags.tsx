// 标签管理页 - 社区管理
//
// Table 展示标签列表，支持删除操作

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { deleteTag, listTags } from '@/api/admin-community-api'
import styles from './styles.module.css'

interface CommunityTag {
  id: number
  name: string
  description: string
  color: string
  postCount: number
  createdAt: string
}

export default function Tags() {
  const [tags, setTags] = useState<CommunityTag[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTags = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listTags()
      setTags((res as CommunityTag[]) || [])
    } catch {
      message.error('加载标签列表失败')
      setTags([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const handleDelete = async (id: number) => {
    try {
      await deleteTag(id)
      message.success('标签已删除')
      fetchTags()
    } catch {
      message.error('删除失败')
    }
  }

  const columns: TableColumnsType<CommunityTag> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (name: string, record: CommunityTag) => (
        <Tag color={record.color || 'blue'}>{name}</Tag>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      width: 240,
      render: (desc: string) => desc || '-'
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 100,
      render: (color: string) =>
        color ? (
          <Space size={4}>
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: 3,
                background: color
              }}
            />
            <span>{color}</span>
          </Space>
        ) : (
          '-'
        )
    },
    {
      title: '帖子数',
      dataIndex: 'postCount',
      key: 'postCount',
      width: 80,
      render: (count: number) => count ?? 0
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => (t ? new Date(t).toLocaleString('zh-CN') : '-')
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_: unknown, record: CommunityTag) => (
        <Popconfirm
          title="确定删除该标签吗？"
          description="删除后不可恢复"
          onConfirm={() => handleDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <div>
      <div className={styles.toolbar}>
        <h3 style={{ margin: 0 }}>标签管理</h3>
        <Button icon={<ReloadOutlined />} onClick={fetchTags} loading={loading}>
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={tags}
          pagination={false}
          scroll={{ x: 800 }}
          size="middle"
          locale={{ emptyText: '暂无标签' }}
        />
      </Spin>
    </div>
  )
}
