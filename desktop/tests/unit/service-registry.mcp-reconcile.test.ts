import { computeMcpSection, type McpServerSpec } from '../../electron/main/service-registry/mcp-reconcile'

const server = (name: string, extra: Partial<McpServerSpec> = {}): McpServerSpec => ({
  name,
  command: 'node',
  args: [`--${name}`],
  env: {},
  enabled: true,
  ...extra,
})

describe('service-registry computeMcpSection', () => {
  test('新增 server 合并进既有 mcp.servers，不丢已有 server', () => {
    const section = computeMcpSection(
      { servers: { existing: { command: 'a', args: [], env: {} } } },
      {},
      [server('new-mod')],
      [],
    )
    const servers = (section.servers as Record<string, unknown>)
    expect(Object.keys(servers)).toContain('existing')
    expect(Object.keys(servers)).toContain('new-mod')
  })

  test('removedNames 精确移除既有 server 与旧版根级 mcpServers', () => {
    const section = computeMcpSection(
      { servers: { keep: { command: 'k' }, gone: { command: 'g' } } },
      { legacyGone: { command: 'l' } },
      [server('keep-2')],
      ['gone', 'legacyGone'],
    )
    const servers = (section.servers as Record<string, unknown>)
    expect(servers.gone).toBeUndefined()
    expect(servers.legacyGone).toBeUndefined()
    expect(servers.keep).toBeDefined()
    expect(servers['keep-2']).toBeDefined()
  })

  test('enabled=false 的 server 不写入但也不删除既有同名', () => {
    const section = computeMcpSection(
      { servers: { stay: { command: 'old' } } },
      {},
      [server('stay', { enabled: false })],
      [],
    )
    expect((section.servers as Record<string, unknown>).stay).toEqual({ command: 'old' })
  })

  test('新 server 覆盖既有同名（url 优先、command 次之）', () => {
    const section = computeMcpSection(
      { servers: { m: { command: 'old' } } },
      {},
      [server('m', { url: 'http://127.0.0.1:9000' })],
      [],
    )
    expect((section.servers as Record<string, unknown>).m).toEqual({ url: 'http://127.0.0.1:9000' })
  })

  test('旧版根级 mcpServers 迁移进 mcp.servers 并被保留', () => {
    const section = computeMcpSection(
      {},
      { legacy: { command: 'legacy', args: [], env: {} } },
      [],
      [],
    )
    expect((section.servers as Record<string, unknown>).legacy).toBeDefined()
  })
})
