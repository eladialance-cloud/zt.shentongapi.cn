// MCP Gateway SSE 桥脚本内容冒烟测试：验证内置桥脚本存在且关键行为未退化
// （桥脚本为纯 Node 内置模块实现，由 service-manager 以 ELECTRON_RUN_AS_NODE 启动）
import * as fs from 'node:fs'
import * as path from 'node:path'

const BRIDGE_PATH = path.join(process.cwd(), 'resources', 'mcp', 'mcp-gateway-server.js')

describe('mcp-gateway-server.js 内置 SSE 桥', () => {
  const src = fs.readFileSync(BRIDGE_PATH, 'utf-8')

  test('桥脚本存在', () => {
    expect(fs.existsSync(BRIDGE_PATH)).toBe(true)
  })

  test('暴露 SSE / message / health 端点', () => {
    expect(src).toContain(`'/sse'`)
    expect(src).toContain(`'/api/mcp/sse'`)
    expect(src).toContain(`'/message'`)
    expect(src).toContain(`'/health'`)
  })

  test('以 stdio 方式启动 OpenClaw mcp serve', () => {
    expect(src).toContain(`'mcp', 'serve'`)
    expect(src).toContain('--gateway-ws')
    expect(src).toContain('openclawMjs')
    expect(src).toContain('--url')
  })

  test('输出 service-manager 识别的就绪标记', () => {
    expect(src).toContain('MCP Gateway is running')
    expect(src).toContain('SSE backend connected')
  })

  test('只依赖 Node 内置模块（无 require 外部包）', () => {
    const requires = [...src.matchAll(/require\(['\"]([^'\"]+)['\"]\)/g)].map((m) => m[1])
    for (const mod of requires) {
      expect(mod.startsWith('node:')).toBe(true)
    }
  })
})
