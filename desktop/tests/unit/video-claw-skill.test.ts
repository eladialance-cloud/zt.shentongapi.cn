// video-claw OpenClaw 技能入库测试（Task 5）
// 验证技能包已内置到桌面端 resources/openclaw/skills/video-claw，
// 且 SKILL.md 初始化章节已改为“桌面端已自动配置”（无需用户手动初始化）。
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_ROOT = join(__dirname, '../../resources/openclaw/skills/video-claw')

describe('video-claw OpenClaw 技能包', () => {
  it('SKILL.md 存在且登记 name: video-claw', () => {
    const p = join(SKILL_ROOT, 'SKILL.md')
    expect(existsSync(p)).toBe(true)
    const md = readFileSync(p, 'utf-8')
    expect(md).toContain('name: video-claw')
  })

  it('references/workflow/create_project.md 存在（六阶段流程文档）', () => {
    expect(
      existsSync(join(SKILL_ROOT, 'references/workflow/create_project.md'))
    ).toBe(true)
  })

  it('初始化章节说明桌面端已自动配置', () => {
    const md = readFileSync(join(SKILL_ROOT, 'SKILL.md'), 'utf-8')
    expect(md).toMatch(/桌面端已自动配置/)
  })

  it('技能根目录不包含大图与锁文件（控制体积）', () => {
    expect(existsSync(join(SKILL_ROOT, 'uv.lock'))).toBe(false)
    expect(existsSync(join(SKILL_ROOT, 'package-lock.json'))).toBe(false)
  })
})
