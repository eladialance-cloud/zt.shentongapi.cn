// M4 修复：此文件原与 hermes-smoke.test.ts 内容完全重复，已清空。
// 此处仅保留一个最小占位测试，避免 jest 报“测试套件为空”。
import type { ServiceName } from '../../electron/shared/types'

describe('ServiceManager Hermes 占位测试', () => {
  test('hermes 是合法的 ServiceName', () => {
    const names: ServiceName[] = ['openclaw', 'n8n', 'mcp', 'hermes']
    expect(names).toContain('hermes')
  })
})
