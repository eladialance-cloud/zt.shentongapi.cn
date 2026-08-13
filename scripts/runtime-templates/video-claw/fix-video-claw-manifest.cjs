'use strict'
/**
 * VideoClaw 运行时清单回填助手（幂等，跨 PowerShell 版本输出一致格式）
 * 用法: node fix-video-claw-manifest.cjs <archive> <manifest.json> <embedded.ts>
 */
const fs = require('node:fs')
const crypto = require('node:crypto')

const [archive, manifestPath, embPath] = process.argv.slice(2)
if (!archive || !manifestPath || !embPath) {
  console.error('usage: node fix-video-claw-manifest.cjs <archive> <manifest.json> <embedded.ts>')
  process.exit(1)
}

const buf = fs.readFileSync(archive)
const size = buf.length
const sha256 = crypto.createHash('sha256').update(buf).digest('hex')

const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
if (!m.services || !m.services['video-claw']) {
  console.error('manifest.json missing video-claw entry')
  process.exit(1)
}
m.services['video-claw'].size['win32-x64'] = size
m.services['video-claw'].sha256['win32-x64'] = sha256

fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n', 'utf8')

const cur = fs.readFileSync(embPath, 'utf8')
const marker = 'export const EMBEDDED_MANIFEST: RuntimeManifest'
const idx = cur.indexOf(marker)
if (idx < 0) {
  console.error('runtime-manifest-embedded.ts missing EMBEDDED_MANIFEST marker')
  process.exit(1)
}
const prefix = cur.slice(0, idx)
fs.writeFileSync(embPath, prefix + marker + ' = ' + JSON.stringify(m, null, 2) + ';\n', 'utf8')

console.log('manifest backfilled: size=' + size + ' sha256=' + sha256)
