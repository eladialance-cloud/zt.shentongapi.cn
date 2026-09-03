// A2 安全策略管理：高危操作白名单 / 敏感域名黑名单（JSON 编辑）
import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Input, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import {
  adminListAutomationPolicies,
  adminUpdateAutomationPolicy,
  type AdminAutomationPolicy,
} from '@/api/admin-automation-api'

const KEY_LABELS: Record<string, string> = {
  high_risk_ops: '高危操作白名单',
  domain_blacklist: '敏感域名黑名单',
}

export default function AutomationPolicies() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<AdminAutomationPolicy[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = (await adminListAutomationPolicies()) || []
      setList(rows)
      const d: Record<string, string> = {}
      for (const r of rows) d[r.policyKey] = JSON.stringify(r.policyValue ?? [], null, 2)
      setDrafts(d)
    } catch (err) {
      message.error('加载策略失败: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (p: AdminAutomationPolicy) => {
    try {
      let value: unknown = []
      try { value = JSON.parse(drafts[p.policyKey] || '[]') } catch { throw new Error('JSON 格式错误') }
      setSavingKey(p.policyKey)
      await adminUpdateAutomationPolicy(p.policyKey, { policyValue: value })
      message.success('策略已保存')
      void load()
    } catch (err) {
      message.error('保存失败: ' + (err as Error).message)
    } finally {
      setSavingKey('')
    }
  }

  const columns: TableColumnsType<AdminAutomationPolicy> = [
    {
      title: '策略', dataIndex: 'policyKey', width: 220,
      render: (k) => (
        <Space direction="vertical" size={2}>
          <Tag color="geekblue">{k}</Tag>
          <span style={{ color: '#888', fontSize: 12 }}>{KEY_LABELS[k] ?? ''}</span>
        </Space>
      ),
    },
    { title: '说明', dataIndex: 'description', width: 260 },
    {
      title: '策略内容 (JSON 数组)', width: 420,
      render: (_, p) => (
        <Input.TextArea
          rows={5}
          value={drafts[p.policyKey] ?? ''}
          onChange={(e) => setDrafts((d) => ({ ...d, [p.policyKey]: e.target.value }))}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      ),
    },
    {
      title: '操作', width: 120,
      render: (_, p) => (
        <Button type="primary" icon={<SaveOutlined />} loading={savingKey === p.policyKey} onClick={() => save(p)}>保存</Button>
      ),
    },
  ]

  return (
    <Card
      title="安全策略管理"
      extra={<Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}
    >
      <Table rowKey="policyKey" loading={loading} columns={columns} dataSource={list} pagination={false} />
    </Card>
  )
}