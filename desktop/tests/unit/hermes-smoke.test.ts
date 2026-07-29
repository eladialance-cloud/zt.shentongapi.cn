import { ServiceManager } from '../../electron/main/service-manager'
import { verifyAll } from '../../electron/main/runtime-resolver'
import type { ServiceName } from '../../electron/shared/types'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('Hermes Agent service integration', () => {
  test('ServiceName type includes hermes at runtime', () => {
    const names: ServiceName[] = ['openclaw', 'n8n', 'mcp', 'hermes']
    expect(names).toContain('hermes')
  })

  test('manifest.json includes hermes entry', () => {
    const manifestPath = path.join(process.cwd(), 'runtime', 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    expect(manifest.services.hermes).toBeDefined()
    expect(manifest.services.hermes.port).toBe(8642)
    expect(manifest.services.hermes.entry.win32).toBe('hermes')
    expect(manifest.services.hermes.downloadUrl['win32-x64']).toMatch(/hermes/)
  })

  test('ServiceManager exposes all four base services', () => {
    const manager = new ServiceManager()
    const all = manager.getAllInfo()
    const names = all.map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['openclaw', 'n8n', 'mcp', 'hermes']))
  })

  test('runtime-resolver verifyAll returns hermes', async () => {
    const result = await verifyAll()
    expect(result).toHaveProperty('hermes')
    expect(typeof result.hermes).toBe('boolean')
  })
})
