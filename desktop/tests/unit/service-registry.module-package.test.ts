import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  parseModuleYaml,
  findModuleRoot,
  findContentDir,
} from '../../electron/main/service-registry/module-package'

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'modpkg-'))
}

describe('service-registry module-package', () => {
  afterEach(() => {
    // cleanup handled by callers via try/finally; no shared dir
  })

  test('parseModuleYaml：skill 型', () => {
    const meta = parseModuleYaml('id: st-skill\ndisplayName: 技能\nkind: skill\nversion: 1.0.0\ntarget: hermes\n')
    expect(meta).toEqual({ id: 'st-skill', displayName: '技能', name: undefined, kind: 'skill', version: '1.0.0', target: 'hermes' })
  })

  test('parseModuleYaml：缺 id 抛错', () => {
    expect(() => parseModuleYaml('kind: skill\n')).toThrow(/缺少 id/)
  })

  test('parseModuleYaml：kind 非法抛错', () => {
    expect(() => parseModuleYaml('id: x\nkind: plugin\n')).toThrow(/kind 非法/)
  })

  test('findModuleRoot：根含 module.yaml 直接用根', () => {
    const root = makeTmp()
    try {
      fs.writeFileSync(path.join(root, 'module.yaml'), 'id: a\nkind: skill\n', 'utf-8')
      expect(findModuleRoot(root)).toBe(path.resolve(root))
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('findModuleRoot：浅层子目录且 subpath 定位', () => {
    const root = makeTmp()
    try {
      const sub = path.join(root, 'pkg')
      fs.mkdirSync(sub, { recursive: true })
      fs.writeFileSync(path.join(sub, 'module.yaml'), 'id: a\nkind: skill\n', 'utf-8')
      expect(findModuleRoot(root, 'pkg')).toBe(path.resolve(sub))
      expect(() => findModuleRoot(root, 'missing')).toThrow(/子路径不存在/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('findContentDir：skill 优先 skill/ 子目录，缺失标志文件抛错', () => {
    const root = makeTmp()
    try {
      fs.mkdirSync(path.join(root, 'skill'), { recursive: true })
      fs.writeFileSync(path.join(root, 'skill', 'SKILL.md'), '# hi\n', 'utf-8')
      expect(findContentDir(root, 'skill')).toBe(path.resolve(path.join(root, 'skill')))

      fs.rmSync(path.join(root, 'skill'), { recursive: true, force: true })
      fs.writeFileSync(path.join(root, 'SKILL.md'), '# hi\n', 'utf-8')
      expect(findContentDir(root, 'skill')).toBe(path.resolve(root))

      fs.rmSync(path.join(root, 'SKILL.md'))
      expect(() => findContentDir(root, 'skill')).toThrow(/缺少/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})