// 个人设置 · 飞书开放平台（对标 RRClaw「平台设置 → 飞书」）
// 凭证（App ID / App Secret）→ 测试连接 → 一键创建多维表格（三省六部工作台）
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Form, Input, Modal, Space, Spin, Table, Tag, Typography, message } from 'antd'
import { CheckCircleOutlined, CloudSyncOutlined, CopyOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons'

const { Paragraph, Text } = Typography

interface FeishuTableRow {
  name: string
  envKey: string
  official: string
  tableId: string
  url: string
}

export default function FeishuPlatform() {
  const [form] = Form.useForm<{ appId?: string; appSecret?: string }>()
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState<{ step: string; message?: string } | null>(null)
  const [configured, setConfigured] = useState(false)
  const [hasSecret, setHasSecret] = useState(false)
  const [rows, setRows] = useState<FeishuTableRow[]>([])
  const [failed, setFailed] = useState<Array<{ name: string; error: string }>>([])
  const [appUrl, setAppUrl] = useState('')
  const [bitableInfo, setBitableInfo] = useState<{
    appUrl: string
    createdAt: string
    droppedFields?: Array<{ table: string; field: string; error: string }>
  } | null>(null)
  const [strategicUrl, setStrategicUrl] = useState('')

  const api = window.electronAPI as unknown as {
    feishu?: {
      getSettings(): Promise<{ configured: boolean; appId: string; hasSecret: boolean }>
      saveSettings(input: { appId?: string; appSecret?: string }): Promise<{ ok: boolean; error?: string }>
      testConnection(): Promise<{ ok: boolean; error?: string; data?: { appId: string; tokenMask: string } }>
      initTables(options?: { force?: boolean }): Promise<{
        ok: boolean
        appToken?: string
        appUrl?: string
        tables?: FeishuTableRow[]
        failed?: Array<{ name: string; error: string }>
        reused?: boolean
        createdCount?: number
        reusedCount?: number
        droppedFields?: Array<{ table: string; field: string; error: string }>
        error?: string
      }>
      getBitable(): Promise<{
        appToken: string
        appUrl: string
        createdAt: string
        tables: FeishuTableRow[]
        failed: Array<{ name: string; error: string }>
        droppedFields?: Array<{ table: string; field: string; error: string }>
      } | null>
      onInitProgress(cb: (p: { step: string; message?: string }) => void): () => void
    }
  }

  /** 用系统浏览器打开外链（Electron 内 window.open 常被拦/开在应用内） */
  const openUrl = useCallback((url: string) => {
    if (!url) return
    const app = (
      window as unknown as { electronAPI?: { app?: { openExternal?: (u: string) => Promise<void> } } }
    ).electronAPI?.app
    if (app?.openExternal) void app.openExternal(url).catch(() => window.open(url, '_blank'))
    else window.open(url, '_blank')
  }, [])

  const copyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      message.success('已复制链接')
    } catch {
      message.warning('复制失败，请手动选中复制')
    }
  }, [])

  const load = useCallback(async () => {
    if (!api?.feishu) return
    setLoading(true)
    try {
      const s = await api.feishu.getSettings()
      setConfigured(s.configured)
      setHasSecret(s.hasSecret)
      form.setFieldsValue({ appId: s.appId })

      // 已建工作台：刷新/重进页面后依然可见（以前只存在内存里，关掉就"没了"）
      const st = await api.feishu.getBitable?.()
      setBitableInfo(
        st ? { appUrl: st.appUrl, createdAt: st.createdAt, droppedFields: st.droppedFields } : null,
      )
      if (st) {
        setRows(st.tables ?? [])
        setFailed(st.failed ?? [])
        setAppUrl(st.appUrl || '')
      }

      // 战略方向文档（中书省牵头维护）
      const t = await window.electronAPI?.edict?.officialTables?.('zhongshu')
      const doc = t?.tables?.find((x) => x.envKey === 'FEISHU_STRATEGY_DOC')
      setStrategicUrl(doc?.url || '')
    } finally {
      setLoading(false)
    }
  }, [api, form])

  useEffect(() => {
    void load()
    if (!api?.feishu) return
    const off = api.feishu.onInitProgress((p) => setProgress(p))
    return () => off?.()
  }, [api, load])

  const onSave = async () => {
    const values = form.getFieldsValue()
    if (!values.appId?.trim()) {
      message.warning('请填写 App ID')
      return
    }
    const res = await api.feishu!.saveSettings({
      appId: values.appId?.trim(),
      // 留空表示不修改已保存的 Secret
      appSecret: values.appSecret?.trim() ? values.appSecret.trim() : undefined,
    })
    if (res.ok) {
      message.success('已保存飞书凭证')
      form.setFieldValue('appSecret', '')
      await load()
    } else {
      message.error(res.error || '保存失败')
    }
  }

  const onTest = async () => {
    setTesting(true)
    try {
      const res = await api.feishu!.testConnection()
      if (res.ok) message.success(`连接成功（App ID ${res.data?.appId}）`)
      else message.error(res.error || '连接失败')
    } finally {
      setTesting(false)
    }
  }

  const onCreateTables = async (force = false) => {
    setCreating(true)
    setRows([])
    setFailed([])
    setProgress({ step: 'start', message: force ? '重建工作台…' : '开始创建…' })
    try {
      const res = await api.feishu!.initTables(force ? { force: true } : undefined)
      if (res.ok) {
        setRows(res.tables ?? [])
        setFailed(res.failed ?? [])
        setAppUrl(res.appUrl ?? '')
        await load()
        const parts = [
          res.reused ? '复用已有工作台' : '新建工作台',
          `新建 ${res.createdCount ?? 0} 张`,
          `复用 ${res.reusedCount ?? 0} 张`,
        ]
        if (res.failed?.length) parts.push(`失败 ${res.failed.length} 张`)
        if (res.droppedFields?.length) parts.push(`${res.droppedFields.length} 个字段被飞书拒绝`)
        message.success(`多维表格就绪：${parts.join(' · ')}`)
      } else {
        message.error(res.error || '创建失败')
      }
    } finally {
      setCreating(false)
      setTimeout(() => setProgress(null), 1500)
    }
  }

  const columns = useMemo(
    () => [
      { title: '数据表', dataIndex: 'name', key: 'name', ellipsis: true },
      { title: '归属官署', dataIndex: 'official', key: 'official', width: 110 },
      { title: 'env 键', dataIndex: 'envKey', key: 'envKey', ellipsis: true },
      {
        title: '打开',
        key: 'url',
        width: 80,
        render: (_: unknown, r: FeishuTableRow) => (
          <Button
            type="link"
            size="small"
            icon={<ExportOutlined />}
            onClick={() => openUrl(r.url)}
          >
            查看
          </Button>
        ),
      },
    ],
    [openUrl],
  )

  const workbenchUrl = bitableInfo?.appUrl || appUrl

  if (!api?.feishu) {
    return <Alert type="warning" showIcon message="当前环境不支持飞书平台功能（仅桌面端可用）" />
  }

  return (
    <Card title="飞书开放平台" extra={<Tag color={configured ? 'success' : 'default'}>{configured ? '已配置' : '未配置'}</Tag>}>
      <Spin spinning={loading}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="用途"
          description={
            <Paragraph style={{ marginBottom: 0 }}>
              三省六部的任务主表、各官署业务表都落在飞书多维表格里，AI 员工读写真实业务数据。请到飞书开放平台创建「企业自建应用」，
              开通 <Text code>bitable:app</Text>、<Text code>docx:document</Text>、<Text code>drive:drive</Text> 权限，把 App ID / App Secret 填到下方。
            </Paragraph>
          }
        />

        <Form form={form} layout="vertical" style={{ maxWidth: 520 }}>
          <Form.Item label="App ID" name="appId" rules={[{ required: true, message: '请填写 App ID' }]}>
            <Input placeholder="cli_xxxxxxxxxxxx" allowClear />
          </Form.Item>
          <Form.Item
            label="App Secret"
            name="appSecret"
            extra={hasSecret ? '已保存，留空则不修改' : '尚未保存'}
          >
            <Input.Password placeholder={hasSecret ? '••••••••（留空不修改）' : '请输入 App Secret'} allowClear />
          </Form.Item>
          <Space wrap>
            <Button type="primary" onClick={onSave}>
              保存
            </Button>
            <Button icon={<CheckCircleOutlined />} loading={testing} disabled={!configured} onClick={onTest}>
              测试连接
            </Button>
          </Space>
        </Form>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--app-split, #f0f0f0)' }}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space wrap>
              <Button
                type="primary"
                icon={<CloudSyncOutlined />}
                loading={creating}
                disabled={!configured}
                onClick={() => void onCreateTables(false)}
              >
                {bitableInfo ? '补齐缺失的表' : '一键创建多维表格'}
              </Button>
              {bitableInfo && (
                <Button
                  danger
                  disabled={creating}
                  onClick={() =>
                    Modal.confirm({
                      title: '重建多维表格？',
                      content:
                        '会在飞书里再建一份全新的多维表格工作台，旧工作台里的数据不会自动迁移。只有旧工作台被删或想重新开始时才需要。',
                      okText: '重建',
                      cancelText: '取消',
                      onOk: () => onCreateTables(true),
                    })
                  }
                >
                  重建工作台
                </Button>
              )}
              <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={creating}>
                刷新状态
              </Button>
              {progress?.message && <Tag color="processing">{progress.message}</Tag>}
            </Space>

            {workbenchUrl && (
              <Alert
                type="success"
                showIcon
                message={bitableInfo ? '已有多维表格工作台（默认复用，不会重复新建）' : '多维表格已就绪'}
                description={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Space wrap>
                      <Button
                        type="link"
                        style={{ padding: 0 }}
                        icon={<ExportOutlined />}
                        onClick={() => openUrl(workbenchUrl)}
                      >
                        打开工作台：{workbenchUrl}
                      </Button>
                      <Button size="small" icon={<CopyOutlined />} onClick={() => void copyUrl(workbenchUrl)}>
                        复制
                      </Button>
                    </Space>
                    {bitableInfo?.createdAt && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        创建于 {new Date(bitableInfo.createdAt).toLocaleString()}
                      </Text>
                    )}
                    {bitableInfo?.droppedFields && bitableInfo.droppedFields.length > 0 && (
                      <Text type="warning" style={{ fontSize: 12 }}>
                        {bitableInfo.droppedFields.length} 个字段被飞书拒绝（表本身已建出）：
                        {bitableInfo.droppedFields.map((f) => `${f.table}/${f.field}`).join('、')}
                      </Text>
                    )}
                  </div>
                }
              />
            )}

            {strategicUrl && (
              <Alert
                type="info"
                showIcon
                message="战略方向文档（由中书省牵头维护）"
                description={
                  <Space wrap>
                    <Button
                      type="link"
                      style={{ padding: 0 }}
                      icon={<ExportOutlined />}
                      onClick={() => openUrl(strategicUrl)}
                    >
                      {strategicUrl}
                    </Button>
                    <Button size="small" icon={<CopyOutlined />} onClick={() => void copyUrl(strategicUrl)}>
                      复制
                    </Button>
                  </Space>
                }
              />
            )}

            {(rows.length > 0 || failed.length > 0) && (
              <>
                <Table
                  size="small"
                  rowKey="tableId"
                  columns={columns}
                  dataSource={rows}
                  pagination={false}
                  scroll={{ y: 320 }}
                />
                {failed.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`${failed.length} 张表创建失败`}
                    description={failed.map((f) => `${f.name}：${f.error}`).join('；')}
                  />
                )}
              </>
            )}
          </Space>
        </div>
      </Spin>
    </Card>
  )
}
