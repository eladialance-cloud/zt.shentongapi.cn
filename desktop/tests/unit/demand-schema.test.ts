// Task 3：需求对话重构 — demand-schema 纯函数单测
// 覆盖：键序与文案、required 规则（老板 task/target/platform；客户 name/goal/platform）、
// 跳过/必填校验、payload 组装、模式切换不串数据。
import {
  DEMAND_MODES,
  DEMAND_MODE_LABELS,
  getStepSchema,
  stepCount,
  validateStep,
  isComplete,
  nextStep,
  prevStep,
  resumeIndex,
  splitPlatforms,
  normalizeDeadline,
  buildBriefPayload,
  briefToAnswers,
  isWizardMode,
  parseNaturalRequirement,
  stripNaturalFields,
  hasNaturalFields,
  loadCustomTemplates,
  saveCustomTemplates,
  getEffectiveStepSchema,
} from '@/pages/Chat/demand-schema'
import type { StepItem, DemandAnswers } from '@/pages/Chat/demand-schema'
import type { BriefItem } from '@/api/brief-api'

describe('demand-schema: 模式与键序', () => {
  test('DEMAND_MODES 顺序为 free/boss/client', () => {
    expect(DEMAND_MODES).toEqual(['free', 'boss', 'client'])
  })

  test('模式显示文案齐全', () => {
    expect(DEMAND_MODE_LABELS.free).toBe('自由对话')
    expect(DEMAND_MODE_LABELS.boss).toBe('老板模式')
    expect(DEMAND_MODE_LABELS.client).toBe('客户会议模式')
  })

  test('free 模式无向导步骤', () => {
    expect(getStepSchema('free')).toEqual([])
    expect(stepCount('free')).toBe(0)
    expect(isWizardMode('free')).toBe(false)
  })

  test('老板模式 7 键：task/target/audience/platform/style/material/deadline', () => {
    const steps = getStepSchema('boss')
    expect(steps.map((s) => s.key)).toEqual([
      'task', 'target', 'audience', 'platform', 'style', 'material', 'deadline',
    ])
    expect(stepCount('boss')).toBe(7)
    // 每步有中文提示文案
    for (const s of steps) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.question.length).toBeGreaterThan(0)
    }
  })

  test('客户会议模式 8 键：name/goal/audience/platform/material/budget/deadline/done', () => {
    const steps = getStepSchema('client')
    expect(steps.map((s) => s.key)).toEqual([
      'name', 'goal', 'audience', 'platform', 'material', 'budget', 'deadline', 'done',
    ])
    expect(stepCount('client')).toBe(8)
    for (const s of steps) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.question.length).toBeGreaterThan(0)
    }
  })
})

describe('demand-schema: required 规则', () => {
  const requiredKeys = (mode: 'boss' | 'client') =>
    getStepSchema(mode).filter((s) => s.required).map((s) => s.key)

  test('老板模式 task/target/platform 必填，其余可跳过', () => {
    expect(requiredKeys('boss')).toEqual(['task', 'target', 'platform'])
    const optional = getStepSchema('boss').filter((s) => !s.required).map((s) => s.key)
    expect(optional).toEqual(['audience', 'style', 'material', 'deadline'])
  })

  test('客户会议模式 name/goal/platform 必填，其余可跳过', () => {
    expect(requiredKeys('client')).toEqual(['name', 'goal', 'platform'])
    const optional = getStepSchema('client').filter((s) => !s.required).map((s) => s.key)
    expect(optional).toEqual(['audience', 'material', 'budget', 'deadline', 'done'])
  })

  test('validateStep：必填键空值不通过，非空通过；可跳过键恒通过', () => {
    const task = getStepSchema('boss')[0]
    const audience = getStepSchema('boss')[2]
    expect(validateStep(task, '')).toBe(false)
    expect(validateStep(task, '   ')).toBe(false)
    expect(validateStep(task, undefined)).toBe(false)
    expect(validateStep(task, '为新品写文案')).toBe(true)
    expect(validateStep(audience, '')).toBe(true)
    expect(validateStep(audience, undefined)).toBe(true)
    expect(validateStep(audience, '职场人')).toBe(true)
  })

  test('isComplete：必填齐全才为 true', () => {
    const ok: DemandAnswers = {
      task: '写文案', target: '涨粉', platform: '小红书',
    }
    expect(isComplete('boss', ok)).toBe(true)
    expect(isComplete('boss', { ...ok, task: '' })).toBe(false)
    const clientOk: DemandAnswers = { name: '烘焙店', goal: '引流', platform: '小红书' }
    expect(isComplete('client', clientOk)).toBe(true)
    expect(isComplete('client', { ...clientOk, platform: undefined })).toBe(false)
  })
})

describe('demand-schema: 向导状态推进', () => {
  test('nextStep：必填未填停留原步，填完后推进', () => {
    // 第 0 步 task 必填
    expect(nextStep('boss', {}, 0)).toBe(0)
    expect(nextStep('boss', { task: '写文案' }, 0)).toBe(1)
    // 第 1 步 target 必填
    expect(nextStep('boss', { task: '写文案' }, 1)).toBe(1)
    expect(nextStep('boss', { task: '写文案', target: '涨粉' }, 1)).toBe(2)
  })

  test('nextStep：可跳过步未填也算通过（推进 1 步）', () => {
    // 第 2 步 audience 可跳过
    expect(nextStep('boss', { task: 'x', target: 'y' }, 2)).toBe(3)
    expect(nextStep('boss', { task: 'x', target: 'y', audience: '职场人' }, 2)).toBe(3)
  })

  test('nextStep：到达最后一步后返回 steps.length（收集完成）', () => {
    const answers: DemandAnswers = {
      task: 'x', target: 'y', platform: '小红书',
    }
    // 第 6 步 deadline 可跳过 → 推进到 7 = steps.length
    expect(nextStep('boss', answers, 6)).toBe(7)
    expect(nextStep('boss', answers, 7)).toBe(7)
    expect(nextStep('free', {}, 0)).toBe(0)
  })

  test('nextStep：已作答步骤自动跳过（自然语言预填后不重复问）', () => {
    // platform 已被自然语言预填 → 从 audience（第 2 步）推进时直接到 style（第 4 步）
    const answers: DemandAnswers = { task: 'x', target: 'y', platform: '小红书' }
    expect(nextStep('boss', answers, 2)).toBe(4)
    // style 已作答 → 继续跳过到 material（第 5 步）
    const full: DemandAnswers = { task: 'x', target: 'y', platform: '小红书', style: '干货', deadline: '明天' }
    expect(nextStep('boss', full, 2)).toBe(5)
  })

  test('prevStep 不会低于 0', () => {
    expect(prevStep(3)).toBe(2)
    expect(prevStep(0)).toBe(0)
  })

  test('resumeIndex：历史预填后定位首个缺失必填键；全齐返回 steps.length', () => {
    const full: DemandAnswers = { task: 'x', target: 'y', platform: '小红书' }
    expect(resumeIndex('boss', full)).toBe(7)
    expect(resumeIndex('boss', { ...full, platform: undefined })).toBe(3)
    expect(resumeIndex('boss', { task: 'x' })).toBe(1)
    expect(resumeIndex('client', { name: '烘焙店', goal: '引流' })).toBe(3)
  })
})

describe('demand-schema: payload 组装', () => {
  test('splitPlatforms 拆分中英文分隔符', () => {
    expect(splitPlatforms('小红书, 公众号')).toEqual(['小红书', '公众号'])
    expect(splitPlatforms('抖音，小红书、B站;知乎')).toEqual(['抖音', '小红书', 'B站', '知乎'])
    expect(splitPlatforms('  ')).toEqual([])
    expect(splitPlatforms(undefined)).toEqual([])
  })

  test('normalizeDeadline：日期格式写入 deadline，自由文本并入 goal', () => {
    expect(normalizeDeadline('2026-09-01')).toEqual({ deadline: '2026-09-01' })
    expect(normalizeDeadline('2026/9/1')).toEqual({ deadline: '2026-09-01' })
    expect(normalizeDeadline('2026年9月1日')).toEqual({ deadline: '2026-09-01' })
    expect(normalizeDeadline('明天出稿')).toEqual({ goalLine: '截止：明天出稿' })
    expect(normalizeDeadline(undefined)).toEqual({})
  })

  test('老板模式 payload 组装', () => {
    const answers: DemandAnswers = {
      task: '为新品写 3 条种草文案',
      target: '拉新涨粉',
      audience: '职场人',
      platform: '小红书, 公众号',
      style: '干货实操',
      material: '我有真实使用截图',
      deadline: '2026-09-01',
    }
    const payload = buildBriefPayload('boss', answers, { sourceChatSessionId: 7, sourceChatSummary: '来自对话' })
    expect(payload).toEqual({
      title: '为新品写 3 条种草文案',
      goal: '拉新涨粉\n素材：我有真实使用截图',
      targetAudience: '职场人',
      platforms: ['小红书', '公众号'],
      style: '干货实操',
      deadline: '2026-09-01',
      sourceChatSessionId: 7,
      sourceChatSummary: '来自对话',
    })
  })

  test('客户会议模式 payload 组装（预算/交付物/素材并入 goal）', () => {
    const answers: DemandAnswers = {
      name: '甜心烘焙',
      goal: '品牌宣传+引流到店',
      audience: '25-40 岁妈妈群体',
      platform: '小红书',
      material: '门店实拍',
      budget: '3k-1w',
      deadline: '一周内交付首篇',
      done: '3 篇小红书图文',
    }
    const payload = buildBriefPayload('client', answers)
    expect(payload.title).toBe('甜心烘焙')
    expect(payload.goal).toBe('品牌宣传+引流到店\n素材：门店实拍\n预算：3k-1w\n交付物：3 篇小红书图文\n截止：一周内交付首篇')
    expect(payload.targetAudience).toBe('25-40 岁妈妈群体')
    expect(payload.platforms).toEqual(['小红书'])
    expect(payload.deadline).toBeUndefined()
  })

  test('客户 deadline 为日期时写入 deadline 字段', () => {
    const answers: DemandAnswers = { name: 'x', goal: 'y', platform: '小红书', deadline: '2026年8月1日' }
    const payload = buildBriefPayload('client', answers)
    expect(payload.deadline).toBe('2026-08-01')
    expect(payload.goal).toBe('y')
  })

  test('老板模式缺省字段不输出 undefined 键', () => {
    const payload = buildBriefPayload('boss', { task: 'x', target: 'y', platform: '小红书' })
    expect(payload.title).toBe('x')
    expect(payload.goal).toBe('y')
    expect(payload.platforms).toEqual(['小红书'])
  })
})

describe('demand-schema: 模式切换不串数据', () => {
  test('boss 答案不会以 name/goal 键进入 client payload', () => {
    const bossAnswers: DemandAnswers = {
      task: '老板任务', target: '老板目标', platform: '小红书',
    }
    const clientPayload = buildBriefPayload('client', bossAnswers)
    // client 模式只认 name/goal，boss 的 task/target 不会污染
    expect(clientPayload.title).toBe('客户需求简报')
    expect(clientPayload.goal).toBeUndefined()
  })

  test('briefToAnswers：同一份简报按 boss/client 映射到不同键', () => {
    const brief = {
      id: 1,
      userId: 1,
      title: '烘焙店小红书代运营',
      goal: '品牌宣传+引流到店\n素材：门店实拍\n预算：3k-1w\n交付物：3 篇图文',
      targetAudience: '妈妈群体',
      platforms: ['xiaohongshu'],
      style: '实拍风',
      deadline: '2026-09-01',
      status: 'completed' as const,
      dispatchStatus: 'done' as const,
      dispatchResult: null,
      sourceChatSessionId: null,
      sourceChatSummary: null,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:00:00.000Z',
    } as BriefItem

    const boss = briefToAnswers('boss', brief)
    expect(boss.task).toBe('烘焙店小红书代运营')
    expect(boss.target).toBe('品牌宣传+引流到店')
    expect(boss.material).toBe('门店实拍')
    expect(boss.budget).toBeUndefined()
    expect(boss.done).toBeUndefined()
    expect(boss.platform).toBe('xiaohongshu')

    const client = briefToAnswers('client', brief)
    expect(client.name).toBe('烘焙店小红书代运营')
    expect(client.goal).toBe('品牌宣传+引流到店')
    expect(client.material).toBe('门店实拍')
    expect(client.budget).toBe('3k-1w')
    expect(client.done).toBe('3 篇图文')
    expect(client.platform).toBe('xiaohongshu')

    // 两个模式的答案互不包含对方的关键键
    expect(boss.name).toBeUndefined()
    expect(boss.goal).toBeUndefined()
    expect(client.task).toBeUndefined()
    expect(client.target).toBeUndefined()
  })

  test('briefToAnswers 与 resumeIndex 配合：全量预填直接可汇总', () => {
    const brief = {
      id: 2,
      userId: 1,
      title: '新品推广',
      goal: '拉新涨粉',
      targetAudience: '职场人',
      platforms: ['xiaohongshu'],
      style: '干货',
      deadline: '2026-09-01',
      status: 'confirmed' as const,
      dispatchStatus: 'none' as const,
      dispatchResult: null,
      sourceChatSessionId: null,
      sourceChatSummary: null,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:00:00.000Z',
    } as BriefItem
    const answers = briefToAnswers('boss', brief)
    expect(resumeIndex('boss', answers)).toBe(7)
    expect(isComplete('boss', answers)).toBe(true)
  })

  test('briefToAnswers：自由文本截止（goal 中「截止：」行）回填到 deadline', () => {
    const brief = {
      id: 3,
      userId: 1,
      title: '一周内交付首篇',
      goal: '品牌宣传+引流到店\n截止：明天出稿',
      targetAudience: null,
      platforms: null,
      status: 'draft' as const,
      dispatchStatus: 'none' as const,
      dispatchResult: null,
      sourceChatSessionId: null,
      sourceChatSummary: null,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:00:00.000Z',
    } as BriefItem
    const boss = briefToAnswers('boss', brief)
    expect(boss.deadline).toBe('明天出稿')
    const client = briefToAnswers('client', brief)
    expect(client.deadline).toBe('明天出稿')
  })

  test('briefToAnswers：结构化 deadline 优先于 goal 截止行', () => {
    const brief = {
      id: 4,
      userId: 1,
      title: '新品推广',
      goal: '拉新涨粉\n截止：明天出稿',
      deadline: '2026-09-01',
      status: 'confirmed' as const,
      dispatchStatus: 'none' as const,
      dispatchResult: null,
      sourceChatSessionId: null,
      sourceChatSummary: null,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:00:00.000Z',
    } as BriefItem
    expect(briefToAnswers('boss', brief).deadline).toBe('2026-09-01')
    expect(briefToAnswers('client', brief).deadline).toBe('2026-09-01')
  })
})

describe('demand-schema: 步骤类型约束', () => {
  test('StepItem 结构完整（key/label/question/required）', () => {
    const step: StepItem = getStepSchema('boss')[0]
    expect(step.key).toBe('task')
    expect(typeof step.label).toBe('string')
    expect(typeof step.question).toBe('string')
    expect(typeof step.required).toBe('boolean')
  })
})

describe('demand-schema: 自然语言一句话收集（C）', () => {
  test('parseNaturalRequirement：识别平台/受众/风格/截止', () => {
    const parsed = parseNaturalRequirement('为新品写 3 条小红书种草文案，目标 25-40 岁注重品质的妈妈群体，带货转化，本周四前')
    expect(parsed.platform).toBe('小红书')
    expect(parsed.audience).toContain('25-40 岁')
    expect(parsed.style).toBe('种草')
    expect(parsed.deadline).toBe('本周四')
  })

  test('parseNaturalRequirement：多平台去重并顿号连接', () => {
    const parsed = parseNaturalRequirement('发小红书和公众号，再同步到小红书')
    expect(parsed.platform).toBe('小红书、公众号')
  })

  test('parseNaturalRequirement：无匹配字段返回空对象', () => {
    const parsed = parseNaturalRequirement('随便想想')
    expect(parsed).toEqual({})
  })

  test('parseNaturalRequirement：空输入返回空对象', () => {
    expect(parseNaturalRequirement('')).toEqual({})
    expect(parseNaturalRequirement('   ')).toEqual({})
  })

  test('parseNaturalRequirement：日期与天后截止识别', () => {
    expect(parseNaturalRequirement('下周三前交付').deadline).toBe('下周三')
    expect(parseNaturalRequirement('3天后发').deadline).toBe('3天后')
    expect(parseNaturalRequirement('8月20日上线').deadline).toBe('8月20日')
  })

  test('stripNaturalFields：剥离已识别字段保留核心任务', () => {
    const parsed = parseNaturalRequirement('为新品写 3 条小红书种草文案，25-40 岁妈妈，本周四前')
    const core = stripNaturalFields('为新品写 3 条小红书种草文案，25-40 岁妈妈，本周四前', parsed)
    expect(core).toContain('为新品写')
    expect(core).toContain('3 条')
    expect(core).toContain('文案')
    expect(core).not.toContain('小红书')
  })

  test('hasNaturalFields：命中任一字段即为 true', () => {
    expect(hasNaturalFields({ platform: '知乎' })).toBe(true)
    expect(hasNaturalFields({})).toBe(false)
  })
})

describe('demand-schema: 模板可配置（A）', () => {
  beforeEach(() => {
    saveCustomTemplates(null)
  })

  test('loadCustomTemplates：未保存时返回 null', () => {
    expect(loadCustomTemplates()).toBeNull()
  })

  test('saveCustomTemplates：保存后可读回，清除后恢复 null', () => {
    const tpl = { boss: [{ key: 'task', label: '任务', question: '这次做什么？', required: true }] }
    saveCustomTemplates(tpl)
    expect(loadCustomTemplates()).toEqual(tpl)
    saveCustomTemplates(null)
    expect(loadCustomTemplates()).toBeNull()
  })

  test('getEffectiveStepSchema：无自定义模板时返回内置默认', () => {
    const steps = getEffectiveStepSchema('boss')
    expect(steps.map((s) => s.key)).toEqual(['task', 'target', 'audience', 'platform', 'style', 'material', 'deadline'])
  })

  test('getEffectiveStepSchema：free 模式返回空数组', () => {
    expect(getEffectiveStepSchema('free')).toEqual([])
  })
})
