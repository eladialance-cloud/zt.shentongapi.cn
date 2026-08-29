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
const BUILTIN_MANIFEST_PATH = path.join(process.cwd(), 'runtime', 'manifest.json')
const FAKE_SHA = 'fake-sha-for-test'
let originalManifest: string | null = null
const SVC = 'openclaw'

function readManifestSha(): string {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'runtime', 'manifest.json'), 'utf-8'))
  const key = process.platform + '-' + process.arch
  return manifest.services[SVC].sha256[key]
}

beforeAll(() => {
  // 清单 sha 可能为空（免校验开发构建）→ 注入假 sha，使指纹校验用例可确定性执行
  originalManifest = fs.readFileSync(BUILTIN_MANIFEST_PATH, 'utf-8')
  const manifest = JSON.parse(originalManifest) as { services: Record<string, { sha256?: Record<string, string> }> }
  const key = process.platform + '-' + process.arch
  manifest.services[SVC].sha256 = manifest.services[SVC].sha256 ?? {}
  manifest.services[SVC].sha256[key] = FAKE_SHA
  fs.writeFileSync(BUILTIN_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8')
})

function ensureEntry(): void {
  const dir = path.join(USERDATA_RT, SVC)
  fs.mkdirSync(dir, { recursive: true })
  const entry = path.join(dir, 'openclaw.exe.cmd')
  if (!fs.existsSync(entry)) fs.writeFileSync(entry, '@echo off\r\n', 'utf-8')
}

afterAll(() => {
  if (originalManifest != null) {
    fs.writeFileSync(BUILTIN_MANIFEST_PATH, originalManifest, 'utf-8')
  }
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

  test('内置清单文件缺失时回退到内嵌清单（内嵌 sha 为空视为免校验）', () => {
    const builtinPath = path.join(process.cwd(), 'runtime', 'manifest.json')
    const backupPath = builtinPath + '.bak-test'
    fs.renameSync(builtinPath, backupPath)
    try {
      ensureEntry()
      fs.writeFileSync(path.join(USERDATA_RT, SVC, '.runtime-sha256'), 'deadbeef', 'utf-8')
      const manifest = loadManifest()
      expect(manifest).not.toBeNull()
      const key = process.platform + '-' + process.arch
      expect(manifest!.services[SVC].sha256[key]).toBeDefined()
      // P0-1: 内嵌清单已带真实 sha 且指纹不一致 → 判定过期（触发完整性重装）
      expect(isServiceContentStale(SVC)).toBe(true)
    } finally {
      fs.renameSync(backupPath, builtinPath)
    }
  })
})
