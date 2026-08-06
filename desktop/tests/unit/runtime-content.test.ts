// 运行时内容指纹（sha256 标记）测试：验证"版本号相同但内容已更新"的旧残留能被识别
jest.mock('electron', () => {
  const path = require('node:path')
  return {
    app: {
      isPackaged: false,
      getPath: () => path.join(process.cwd(), 'test-userdata'),
      getAppPath: () => process.cwd()
    }
  }
})
import { isServiceContentStale, loadManifest } from '../../electron/main/runtime-resolver'
import * as fs from 'node:fs'
import * as path from 'node:path'

const USERDATA_RT = path.join(process.cwd(), 'test-userdata', 'runtime')
const SVC = 'openclaw'

function readManifestSha(): string {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'runtime', 'manifest.json'), 'utf-8'))
  const key = process.platform + '-' + process.arch
  return manifest.services[SVC].sha256[key]
}

function ensureEntry(): void {
  const dir = path.join(USERDATA_RT, SVC)
  fs.mkdirSync(dir, { recursive: true })
  const entry = path.join(dir, 'openclaw.exe.cmd')
  if (!fs.existsSync(entry)) fs.writeFileSync(entry, '@echo off\r\n', 'utf-8')
}

afterAll(() => {
  try {
    fs.rmSync(USERDATA_RT, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('isServiceContentStale 内容指纹校验', () => {
  test('未安装（入口缺失）时不强制重装', () => {
    fs.rmSync(USERDATA_RT, { recursive: true, force: true })
    expect(isServiceContentStale(SVC)).toBe(false)
  })

  test('旧版本下载残留（无指纹文件）判定为过期', () => {
    ensureEntry()
    const marker = path.join(USERDATA_RT, SVC, '.runtime-sha256')
    try {
      fs.unlinkSync(marker)
    } catch {
      // ignore
    }
    expect(isServiceContentStale(SVC)).toBe(true)
  })

  test('指纹与清单一致时判定为最新', () => {
    ensureEntry()
    fs.writeFileSync(path.join(USERDATA_RT, SVC, '.runtime-sha256'), readManifestSha(), 'utf-8')
    expect(isServiceContentStale(SVC)).toBe(false)
  })

  test('指纹与清单不一致（CDN 内容已更新）判定为过期', () => {
    ensureEntry()
    fs.writeFileSync(path.join(USERDATA_RT, SVC, '.runtime-sha256'), 'deadbeef', 'utf-8')
    expect(isServiceContentStale(SVC)).toBe(true)
  })

  test('内置清单文件缺失时回退到内嵌清单，旧指纹仍判定过期', () => {
    const builtinPath = path.join(process.cwd(), 'runtime', 'manifest.json')
    const backupPath = builtinPath + '.bak-test'
    fs.renameSync(builtinPath, backupPath)
    try {
      ensureEntry()
      fs.writeFileSync(path.join(USERDATA_RT, SVC, '.runtime-sha256'), 'deadbeef', 'utf-8')
      const manifest = loadManifest()
      expect(manifest).not.toBeNull()
      const key = process.platform + '-' + process.arch
      expect(manifest!.services[SVC].sha256[key]).toBeTruthy()
      expect(isServiceContentStale(SVC)).toBe(true)
    } finally {
      fs.renameSync(backupPath, builtinPath)
    }
  })
})
