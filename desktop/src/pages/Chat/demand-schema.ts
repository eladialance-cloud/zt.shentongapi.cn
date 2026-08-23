// 需求对话：模式键序 / 步骤文案 / 简报 payload 组装（纯函数，无副作用）
// 老板模式 7 键：task/target/audience/platform/style/material/deadline
// 客户会议模式 8 键：name/goal/audience/platform/material/budget/deadline/done
// 关键项必填（老板 task/target/platform；客户 name/goal/platform），其余可跳过。
// 向导为前端驱动状态机：AI 气泡文案由本文件提供，不依赖 OpenClaw 自由发挥。

import type { CreateBriefPayload, BriefItem } from '@/api/brief-api'

/** 需求对话模式 */
export type DemandMode = 'free' | 'boss' | 'client'

/** 模式键序（自由对话默认，不做向导） */
export const DEMAND_MODES: DemandMode[] = ['free', 'boss', 'client']

/** 模式显示名 */
export const DEMAND_MODE_LABELS: Record<DemandMode, string> = {
  free: '自由对话',
  boss: '老板模式',
  client: '客户会议模式',
}

/** 向导模式说明文案 */
export const DEMAND_MODE_DESC: Record<'boss' | 'client', string> = {
  boss: '老板自己提需求 · 7 步收集关键信息',
  client: '商务对接客户 · 8 步收集会议需求',
}

/** 单步定义 */
export interface StepItem {
  key: string
  label: string
  question: string
  required: boolean
}

/** 向导答案集（key → 用户回答） */
export type DemandAnswers = Record<string, string | undefined>

/** 老板模式 7 键 */
const BOSS_STEPS: StepItem[] = [
  { key: 'task', label: '任务', question: '👋 你好老板！这次想做什么？\n直接说，例如：为新品写 3 条小红书种草文案。', required: true },
  { key: 'target', label: '目标', question: '收到！核心目标是？\n（拉新涨粉 / 带货转化 / 品牌曝光 / 引流私域）', required: true },
  { key: 'audience', label: '受众', question: '目标受众是谁？\n（例如：25-40 岁注重品质的妈妈群体）', required: false },
  { key: 'platform', label: '平台', question: '发布平台？（可多选，用逗号分隔）\n（小红书 / 公众号 / 视频号 / 知乎）', required: true },
  { key: 'style', label: '风格', question: '风格参考？\n（干货实操 / 故事共鸣 / 热点话题，或贴参考链接）', required: false },
  { key: 'material', label: '素材', question: '有没有你的个人观点 / 经历 / 素材？\n一句话即可，没有就回复「跳过」。', required: false },
  { key: 'deadline', label: '截止', question: '截止时间？\n（例如：明天出稿，后天发布）', required: false },
]

/** 客户会议模式 8 键 */
const CLIENT_STEPS: StepItem[] = [
  { key: 'name', label: '名称', question: '🤝 您好！我是内容服务顾问小需，很高兴为您服务。\n请先简单介绍您和您的业务？（例如：我是开烘焙店的，想扩大宣传）', required: true },
  { key: 'goal', label: '目标', question: '好的！这次合作想达成什么目标？\n（品牌宣传 / 引流到店 / 涨粉 / 新品发布）', required: true },
  { key: 'audience', label: '受众', question: '目标客户是哪些人？\n（例如：25-40 岁注重品质的妈妈群体）', required: false },
  { key: 'platform', label: '平台', question: '希望在哪些平台投放？（可多选，用逗号分隔）\n（小红书 / 公众号 / 视频号 / 知乎）', required: true },
  { key: 'material', label: '素材', question: '有没有品牌资料或参考案例？\n可以粘贴链接、文档，或简要描述。', required: false },
  { key: 'budget', label: '预算', question: '预算范围大概是？（用于匹配合适方案）\n（单次 <3k / 3k-1w / 1w 以上 / 先出方案再说）', required: false },
  { key: 'deadline', label: '截止', question: '希望什么时候交付？\n（例如：一周内）', required: false },
  { key: 'done', label: '交付物', question: '交付物是什么？\n（例如：3 篇小红书图文 + 1 篇公众号推文）', required: false },
]

/** 模式 → 步骤表 */
const STEP_SCHEMAS: Record<'boss' | 'client', StepItem[]> = {
  boss: BOSS_STEPS,
  client: CLIENT_STEPS,
}

/** 获取某模式的步骤表（free 无向导步骤） */
export function getStepSchema(mode: DemandMode): StepItem[] {
  if (mode === 'free') return []
  return STEP_SCHEMAS[mode]
}

/** 是否为向导模式（boss/client） */
export function isWizardMode(mode: DemandMode): mode is 'boss' | 'client' {
  return mode === 'boss' || mode === 'client'
}

/** 步骤总数 */
export function stepCount(mode: DemandMode): number {
  return getStepSchema(mode).length
}

/** 单步校验：required 键必须有非空内容；可跳过键永远通过 */
export function validateStep(step: StepItem, value: string | undefined): boolean {
  if (!step.required) return true
  return typeof value === 'string' && value.trim().length > 0
}

/** 必填键是否全部收集完成 */
export function isComplete(mode: DemandMode, answers: DemandAnswers): boolean {
  return getStepSchema(mode).every((step) => validateStep(step, answers[step.key]))
}

/**
 * 向导推进：提交当前步答案后返回下一步索引。
 * 当前步必填未填 → 停留原步；否则推进 1 步（可跳过步未填也算通过）。
 * 已到最后一步之后返回 steps.length（表示收集完成）。
 */
export function nextStep(mode: DemandMode, answers: DemandAnswers, currentIndex: number): number {
  const steps = getStepSchema(mode)
  if (steps.length === 0) return 0
  const idx = Math.min(Math.max(0, currentIndex), steps.length)
  if (idx >= steps.length) return steps.length
  if (!validateStep(steps[idx], answers[steps[idx].key])) return idx
  // 当前步已通过（必填已填 / 可跳过）：向后找下一个需要提问的步骤，已作答的步骤不再重复问（自然语言预填后不重复问）
  for (let i = idx + 1; i < steps.length; i++) {
    const s = steps[i]
    const answered = typeof answers[s.key] === 'string' && answers[s.key]!.trim().length > 0
    if (!answered) return i
  }
  return steps.length
}

/** 上一步（不会低于 0） */
export function prevStep(currentIndex: number): number {
  return Math.max(0, currentIndex - 1)
}

/**
 * 历史简报预填后定位首个未收集的必填键（只问差异点）。
 * 必填齐全时返回 steps.length（直接展示汇总卡）。
 */
export function resumeIndex(mode: DemandMode, answers: DemandAnswers): number {
  const steps = getStepSchema(mode)
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].required && !validateStep(steps[i], answers[steps[i].key])) return i
  }
  return steps.length
}

/** 平台输入拆分为数组（兼容中英文逗号 / 顿号 / 分号 / 空格） */
export function splitPlatforms(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 截止时间归一化：符合日期格式（YYYY-MM-DD / YYYY/MM/DD / YYYY年M月D日）才写入 deadline 字段；
 * 其余自由文本（如「明天出稿」）并入 goal，避免服务端 IsDateString 校验失败。
 */
export function normalizeDeadline(value: string | undefined): { deadline?: string; goalLine?: string } {
  if (!value) return {}
  const v = value.trim()
  const m = v.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/)
  if (m) {
    return {
      deadline: m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'),
    }
  }
  return { goalLine: '截止：' + v }
}

/** goal 字段内的标签行前缀（素材/预算/交付物/截止） */
const GOAL_LABEL_PREFIXES = ['素材：', '预算：', '交付物：', '截止：']

/** 提取 goal 中指定前缀的标签行内容 */
function extractLabeledLine(goal: string | undefined, prefix: string): string | undefined {
  if (!goal) return undefined
  for (const line of goal.split('\n')) {
    const t = line.trim()
    if (t.startsWith(prefix)) {
      const rest = t.slice(prefix.length).trim()
      return rest || undefined
    }
  }
  return undefined
}

/** goal 中第一行非标签内容（即目标本身） */
function firstPlainLine(goal: string | undefined): string | undefined {
  if (!goal) return undefined
  for (const line of goal.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (GOAL_LABEL_PREFIXES.some((p) => t.startsWith(p))) continue
    return t
  }
  return undefined
}

/** 组装 createBrief 入参（对齐 brief-api CreateBriefPayload） */
export function buildBriefPayload(
  mode: DemandMode,
  answers: DemandAnswers,
  extra?: { sourceChatSessionId?: number | null; sourceChatSummary?: string | null },
): CreateBriefPayload {
  const deadlineInfo = normalizeDeadline(answers.deadline)
  const goalParts: string[] = []
  const base = {
    sourceChatSessionId: extra?.sourceChatSessionId ?? null,
    sourceChatSummary: extra?.sourceChatSummary ?? null,
  }
  if (mode === 'boss') {
    if (answers.target) goalParts.push(answers.target.trim())
    if (answers.material) goalParts.push('素材：' + answers.material.trim())
    if (deadlineInfo.goalLine) goalParts.push(deadlineInfo.goalLine)
    return {
      title: answers.task?.trim() || '需求简报',
      goal: goalParts.length > 0 ? goalParts.join('\n') : undefined,
      targetAudience: answers.audience?.trim() || undefined,
      platforms: splitPlatforms(answers.platform),
      style: answers.style?.trim() || undefined,
      deadline: deadlineInfo.deadline,
      ...base,
    }
  }
  if (mode === 'client') {
    if (answers.goal) goalParts.push(answers.goal.trim())
    if (answers.material) goalParts.push('素材：' + answers.material.trim())
    if (answers.budget) goalParts.push('预算：' + answers.budget.trim())
    if (answers.done) goalParts.push('交付物：' + answers.done.trim())
    if (deadlineInfo.goalLine) goalParts.push(deadlineInfo.goalLine)
    return {
      title: answers.name?.trim() || '客户需求简报',
      goal: goalParts.length > 0 ? goalParts.join('\n') : undefined,
      targetAudience: answers.audience?.trim() || undefined,
      platforms: splitPlatforms(answers.platform),
      deadline: deadlineInfo.deadline,
      ...base,
    }
  }
  // free 模式不收集向导，按显式提供的字段组装（历史简报直接复用）
  if (answers.goal) goalParts.push(answers.goal.trim())
  if (answers.material) goalParts.push('素材：' + answers.material.trim())
  if (answers.budget) goalParts.push('预算：' + answers.budget.trim())
  if (answers.done) goalParts.push('交付物：' + answers.done.trim())
  if (deadlineInfo.goalLine) goalParts.push(deadlineInfo.goalLine)
  return {
    title: answers.task?.trim() || answers.title?.trim() || '需求简报',
    goal: goalParts.length > 0 ? goalParts.join('\n') : undefined,
    targetAudience: answers.audience?.trim() || undefined,
    platforms: splitPlatforms(answers.platform),
    style: answers.style?.trim() || undefined,
    deadline: deadlineInfo.deadline,
    ...base,
  }
}

/** 历史简报 → 向导答案（按当前模式映射，boss/client 互不串数据） */
export function briefToAnswers(mode: DemandMode, brief: BriefItem): DemandAnswers {
  const platformText = (brief.platforms || []).join('，')
  const goal = brief.goal ?? undefined
  if (mode === 'boss') {
    return {
      task: brief.title || undefined,
      target: firstPlainLine(goal),
      audience: brief.targetAudience ?? undefined,
      platform: platformText || undefined,
      style: brief.style ?? undefined,
      material: extractLabeledLine(goal, '素材：'),
      deadline: brief.deadline ?? extractLabeledLine(goal, '截止：'),
    }
  }
  if (mode === 'client') {
    return {
      name: brief.title || undefined,
      goal: firstPlainLine(goal),
      audience: brief.targetAudience ?? undefined,
      platform: platformText || undefined,
      material: extractLabeledLine(goal, '素材：'),
      budget: extractLabeledLine(goal, '预算：'),
      deadline: brief.deadline ?? extractLabeledLine(goal, '截止：'),
      done: extractLabeledLine(goal, '交付物：'),
    }
  }
  return {
    title: brief.title || undefined,
    goal: firstPlainLine(goal),
    audience: brief.targetAudience ?? undefined,
    platform: platformText || undefined,
    style: brief.style ?? undefined,
    deadline: brief.deadline ?? extractLabeledLine(goal, '截止：'),
  }
}

/* ===== 模板可配置（A）：自定义需求模板（localStorage 持久化） ===== */

const TEMPLATE_STORAGE_KEY = 'demand-wizard-template:v1'

export interface DemandTemplate {
  boss?: StepItem[]
  client?: StepItem[]
}

/** 读取自定义模板（非浏览器环境 / 未保存 / 数据损坏时返回 null） */
export function loadCustomTemplates(): DemandTemplate | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemandTemplate
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** 保存自定义模板；传 null 或无有效内容时清除存储 */
export function saveCustomTemplates(tpl: DemandTemplate | null): void {
  if (typeof window === 'undefined') return
  try {
    if (!tpl || (!tpl.boss && !tpl.client)) {
      window.localStorage.removeItem(TEMPLATE_STORAGE_KEY)
    } else {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(tpl))
    }
  } catch {
    /* 忽略配额等异常 */
  }
}

/** 生效步骤表：自定义模板优先（仅接受合法键，空文案回退默认），否则内置默认 */
export function getEffectiveStepSchema(mode: DemandMode): StepItem[] {
  if (mode === 'free') return []
  const key = mode === 'boss' ? 'boss' : 'client'
  const custom = loadCustomTemplates()?.[key]
  const validKeys = new Set(STEP_SCHEMAS[key].map((s) => s.key))
  if (Array.isArray(custom) && custom.length > 0) {
    const cleaned = custom
      .filter((s) => s && validKeys.has(s.key))
      .map((s) => {
        const def = STEP_SCHEMAS[key].find((d) => d.key === s.key)
        return {
          key: s.key,
          label: (s.label && s.label.trim()) || def?.label || s.key,
          question: (s.question && s.question.trim()) || def?.question || '',
          required: s.required ?? def?.required ?? false,
        }
      })
    if (cleaned.length > 0) return cleaned
  }
  return STEP_SCHEMAS[key]
}

/* ===== 自然语言一句话收集（C）：从一段话中抽取平台/受众/风格/截止 ===== */

const PLATFORM_KEYWORDS = ['小红书', '公众号', '视频号', '知乎', '抖音', '快手', '哔哩哔哩', 'B站', 'b站', '微博', '头条', '百家号']
const STYLE_KEYWORDS = ['干货', '故事', '热点', '测评', '评测', '种草', '口播', '剧情', '搞笑', '教程', '知识', '情感', 'vlog', 'Vlog']

/** 抽取一句话需求中的字段（启发式，无匹配的键不输出） */
export function parseNaturalRequirement(text: string): Partial<DemandAnswers> {
  const result: Partial<DemandAnswers> = {}
  if (!text) return result
  const trimmed = text.trim()
  const platforms = PLATFORM_KEYWORDS.filter((k) => trimmed.includes(k))
  if (platforms.length > 0) result.platform = [...new Set(platforms)].join('、')
  const style = STYLE_KEYWORDS.find((k) => trimmed.includes(k))
  if (style) result.style = style
  const audience = trimmed.match(
    /(\d{1,2}\s*[-~到至]\s*\d{1,2}\s*岁[\u4e00-\u9fa5]{0,10})|(\d{1,2}\s*岁[\u4e00-\u9fa5]{0,10})|((?:宝妈|妈妈|家长|学生|白领|职场人|年轻人|中老年|男性|女性|人群|群体|粉丝|用户)[\u4e00-\u9fa5]{0,10})/,
  )
  if (audience) result.audience = audience[0]
  const deadline = trimmed.match(
    /(今天|明天|后天|本周[一二三四五六日天内]{0,2}|下周[一二三四五六日天内]{0,2}|周[一二三四五六日天]|\d{1,2}月\d{1,2}日|\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d+天后)/,
  )
  if (deadline) result.deadline = deadline[0]
  return result
}

/** 从一句话需求中剥离已抽取字段，得到核心任务描述 */
export function stripNaturalFields(text: string, parsed: Partial<DemandAnswers>): string {
  if (!text) return ''
  let rest = text
  for (const v of [parsed.platform, parsed.style, parsed.audience, parsed.deadline]) {
    if (v) rest = rest.split(v).join(' ')
  }
  return rest
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[，,、。；;]+$/, '')
}

/** 是否命中自然语言抽取（存在可填充字段） */
export function hasNaturalFields(parsed: Partial<DemandAnswers>): boolean {
  return Boolean(parsed.platform || parsed.style || parsed.audience || parsed.deadline)
}
