// SubTask 10.5: 内置本地服务运行时 - 运行时解析与校验 e2e 测试
//
// 测试场景：
// 1. manifest.json 结构验证：3 个服务、字段完整性、端口正确性
// 2. pickNewerManifest 语义化版本比较：null 处理、版本高低、相等时优先 userData
// 3. manifest 完整性：downloadUrl / entry / sha256 多平台字段覆盖
//
// 说明：RuntimeResolver.resolve() 依赖 electron 的 app 模块，在纯 Node.js 测试环境
// 无法直接 import（参考现有 e2e 测试风格，均不引入 electron/main 模块）。
// 故采用方案 B：直接读取 runtime/manifest.json 验证结构与字段完整性；
// pickNewerManifest 为纯函数，通过本地复刻源码语义进行验证（与 billing.e2e.test.ts
// 复刻 freezeCredits/settleCredits 的模式一致）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import type {
  RuntimeManifest,
  RuntimeManifestEntry,
  ServiceName
} from '@shared/types'

/** manifest.json 文件绝对路径 */
const MANIFEST_PATH = path.join(__dirname, '../../runtime/manifest.json')

/** 读取并解析 manifest.json */
function loadManifest(): RuntimeManifest {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8')
  return JSON.parse(raw) as RuntimeManifest
}

/**
 * 复刻 runtime-resolver.ts 的语义化版本比较逻辑
 * 返回值 > 0 表示 a 较新，< 0 表示 b 较新，0 表示相等
 * 非法版本按 0.0.0 处理
 */
function compareSemver(a: string, b: string): number {
  const parseSemver = (v: string): [number, number, number] => {
    if (!v || typeof v !== 'string') return [0, 0, 0]
    const parts = v.split('.').map((s) => {
      const n = parseInt(s, 10)
      return Number.isNaN(n) ? 0 : n
    })
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }
  const [aMaj, aMin, aPatch] = parseSemver(a)
  const [bMaj, bMin, bPatch] = parseSemver(b)
  if (aMaj !== bMaj) return aMaj - bMaj
  if (aMin !== bMin) return aMin - bMin
  return aPatch - bPatch
}

/**
 * 复刻 runtime-resolver.ts 的 pickNewerManifest 逻辑
 * - 两者都为 null → null
 * - 其中一个为 null → 返回另一个
 * - 两者都存在 → 比较 manifest.version，返回较大者
 * - 版本相等时优先返回 userData（保留补丁优先语义）
 */
function pickNewerManifest(
  builtin: RuntimeManifest | null,
  userData: RuntimeManifest | null
): RuntimeManifest | null {
  if (!builtin && !userData) return null
  if (!builtin) return userData
  if (!userData) return builtin
  const cmp = compareSemver(builtin.version, userData.version)
  // userData 版本 >= builtin → 用 userData（补丁优先）
  if (cmp >= 0) return userData
  return builtin
}

/** 构造测试用 manifest（pickNewerManifest 仅依赖 version 字段） */
function makeManifest(version: string): RuntimeManifest {
  return {
    version,
    services: {} as Record<ServiceName, RuntimeManifestEntry>
  }
}

/** 全部服务名 */
const SERVICE_NAMES: ServiceName[] = ['n8n', 'openclaw', 'mcp']
/** 平台-架构组合（downloadUrl / sha256 字段 key） */
const PLATFORM_ARCH_KEYS = [
  'win32-x64',
  'darwin-x64',
  'darwin-arm64',
  'linux-x64'
]
/** 平台组合（entry 字段 key） */
const PLATFORM_KEYS = ['win32', 'darwin', 'linux']

describe('SubTask 10.5 - 运行时解析与校验', () => {
  describe('Runtime Manifest', () => {
    it('should load manifest.json with all 3 services', () => {
      // act
      const manifest = loadManifest()

      // assert - 顶层字段
      expect(manifest.version).toBeDefined()
      expect(typeof manifest.version).toBe('string')
      expect(manifest.services).toBeDefined()

      // assert - services 包含 n8n / openclaw / mcp 三个 key
      expect(Object.keys(manifest.services).sort()).toEqual([
        'mcp',
        'n8n',
        'openclaw'
      ])

      // assert - 每个服务具备 version / entry / downloadUrl / sha256 字段
      for (const name of SERVICE_NAMES) {
        const entry = manifest.services[name]
        expect(entry).toBeDefined()
        expect(typeof entry.version).toBe('string')
        expect(entry.version.length).toBeGreaterThan(0)
        expect(entry.entry).toBeDefined()
        expect(typeof entry.entry).toBe('object')
        expect(entry.downloadUrl).toBeDefined()
        expect(typeof entry.downloadUrl).toBe('object')
        expect(entry.sha256).toBeDefined()
        expect(typeof entry.sha256).toBe('object')
      }
    })

    it('should have correct ports for each service', () => {
      // act
      const manifest = loadManifest()

      // assert
      expect(manifest.services.n8n.port).toBe(5678)
      expect(manifest.services.openclaw.port).toBe(8080)
      expect(manifest.services.mcp.port).toBe(3100)
    })
  })

  describe('pickNewerManifest', () => {
    it('should return null when both manifests are null', () => {
      // act
      const result = pickNewerManifest(null, null)

      // assert
      expect(result).toBeNull()
    })

    it('should return non-null manifest when one is null', () => {
      // arrange
      const builtin = makeManifest('1.0.0')
      const userData = makeManifest('1.1.0')

      // act & assert - builtin 为 null → 返回 userData
      expect(pickNewerManifest(null, userData)).toBe(userData)
      // userData 为 null → 返回 builtin
      expect(pickNewerManifest(builtin, null)).toBe(builtin)
    })

    it('should return the manifest with higher version', () => {
      // arrange - userData 较新（builtin 1.0.0, userData 1.1.0）
      const builtin = makeManifest('1.0.0')
      const userData = makeManifest('1.1.0')

      // act
      const result = pickNewerManifest(builtin, userData)

      // assert
      expect(result).toBe(userData)
      expect(result?.version).toBe('1.1.0')
    })

    it('should return builtin when builtin version is higher', () => {
      // arrange - builtin 较新（builtin 2.0.0, userData 1.1.0）
      const builtin = makeManifest('2.0.0')
      const userData = makeManifest('1.1.0')

      // act
      const result = pickNewerManifest(builtin, userData)

      // assert
      expect(result).toBe(builtin)
      expect(result?.version).toBe('2.0.0')
    })

    it('should prefer userData when versions are equal', () => {
      // arrange
      const builtin = makeManifest('1.0.0')
      const userData = makeManifest('1.0.0')

      // act
      const result = pickNewerManifest(builtin, userData)

      // assert
      expect(result).toBe(userData)
    })

    it('should compare semver by major.minor.patch', () => {
      // act & assert - patch 差异
      expect(
        pickNewerManifest(makeManifest('1.0.0'), makeManifest('1.0.1'))?.version
      ).toBe('1.0.1')
      // minor 差异（patch 更高也无法超越 minor）
      expect(
        pickNewerManifest(makeManifest('1.2.0'), makeManifest('1.1.9'))?.version
      ).toBe('1.2.0')
      // major 差异（minor/patch 更高也无法超越 major）
      expect(
        pickNewerManifest(makeManifest('2.0.0'), makeManifest('1.9.9'))?.version
      ).toBe('2.0.0')
    })
  })

  describe('Runtime Integrity', () => {
    it('should have download URLs for all platforms', () => {
      // arrange
      const manifest = loadManifest()

      // act & assert
      for (const name of SERVICE_NAMES) {
        const { downloadUrl } = manifest.services[name]
        for (const key of PLATFORM_ARCH_KEYS) {
          expect(downloadUrl).toHaveProperty(key)
          expect(typeof downloadUrl[key]).toBe('string')
          expect(downloadUrl[key].length).toBeGreaterThan(0)
          expect(downloadUrl[key]).toMatch(/^https?:\/\//)
        }
      }
    })

    it('should have entry files for all platforms', () => {
      // arrange
      const manifest = loadManifest()

      // act & assert
      for (const name of SERVICE_NAMES) {
        const { entry } = manifest.services[name]
        for (const key of PLATFORM_KEYS) {
          expect(entry).toHaveProperty(key)
          expect(typeof entry[key]).toBe('string')
          expect(entry[key].length).toBeGreaterThan(0)
        }
        // win32 入口必须以 .exe 结尾
        expect(entry.win32.endsWith('.exe')).toBe(true)
      }
    })

    it('should have sha256 field for all platforms (can be empty)', () => {
      // arrange
      const manifest = loadManifest()

      // act & assert
      for (const name of SERVICE_NAMES) {
        const { sha256 } = manifest.services[name]
        for (const key of PLATFORM_ARCH_KEYS) {
          expect(sha256).toHaveProperty(key)
          expect(typeof sha256[key]).toBe('string')
          // 初始值可以是空字符串（构建期未填充）；若非空则必须是 64 字符 hex
          if (sha256[key].length > 0) {
            expect(sha256[key]).toMatch(/^[0-9a-f]{64}$/)
          }
        }
      }
    })
  })
})
