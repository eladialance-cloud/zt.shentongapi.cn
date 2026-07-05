// 校验 desktop/dist/installer/ 下的安装包与 latest.yml 完整性
//
// 校验项:
// 1. 安装包文件存在性
// 2. latest.yml 存在且可解析
// 3. SHA-512 哈希一致性
// 4. 体积在 50MB-500MB 合理区间(警告,不中断)
//
// 退出码:0=全部通过,1=存在失败项

import { createReadStream, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createHash } from 'node:crypto'

const INSTALLER_DIR = join(process.cwd(), 'dist', 'installer')
const LATEST_YML_PATH = join(INSTALLER_DIR, 'latest.yml')
const INSTALLER_EXTS = ['.exe', '.dmg', '.appimage', '.deb', '.rpm']
const MIN_SIZE_BYTES = 50 * 1024 * 1024  // 50MB
const MAX_SIZE_BYTES = 500 * 1024 * 1024 // 500MB

// ANSI 颜色码
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
}

interface YmlFileEntry {
  url: string
  sha512: string
  size: number
}

interface ParsedYml {
  version: string
  files: YmlFileEntry[]
  releaseDate?: string
}

/** 流式计算 SHA-512 */
function computeSha512(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024
  if (mb < 1024) return `${mb.toFixed(2)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/** 简易 YAML 解析(仅支持 latest.yml 固定格式) */
function parseLatestYml(content: string): ParsedYml {
  const lines = content.split('\n')
  const result: ParsedYml = { version: '', files: [] }
  let currentFile: YmlFileEntry | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // version: x.y.z
    const versionMatch = trimmed.match(/^version:\s*(.+)$/)
    if (versionMatch) {
      result.version = versionMatch[1].trim()
      continue
    }

    // releaseDate: '...'
    const dateMatch = trimmed.match(/^releaseDate:\s*'?([^']+)'?$/)
    if (dateMatch) {
      result.releaseDate = dateMatch[1].trim()
      continue
    }

    // - url: filename(新文件条目开始)
    const urlMatch = trimmed.match(/^-\s*url:\s*(.+)$/)
    if (urlMatch) {
      if (currentFile) result.files.push(currentFile)
      currentFile = { url: urlMatch[1].trim(), sha512: '', size: 0 }
      continue
    }

    // sha512: hash(在 files 数组内或顶层)
    const shaMatch = trimmed.match(/^sha512:\s*(.+)$/)
    if (shaMatch && currentFile) {
      currentFile.sha512 = shaMatch[1].trim()
      continue
    }

    // size: bytes
    const sizeMatch = trimmed.match(/^size:\s*(\d+)$/)
    if (sizeMatch && currentFile) {
      currentFile.size = parseInt(sizeMatch[1], 10)
      continue
    }
  }

  if (currentFile) result.files.push(currentFile)
  return result
}

async function main(): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  校验安装包完整性')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  let passed = 0
  let failed = 0
  let warned = 0

  // ===== 校验 1:安装包目录存在性 =====
  console.log('\n📋 校验 1:安装包目录存在性')
  let installerFiles: string[]
  try {
    installerFiles = readdirSync(INSTALLER_DIR).filter((f) =>
      INSTALLER_EXTS.includes(extname(f).toLowerCase())
    )
    if (installerFiles.length === 0) {
      console.log(`${COLORS.red}  ❌ 未找到安装包文件${COLORS.reset}`)
      console.log(`${COLORS.dim}     目录: ${INSTALLER_DIR}${COLORS.reset}`)
      console.log(`${COLORS.dim}     支持的扩展名: ${INSTALLER_EXTS.join(', ')}${COLORS.reset}`)
      process.exit(1)
    }
    console.log(`${COLORS.green}  ✅ 找到 ${installerFiles.length} 个安装包${COLORS.reset}`)
    installerFiles.forEach((f) => {
      console.log(`${COLORS.dim}     - ${f}${COLORS.reset}`)
    })
    passed++
  } catch {
    console.log(`${COLORS.red}  ❌ 目录不存在: ${INSTALLER_DIR}${COLORS.reset}`)
    console.log(`${COLORS.dim}     请先执行 npm run build:win 或 build:mac${COLORS.reset}`)
    process.exit(1)
  }

  // ===== 校验 2:latest.yml 存在性 =====
  console.log('\n📋 校验 2:latest.yml 存在性')
  let ymlContent: string
  try {
    ymlContent = readFileSync(LATEST_YML_PATH, 'utf-8')
    console.log(`${COLORS.green}  ✅ latest.yml 存在${COLORS.reset}`)
    passed++
  } catch {
    console.log(`${COLORS.red}  ❌ latest.yml 不存在: ${LATEST_YML_PATH}${COLORS.reset}`)
    console.log(`${COLORS.dim}     请先执行 npm run gen-latest-yml${COLORS.reset}`)
    process.exit(1)
  }

  // ===== 校验 3:latest.yml 可解析性 =====
  console.log('\n📋 校验 3:latest.yml 可解析性')
  const yml = parseLatestYml(ymlContent)
  if (!yml.version || yml.files.length === 0) {
    console.log(`${COLORS.red}  ❌ latest.yml 格式错误${COLORS.reset}`)
    console.log(`${COLORS.dim}     version: ${yml.version || '(缺失)'}${COLORS.reset}`)
    console.log(`${COLORS.dim}     files: ${yml.files.length} 个${COLORS.reset}`)
    failed++
  } else {
    console.log(`${COLORS.green}  ✅ 版本号: ${yml.version}${COLORS.reset}`)
    console.log(`${COLORS.green}  ✅ 文件条目: ${yml.files.length} 个${COLORS.reset}`)
    if (yml.releaseDate) {
      console.log(`${COLORS.dim}     发布时间: ${yml.releaseDate}${COLORS.reset}`)
    }
    passed++
  }

  // ===== 校验 4:SHA-512 哈希一致性 =====
  console.log('\n📋 校验 4:SHA-512 哈希一致性')
  for (const entry of yml.files) {
    const filePath = join(INSTALLER_DIR, entry.url)
    try {
      const actualHash = await computeSha512(filePath)
      if (actualHash === entry.sha512) {
        console.log(`${COLORS.green}  ✅ ${entry.url}${COLORS.reset}`)
        console.log(`${COLORS.dim}     期望: ${entry.sha512.substring(0, 32)}...${COLORS.reset}`)
        console.log(`${COLORS.dim}     实际: ${actualHash.substring(0, 32)}...${COLORS.reset}`)
        passed++
      } else {
        console.log(`${COLORS.red}  ❌ ${entry.url}${COLORS.reset}`)
        console.log(`${COLORS.dim}     期望: ${entry.sha512}${COLORS.reset}`)
        console.log(`${COLORS.dim}     实际: ${actualHash}${COLORS.reset}`)
        failed++
      }
    } catch (err) {
      console.log(`${COLORS.red}  ❌ ${entry.url} - 文件读取失败${COLORS.reset}`)
      console.log(`${COLORS.dim}     ${err instanceof Error ? err.message : String(err)}${COLORS.reset}`)
      failed++
    }
  }

  // ===== 校验 5:体积区间(警告) =====
  console.log('\n📋 校验 5:体积区间(50MB-500MB)')
  for (const entry of yml.files) {
    const filePath = join(INSTALLER_DIR, entry.url)
    try {
      const stat = statSync(filePath)
      const size = stat.size
      if (size < MIN_SIZE_BYTES) {
        console.log(`${COLORS.yellow}  ⚠️  ${entry.url} 体积偏小: ${formatSize(size)}${COLORS.reset}`)
        warned++
      } else if (size > MAX_SIZE_BYTES) {
        console.log(`${COLORS.yellow}  ⚠️  ${entry.url} 体积偏大: ${formatSize(size)}${COLORS.reset}`)
        warned++
      } else {
        console.log(`${COLORS.green}  ✅ ${entry.url}: ${formatSize(size)}${COLORS.reset}`)
      }
    } catch {
      console.log(`${COLORS.red}  ❌ ${entry.url} - 无法读取大小${COLORS.reset}`)
      failed++
    }
  }

  // ===== 汇总报告 =====
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  校验报告')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`${COLORS.green}  ✅ 通过: ${passed}${COLORS.reset}`)
  console.log(`${COLORS.yellow}  ⚠️  警告: ${warned}${COLORS.reset}`)
  console.log(`${COLORS.red}  ❌ 失败: ${failed}${COLORS.reset}`)

  if (failed > 0) {
    console.log(`\n${COLORS.red}❌ 校验失败,请重新打包${COLORS.reset}`)
    process.exit(1)
  } else if (warned > 0) {
    console.log(`\n${COLORS.yellow}⚠️  存在警告,请检查体积是否合理${COLORS.reset}`)
    process.exit(0)
  } else {
    console.log(`\n${COLORS.green}✅ 全部校验通过${COLORS.reset}`)
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('❌ 校验脚本异常:', err)
  process.exit(1)
})
