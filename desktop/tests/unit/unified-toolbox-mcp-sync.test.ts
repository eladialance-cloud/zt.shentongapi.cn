/**
 * Task 4: Hermes 工具集 + MCP 写回闭环
 *
 * 断言：
 * - TOOLSET_DEFS 含 `toolbox` 工具集。TOOLSET_DEFS 本身未导出，此处经已导出的
 *   `buildToolsetInfos(null)`（内部遍历 TOOLSET_DEFS）读取，避免为导入常量而改动源码。
 * - `mergeHermesMcpServers` 将 `unified-toolbox` 写入 Hermes config.yaml 的
 *   `mcp_servers.unified-toolbox.url`。
 */
import { buildToolsetInfos } from '../../electron/main/hermes-tools'
import { mergeHermesMcpServers } from '../../electron/main/hermes-mcp-sync'
import type { McpServerSpec } from '../../electron/main/service-registry/mcp-reconcile'
import { load } from 'js-yaml'

jest.mock('electron', () => ({
  app: { getPath: () => '/tmp/unified-toolbox-mcp-sync-test' },
}))

describe('unified-toolbox MCP 同步闭环', () => {
  it('TOOLSET_DEFS 包含 toolbox 工具集', () => {
    // buildToolsetInfos(null) 遍历 TOOLSET_DEFS 并返回全部启用项
    const defs = buildToolsetInfos(null)
    const toolbox = defs.find((t) => t.key === 'toolbox')
    expect(toolbox).toBeDefined()
    expect(toolbox?.label).toBe('工具箱')
    expect(toolbox?.description).toBe('调用统一工具箱能力（飞书/MySQL 等）')
    expect(toolbox?.enabled).toBe(true)
  })

  it('mergeHermesMcpServers 将 unified-toolbox 写入 mcp_servers.unified-toolbox.url', () => {
    const spec: McpServerSpec = { name: 'unified-toolbox', url: 'http://127.0.0.1:9010/mcp', enabled: true }
    const res = mergeHermesMcpServers('', [spec], [])

    expect(res.changed).toBe(true)
    expect(res.servers['unified-toolbox']).toMatchObject({ url: 'http://127.0.0.1:9010/mcp' })
    expect(res.yaml).toContain('mcp_servers:')
    expect(res.yaml).toContain('unified-toolbox:')
    expect(res.yaml).toContain('url: http://127.0.0.1:9010/mcp')

    // js-yaml 回读校验结构正确
    const cfg = load(res.yaml) as Record<string, unknown>
    const servers = cfg.mcp_servers as Record<string, { url?: string }>
    expect(servers?.['unified-toolbox']?.url).toBe('http://127.0.0.1:9010/mcp')
  })
})
