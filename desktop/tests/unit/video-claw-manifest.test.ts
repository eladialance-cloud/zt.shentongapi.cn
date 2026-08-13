// video-claw 运行时清单一致性测试（Task 1）
// 验证 EMBEDDED_MANIFEST 与 runtime/manifest.json 均登记 video-claw 服务，
// 且端口/入口字段与 service-manager 约定一致。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EMBEDDED_MANIFEST } from '../../electron/main/runtime-manifest-embedded'

describe('video-claw 运行时清单一致性', () => {
  const ENTRY = 'video-claw.cmd'
  const PORT = 8000

  it('embedded manifest 登记 video-claw（端口 8000，win32 入口）', () => {
    const svc = EMBEDDED_MANIFEST.services['video-claw']
    expect(svc).toBeDefined()
    expect(svc.port).toBe(PORT)
    expect(svc.entry.win32).toBe(ENTRY)
  })

  it('runtime/manifest.json 与 embedded manifest 一致', () => {
    const raw = readFileSync(join(__dirname, '../../runtime/manifest.json'), 'utf-8')
    const disk = JSON.parse(raw)
    expect(disk.services['video-claw']).toBeDefined()
    expect(disk.services['video-claw'].port).toBe(PORT)
    expect(disk.services['video-claw'].entry.win32).toBe(ENTRY)
  })

  it('共享类型 ServiceName 包含 video-claw', () => {
    const src = readFileSync(join(__dirname, '../../electron/shared/types.ts'), 'utf-8')
    expect(src).toMatch(/video-claw/)
  })
})
