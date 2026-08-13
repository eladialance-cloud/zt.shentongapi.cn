// video-claw 运行时指纹重装机制测试
// 背景：0.8.13 运行时缺 cffi（dashscope 导入崩溃）。0.8.14 重新打包后 CDN 内容 sha256 变化，
// 依赖 isServiceContentStale 的 .runtime-sha256 指纹比对强制用户端自动重装。
// 本测试锁定该机制对 video-claw 生效，防止未来回归为“版本号相同就跳过重装”。
jest.mock('electron', () => {
  const path = require('node:path')
  return {
    app: {
      isPackaged: false,
      getPath: () => path.join(process.cwd(), 'test-userdata-vc'),
      getAppPath: () => process.cwd()
    }
  }
})
import { isServiceContentStale } from '../../electron/main/runtime-resolver'
import * as fs from 'node:fs'
import * as path from 'node:path'

const USERDATA_RT = path.join(process.cwd(), 'test-userdata-vc', 'runtime')
const SVC = 'video-claw'
const ENTRY = 'video-claw.cmd'

function readManifestSha(): string {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'runtime', 'manifest.json'), 'utf-8'))
  const key = process.platform + '-' + process.arch
  const sha = manifest.services[SVC].sha256[key]
  expect(sha).toBeTruthy()
  return sha
}

function ensureEntry(): void {
  const dir = path.join(USERDATA_RT, SVC)
  fs.mkdirSync(dir, { recursive: true })
  const entry = path.join(dir, ENTRY)
  if (!fs.existsSync(entry)) fs.writeFileSync(entry, '@echo off\r\n', 'utf-8')
}

afterAll(() => {
  try {
    fs.rmSync(USERDATA_RT, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('video-claw 内容指纹（sha256 标记）重装判定', () => {
  test('CDN 内容更新后（指纹不一致）判定为过期，触发自动重装', () => {
    fs.rmSync(USERDATA_RT, { recursive: true, force: true })
    ensureEntry()
    // 旧版运行时指纹（模拟 0.8.13 的 cffi 缺失包，与当前清单 sha 不一致）
    fs.writeFileSync(path.join(USERDATA_RT, SVC, '.runtime-sha256'), 'deadbeef', 'utf-8')
    expect(isServiceContentStale(SVC)).toBe(true)
  })

  test('指纹与当前清单一致时判定为最新，不重复下载', () => {
    ensureEntry()
    fs.writeFileSync(path.join(USERDATA_RT, SVC, '.runtime-sha256'), readManifestSha(), 'utf-8')
    expect(isServiceContentStale(SVC)).toBe(false)
  })

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
})
