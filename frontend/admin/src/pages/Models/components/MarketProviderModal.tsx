import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Typography,
  message
} from 'antd'
import {
  createAdminProvider,
  testAdminProvider
} from '@/api/admin-model-api'
import type { MarketVendor } from '@/types/admin-model'

interface FormValues {
  name: string
  apiKey: string
  baseUrl: string
}

/** 模型市场：创建供应商弹窗（名称 + API Key；URL/路径/适配模板由预设预填可改） */
export default function MarketProviderModal(props: {
  open: boolean
  vendor: MarketVendor | null
  onClose: () => void
  onSaved: (providerId: number) => void
}) {
  const { open, vendor, onClose, onSaved } = props
  const [form] = Form.useForm<FormValues>()
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    if (open && vendor) {
      form.setFieldsValue({
        name: vendor.nameSuggestion,
        apiKey: '',
        baseUrl: vendor.baseUrl
      })
      setTestResult(null)
    }
  }, [open, vendor, form])

  async function handleTest() {
    if (!vendor) return
    const values = await form.validateFields()
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testAdminProvider({
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        model: 'qwen-plus',
        config: {
          chatPath: vendor.chatPath,
          modelsPath: vendor.modelsPath,
          generation: vendor.generation
        }
      })
      setTestResult({ ok: true, msg: res.response })
    } catch (err) {
      setTestResult({ ok: false, msg: (err as Error)?.message || '连接失败' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!vendor) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      const provider = await createAdminProvider({
        name: values.name,
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        apiStyle: vendor.apiStyle,
        config: {
          vendorKey: vendor.vendor,
          chatPath: vendor.chatPath,
          modelsPath: vendor.modelsPath,
          generation: vendor.generation
        }
      })
      message.success('供应商已创建')
      onSaved(provider.id)
    } catch (err) {
      message.error((err as Error)?.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`创建供应商：${vendor?.nameSuggestion ?? ''}`}
      open={open}
      onCancel={onClose}
      width={560}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button loading={testing} onClick={() => void handleTest()}>
            测试连接
          </Button>
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            保存并继续
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="供应商名称"
          rules={[{ required: true, message: '请输入供应商名称' }]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label="API Key"
          rules={[{ required: true, message: '请输入 API Key' }]}
        >
          <Input.Password maxLength={1024} placeholder="sk-xxx" />
        </Form.Item>
        <Form.Item
          name="baseUrl"
          label="Base URL"
          rules={[{ required: true, message: '请输入 Base URL' }]}
        >
          <Input maxLength={512} />
        </Form.Item>
      </Form>
      <Alert
        type="info"
        showIcon
        message="已自动预填（可改）"
        description={
          <Typography.Text style={{ fontSize: 12 }}>
            Chat 路径：{vendor?.chatPath}
            <br />
            模型列表路径：{vendor?.modelsPath}
            <br />
            生成适配模板：
            {vendor && Object.keys(vendor.generation).length > 0
              ? `${Object.keys(vendor.generation).join('、')} 等`
              : '无（文本类走 OpenAI 兼容即可）'}
          </Typography.Text>
        }
      />
      {testResult && (
        <Alert
          style={{ marginTop: 12 }}
          type={testResult.ok ? 'success' : 'error'}
          showIcon
          message={testResult.ok ? '连接成功' : '连接失败'}
          description={testResult.msg}
        />
      )}
    </Modal>
  )
}