/**
 * stdiocommand + args + env
 * httpurl + headers
 */

import { useState } from 'react'
import { Modal, Form, Input, Select, Space, message } from 'antd'
import { mcpApi } from '@/api/mcp-api'
import type { McpServer } from '@/api/mcp-api'
import styles from './styles.module.css'

interface ServerFormProps {
  open: boolean
  editing: McpServer | null
  onClose: () => void
  onSuccess: () => void
}

interface FormValues {
  name: string
  description?: string
  transportType: 'stdio' | 'http' | 'streamable-http'
  command?: string
  args?: string
  env?: string
  url?: string
  headers?: string
}

const TRANSPORT_OPTIONS = [
  { label: 'stdio', value: 'stdio' },
  { label: 'http', value: 'http' },
  { label: 'streamable-http', value: 'streamable-http' },
]

export default function ServerForm({ open, editing, onClose, onSuccess }: ServerFormProps) {
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)

  const initialValues: Partial<FormValues> = editing
    ? {
        name: editing.name,
        description: editing.description,
        transportType: editing.transportType || editing.transport || 'stdio',
        command: editing.command,
        args: editing.args?.join(' '),
        env: editing.env ? JSON.stringify(editing.env, null, 2) : '',
        url: editing.url,
        headers: editing.headers ? JSON.stringify(editing.headers, null, 2) : '',
      }
    : {
        transportType: 'stdio',
      }

  /** 保存 */
  const handleSave = async () => {
    try {
      const values = await form.validateFields()

      let envParsed: Record<string, string> | undefined
      let headersParsed: Record<string, string> | undefined

      if (values.env && values.env.trim()) {
        try {
          envParsed = JSON.parse(values.env) as Record<string, string>
        } catch {
          message.error('环境变量 JSON 格式')
          return
        }
      }
      if (values.headers && values.headers.trim()) {
        try {
          headersParsed = JSON.parse(values.headers) as Record<string, string>
        } catch {
          message.error('求头 JSON 格式')
          return
        }
      }

      const argsArr = values.args?.trim() ? values.args.trim().split(/\s+/) : undefined

      setSaving(true)

      const payload: Partial<McpServer> = {
        name: values.name,
        description: values.description,
        transportType: values.transportType,
        command: values.command,
        args: argsArr,
        env: envParsed,
        url: values.url,
        ...(headersParsed ? { headers: headersParsed } as Record<string, unknown> : {}),
      }

      if (editing) {
        await mcpApi.updateServer(editing.id, payload)
        message.success('MCP服务器已更新')
      } else {
        await mcpApi.createServer(payload)
        message.success('MCP服务器已创建')
      }
      onSuccess()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[ServerForm] save failed:', err)
      message.error('保存失')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? `编服务器 - ${editing.name}` : '添加MCP服务器'}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnClose
      width={680}
      styles={{
        body: { background: 'var(--color-bg-container)', paddingTop: 24 },
      }}
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={initialValues}
      >
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, message: '入名称' }]}
        >
          <Input placeholder="" maxLength={64} />
        </Form.Item>

        <Form.Item name="description" label="描">
          <Input.TextArea rows={2} maxLength={500} showCount />
        </Form.Item>

        <Form.Item
          name="transportType"
          label="传型"
          rules={[{ required: true, message: '选择传型' }]}
        >
          <Select options={TRANSPORT_OPTIONS} />
        </Form.Item>

        {/* stdio 模式command + args */}
        <Form.Item shouldUpdate noStyle>
          {({ getFieldValue }) =>
            getFieldValue('transportType') === 'stdio' ? (
              <>
                <Form.Item name="command" label="命令">
                  <Input placeholder="" />
                </Form.Item>
                <Form.Item name="args" label="">
                  <Input placeholder="" />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item name="url" label="URL">
                  <Input placeholder="" />
                </Form.Item>
                <Form.Item name="headers" label="">
                  <Input.TextArea
                    rows={3}
                    placeholder='{"Authorization":"Bearer xxx"}'
                    className={styles.jsonTextarea}
                  />
                </Form.Item>
              </>
            )
          }
        </Form.Item>

        <Form.Item name="env" label="">
          <Input.TextArea
            rows={3}
            placeholder='{"API_KEY":"xxx"}'
            className={styles.jsonTextarea}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
