// 创建/编辑 Agent 表单
// SubTask 12.1: 基本信息 + 系统提示词 + 使用示例 + 模型绑定 + 定价配置
// 调用 POST /agents/creator（创建）/ PATCH /agents/creator/:id（编辑）/ GET /models

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Spin,
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  RobotOutlined,
  SaveOutlined
} from '@ant-design/icons'
import * as creatorApi from '@/api/agent-creator-api'
import type {
  CreatorAgent,
  CreatorModelOption,
  CreatorAgentCategory,
  PricingMode,
  CreateAgentDto
} from '@/types/agent-creator'
import styles from './styles.module.css'

const CATEGORY_OPTIONS: Array<{ label: string; value: CreatorAgentCategory }> = [
  { label: '办公', value: 'office' },
  { label: '编程', value: 'programming' },
  { label: '文案', value: 'copywriting' },
  { label: '数据分析', value: 'data_analysis' },
  { label: '其他', value: 'other' }
]

interface FormValues {
  name: string
  displayName: string
  description?: string
  avatar?: string
  category: CreatorAgentCategory
  systemPrompt: string
  usageExamples: string[]
  modelId: number
  pricingMode: PricingMode
  pricePerCall?: number
  pricePerTokenInput?: number
  pricePerTokenOutput?: number
}

export default function AgentCreatorCreate() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const agentId = id ? Number(id) : NaN
  const isEdit = Number.isFinite(agentId)

  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<CreatorModelOption[]>([])

  /** 加载模型列表 + （编辑模式）加载现有数据 */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const modelList = await creatorApi.listModels()
      setModels(modelList || [])

      if (isEdit) {
        const agent = await creatorApi.getAgentDetail(agentId)
        form.setFieldsValue({
          name: agent.name,
          displayName: agent.displayName,
          description: agent.description,
          avatar: agent.avatar,
          category: agent.category,
          systemPrompt: agent.systemPrompt,
          usageExamples:
            agent.usageExamples && agent.usageExamples.length > 0
              ? agent.usageExamples
              : [''],
          modelId: agent.modelId,
          pricingMode: agent.pricingMode,
          pricePerCall: agent.pricePerCall,
          pricePerTokenInput: agent.pricePerTokenInput,
          pricePerTokenOutput: agent.pricePerTokenOutput
        })
      } else {
        form.setFieldsValue({
          category: 'other',
          pricingMode: 'per_call',
          pricePerCall: 0,
          usageExamples: ['']
        })
      }
    } catch (err) {
      console.error('[AgentCreatorCreate] load failed:', err)
      message.error('加载数据失败: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [form, agentId, isEdit])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 提交表单 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      // 清理空的 usageExamples
      const cleanedExamples = (values.usageExamples || []).filter(
        (s) => s && s.trim().length > 0
      )

      const dto: CreateAgentDto = {
        name: values.name,
        displayName: values.displayName,
        description: values.description,
        avatar: values.avatar,
        category: values.category,
        systemPrompt: values.systemPrompt,
        usageExamples: cleanedExamples,
        modelId: values.modelId,
        pricingMode: values.pricingMode
      }

      if (values.pricingMode === 'per_call') {
        dto.pricePerCall = values.pricePerCall ?? 0
      } else {
        dto.pricePerTokenInput = values.pricePerTokenInput ?? 0
        dto.pricePerTokenOutput = values.pricePerTokenOutput ?? 0
      }

      let saved: CreatorAgent
      if (isEdit) {
        saved = await creatorApi.updateAgent(agentId, dto)
        message.success(`Agent "${saved.name}" 已更新`)
      } else {
        saved = await creatorApi.createAgent(dto)
        message.success(`Agent "${saved.name}" 已创建（草稿状态）`)
      }
      navigate('/creator')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AgentCreatorCreate] save failed:', err)
      message.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const pricingMode = Form.useWatch('pricingMode', form)

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <RobotOutlined />
          <span>{isEdit ? '编辑 Agent' : '创建 Agent'}</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/creator')}
          >
            返回列表
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        <div className={styles.formContainer}>
          <Card className={styles.formCard} bordered={false}>
            <Form form={form} layout="vertical" requiredMark>
              {/* ===== 基本信息 ===== */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>基本信息</div>
                <Form.Item
                  label="Agent 名称（唯一标识）"
                  name="name"
                  rules={[
                    { required: true, message: '请输入 Agent 名称' },
                    { max: 64, message: '名称最多 64 个字符' },
                    {
                      pattern: /^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/,
                      message: '仅支持字母、数字、下划线、连字符、中文'
                    }
                  ]}
                >
                  <Input placeholder="如 weather-assistant" />
                </Form.Item>

                <Form.Item
                  label="显示名称"
                  name="displayName"
                  rules={[
                    { required: true, message: '请输入显示名称' },
                    { max: 64, message: '显示名称最多 64 个字符' }
                  ]}
                >
                  <Input placeholder="如 天气助手" />
                </Form.Item>

                <Form.Item
                  label="描述"
                  name="description"
                  rules={[{ max: 256, message: '描述最多 256 个字符' }]}
                >
                  <Input.TextArea
                    rows={3}
                    placeholder="简要描述 Agent 用途、能力等"
                    maxLength={256}
                    showCount
                  />
                </Form.Item>

                <Form.Item
                  label="头像 URL"
                  name="avatar"
                  rules={[{ type: 'url', message: '请输入有效的 URL' }]}
                >
                  <Input placeholder="https://example.com/avatar.png（可选）" />
                </Form.Item>

                <Form.Item
                  label="分类"
                  name="category"
                  rules={[{ required: true, message: '请选择分类' }]}
                >
                  <Select options={CATEGORY_OPTIONS} placeholder="选择分类" />
                </Form.Item>
              </div>

              {/* ===== 系统提示词 ===== */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>系统提示词</div>
                <Form.Item
                  label="System Prompt"
                  name="systemPrompt"
                  rules={[
                    { required: true, message: '请输入系统提示词' },
                    { max: 4000, message: '系统提示词最多 4000 个字符' }
                  ]}
                >
                  <Input.TextArea
                    rows={6}
                    placeholder="定义 Agent 的人设、能力边界、输出格式等"
                    maxLength={4000}
                    showCount
                  />
                </Form.Item>
              </div>

              {/* ===== 使用示例 ===== */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>使用示例</div>
                <Form.List name="usageExamples" initialValue={['']}>
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <div key={field.key} className={styles.usageExampleItem}>
                          <Form.Item
                            {...field}
                            className={styles.usageExampleInput}
                            rules={[{ max: 256, message: '单个示例最多 256 个字符' }]}
                          >
                            <Input placeholder="示例：帮我查询今天的天气" />
                          </Form.Item>
                          {fields.length > 1 && (
                            <Button
                              type="text"
                              danger
                              icon={<MinusCircleOutlined />}
                              onClick={() => remove(field.name)}
                            />
                          )}
                        </div>
                      ))}
                      <Button
                        type="dashed"
                        onClick={() => add('')}
                        icon={<PlusOutlined />}
                        className={styles.backBtn}
                      >
                        添加示例
                      </Button>
                    </>
                  )}
                </Form.List>
              </div>

              {/* ===== 模型绑定 + 定价 ===== */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>模型绑定与定价</div>
                <Form.Item
                  label="绑定模型"
                  name="modelId"
                  rules={[{ required: true, message: '请选择绑定模型' }]}
                >
                  <Select
                    placeholder="选择模型"
                    options={models.map((m) => ({
                      label: m.provider ? `${m.name}（${m.provider}）` : m.name,
                      value: m.id
                    }))}
                    notFoundContent={
                      models.length === 0 ? '暂无可用模型' : undefined
                    }
                  />
                </Form.Item>

                <Form.Item
                  label="定价模式"
                  name="pricingMode"
                  rules={[{ required: true, message: '请选择定价模式' }]}
                >
                  <Select
                    options={[
                      { label: '按次计费（每次调用固定积分）', value: 'per_call' },
                      { label: '按 Token 计费（输入/输出分别计价）', value: 'per_token' }
                    ]}
                  />
                </Form.Item>

                {pricingMode === 'per_call' && (
                  <Form.Item
                    label="每次调用价格（积分）"
                    name="pricePerCall"
                    rules={[{ required: true, message: '请输入价格' }]}
                    extra="设置为 0 表示免费"
                  >
                    <Input type="number" min={0} placeholder="如 10" />
                  </Form.Item>
                )}

                {pricingMode === 'per_token' && (
                  <>
                    <Form.Item
                      label="输入 Token 价格（积分/千 token）"
                      name="pricePerTokenInput"
                      rules={[{ required: true, message: '请输入输入价格' }]}
                    >
                      <Input type="number" min={0} placeholder="如 2" />
                    </Form.Item>
                    <Form.Item
                      label="输出 Token 价格（积分/千 token）"
                      name="pricePerTokenOutput"
                      rules={[{ required: true, message: '请输入输出价格' }]}
                    >
                      <Input type="number" min={0} placeholder="如 5" />
                    </Form.Item>
                  </>
                )}
              </div>

              {/* ===== 操作按钮 ===== */}
              <div className={styles.formActions}>
                <Button
                  className={styles.backBtn}
                  onClick={() => navigate('/creator')}
                  disabled={saving}
                >
                  取消
                </Button>
                <Button
                  type="primary"
                  className={styles.primaryBtn}
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={handleSubmit}
                >
                  {isEdit ? '保存修改' : '创建草稿'}
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      </Spin>
    </div>
  )
}
