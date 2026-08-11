// 环境变量配置弹窗
// 优先按官方目录 envTemplate 渲染表单；拿不到模板时回退为通用 KV 编辑。

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  ConfigProvider,
  Form,
  Input,
  Modal,
  Spin,
  theme,
  message,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { mcpApi } from '@/api/mcp-api'
import * as marketApi from '@/api/market-api'
import styles from './styles.module.css'

export interface EnvTemplateItem {
  key: string
  label: string
  required?: boolean
  secret?: boolean
  default?: string
  description?: string
}

interface EnvModalProps {
  open: boolean
  serverId: number | null
  onClose: () => void
  onSaved?: () => void
}

interface EnvFormValues {
  env?: Record<string, string>
  kvEnv?: Array<{ key: string; value?: string }>
}

/** 优先走后端目录详情，失败回退本地 mcp.json（均不强依赖） */
async function tryLoadTemplate(catalogId: number): Promise<EnvTemplateItem[] | null> {
  try {
    const cat = await mcpApi.getCatalog(catalogId)
    if (cat.envTemplate && cat.envTemplate.length > 0) {
      return cat.envTemplate as EnvTemplateItem[]
    }
  } catch {
    // 后端目录详情不可用时继续尝试本地
  }
  try {
    const d = await marketApi.getDetail('mcp', catalogId)
    const raw = (d.detail || {}) as Record<string, unknown>
    if (Array.isArray(raw.envTemplate)) {
      return raw.envTemplate as EnvTemplateItem[]
    }
  } catch {
    // 忽略，回退 KV 编辑
  }
  return null
}

export default function EnvModal({ open, serverId, onClose, onSaved }: EnvModalProps) {
  const [form] = Form.useForm<EnvFormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [template, setTemplate] = useState<EnvTemplateItem[] | null>(null)
  const [serverName, setServerName] = useState('')

  const load = useCallback(
    async (id: number) => {
      setLoading(true)
      setTemplate(null)
      setServerName('')
      try {
        const server = await mcpApi.getServer(id)
        setServerName(server.name)

        let tmpl: EnvTemplateItem[] | null = null
        if (server.catalogId != null) {
          tmpl = await tryLoadTemplate(server.catalogId)
        }

        if (tmpl && tmpl.length > 0) {
          setTemplate(tmpl)
          const env = server.env || {}
          const initEnv: Record<string, string> = {}
          for (const t of tmpl) {
            initEnv[t.key] = env[t.key] ?? t.default ?? ''
          }
          form.setFieldsValue({ env: initEnv })
        } else {
          setTemplate(null)
          form.setFieldsValue({
            kvEnv: Object.entries(server.env || {}).map(([k, v]) => ({ key: k, value: v })),
          })
        }
      } catch (err) {
        console.error('[EnvModal] load failed:', err)
        message.error('加载服务器信息失败')
      } finally {
        setLoading(false)
      }
    },
    [form],
  )

  useEffect(() => {
    if (open) {
      form.resetFields()
      if (serverId != null) {
        void load(serverId)
      }
    }
  }, [open, serverId, form, load])

  const handleSave = async () => {
    if (serverId == null) return
    try {
      const values = await form.validateFields()
      let env: Record<string, string> = {}
      if (template && template.length > 0) {
        env = values.env || {}
      } else {
        for (const row of values.kvEnv || []) {
          const key = (row.key || '').trim()
          if (key) env[key] = row.value ?? ''
        }
      }
      setSaving(true)
      await mcpApi.updateServer(serverId, { env })
      message.success('环境变量已保存')
      onClose()
      onSaved?.()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[EnvModal] save failed:', err)
      message.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <Modal
        className={styles.envModal}
        title={serverName ? '配置环境变量 - ' + serverName : '配置环境变量'}
        open={open}
        onCancel={onClose}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={560}
        forceRender
        styles={{ body: { paddingTop: 24 } }}
      >
        <Spin spinning={loading}>
          {template && template.length > 0 ? (
            /* 模板模式：按 envTemplate 逐项渲染，key 只读 */
            <Form form={form} layout="vertical">
              {template.map((item) => (
                <Form.Item
                  key={item.key}
                  name={['env', item.key]}
                  label={
                    <span className={styles.envLabel}>
                      <span>{item.label || item.key}</span>
                      <span className={styles.envKey}>{item.key}</span>
                    </span>
                  }
                  rules={
                    item.required
                      ? [{ required: true, message: '请填写 ' + (item.label || item.key) }]
                      : undefined
                  }
                >
                  {item.secret ? (
                    <Input.Password
                      placeholder={item.description || '请输入 ' + (item.label || item.key)}
                      autoComplete="new-password"
                    />
                  ) : (
                    <Input
                      placeholder={item.description || '请输入 ' + (item.label || item.key)}
                    />
                  )}
                </Form.Item>
              ))}
            </Form>
          ) : (
            /* 通用 KV 编辑 */
            <Form form={form} layout="vertical">
              <Form.List name="kvEnv">
                {(fields, { add, remove }) => (
                  <div>
                    {fields.map(({ key, name, ...restField }) => (
                      <div key={key} className={styles.kvRow}>
                        <Form.Item
                          {...restField}
                          name={[name, 'key']}
                          rules={[{ required: true, message: '请输入变量名' }]}
                          className={styles.kvKey}
                        >
                          <Input placeholder="变量名（如 API_KEY）" />
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, 'value']}
                          className={styles.kvValue}
                        >
                          <Input placeholder="变量值" />
                        </Form.Item>
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(name)}
                          aria-label="删除"
                        />
                      </div>
                    ))}
                    {fields.length === 0 && (
                      <div className={styles.kvEmptyHint}>
                        暂无环境变量模板，可手动添加变量后保存
                      </div>
                    )}
                    <Button
                      type="dashed"
                      block
                      icon={<PlusOutlined />}
                      onClick={() => add({ key: '', value: '' })}
                    >
                      添加环境变量
                    </Button>
                  </div>
                )}
              </Form.List>
            </Form>
          )}
        </Spin>
      </Modal>
    </ConfigProvider>
  )
}
