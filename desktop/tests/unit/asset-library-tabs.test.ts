// 素材两库 Tab 映射纯函数单测（library-tabs.ts）
// 覆盖：库/类别定义、类别 → 后端查询参数、切库时 Tab 归一
import {
  ASSET_LIBRARIES,
  KIND_LABELS,
  LIBRARY_LABELS,
  LIBRARY_TABS,
  libraryTabQuery,
  normalizeLibraryTab,
} from '@/pages/Assets/library-tabs'

describe('两库定义', () => {
  it('一级库为输入库/生成库，且都带说明文案', () => {
    expect(ASSET_LIBRARIES.map((l) => l.key)).toEqual(['input', 'output'])
    for (const l of ASSET_LIBRARIES) expect(l.hint.length).toBeGreaterThan(0)
  })

  it('输入库有声音/形象/IP 档案/文档，没有文案', () => {
    const keys = LIBRARY_TABS.input.map((t) => t.key)
    expect(keys).toEqual(expect.arrayContaining(['all', 'image', 'video', 'audio', 'voice', 'avatar', 'ip_archive', 'document']))
    expect(keys).not.toContain('text')
  })

  it('生成库有文案/图片/视频/音频，没有声音/形象/IP 档案', () => {
    const keys = LIBRARY_TABS.output.map((t) => t.key)
    expect(keys).toEqual(['all', 'text', 'image', 'video', 'audio'])
    for (const k of ['voice', 'avatar', 'ip_archive', 'document']) expect(keys).not.toContain(k)
  })

  it('库名与类别名有中文标签', () => {
    expect(LIBRARY_LABELS).toEqual({ input: '输入库', output: '生成库' })
    for (const k of ['voice', 'avatar', 'ip_archive', 'image', 'video', 'audio', 'file', 'copy']) {
      expect(KIND_LABELS[k]).toBeTruthy()
    }
  })
})

describe('libraryTabQuery 类别 → 后端查询参数', () => {
  it('全部：只带 library（不额外过滤）', () => {
    expect(libraryTabQuery('input', 'all')).toEqual({ library: 'input' })
    expect(libraryTabQuery('output', 'all')).toEqual({ library: 'output' })
  })

  it('输入库专用类别映射到同名 kind', () => {
    expect(libraryTabQuery('input', 'voice')).toEqual({ library: 'input', kind: 'voice' })
    expect(libraryTabQuery('input', 'avatar')).toEqual({ library: 'input', kind: 'avatar' })
    expect(libraryTabQuery('input', 'ip_archive')).toEqual({ library: 'input', kind: 'ip_archive' })
  })

  it('生成库「文案」映射 kind=copy（取代前端翻页聚合）', () => {
    expect(libraryTabQuery('output', 'text')).toEqual({ library: 'output', kind: 'copy' })
  })

  it('图片/视频/音频两库通用，映射同物理类型的 kind', () => {
    for (const lib of ['input', 'output'] as const) {
      expect(libraryTabQuery(lib, 'image')).toEqual({ library: lib, kind: 'image' })
      expect(libraryTabQuery(lib, 'video')).toEqual({ library: lib, kind: 'video' })
      expect(libraryTabQuery(lib, 'audio')).toEqual({ library: lib, kind: 'audio' })
    }
  })

  it('文档 = 输入库里的普通文件（type=file + kind=file）', () => {
    expect(libraryTabQuery('input', 'document')).toEqual({ library: 'input', type: 'file', kind: 'file' })
  })

  it('非法组合（生成库的「声音」）退化为整库查询，不拼出非法 kind', () => {
    expect(libraryTabQuery('output', 'voice')).toEqual({ library: 'output' })
    expect(libraryTabQuery('input', 'text')).toEqual({ library: 'input' })
  })
})

describe('normalizeLibraryTab 切库归一', () => {
  it('输入库 → 生成库：声音/形象/IP 档案/文档 归一到全部', () => {
    for (const tab of ['voice', 'avatar', 'ip_archive', 'document'] as const) {
      expect(normalizeLibraryTab('output', tab)).toBe('all')
    }
  })

  it('生成库 → 输入库：文案 归一到全部', () => {
    expect(normalizeLibraryTab('input', 'text')).toBe('all')
  })

  it('两库共有的类别保持不变', () => {
    for (const tab of ['all', 'image', 'video', 'audio'] as const) {
      expect(normalizeLibraryTab('input', tab)).toBe(tab)
      expect(normalizeLibraryTab('output', tab)).toBe(tab)
    }
    expect(normalizeLibraryTab('output', 'text')).toBe('text')
    expect(normalizeLibraryTab('input', 'voice')).toBe('voice')
  })
})
