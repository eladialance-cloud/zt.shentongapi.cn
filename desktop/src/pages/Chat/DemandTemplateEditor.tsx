// 需求模板编辑器（方案 A）：自定义老板模式 / 客户会议模式的步骤文案与必填规则
// 保存到 localStorage（demand-wizard-template:v1），向导实时生效
import { useEffect, useState } from 'react'
import { Button, Checkbox, Input, Modal, Tabs, message } from 'antd'
import { getStepSchema, saveCustomTemplates } from './demand-schema'
import type { DemandMode, StepItem } from './demand-schema'

interface DemandTemplateEditorProps {
  open: boolean
  onClose: () => void
  /** 保存/恢复默认后通知父组件刷新向导 */
  onSaved: () => void
}

type StepListState = Record<Extract<DemandMode, 'boss' | 'client'>, StepItem[]>

function StepRows({
  steps,
  onChange,
}: {
  steps: StepItem[]
  onChange: (next: StepItem[]) => void
}) {
  const update = (index: number, patch: Partial<StepItem>) => {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((step, i) => (
        <div key={step.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Input
            style={{ width: 110 }}
            placeholder="标签"
            value={step.label}
            onChange={(e) => update(i, { label: e.target.value })}
          />
          <Input.TextArea
            style={{ flex: 1 }}
            placeholder="提问文案"
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={step.question}
            onChange={(e) => update(i, { question: e.target.value })}
          />
          <Checkbox
            checked={step.required}
            onChange={(e) => update(i, { required: e.target.checked })}
          >
            必填
          </Checkbox>
        </div>
      ))}
    </div>
  )
}

export function DemandTemplateEditor({ open, onClose, onSaved }: DemandTemplateEditorProps) {
  const [draft, setDraft] = useState<StepListState>({ boss: [], client: [] })

  useEffect(() => {
    if (open) {
      setDraft({
        boss: getStepSchema('boss').map((s) => ({ ...s })),
        client: getStepSchema('client').map((s) => ({ ...s })),
      })
    }
  }, [open])

  const changeMode = (mode: 'boss' | 'client', steps: StepItem[]) => {
    setDraft((prev) => ({ ...prev, [mode]: steps }))
  }

  const handleSave = () => {
    saveCustomTemplates({ boss: draft.boss, client: draft.client })
    message.success('需求模板已保存')
    onSaved()
    onClose()
  }

  const handleReset = () => {
    saveCustomTemplates(null)
    message.success('已恢复默认模板')
    onSaved()
    onClose()
  }

  return (
    <Modal
      title="需求模板设置"
      open={open}
      onCancel={onClose}
      width={720}
      footer={[
        <Button key="reset" onClick={handleReset}>恢复默认</Button>,
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="save" type="primary" onClick={handleSave}>保存模板</Button>,
      ]}
    >
      <Tabs
        items={[
          {
            key: 'boss',
            label: '老板模式（' + draft.boss.length + ' 键）',
            children: <StepRows steps={draft.boss} onChange={(s) => changeMode('boss', s)} />,
          },
          {
            key: 'client',
            label: '客户会议模式（' + draft.client.length + ' 键）',
            children: <StepRows steps={draft.client} onChange={(s) => changeMode('client', s)} />,
          },
        ]}
      />
      <p style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        模板保存在本机。字段数量与键序不可增删（避免简报组装失败），可修改提问文案、标签与必填规则。
      </p>
    </Modal>
  )
}

export default DemandTemplateEditor
