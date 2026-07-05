// 设备管理页 - SubTask 18.5
//
// 筛选:用户名/设备名
// 表格:用户/设备名/设备指纹(脱敏)/最后登录时间/创建时间/操作
// 操作:远程解绑(二次确认)

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Input,
  Modal,
  Pagination,
  Spin,
  Table,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  LaptopOutlined
} from '@ant-design/icons'
import { deleteDevice, listAdminDevices } from '@/api/admin-user-api'
import type { AdminDevice } from '@/types/admin-user'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

export default function AdminDevices() {
  const [loading, setLoading] = useState(true)
  const [devices, setDevices] = useState<AdminDevice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [unbindTarget, setUnbindTarget] = useState<AdminDevice | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadDevices = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (keyword.trim()) query.keyword = keyword.trim()
      const result = await listAdminDevices(query)
      const r = result as AdminPaginatedResult<AdminDevice>
      setDevices(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AdminDevices] load failed:', err)
      message.error('加载设备列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, keyword])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  const handleSearch = () => {
    setPage(1)
    void loadDevices()
  }

  const handleConfirmUnbind = async () => {
    if (!unbindTarget) return
    setDeleting(true)
    try {
      await deleteDevice(unbindTarget.id)
      message.success('设备已解绑')
      setUnbindTarget(null)
      setDevices((prev) => prev.filter((d) => d.id !== unbindTarget.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AdminDevices] unbind failed:', err)
      message.error('解绑失败')
    } finally {
      setDeleting(false)
    }
  }

  const columns: TableColumnsType<AdminDevice> = [
    {
      title: '用户',
      key: 'user',
      width: 160,
      render: (_: unknown, r: AdminDevice) => (
        <span style={{ color: '#94a3b8' }}>
          {r.username} #{r.userId}
        </span>
      )
    },
    {
      title: '设备名',
      dataIndex: 'deviceName',
      key: 'deviceName',
      render: (v: string) => <span style={{ color: '#f1f5f9' }}>{v}</span>
    },
    {
      title: '设备指纹',
      dataIndex: 'deviceFingerprint',
      key: 'deviceFingerprint',
      render: (v: string) => (
        <span style={{ color: '#8b949e', fontFamily: 'Consolas, monospace' }}>
          {v}
        </span>
      )
    },
    {
      title: '最后登录时间',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 180,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: AdminDevice) => (
        <Button
          type="link"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => setUnbindTarget(record)}
        >
          远程解绑
        </Button>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <LaptopOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>设备管理</h1>
            <div className={styles.subtitle}>查看与解绑用户设备</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadDevices}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Input
            placeholder="用户名 / 设备名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            className={styles.searchBox}
            allowClear
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            className={styles.primaryBtn}
          >
            查询
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {devices.length === 0 && !loading ? (
          <Empty description="暂无设备" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminDevice>
              rowKey="id"
              columns={columns}
              dataSource={devices}
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

      <Modal
        title="远程解绑设备"
        open={!!unbindTarget}
        onCancel={() => setUnbindTarget(null)}
        onOk={handleConfirmUnbind}
        confirmLoading={deleting}
        okText="确认解绑"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p style={{ color: '#e6edf3' }}>
          确认要解绑设备
          <strong style={{ color: '#fbbf24' }}> {unbindTarget?.deviceName} </strong>
          (属于用户 {unbindTarget?.username})吗?
        </p>
        <p style={{ color: '#94a3b8', fontSize: 12 }}>
          解绑后该设备将无法继续使用,用户需重新登录绑定。
        </p>
      </Modal>
    </div>
  )
}
