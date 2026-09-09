import {
  parsePlatformCliToolsets,
  hasExplicitCliToolsets,
  buildToolsetInfos,
  applyPlatformToolsetEnabled,
} from '../../electron/main/hermes-tools'

jest.mock('electron', () => ({
  app: { getPath: () => '/tmp/hermes-tools-test' },
}))

const CFG_TOOLS_ONLY = [
  'model: codex',
  'platform_toolsets:',
  '  cli:',
  '    - web',
  '    - file',
  'custom_providers:',
  '  - name: x',
].join('\n')

const CFG_NO_MCP = [
  'platform_toolsets:',
  '  cli:',
  '    - no_mcp',
].join('\n')

const CFG_EMPTY = 'model: codex\n'

describe('hermes-tools 纯函数', () => {
  it('parsePlatformCliToolsets 解析 cli 启用列表', () => {
    const set = parsePlatformCliToolsets(CFG_TOOLS_ONLY)
    expect(set.has('web')).toBe(true)
    expect(set.has('file')).toBe(true)
    expect(set.has('no_mcp')).toBe(false)
  })

  it('no_mcp 哨兵不算显式工具集配置', () => {
    expect(parsePlatformCliToolsets(CFG_NO_MCP).has('no_mcp')).toBe(true)
    expect(hasExplicitCliToolsets(CFG_NO_MCP)).toBe(false)
    expect(hasExplicitCliToolsets(CFG_TOOLS_ONLY)).toBe(true)
    expect(hasExplicitCliToolsets(CFG_EMPTY)).toBe(false)
  })

  it('buildToolsetInfos：null 全启用，集合只启用指定项', () => {
    const all = buildToolsetInfos(null)
    expect(all.length).toBeGreaterThanOrEqual(19)
    expect(all.every((t) => t.enabled)).toBe(true)

    const subset = buildToolsetInfos(new Set(['web', 'file']))
    expect(subset.find((t) => t.key === 'web')?.enabled).toBe(true)
    expect(subset.find((t) => t.key === 'file')?.enabled).toBe(true)
    expect(subset.find((t) => t.key === 'terminal')?.enabled).toBe(false)
  })

  it('applyPlatformToolsetEnabled 开关并保留其它段', () => {
    const off = applyPlatformToolsetEnabled(CFG_TOOLS_ONLY, 'cli', 'web', false)
    expect(parsePlatformCliToolsets(off).has('web')).toBe(false)
    expect(parsePlatformCliToolsets(off).has('file')).toBe(true)
    expect(off).toContain('custom_providers:')

    const on = applyPlatformToolsetEnabled(off, 'cli', 'web', true)
    expect(parsePlatformCliToolsets(on).has('web')).toBe(true)
  })

  it('无 platform_toolsets 段时补齐', () => {
    const next = applyPlatformToolsetEnabled(CFG_EMPTY, 'cli', 'web', true)
    expect(next).toContain('platform_toolsets:')
    expect(parsePlatformCliToolsets(next).has('web')).toBe(true)
  })
})