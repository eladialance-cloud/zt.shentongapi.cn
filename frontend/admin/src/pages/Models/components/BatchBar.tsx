import { Button, Form, InputNumber, Modal, Space, Upload, message } from 'antd'
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { batchEnableModels, batchUpdateModelPrice, exportModels, importModelsJson } from '@/api/admin-model-api'

/** 批量操作：上架/下架/改价/导出/导入 */
export default function BatchBar(props: { selectedIds: number[]; onChanged: () => void }) {
  const { selectedIds, onChanged } = props
  const [priceOpen, setPriceOpen] = useState(false)
  const [priceSubmitting, setPriceSubmitting] = useState(false)
  const [form] = Form.useForm()

  async function handleEnable(enabled: boolean) {
    if (selectedIds.length === 0) return message.warning('请先勾选模型')
    try {
      await batchEnableModels({ ids: selectedIds, enabled })
      message.success(enabled ? '已批量上架' : '已批量下架')
      onChanged()
    } catch (err) {
      message.error((err as Error)?.message || '操作失败')
      console.error(err)
    }
  }

  async function handlePrice() {
    try {
      setPriceSubmitting(true)
      const values = await form.validateFields()
      if (Object.keys(values).length === 0) {
        message.warning('请至少填写一个价格字段')
        return
      }
      await batchUpdateModelPrice({ ids: selectedIds, ...values })
      message.success('批量改价完成')
      setPriceOpen(false)
      form.resetFields()
      onChanged()
    } catch (err) {
      message.error((err as Error)?.message || '操作失败')
      console.error(err)
    } finally {
      setPriceSubmitting(false)
    }
  }

  async function handleExport() {
    try {
      const items = await exportModels()
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'models-config.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      message.error((err as Error)?.message || '操作失败')
      console.error(err)
    }
  }

  return (
    <Space style={{ marginBottom: 12 }}>
      <Button disabled={selectedIds.length === 0} onClick={() => handleEnable(true)}>批量上架</Button>
      <Button disabled={selectedIds.length === 0} onClick={() => handleEnable(false)}>批量下架</Button>
      <Button disabled={selectedIds.length === 0} onClick={() => setPriceOpen(true)}>批量改价</Button>
      <Button icon={<DownloadOutlined />} onClick={handleExport}>导出配置</Button>
      <Upload
        accept=".json"
        showUploadList={false}
        beforeUpload={async (file) => {
          try {
            const text = await file.text()
            let items: unknown
            try {
              items = JSON.parse(text)
            } catch {
              message.error('JSON 解析失败，请选择导出的配置文件')
              return Upload.LIST_IGNORE
            }
            if (!Array.isArray(items)) {
              message.error('配置文件必须是模型数组')
              return Upload.LIST_IGNORE
            }
            const r = await importModelsJson(items)
            if (r.errors.length > 0) {
              message.warning(`导入 ${r.imported} 条，更新 ${r.updated} 条，失败 ${r.errors.length} 条`)
            } else {
              message.success(`导入 ${r.imported} 条，更新 ${r.updated} 条`)
            }
            onChanged()
            return Upload.LIST_IGNORE
          } catch (err) {
            message.error((err as Error)?.message || '操作失败')
            console.error(err)
            return Upload.LIST_IGNORE
          }
        }}
      >
        <Button icon={<UploadOutlined />}>导入配置</Button>
      </Upload>

      <Modal
        title={`批量改价（${selectedIds.length} 个模型）`}
        open={priceOpen}
        onOk={handlePrice}
        onCancel={() => {
          setPriceOpen(false)
          form.resetFields()
        }}
        confirmLoading={priceSubmitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="inputPricePerToken" label="输入单价(积分/千token)">
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="outputPricePerToken" label="输出单价(积分/千token)">
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="pricePerImage" label="图片单价(积分/张)">
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="pricePerCall" label="按次单价(积分/次)">
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="pricePerMinute" label="按分钟单价(积分/分钟)">
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}