// A3 用户/设备视图：IM 绑定状态、设备在线状态、实例数、执行历史
import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import {
  adminAutomationOverview,
  type AdminAutomationOverviewUser,
} from '@/api/admin-automation-api'

const PLATFORM_LABELS: Record<string, string> = {
  feishu_bot: '飞书',
  wechat_mp: '公众号',
  wechat_work: '企业微信',
  dingtalk_bot: '钉钉',
  telegram_bot: 'Telegram',
}

export default function AutomationDevices() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AdminAutomationOverviewUser[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await adminAutomationOverview()
      setUsers(r.users || [])
    } catch (err) {
      message.error('加载失败: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const columns: TableColumnsType<AdminAutomationOverviewUser> = [
    { title: '用户 ID', dataIndex: 'userId', width: 90 },
    { title: '用户名', dataIndex: 'username', width: 160 },
    { title: '邮箱', dataIndex: 'email', ellipsis: true },
    {
      title: 'IM 绑定', dataIndex: 'bindings', width: 240,
      render: (b: Record<string, string>) => {
        const keys = Object.keys(b || {})
        if (keys.length === 0) return <Tag>未绑定</Tag>
        return keys.map((k) => <Tag key={k} color="green">{PLATFORM_LABELS[k] ?? k}</Tag>)
      },
    },
    {
      title: '设备在线', dataIndex: 'online', width: 110,
      render: (v: boolean) => (v ? <Tag color="green">在线</Tag> : <Tag color="default">离线</Tag>),
    },
    { title: '场景实例', dataIndex: 'instanceCount', width: 100 },
    { title: '执行次数', dataIndex: 'auditCount', width: 100 },
  ]

  return (
    <Card
      title="用户 / 设备视图"
      extra={<Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}
    >
      <Table rowKey="userId" loading={loading} columns={columns} dataSource={users} pagination={{ pageSize: 20 }} />
      <Space style={{ marginTop: 12, color: '#888' }} size="large">
        <span>提示：执行历史可在「审计日志」按用户筛选查看（/admin/automation/audit?userId=）。</span>
      </Space>
    </Card>
  )
}