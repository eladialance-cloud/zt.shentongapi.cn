// 需求模式（Task 3）：模式切换 + 前端驱动步骤式提问向导
// - DemandModeBar：自由对话（默认）/ 老板模式 / 客户会议模式
// - DemandWizard：对话气泡式逐步提问（AI 问 / 用户答），提供「上一步 / 跳过」，
//   收集完成显示「需求汇总卡」+「发布简报」；历史简报预填后只问差异点。
// 步骤键序 / 文案 / 必填规则全部来自 demand-schema 纯函数，不依赖 OpenClaw。

import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Button, Input, Segmented, message } from 'antd'
import { RobotOutlined, SendOutlined, UserOutlined } from '@ant-design/icons'
import {
  DEMAND_MODE_DESC,
  DEMAND_MODE_LABELS,
  DEMAND_MODES,
  getEffectiveStepSchema,
  hasNaturalFields,
  isWizardMode,
  nextStep,
  parseNaturalRequirement,
  prevStep,
  resumeIndex,
  stripNaturalFields,
  validateStep,
} from './demand-schema'
import type { DemandAnswers, DemandMode } from './demand-schema'
import styles from './styles.module.css'

/* ===== 模式切换 ===== */

interface DemandModeBarProps {
  mode: DemandMode
  onChange: (mode: DemandMode) => void
}

export function DemandModeBar({ mode, onChange }: DemandModeBarProps) {
  return (
    <div className={styles.demandModeBar}>
      <span className={styles.demandModeBarLabel}>需求模式</span>
      <Segmented
        size="small"
        value={mode}
        onChange={(v) => onChange(v as DemandMode)}
        options={DEMAND_MODES.map((m) => ({ label: DEMAND_MODE_LABELS[m], value: m }))}
      />
      {isWizardMode(mode) && (
        <span className={styles.demandModeHint}>{DEMAND_MODE_DESC[mode]}</span>
      )}
    </div>
  )
}

/* ===== 步骤向导 ===== */

interface WizardLine {
  role: 'ai' | 'user'
  text: string
}

interface DemandWizardProps {
  mode: 'boss' | 'client'
  /** 历史简报标题（存在时气泡前置「这次和上次比，有什么不同？」提示） */
  prefillTitle?: string | null
  /** 历史简报预填答案（只问差异点：定位首个缺失必填键） */
  prefill?: DemandAnswers | null
  /** 模板版本（保存自定义模板后递增，用于刷新向导步骤） */
  templateVersion?: number
  /** 发布中 */
  publishing?: boolean
  /** 发布简报（父组件负责 API + 离线兜底 + 成功提示） */
  onPublish: (answers: DemandAnswers) => void
}

export function DemandWizard({
  mode,
  prefillTitle,
  prefill,
  publishing = false,
  templateVersion = 0,
  onPublish,
}: DemandWizardProps) {
  const steps = useMemo(() => getEffectiveStepSchema(mode), [mode, templateVersion])
  const [answers, setAnswers] = useState<DemandAnswers>(prefill || {})
  const [stepIndex, setStepIndex] = useState(() => resumeIndex(mode, prefill || {}))
  const [lines, setLines] = useState<WizardLine[]>([])
  const [done, setDone] = useState(false)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  /** 初始化 / 历史预填变化 / 模式切换：重置向导并发出首问（只问差异点） */
  useEffect(() => {
    const idx = resumeIndex(mode, prefill || {})
    setAnswers(prefill || {})
    setStepIndex(idx)
    setDone(idx >= steps.length)
    setInput('')
    const historyHint = prefillTitle
      ? '📌 已调取历史简报「' + prefillTitle + '」，信息已自动带入。\n这次和上次比，有什么不同？\n'
      : ''
    if (idx >= steps.length) {
      setLines([{
        role: 'ai',
        text: historyHint
          ? historyHint + '需求信息已齐全，请直接确认下方「需求汇总卡」后发布简报。'
          : '需求信息已收集完整，请确认下方「需求汇总卡」后发布简报。',
      }])
    } else {
      const hint =
        idx === 0
          ? '\n💡 也可以一句话说完需求（例如「为新品写 3 条小红书种草文案，25-40 岁妈妈，带货转化，本周四前」），我会自动拆分。'
          : ''
      setLines([{ role: 'ai', text: historyHint + steps[idx].question + hint }])
    }
  }, [mode, prefill, prefillTitle, steps])

  /** 自动滚动到底部 */
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, done])

  /** 提交当前步答案并推进（命中自然语言字段时自动合并拆分） */
  const handleSubmit = () => {
    const step = steps[stepIndex]
    if (!step) return
    const value = input.trim()
    if (!validateStep(step, value)) {
      message.warning('「' + step.label + '」为必填项，请填写后继续')
      return
    }
    const parsed = parseNaturalRequirement(value)
    const hasParsed = hasNaturalFields(parsed)
    const nextAnswers = { ...answers, [step.key]: value }
    if (hasParsed) {
      // 自然语言合并：剥离已识别字段回填核心任务，其余字段预填
      if (step.key === 'task') nextAnswers.task = stripNaturalFields(value, parsed)
      for (const k of Object.keys(parsed) as Array<keyof DemandAnswers>) {
        if (!nextAnswers[k]) nextAnswers[k] = parsed[k]
      }
    }
    setAnswers(nextAnswers)
    setLines((prev) => [...prev, { role: 'user', text: value }])
    setInput('')
    if (hasParsed) smartAdvance(nextAnswers)
    else advance(nextAnswers)
  }

  /** 自然语言合并后：跳到首个缺失必填键；必填齐全直接汇总 */
  const smartAdvance = (nextAnswers: DemandAnswers) => {
    const next = resumeIndex(mode, nextAnswers)
    if (next >= steps.length) {
      setStepIndex(steps.length)
      setDone(true)
      setLines((prev) => [
        ...prev,
        { role: 'ai', text: '✅ 已从描述中识别需求信息，请确认下方「需求汇总卡」后发布简报。' },
      ])
    } else {
      setStepIndex(next)
      setLines((prev) => [...prev, { role: 'ai', text: steps[next].question }])
    }
  }

  /** 跳过当前步（仅可跳过步显示按钮） */
  const handleSkip = () => {
    const step = steps[stepIndex]
    if (!step || step.required) return
    setLines((prev) => [...prev, { role: 'user', text: '（跳过）' }])
    advance(answers)
  }

  /** 按当前答案推进向导 */
  const advance = (nextAnswers: DemandAnswers) => {
    const next = nextStep(mode, nextAnswers, stepIndex)
    if (next >= steps.length) {
      setStepIndex(steps.length)
      setDone(true)
      setLines((prev) => [
        ...prev,
        { role: 'ai', text: '✅ 需求信息已收集完整，请确认下方「需求汇总卡」后发布简报。' },
      ])
    } else {
      setStepIndex(next)
      setLines((prev) => [...prev, { role: 'ai', text: steps[next].question }])
    }
  }

  /** 上一步：弹掉末尾未回答的 AI 问句回到上一步（该步问句与回答保留在对话中，不重复追加） */
  const handleBack = () => {
    if (stepIndex <= 0) return
    const back = prevStep(stepIndex)
    setStepIndex(back)
    setDone(false)
    setLines((prev) => {
      const next = [...prev]
      if (next.length && next[next.length - 1].role === 'ai') next.pop()
      return next
    })
  }

  const currentStep = steps[stepIndex]

  return (
    <>
      <div className={styles.wizardArea} ref={scrollRef}>
        {lines.map((line, i) => (
          <div
            key={i}
            className={styles.messageRow + (line.role === 'user' ? ' ' + styles.messageRowUser : '')}
          >
            <Avatar
              size={32}
              icon={line.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
              className={
                line.role === 'user'
                  ? styles.messageAvatar + ' ' + styles.messageAvatarUser
                  : styles.messageAvatar + ' ' + styles.messageAvatarAssistant
              }
            />
            <div
              className={
                line.role === 'user'
                  ? styles.messageBubbleWrap + ' ' + styles.messageBubbleWrapUser
                  : styles.messageBubbleWrap
              }
            >
              <div
                className={
                  line.role === 'user'
                    ? styles.messageBubble + ' ' + styles.messageBubbleUser
                    : styles.messageBubble + ' ' + styles.messageBubbleAssistant
                }
              >
                {line.text}
              </div>
            </div>
          </div>
        ))}

        {done && (
          <div className={styles.summaryCard}>
            <div className={styles.summaryCardTitle}>📋 需求汇总卡</div>
            {steps.map((s) => {
              return (
                <div key={s.key} className={styles.summaryRow}>
                  <div className={styles.summaryLabel}>
                    {s.label}{s.required ? ' *' : ''}
                  </div>
                  <Input
                    size="small"
                    className={styles.summaryValueInput}
                    value={answers[s.key] || ''}
                    placeholder="未填写"
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  />
                </div>
              )
            })}
            <div className={styles.summaryActions}>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={publishing}
                onClick={() => onPublish(answers)}
              >
                发布简报
              </Button>
            </div>
            <div className={styles.summaryTip}>
              发布后简报进入 AI 拆解流程，可在任务中心查看进度
            </div>
          </div>
        )}
      </div>

      {!done && currentStep && (
        <div className={styles.wizardInputArea}>
          <div className={styles.wizardInputRow}>
            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={(e) => {
                const native = e.nativeEvent as KeyboardEvent
                if (!native.isComposing) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              autoSize={{ minRows: 1, maxRows: 4 }}
              placeholder={currentStep.required ? '输入后回车（必填）' : '输入后回车，或点「跳过」'}
              className={styles.textArea}
              bordered={false}
            />
            <Button onClick={handleBack} disabled={stepIndex === 0}>上一步</Button>
            {!currentStep.required && <Button onClick={handleSkip}>跳过</Button>}
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              发送
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export default DemandModeBar
