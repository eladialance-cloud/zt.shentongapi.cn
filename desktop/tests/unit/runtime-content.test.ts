// 运行时内容指纹（sha256 标记）测试：验证"版本号相同但内容已更新"的旧残留能被识别
//
// 隔离说明：被测算符经 process.cwd() 解析内置清单。若直接在仓库 desktop/runtime/manifest.json
// 上注入假 sha，会与并行读取该清单的用例（runtime-bundled.e2e、video-claw-manifest）竞态，
// 且进程被中断时会把假 sha 留在工作区。故本用例把 cwd 切到临时目录，只在临时目录内造清单。
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
import * as os from 'node:os'
import * as path from 'node:path'

const REAL_CWD = process.cwd()
const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'st-runtime-content-'))
const USERDATA_RT = path.join(TEST_ROOT, 'test-userdata', 'runtime')
const BUILTIN_MANIFEST_PATH = path.join(TEST_ROOT, 'runtime', 'manifest.json')
const FAKE_SHA = 'a'.repeat(64)
const SVC = 'hermes'

function readManifestSha(): string {
  const manifest = JSON.parse(fs.readFileSync(BUILTIN_MANIFEST_PATH, 'utf-8'))
  const key = process.platform + '-' + process.arch
  return manifest.services[SVC].sha256[key]
}

beforeAll(() => {
  // 先把真实清单复制进临时目录，再切 cwd，确保被测算符解析到的是临时副本
  fs.mkdirSync(path.dirname(BUILTIN_MANIFEST_PATH), { recursive: true })
  fs.copyFileSync(path.join(REAL_CWD, 'runtime', 'manifest.json'), BUILTIN_MANIFEST_PATH)
  process.chdir(TEST_ROOT)
  // 清单 sha 可能为空（免校验开发构建）→ 注入假 sha，使指纹校验用例可确定性执行
  const originalManifest = fs.readFileSync(BUILTIN_MANIFEST_PATH, 'utf-8')
  const manifest = JSON.parse(originalManifest) as { services: Record<string, { sha256?: Record<string, string> }> }
  const key = process.platform + '-' + process.arch
  manifest.services[SVC].sha256 = manifest.services[SVC].sha256 ?? {}
  manifest.services[SVC].sha256[key] = FAKE_SHA
  fs.writeFileSync(BUILTIN_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8')
})

function ensureEntry(): void {
  const dir = path.join(USERDATA_RT, SVC)
  fs.mkdirSync(dir, { recursive: true })
  const entry = path.join(dir, 'hermes.exe.cmd')
  if (!fs.existsSync(entry)) fs.writeFileSync(entry, '@echo off\r\n', 'utf-8')
}

afterAll(() => {
  process.chdir(REAL_CWD)
  try {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
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
    const backupPath = BUILTIN_MANIFEST_PATH + '.bak-test'
    fs.renameSync(BUILTIN_MANIFEST_PATH, backupPath)
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
      fs.renameSync(backupPath, BUILTIN_MANIFEST_PATH)
    }
  })
})