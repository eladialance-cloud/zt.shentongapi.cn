// 帖子审核页 - 社区管理
//
// Tab:待审核 / 已通过 / 已拒绝 / 全部
// 操作:通过 / 拒绝(弹窗输入理由) / 删除 / 置顶 / 加精

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  PushpinOutlined,
  StarOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import {
  approvePost,
  deletePost,
  listPendingPosts,
  rejectPost,
  toggleEssencePost,
  togglePinPost
} from '@/api/admin-community-api'
import styles from './styles.module.css'

const PAGE_SIZE = 20

type PostStatus = 'pending' | 'approved' | 'rejected' | 'all'

interface CommunityPost {
  id: number
  title: string
  content: string
  channelName: string
  authorName: string
  authorAvatar?: string
  type: string
  status: string
  isPinned: boolean
  isEssence: boolean
  createdAt: string
}

const STATUS_TABS: Array<{ key: PostStatus; label: string }> = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'all', label: '全部' }
]

const TYPE_LABEL: Record<string, string> = {
  text: '图文',
  image: '图片',
  video: '视频',
  link: '链接'
}

const TYPE_COLOR: Record<string, string> = {
  text: 'blue',
  image: 'cyan',
  video: 'purple',
  link: 'geekblue'
}

export default function PostReview() {
  const [activeTab, setActiveTab] = useState<PostStatus>('pending')
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectLoading, setRejectLoading] = useState(false)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listPendingPosts(page, PAGE_SIZE) as {
        list: CommunityPost[]
        total: number
      }
      setPosts(res?.list || [])
      setTotal(res?.total || 0)
    } catch {
      message.error('加载帖子列表失败')
      setPosts([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleApprove = async (id: number) => {
    try {
      await approvePost(id)
      message.success('已通过')
      fetchPosts()
    } catch {
      message.error('操作失败')
    }
  }

  const handleReject = async () => {
    if (!rejectingId) return
    if (!rejectReason.trim()) {
      message.warning('请输入拒绝理由')
      return
    }
    setRejectLoading(true)
    try {
      await rejectPost(rejectingId, rejectReason.trim())
      message.success('已拒绝')
      setRejectModalOpen(false)
      setRejectReason('')
      setRejectingId(null)
      fetchPosts()
    } catch {
      message.error('操作失败')
    } finally {
      setRejectLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deletePost(id)
      message.success('已删除')
      fetchPosts()
    } catch {
      message.error('删除失败')
    }
  }

  const handleTogglePin = async (id: number, pinned: boolean) => {
    try {
      await togglePinPost(id, pinned)
      message.success(pinned ? '已置顶' : '已取消置顶')
      fetchPosts()
    } catch {
      message.error('操作失败')
    }
  }

  const handleToggleEssence = async (id: number, essence: boolean) => {
    try {
      await toggleEssencePost(id, essence)
      message.success(essence ? '已加精' : '已取消加精')
      fetchPosts()
    } catch {
      message.error('操作失败')
    }
  }

  const openRejectModal = (id: number) => {
    setRejectingId(id)
    setRejectReason('')
    setRejectModalOpen(true)
  }

  const columns: TableColumnsType<CommunityPost> = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      width: 220,
      render: (text: string, record: CommunityPost) => (
        <Space size={4}>
          <span>{text}</span>
          {record.isPinned && <Tag color="gold" icon={<PushpinOutlined />}>置顶</Tag>}
          {record.isEssence && <Tag color="orange" icon={<StarOutlined />}>精华</Tag>}
        </Space>
      )
    },
    {
      title: '频道',
      dataIndex: 'channelName',
      key: 'channelName',
      width: 120,
      render: (name: string) => name || '-'
    },
    {
      title: '作者',
      dataIndex: 'authorName',
      key: 'authorName',
      width: 120,
      render: (name: string) => name || '-'
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => (
        <Tag color={TYPE_COLOR[type] || 'default'}>
          {TYPE_LABEL[type] || type}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        const map: Record<string, { label: string; color: string }> = {
          pending: { label: '待审核', color: 'processing' },
          approved: { label: '已通过', color: 'success' },
          rejected: { label: '已拒绝', color: 'error' }
        }
        const item = map[status] || { label: status, color: 'default' }
        return <Tag color={item.color}>{item.label}</Tag>
      }
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
      width: 280,
      fixed: 'right',
      render: (_: unknown, record: CommunityPost) => (
        <Space size={4} wrap>
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => handleApprove(record.id)}
              >
                通过
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => openRejectModal(record.id)}
              >
                拒绝
              </Button>
            </>
          )}
          <Popconfirm
            title="确定删除该帖子吗？"
            description="删除后不可恢复"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button
            type="link"
            size="small"
            icon={<PushpinOutlined />}
            onClick={() => handleTogglePin(record.id, !record.isPinned)}
          >
            {record.isPinned ? '取消置顶' : '置顶'}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<StarOutlined />}
            onClick={() => handleToggleEssence(record.id, !record.isEssence)}
          >
            {record.isEssence ? '取消加精' : '加精'}
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div className={styles.toolbar}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key as PostStatus)
            setPage(1)
          }}
          items={STATUS_TABS.map((tab) => ({
            key: tab.key,
            label: tab.label
          }))}
          style={{ marginBottom: 0 }}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchPosts} loading={loading}>
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={posts}
          pagination={false}
          scroll={{ x: 1000 }}
          size="middle"
          locale={{ emptyText: '暂无帖子' }}
        />
      </Spin>

      {total > 0 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={(p) => setPage(p)}
            showTotal={(t) => `共 ${t} 条`}
            showSizeChanger={false}
          />
        </div>
      )}

      <Modal
        title="拒绝帖子"
        open={rejectModalOpen}
        onCancel={() => {
          setRejectModalOpen(false)
          setRejectReason('')
          setRejectingId(null)
        }}
        onOk={handleReject}
        confirmLoading={rejectLoading}
        okText="确认拒绝"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Input.TextArea
          rows={4}
          placeholder="请输入拒绝理由"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          maxLength={200}
          showCount
        />
      </Modal>
    </div>
  )
}
