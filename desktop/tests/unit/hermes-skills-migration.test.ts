// Hermes 技能迁移入库验证：确认 resources/hermes/skills 下已包含从 OpenClaw 迁移的 5 个技能，
// 且脚本型技能脚本齐全、video-claw 仅携带指令与 references（不携带源码/node_modules）。
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_ROOT = join(__dirname, '../../resources/hermes/skills')

const SCRIPT_SKILLS = ['edict-create', 'hermes-agent', 'knowledge-query', 'n8n-run-workflow']
const EXPECTED = [...SCRIPT_SKILLS, 'video-claw']

function hasFrontmatter(p: string): boolean {
  if (!existsSync(p)) return false
  const md = readFileSync(p, 'utf-8').replace(/^\uFEFF/, '')
  return /^---\s*\n[\s\S]*?^name:\s*\S/m.test(md) && /^description:\s*\S/m.test(md)
}

describe('Hermes 技能迁移', () => {
  it('迁移 5 个技能目录均存在且含规范 SKILL.md', () => {
    expect(existsSync(SKILL_ROOT)).toBe(true)
    const dirs = readdirSync(SKILL_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    for (const name of EXPECTED) {
      expect(dirs).toContain(name)
      expect(hasFrontmatter(join(SKILL_ROOT, name, 'SKILL.md'))).toBe(true)
    }
  })

  it('脚本型技能脚本齐全', () => {
    for (const name of SCRIPT_SKILLS) {
      const scriptFile = name + '.mjs'
      expect(existsSync(join(SKILL_ROOT, name, 'scripts', scriptFile))).toBe(true)
    }
  })

  it('video-claw 仅携带指令与 references，不携带源码与 node_modules', () => {
    expect(existsSync(join(SKILL_ROOT, 'video-claw', 'references/workflow/create_project.md'))).toBe(true)
    expect(existsSync(join(SKILL_ROOT, 'video-claw', 'video-claw'))).toBe(false)
    expect(existsSync(join(SKILL_ROOT, 'video-claw', 'node_modules'))).toBe(false)
    expect(readFileSync(join(SKILL_ROOT, 'video-claw', 'SKILL.md'), 'utf-8')).toContain('name: video-claw')
  })
})
