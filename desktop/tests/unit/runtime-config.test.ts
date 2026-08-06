// runtime-config 单元测试：下载安装位置配置模块
// 说明：jest 环境无 electron，userDataDir() 会回退到 process.env.APPDATA
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  userDataDir,
  defaultRuntimeRoot,
  getRuntimeRoot,
  setRuntimeRoot,
  getRuntimeDirInfo
} from '../../electron/main/runtime-config'

describe('runtime-config（下载安装位置）', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-config-test-'))
    process.env.APPDATA = tmp
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
    delete process.env.APPDATA
  })

  it('无配置时返回默认 userData/runtime', () => {
    expect(userDataDir()).toBe(tmp)
    expect(defaultRuntimeRoot()).toBe(path.join(tmp, 'runtime'))
    expect(getRuntimeRoot()).toBe(path.join(tmp, 'runtime'))
  })

  it('setRuntimeRoot 成功后持久化并可读取', () => {
    const target = path.join(tmp, 'custom-runtime')
    const result = setRuntimeRoot(target)
    expect(result.ok).toBe(true)
    expect(result.path).toBe(target)
    expect(getRuntimeRoot()).toBe(target)
    // 配置文件已写入
    expect(fs.existsSync(path.join(tmp, 'runtime-location.json'))).toBe(true)
  })

  it('拒绝非绝对路径', () => {
    const result = setRuntimeRoot('relative/dir')
    expect(result.ok).toBe(false)
    expect(getRuntimeRoot()).toBe(path.join(tmp, 'runtime'))
  })

  it('getRuntimeDirInfo 返回路径与磁盘信息', () => {
    const info = getRuntimeDirInfo()
    expect(info.path).toBe(path.join(tmp, 'runtime'))
    expect(info.defaultPath).toBe(path.join(tmp, 'runtime'))
    expect(typeof info.freeBytes).toBe('number')
    expect(typeof info.totalBytes).toBe('number')
  })
})
