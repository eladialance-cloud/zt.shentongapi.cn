import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { readModuleState, setModuleDisabled } from '../../electron/main/service-registry/module-state'

describe('service-registry module-state', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-reg-state-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('无状态文件时返回空 disabled', () => {
    expect(readModuleState(dir).disabled).toEqual([])
  })

  test('setModuleDisabled 持久化并可读回', () => {
    setModuleDisabled(dir, 'video-claw', true)
    expect(readModuleState(dir).disabled).toContain('video-claw')
    setModuleDisabled(dir, 'video-claw', false)
    expect(readModuleState(dir).disabled).toEqual([])
  })

  test('禁用多个模块按字典序保存且幂等', () => {
    setModuleDisabled(dir, 'b', true)
    setModuleDisabled(dir, 'a', true)
    setModuleDisabled(dir, 'b', true)
    expect(readModuleState(dir).disabled).toEqual(['a', 'b'])
  })
})