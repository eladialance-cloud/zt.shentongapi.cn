// AI 审核配置页 - SubTask 25.2
//
// 表单:启用开关/审核模型选择(从 /api/admin/models 拉取)/敏感阈值(0-1)/暴力阈值/色情阈值/自动处理开关
// 测试输入框:输入文本 → 调用 POST /admin/audit/test 返回审核结果
// API: GET /admin/audit/config、PUT /admin/audit/config、POST /admin/audit/test

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  Switch,
  Tag,
  message
} from 'antd'
import {
  ExperimentOutlined,
  RobotOutlined,
  SaveOutlined
} from '@ant-design/icons'
import { listAdminModels } from '@/api/admin-model-api'
import { getAuditConfig, testAudit, updateAuditConfig } from '@/api/admin-audit-api'
import type { AdminModelItem } from '@/types/admin-model'
import type {
  AuditConfig,
  AuditTestResult,
  UpdateAuditConfigDto
} from '@/types/admin-audit'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

interface ConfigFormValues {
  enabled: boolean
  modelId?: string
  sensitiveThreshold: number
  violenceThreshold: number
  pornThreshold: number
  autoProcess: boolean
}

const SUGGESTION_TAG: Record<AuditTestResult['suggestion'], { color: string; text: string }> = {
  allow: { color: 'green', text: '通过' },
  review: { color: 'orange', text: '需审核' },
  block: { color: 'red', text: '拦截' }
}

export default function AuditAIConfig() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<AdminModelItem[]>([])
  const [form] = Form.useForm<ConfigFormValues>()

  const [testText, setTestText] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AuditTestResult | null>(null)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const [cfg, modelResult] = await Promise.all([
        getAuditConfig(),
        listAdminModels({ enabled: true })
      ])
      const r = modelResult as AdminPaginatedResult<AdminModelItem>
      setModels(r.list || [])
      form.setFieldsValue({
        enabled: cfg.enabled,
        modelId: cfg.modelId,
        sensitiveThreshold: cfg.sensitiveThreshold,
        violenceThreshold: cfg.violenceThreshold,
        pornThreshold: cfg.pornThreshold,
        autoProcess: cfg.autoProcess
      })
    } catch (err) {
      console.error('[AuditAIConfig] load failed:', err)
      message.error('加载审核配置失败')
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const dto: UpdateAuditConfigDto = {
        enabled: values.enabled,
        modelId: values.modelId,
        sensitiveThreshold: values.sensitiveThreshold,
        violenceThreshold: values.violenceThreshold,
        pornThreshold: values.pornThreshold,
        autoProcess: values.autoProcess
      }
      await updateAuditConfig(dto)
      message.success('已保存审核配置')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AuditAIConfig] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testText.trim()) {
      message.warning('请输入测试文本')
      return
    }
    setTesting(true)
    try {
      const result = await testAudit({ text: testText })
      setTestResult(result)
    } catch (err) {
      console.error('[AuditAIConfig] test failed:', err)
      message.error('测试失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <RobotOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>AI 审核配置</h1>
            <div className={styles.subtitle}>配置 AI 内容审核模型与阈值</div>
          </div>
        </div>
      </div>

      <Spin spinning={loading}>
        <div className={styles.sectionTitle}>
          <RobotOutlined /> 审核配置
        </div>
        <Card className={styles.card} bordered={false} style={{ marginBottom: 20 }}>
          <Form<ConfigFormValues> form={form} layout="vertical">
            <Form.Item name="enabled" label="启用 AI 审核" valuePropName="checked">
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Form.Item name="modelId" label="审核模型">
              <Select
                placeholder="请选择审核模型"
                allowClear
                options={models.map((m) => ({
                  label: `${m.displayName} (${m.modelId})`,
                  value: m.modelId
                }))}
              />
            </Form.Item>
            <Form.Item
              name="sensitiveThreshold"
              label="敏感阈值(0-1)"
              rules={[{ required: true, message: '请输入敏感阈值' }]}
            >
              <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="violenceThreshold"
              label="暴力阈值(0-1)"
              rules={[{ required: true, message: '请输入暴力阈值' }]}
            >
              <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="pornThreshold"
              label="色情阈值(0-1)"
              rules={[{ required: true, message: '请输入色情阈值' }]}
            >
              <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="autoProcess"
              label="自动处理(命中风险时直接处理,无需人工)"
              valuePropName="checked"
            >
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
              className={styles.primaryBtn}
            >
              保存配置
            </Button>
          </Form>
        </Card>

        <div className={styles.sectionTitle}>
          <ExperimentOutlined /> 审核测试
        </div>
        <Card className={styles.card} bordered={false}>
          <Input.TextArea
            rows={4}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="输入待审核文本..."
            maxLength={1000}
            showCount
          />
          <div style={{ marginTop: 12 }}>
            <Button
              type="primary"
              icon={<ExperimentOutlined />}
              onClick={handleTest}
              loading={testing}
              className={styles.primaryBtn}
            >
              开始测试
            </Button>
          </div>

          {testResult && (
            <div className={styles.testResultBox}>
              <div>
                是否命中风险:
                <Tag color={testResult.flagged ? 'red' : 'green'}>
                  {testResult.flagged ? '是' : '否'}
                </Tag>
              </div>
              <div>综合风险分数:{testResult.riskScore.toFixed(3)}</div>
              <div>
                分类分数:敏感 {testResult.categories.sensitive.toFixed(3)} / 暴力{' '}
                {testResult.categories.violence.toFixed(3)} / 色情{' '}
                {testResult.categories.porn.toFixed(3)}
              </div>
              <div>
                命中敏感词:
                {testResult.hitWords.length > 0
                  ? testResult.hitWords.map((w) => (
                      <Tag key={w} color="orange" style={{ marginLeft: 4 }}>
                        {w}
                      </Tag>
                    ))
                  : '无'}
              </div>
              <div>
                建议动作:
                <Tag color={SUGGESTION_TAG[testResult.suggestion].color} style={{ marginLeft: 4 }}>
                  {SUGGESTION_TAG[testResult.suggestion].text}
                </Tag>
              </div>
            </div>
          )}
        </Card>
      </Spin>
    </div>
  )
}
