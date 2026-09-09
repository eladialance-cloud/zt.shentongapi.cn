import { TOOL_CATALOG, groupToolsByCategory } from '../../src/pages/HermesChat/toolCatalog'

describe('TOOL_CATALOG', () => {
  it('条目字段完整且含已知命令', () => {
    expect(TOOL_CATALOG.length).toBeGreaterThanOrEqual(20)
    for (const e of TOOL_CATALOG) {
      expect(e.category).toBeTruthy()
      expect(e.name).toMatch(/^\//)
      expect(e.description).toBeTruthy()
    }
    expect(TOOL_CATALOG.map((e) => e.name)).toContain('/web')
    expect(TOOL_CATALOG.map((e) => e.name)).toContain('/memory')
    expect(TOOL_CATALOG.map((e) => e.name)).toContain('/tools')
  })
})

describe('groupToolsByCategory', () => {
  it('按 4 类分组且丢弃空组', () => {
    const groups = groupToolsByCategory(TOOL_CATALOG)
    expect(groups.map((g) => g.category)).toEqual(['chat', 'agent', 'tools', 'info'])
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0)
      expect(g.label).toBeTruthy()
    }
  })
})