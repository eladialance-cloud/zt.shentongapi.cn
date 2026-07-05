// 设备管理（SubTask 15.4）
// 表格：设备名 / 设备指纹(脱敏) / 最后登录时间 / 创建时间 / 操作
// 操作：解绑（二次确认，DELETE /devices/:id）
// 提示：最多 3 台设备，解绑后该设备无法登录
// API: GET /devices、DELETE /devices/:id

import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Popconfirm,
  Empty,
  Spin,
  Alert,
  message,
  type TableColumnsType
} from 'antd'
import { DeleteOutlined, DesktopOutlined } from '@ant-design/icons'
import { listDevices, unbindDevice } from '@/api/settings-api'
import type { Device } from '@/types/settings'
import styles from './styles.module.css'

const MAX_DEVICES = 3

/** 格式化时间 */
function formatTime(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function Devices() {
  const [loading, setLoading] = useState(true)
  const [devices, setDevices] = useState<Device[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listDevices()
      setDevices(list || [])
    } catch (err) {
      console.error('[Devices] load failed:', err)
      message.error('加载设备列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleUnbind = async (device: Device) => {
    try {
      await unbindDevice(device.id)
      message.success(`设备 "${device.deviceName}" 已解绑`)
      setDevices((prev) => prev.filter((d) => d.id !== device.id))
    } catch (err) {
      console.error('[Devices] unbind failed:', err)
      message.error('解绑失败: ' + (err as Error).message)
    }
  }

  const columns: TableColumnsType<Device> = [
    {
      title: '设备名',
      dataIndex: 'deviceName',
      key: 'deviceName',
      width: 180
    },
    {
      title: '设备指纹',
      dataIndex: 'fingerprint',
      key: 'fingerprint',
      render: (fp: string) => (
        <span className={styles.keyCell}>{fp || '—'}</span>
      )
    },
    {
      title: '最后登录时间',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 180,
      render: (v: string | null) => formatTime(v)
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatTime(v)
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Popconfirm
          title="确定解绑该设备吗？"
          description="解绑后该设备将无法登录"
          onConfirm={() => handleUnbind(record)}
          okText="解绑"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger icon={<DeleteOutlined />}>
            解绑
          </Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <Spin spinning={loading}>
      <Card className={styles.card} bordered={false}>
        <div className={styles.cardBody}>
          <h2 className={styles.sectionTitle}>设备管理</h2>
          <div className={styles.sectionDesc}>
            <DesktopOutlined style={{ marginRight: 6 }} />
            最多绑定 {MAX_DEVICES} 台设备，解绑后该设备将无法登录
          </div>

          {devices.length >= MAX_DEVICES && (
            <Alert
              type="warning"
              showIcon
              message={`已达到设备上限（${MAX_DEVICES} 台），请先解绑旧设备再绑定新设备`}
              style={{ marginBottom: 16 }}
            />
          )}

          {devices.length === 0 && !loading ? (
            <div className={styles.emptyWrap}>
              <Empty description="暂无已绑定设备" />
            </div>
          ) : (
            <Table<Device>
              rowKey="id"
              columns={columns}
              dataSource={devices}
              pagination={false}
              size="middle"
            />
          )}
        </div>
      </Card>
    </Spin>
  )
}
