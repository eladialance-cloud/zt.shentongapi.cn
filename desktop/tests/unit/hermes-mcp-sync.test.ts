/**
 * Hermes MCP 配置同步单测（node:test + tsx）
 * 运行: npx tsx --test tests/unit/hermes-mcp-sync.test.ts
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mergeHermesMcpServers, writeHermesMcpServers } from '../../electron/main/hermes-mcp-sync'
import type { McpServerSpec } from '../../electron/main/service-registry/mcp-reconcile'
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = [
  'model:',
  '  provider: custom:shentong',
  '  default: qwen3.8-max',
  'platform_toolsets:',
  '  cli: [no_mcp]',
  'custom_providers:',
  '  - name: shentong',
  '    base_url: "http://127.0.0.1:18454/v1"',
  '    api_key: "sk-mock"',
  '',
].join('\n')

function spec(partial: Partial<McpServerSpec>): McpServerSpec {
  return { name: 'x', enabled: true, ...partial }
}

describe('hermes-mcp-sync', () => {
  test('无 mcp_servers 时插入 HTTP/stdio 定义并保留其它段', () => {
    const res = mergeHermesMcpServers(BASE, [
      spec({ name: 'gw', url: 'http://127.0.0.1:3101/mcp' }),
      spec({ name: 'n8n', command: 'node', args: ['mcp.js'], env: { N8N_BASE_URL: 'http://127.0.0.1:5678' } }),
    ])
    assert.equal(res.changed, true)
    assert.ok(res.yaml.includes('mcp_servers:'), 'has mcp_servers block')
    assert.ok(res.yaml.includes('gw:'), 'has gw server')
    assert.ok(res.yaml.includes('n8n:'), 'has n8n server')
    assert.ok(res.yaml.includes('url: http://127.0.0.1:3101/mcp'))
    assert.ok(res.yaml.includes('args:'))
    // 其它段原样保留
    assert.ok(res.yaml.includes('cli: [no_mcp]'))
    assert.ok(res.yaml.includes('provider: custom:shentong'))
    assert.ok(res.yaml.includes('base_url: "http://127.0.0.1:18454/v1"'))
  })

  test('已存在 mcp_servers 时增量合并，不清空旧服务器', () => {
    const r1 = mergeHermesMcpServers(BASE, [spec({ name: 'gw', url: 'http://127.0.0.1:3101/mcp' })])
    const r2 = mergeHermesMcpServers(r1.yaml, [spec({ name: 'n8n', command: 'node', args: ['mcp.js'], env: {} })])
    assert.equal(r2.changed, true)
    assert.ok(r2.yaml.includes('gw:'), 'preserves existing gw')
    assert.ok(r2.yaml.includes('n8n:'), 'adds n8n')
  })

  test('enabled=false 不写入且无变更', () => {
    const res = mergeHermesMcpServers(BASE, [spec({ name: 'off', command: 'node', enabled: false })])
    assert.equal(res.changed, false)
    assert.ok(!res.yaml.includes('off:'))
  })

  test('removedNames 精确移除服务器，空白块被清掉', () => {
    const r1 = mergeHermesMcpServers(BASE, [spec({ name: 'gw', url: 'http://127.0.0.1:3101/mcp' })])
    const r2 = mergeHermesMcpServers(r1.yaml, [], ['gw'])
    assert.equal(r2.changed, true)
    assert.ok(!r2.yaml.includes('gw:'), 'gw removed')
  })

  test('无服务器且原文件无 mcp_servers 时不改动', () => {
    assert.equal(mergeHermesMcpServers(BASE, []).changed, false)
  })

  test('writeHermesMcpServers 保留 CRLF 且写入生效', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hm-'))
    const cfg = join(dir, 'config.yaml')
    writeFileSync(cfg, BASE.replace(/\n/g, '\r\n'), 'utf-8')
    const changed = writeHermesMcpServers(cfg, [spec({ name: 'gw', url: 'http://127.0.0.1:3101/mcp' })])
    assert.equal(changed, true)
    const out = readFileSync(cfg, 'utf-8')
    assert.ok(out.includes('mcp_servers:'))
    assert.ok(out.includes('gw:'))
    assert.ok(out.includes('\r\n'), 'CRLF preserved')
    rmSync(dir, { recursive: true, force: true })
  })
})