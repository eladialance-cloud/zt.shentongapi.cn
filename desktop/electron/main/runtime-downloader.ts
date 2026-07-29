// 杩愯鏃跺畨瑁呭櫒 - 閫氳繃 npm 鍏ㄥ眬瀹夎 OpenClaw / N8N / MCP Gateway
//
// 瀹炵幇璇存槑锛?// - 涓変釜鏈嶅姟鍧囬€氳繃 npm install -g 瀹夎鍒板叏灞€鐜
// - 瀹夎鍓嶆娴?Node.js 鐜锛岃嫢鏃犲垯鎻愮ず鐢ㄦ埛瀹夎
// - 瀹夎杩涘害閫氳繃瀛愯繘绋?stdout 瑙ｆ瀽
// - 瀹夎瀹屾垚鍚庢洿鏂?local manifest 鐗堟湰鍙?// - 鏀寔鍙栨秷瀹夎锛坘ill 瀛愯繘绋嬶級

import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execFile as execFileCb, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import type { ServiceName } from '../shared/types'
import { loadManifest } from './runtime-resolver'

const execFile = promisify(execFileCb)

export interface DownloadProgress {
  /** 杩涘害鐧惧垎姣?0-100 */
  percent: number
  /** 涓嬭浇閫熺巼 KB/s */
  speedKBs: number
  /** 棰勮鍓╀綑绉掓暟 */
  etaSec: number
}

/** 鍚勬湇鍔＄殑 npm 鍖呬俊鎭紙鐗堟湰鍙蜂粠 manifest 鍔ㄦ€佽鍙栵紝瑙?getServiceVersion锛?*/
const NPM_PACKAGES: Record<ServiceName, { pkg: string; cmd: string }> = {
  openclaw: { pkg: 'openclaw', cmd: 'openclaw' },
  n8n: { pkg: 'n8n', cmd: 'n8n' },
  mcp: { pkg: 'mcp-gateway', cmd: 'mcp-gateway' },
  hermes: { pkg: 'hermes-agent', cmd: 'hermes' }
}

/** manifest 璇诲彇澶辫触鏃剁殑鍥為€€鐗堟湰锛坧in 鍒板叿浣撶増鏈彿锛屼笉浣跨敤 'latest'锛?*/
const DEFAULT_VERSIONS: Record<ServiceName, string> = {
  openclaw: '2026.7.1',
  n8n: '2.30.3',
  mcp: '1.0.0',
  hermes: '0.1.0'
}

/** 浠?manifest 璇诲彇鏈嶅姟鐗堟湰鍙凤紱璇诲彇澶辫触鎴栦负绌哄垯鍥為€€鍒伴粯璁ょ増鏈?*/
function getServiceVersion(name: ServiceName): string {
  try {
    const manifest = loadManifest()
    const v = manifest?.services?.[name]?.version
    if (v && typeof v === 'string' && v.trim() !== '') return v
  } catch {
    // manifest 璇诲彇澶辫触锛屼娇鐢ㄩ粯璁ゅ€?  }
  return DEFAULT_VERSIONS[name]
}

/** 瀹夎杩涚▼寮曠敤锛堢敤浜庡彇娑堬級 */
const installProcesses: Map<ServiceName, ChildProcess> = new Map()
/** 鍙栨秷鏍囪 */
const cancelFlags: Set<ServiceName> = new Set()

/** 鎵嬪姩鍦?PATH 涓煡鎵惧懡浠ょ殑瀹屾暣璺緞 */
async function findCommandPath(cmd: string): Promise<string | null> {
  // 1. 灏濊瘯 where/which
  try {
    const tool = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFile(tool, [cmd], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true
    })
    const result = String(stdout).trim().split(/\r?\n/)
    // Windows 涓婅繃婊ゆ棤鎵╁睍鍚嶇殑 shell wrapper
    if (process.platform === 'win32') {
      const exeExt = ['.exe', '.cmd', '.bat', '.ps1']
      for (const line of result) {
        const p = line.trim()
        if (p && exeExt.some(ext => p.toLowerCase().endsWith(ext))) {
          return p
        }
      }
    } else {
      if (result[0]) return result[0].trim()
    }
  } catch {
    // where 澶辫触
  }

  // 2. 鎵嬪姩閬嶅巻 PATH
  if (process.platform === 'win32') {
    // Windows 涓婂彧鍖归厤甯︽墿灞曞悕鐨勫彲鎵ц鏂囦欢
    const variants = [`${cmd}.exe`, `${cmd}.cmd`, `${cmd}.bat`, `${cmd}.ps1`]
    const pathDirs = (process.env.PATH || '').split(';').filter(Boolean)
    for (const dir of pathDirs) {
      for (const variant of variants) {
        const fullPath = path.join(dir, variant)
        try {
          if (fs.statSync(fullPath).isFile()) return fullPath
        } catch {
          // not found
        }
      }
    }
  } else {
    const pathDirs = (process.env.PATH || '').split(':').filter(Boolean)
    for (const dir of pathDirs) {
      const fullPath = path.join(dir, cmd)
      try {
        if (fs.statSync(fullPath).isFile()) return fullPath
      } catch {
        // not found
      }
    }
  }
  return null
}

/** 妫€娴?Node.js / npm 鏄惁鍙敤 */
async function checkNpmAvailable(): Promise<{ npm: string; node: string } | null> {
  const npmPath = await findCommandPath('npm')
  const nodePath = await findCommandPath('node')
  if (npmPath && nodePath) return { npm: npmPath, node: nodePath }
  return null
}

/** 妫€娴嬪懡浠ゆ槸鍚﹀凡瀹夎 */
async function isCommandInstalled(cmd: string): Promise<boolean> {
  return (await findCommandPath(cmd)) !== null
}

/** 鑾峰彇宸插畨瑁呭寘鐨勭増鏈?*/
async function getInstalledVersion(pkgName: string): Promise<string | null> {
  try {
    const { stdout } = await execFile('npm', ['ls', '-g', pkgName, '--json'], {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
      // Windows 涓?npm 鏄?npm.cmd锛岄渶瑕?shell 瑙ｆ瀽
      shell: process.platform === 'win32'
    })
    const parsed = JSON.parse(String(stdout))
    const deps = parsed?.dependencies ?? {}
    const pkg = deps[pkgName]
    if (pkg?.version) return pkg.version
  } catch {
    // 鏈畨瑁呮垨鏌ヨ澶辫触
  }
  return null
}

export interface DownloadResult {
  ok: boolean
  error?: string
}

/** 褰撳墠骞冲彴鐨?manifest key锛屽 win32-x64 */
function platformKey(): string {
  return `${process.platform}-${process.arch}`
}

/** 褰掓。涓嬭浇鎬昏秴鏃讹紙姣锛夛細2 鍒嗛挓锛堜娇鐢?AbortSignal.timeout锛?*/
const ARCHIVE_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000

/**
 * 娴佸紡璁＄畻鏂囦欢 SHA-256锛堝吋瀹瑰ぇ鏂囦欢锛岄伩鍏嶄竴娆℃€ц鍏ュ唴瀛橈級
 *
 * 浣跨敤 Node crypto.createHash('sha256') + fs.createReadStream 娴佸紡鏇存柊銆? */
export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * 鏍￠獙宸蹭笅杞藉綊妗ｆ枃浠剁殑 SHA-256 瀹屾暣鎬э紙Task 4.1锛氭仮澶嶅畬鏁存€ф牎楠岋級
 *
 * - 璇诲彇 manifest 涓鏈嶅姟褰撳墠骞冲彴鐨?sha256
 * - 鏈熸湜鍊间负绌猴紙鏋勫缓鏈熸湭濉厖锛夆啋 璺宠繃鏍￠獙锛堜笌 runtime-resolver.verifyIntegrity 涓€鑷寸殑寮€鍙戠幆澧冨吋瀹硅涔夛級
 * - 鍚﹀垯娴佸紡璁＄畻鏂囦欢 SHA-256 骞舵瘮瀵? * - 涓嶅尮閰嶏細鍒犻櫎宸蹭笅杞芥枃浠跺苟鎶涘嚭閿欒锛堥槻姝娇鐢ㄨ绡℃敼/鎹熷潖鐨勮繍琛屾椂锛? *
 * @throws Error 褰?SHA-256 涓嶅尮閰嶆椂锛堟枃浠跺凡琚垹闄わ級
 */
export async function verifyArchiveIntegrity(
  name: ServiceName,
  filePath: string
): Promise<void> {
  const manifest = loadManifest()
  if (!manifest) {
    throw new Error('manifest 涓嶅彲鐢紝鏃犳硶鏍￠獙瀹屾暣鎬?)
  }
  const serviceEntry = manifest.services[name]
  if (!serviceEntry) {
    throw new Error(`manifest 涓湭鎵惧埌鏈嶅姟: ${name}`)
  }
  const expected = serviceEntry.sha256[platformKey()]
  // 鏋勫缓鏈熸湭濉厖锛氳烦杩囨牎楠岋紙淇濈暀绌哄瓧绗︿覆浣滀负鈥滄湭濉厖鈥濆摠鍏碉紝閬垮厤璇姤锛?  if (!expected) {
    console.warn(`[runtime-installer] ${name} sha256 鏈～鍏咃紝璺宠繃瀹屾暣鎬ф牎楠宍)
    return
  }
  const actual = await computeFileSha256(filePath)
  if (actual !== expected) {
    // 瀹屾暣鎬ф牎楠屽け璐ワ細鍒犻櫎宸蹭笅杞芥枃浠讹紝闃叉浣跨敤琚鏀?鎹熷潖鐨勮繍琛屾椂
    try {
      await fs.promises.unlink(filePath)
    } catch {
      // 鍒犻櫎澶辫触涓嶆帺鐩栧師濮嬬殑鏍￠獙閿欒
    }
    throw new Error(
      `杩愯鏃跺綊妗ｆ牎楠屽け璐ワ紙SHA-256 涓嶅尮閰嶏級锛屽彲鑳戒笅杞戒笉瀹屾暣鎴栬绡℃敼锛氭湡鏈?${expected}锛屽疄闄?${actual}锛堝凡鍒犻櫎鎹熷潖鏂囦欢锛塦
    )
  }
  console.log(`[runtime-installer] ${name} SHA-256 鏍￠獙閫氳繃`)
}

/**
 * 浠?manifest.downloadUrl 涓嬭浇杩愯鏃跺綊妗ｅ埌涓存椂鏂囦欢锛屽苟鏍￠獙 SHA-256 瀹屾暣鎬э紙Task 4.1 + 4.4锛? *
 * - 浣跨敤 fetch + AbortSignal.timeout锛堢‖绾︽潫锛歠etch 瓒呮椂鎺у埗锛? * - 娴佸紡鍐欏叆涓存椂鏂囦欢锛屽悓鏃舵祦寮忚绠?SHA-256
 * - 涓嬭浇瀹屾垚鍚庝笌 manifest.sha256 姣斿锛屼笉鍖归厤鍒欏垹闄ゆ枃浠跺苟鎶涢敊
 * - 浠绘剰澶辫触锛堢綉缁?瓒呮椂/鏍￠獙锛夊潎閫氳繃 try/finally 娓呯悊涓存椂鏂囦欢
 *
 * @returns 涓嬭浇骞舵牎楠屾垚鍔熺殑涓存椂鏂囦欢璺緞锛堣皟鐢ㄦ柟璐熻矗鍚庣画瑙ｅ帇/娓呯悊锛? */
export async function downloadRuntimeArchive(
  name: ServiceName,
  onProgress?: (progress: DownloadProgress) => void
): Promise<string> {
  const manifest = loadManifest()
  if (!manifest) {
    throw new Error('manifest 涓嶅彲鐢紝鏃犳硶涓嬭浇杩愯鏃跺綊妗?)
  }
  const serviceEntry = manifest.services[name]
  if (!serviceEntry) {
    throw new Error(`manifest 涓湭鎵惧埌鏈嶅姟: ${name}`)
  }
  const url = serviceEntry.downloadUrl[platformKey()]
  if (!url) {
    throw new Error(`manifest 涓湭閰嶇疆 ${name} 鐨?${platformKey()} 涓嬭浇鍦板潃`)
  }

  const tmpDir = path.join(app.getPath('userData'), 'runtime', '.tmp')
  await fs.promises.mkdir(tmpDir, { recursive: true })
  const tmpFile = path.join(tmpDir, `${name}-${platformKey()}.tar.gz`)

  // fetch + AbortSignal.timeout锛氱‖绾︽潫瑕佹眰鐨?fetch 瓒呮椂妯″紡
  // 鍗曠嫭 try/catch 鎹曡幏瓒呮椂锛圱imeoutError/AbortError锛変笌缃戠粶閿欒锛岃浆鎹负鍏蜂綋璇婃柇淇℃伅
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(ARCHIVE_DOWNLOAD_TIMEOUT_MS)
    })
  } catch (err) {
    const errName = (err as Error)?.name || ''
    if (
      errName === 'TimeoutError' ||
      errName === 'AbortError' ||
      (err instanceof Error && /timeout|abort/i.test(err.message))
    ) {
      throw new Error('杩愯鏃朵笅杞借秴鏃讹紝璇锋鏌ョ綉缁滃悗閲嶈瘯')
    }
    throw new Error(
      `杩愯鏃朵笅杞藉け璐ワ紙缃戠粶閿欒锛夛細${err instanceof Error ? err.message : String(err)}`
    )
  }
  // CDN 404锛氬綊妗ｄ笉瀛樺湪锛堢増鏈湭鍙戝竷鎴栧凡涓嬫灦锛?  if (response.status === 404) {
    throw new Error('杩愯鏃跺綊妗ｄ笉瀛樺湪锛圕DN 杩斿洖 404锛夛紝璇风◢鍚庨噸璇曟垨鑱旂郴绠＄悊鍛?)
  }
  if (!response.ok) {
    throw new Error(`杩愯鏃朵笅杞藉け璐ワ細HTTP ${response.status}`)
  }
  if (!response.body) {
    throw new Error(`涓嬭浇 ${name} 澶辫触锛氬搷搴旀棤 body`)
  }

  const total = Number(response.headers.get('content-length') || 0)
  let received = 0
  let lastReport = 0

  try {
    // 灏?web ReadableStream 杞?Node stream锛屾祦寮忓啓鍏ユ枃浠?    const nodeStream = Readable.fromWeb(response.body)
    const fileStream = fs.createWriteStream(tmpFile)
    nodeStream.on('data', (chunk: Buffer) => {
      received += chunk.length
      // 鑺傛祦锛氭瘡 500ms 涓婃姤涓€娆¤繘搴?      const now = Date.now()
      if (onProgress && (now - lastReport > 500 || (total > 0 && received === total))) {
        lastReport = now
        const percent = total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0
        onProgress({ percent, speedKBs: 0, etaSec: 0 })
      }
    })
    await pipeline(nodeStream, fileStream)

    // 涓嬭浇瀹屾垚锛氭牎楠?SHA-256 瀹屾暣鎬э紙涓嶅尮閰嶄細鍒犻櫎鏂囦欢骞舵姏閿欙級
    // 閫氳繃 verifyArchiveIntegrity 娴佸紡閲嶈鏂囦欢璁＄畻 hash锛屼笌鍗曠嫭鏍￠獙閫昏緫淇濇寔涓€鑷?    await verifyArchiveIntegrity(name, tmpFile)

    return tmpFile
  } catch (err) {
    // 涓嬭浇/鍐欏叆/鏍￠獙澶辫触锛氭竻鐞嗕复鏃舵枃浠讹紙verifyArchiveIntegrity 鍐呴儴宸插鐞?sha256 涓嶅尮閰嶇殑鍒犻櫎锛?    // 姝ゅ鍏滃簳瑕嗙洊缃戠粶涓柇/鍐欏叆澶辫触绛夊満鏅紱unlink 瀵逛笉瀛樺湪鐨勬枃浠舵槸 no-op锛?    try {
      await fs.promises.unlink(tmpFile)
    } catch {
      // 鏂囦欢鍙兘宸茶鍒犻櫎鎴栦粠鏈垱寤猴紝蹇界暐
    }
    // 娴佸紡涓嬭浇闃舵瓒呮椂锛圓bortSignal.timeout 鍦?body 璇诲彇闃舵瑙﹀彂锛?    const errName = (err as Error)?.name || ''
    if (
      errName === 'TimeoutError' ||
      errName === 'AbortError' ||
      (err instanceof Error && /timeout|abort/i.test(err.message))
    ) {
      throw new Error('杩愯鏃朵笅杞借秴鏃讹紝璇锋鏌ョ綉缁滃悗閲嶈瘯')
    }
    throw err
  }
}

/** 瀹夎鎬昏秴鏃讹紙姣锛夛細5 鍒嗛挓 */
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000

/**
 * 瀹夎鏈嶅姟杩愯鏃? *
 * 娴佺▼锛? * 1. cloud 绫诲瀷鏈嶅姟鐩存帴杩斿洖鎴愬姛
 * 2. n8n锛欳DN 渚挎惡鐗堜紭鍏堬紙cdnInstall锛夛紝澶辫触鏃舵鏌?npm 鍙敤鎬у悗鍥為€€鍒?npmInstall
 *    锛堢敤鎴风鏈哄櫒閫氬父鏃?Node.js/npm锛屼究鎼虹増褰掓。鑷甫 Node.js runtime锛屾晠浼樺厛 CDN锛? * 3. 鍏朵粬鏈嶅姟锛坥penclaw/mcp/hermes锛夛細npm 浼樺厛锛坣pmInstall锛夛紝澶辫触鏃跺洖閫€鍒?CDN锛坈dnInstall锛? * 4. 涓よ€呴兘澶辫触杩斿洖鍚堝苟閿欒淇℃伅
 *
 * @returns 鎴愬姛杩斿洖 { ok: true }锛涘け璐ヨ繑鍥?{ ok: false, error: '...' }
 */
export async function download(
  name: ServiceName,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  // cloud 绫诲瀷鏈嶅姟涓轰簯绔儴缃诧紝鏃犻渶涓嬭浇鏈湴杩愯鏃讹紝鐩存帴杩斿洖鎴愬姛
  const manifest = loadManifest()
  const serviceEntry = manifest?.services?.[name]
  if (serviceEntry?.type === 'cloud') {
    console.log(`[runtime-downloader] ${name} is cloud service, skip download`)
    onProgress?.({ percent: 100, speedKBs: 0, etaSec: 0 })
    return { ok: true }
  }

  // n8n锛欳DN 涓嬭浇渚挎惡鐗堜紭鍏堬紝澶辫触鏃跺洖閫€鍒?npm 瀹夎
  // 渚挎惡鐗堝綊妗ｅ惈 Node.js runtime锛屾棤闇€鐢ㄦ埛鏈哄櫒棰勮 Node.js锛涗粎褰?CDN 澶辫触鎵嶅洖閫€ npm
  if (name === 'n8n') {
    console.log(`[runtime-downloader] ${name} trying CDN portable install first`)
    const cdnResult = await cdnInstall(name, onProgress)
    if (cdnResult.ok) {
      return cdnResult
    }
    console.warn(
      `[runtime-downloader] ${name} CDN install failed, falling back to npm: ${cdnResult.error}`
    )

    // CDN 澶辫触锛氭鏌ョ郴缁熸槸鍚︽湁 node/npm锛屾棤鍒欐棤娉曞洖閫€
    const env = await checkNpmAvailable()
    if (!env) {
      return {
        ok: false,
        error: `CDN 涓嬭浇澶辫触锛屼笖绯荤粺鏈畨瑁?Node.js锛屾棤娉曞洖閫€鍒?npm 瀹夎銆侰DN 閿欒锛?{cdnResult.error}`
      }
    }

    // npm 鍙敤锛氬洖閫€鍒?npm 瀹夎
    const npmResult = await npmInstall(name, onProgress)
    if (npmResult.ok) {
      return npmResult
    }
    return {
      ok: false,
      error: `CDN 涓嬭浇澶辫触锛屽凡鍥為€€鍒?npm 瀹夎浣嗕篃澶辫触銆侰DN 閿欒锛?{cdnResult.error}锛沶pm 閿欒锛?{npmResult.error}`
    }
  }

  // 鍏朵粬鏈嶅姟锛坥penclaw/mcp/hermes锛夛細淇濇寔 npm 浼樺厛 + CDN 鍥為€€
  // 1. 灏濊瘯 npm 鍏ㄥ眬瀹夎
  const npmResult = await npmInstall(name, onProgress)
  if (npmResult.ok) {
    return npmResult
  }
  console.warn(
    `[runtime-downloader] ${name} npm install failed, falling back to CDN: ${npmResult.error}`
  )

  // 2. npm 澶辫触锛氬洖閫€鍒?CDN 褰掓。涓嬭浇 + 瑙ｅ帇
  const cdnResult = await cdnInstall(name, onProgress)
  if (cdnResult.ok) {
    return cdnResult
  }

  // 3. 涓よ€呴兘澶辫触锛氳繑鍥炲悎骞堕敊璇俊鎭?  return {
    ok: false,
    error: `npm 瀹夎澶辫触: ${npmResult.error}锛汣DN 涓嬭浇涔熷け璐? ${cdnResult.error}`
  }
}

/**
 * 閫氳繃 npm 鍏ㄥ眬瀹夎鏈嶅姟杩愯鏃? *
 * @returns 鎴愬姛杩斿洖 { ok: true }锛涘け璐ヨ繑鍥?{ ok: false, error: '...' }
 */
async function npmInstall(
  name: ServiceName,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  // 1. 妫€娴?npm 鐜
  const env = await checkNpmAvailable()
  if (!env) {
    console.error('[runtime-installer] npm/node not found in PATH')
    return { ok: false, error: '鏈壘鍒?npm/node锛岃纭繚 Node.js 宸插畨瑁呭苟娣诲姞鍒扮郴缁?PATH' }
  }

  const pkgInfo = NPM_PACKAGES[name]
  if (!pkgInfo) {
    console.error(`[runtime-installer] unknown service: ${name}`)
    return { ok: false, error: `鏈煡鏈嶅姟: ${name}` }
  }

  const version = getServiceVersion(name)

  // 2. 濡傛灉宸插畨瑁咃紝璺宠繃
  if (await isCommandInstalled(pkgInfo.cmd)) {
    console.log(`[runtime-installer] ${name} already installed (${pkgInfo.cmd} found in PATH)`)
    onProgress?.({ percent: 100, speedKBs: 0, etaSec: 0 })
    // 鏇存柊 local manifest
    updateLocalManifest(name, (await getInstalledVersion(pkgInfo.pkg)) ?? 'unknown')
    return { ok: true }
  }

  cancelFlags.delete(name)

  // 3. 瀹夎鍓嶅厛鍋滄璇ユ湇鍔＄殑杩涚▼锛堥伩鍏?Windows 鏂囦欢閿?EBUSY锛?  if (process.platform === 'win32') {
    // 鍒嗕袱娆¤皟鐢?taskkill锛屽垎鍒拡瀵?.exe 鍜?.cmd锛涜繘绋嬩笉瀛樺湪鏄甯哥殑锛屽拷鐣ラ敊璇?    for (const ext of ['.exe', '.cmd']) {
      try {
        await execFile('taskkill', ['/f', '/im', `${pkgInfo.cmd}${ext}`], {
          windowsHide: true,
          timeout: 5000
        })
      } catch {
        // 杩涚▼涓嶅瓨鍦紝蹇界暐
      }
    }
  } else {
    try {
      await execFile('pkill', ['-f', pkgInfo.cmd], { timeout: 5000 })
    } catch {
      // 杩涚▼涓嶅瓨鍦紝蹇界暐
    }
  }

  // 4. 瀵逛簬 n8n锛氬厛鍗歌浇鏃х増锛堟竻鐞嗘畫鐣欐枃浠讹級锛屽啀閲嶆柊瀹夎
  if (name === 'n8n') {
    try {
      await execFile(env.npm, ['uninstall', '-g', 'n8n'], {
        windowsHide: true,
        timeout: 30000,
        // Windows 涓?env.npm 閫氬父鏄?npm.cmd锛岄渶瑕?shell 鎵ц
        shell: process.platform === 'win32'
      })
    } catch {
      // 鍗歌浇澶辫触涓嶉樆濉烇紝缁х画瀹夎
    }
  }

  // 5. 鎵ц npm install -g
  // n8n 2.x 渚濊禆 isolated-vm锛圕++ 鍘熺敓妯″潡锛夛紝鍦?Windows 涓?node-gyp 缂栬瘧缁忓父澶辫触
  // 浣跨敤 --ignore-scripts 璺宠繃缂栬瘧锛宯8n 鍦ㄧ己灏?isolated-vm 鏃朵細闄嶇骇杩愯锛堝姛鑳戒笉鍙楀奖鍝嶏紝浠呮矙绠遍殧绂绘€ц兘鐣ュ樊锛?  const npmArgs = ['install', '-g', `${pkgInfo.pkg}@${version}`]
  if (name === 'n8n') {
    npmArgs.push('--ignore-scripts')
  }
  console.log(`[runtime-installer] running: npm ${npmArgs.join(' ')}`)

  // npm 鍦?Windows 涓婇€氬父鏄?npm.cmd锛岄渶瑕?shell 妯″紡锛沶8n 琛ヨ better-sqlite3 澶嶇敤鍚屼竴閰嶇疆
  const needsShell = process.platform === 'win32' && (
    env.npm.toLowerCase().endsWith('.cmd') ||
    env.npm.toLowerCase().endsWith('.bat') ||
    env.npm.toLowerCase().endsWith('.ps1') ||
    !path.isAbsolute(env.npm)
  )

  /**
   * n8n 瀹夎鎴愬姛鍚庤ˉ瑁?better-sqlite3锛屼笉浣跨敤 --ignore-scripts锛?   * 浠ヤ究 prebuild-install 鑳戒笅杞介缂栬瘧浜岃繘鍒躲€?   * 澶辫触浠呰褰曡鍛婏紝涓嶉樆濉?n8n 瀹夎锛坣8n 鍙洖閫€鍒?sqlite3锛夈€?   */
  const installBetterSqlite3 = (): Promise<boolean> =>
    new Promise((resolve) => {
      const args = ['install', '-g', 'better-sqlite3']
      console.log(`[runtime-installer] running fallback: npm ${args.join(' ')}`)
      let child: ChildProcess
      try {
        child = spawn(env.npm, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: needsShell,
          windowsHide: true
        })
      } catch (err) {
        console.warn('[runtime-installer] better-sqlite3 install spawn failed:', err)
        resolve(false)
        return
      }

      let stdout = ''
      let stderr = ''
      const timeout = setTimeout(() => {
        console.warn('[runtime-installer] better-sqlite3 install timed out, continuing without it')
        try { child.kill('SIGKILL') } catch { /* ignore */ }
        resolve(false)
      }, 5 * 60 * 1000)

      child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
      child.once('error', (err) => {
        clearTimeout(timeout)
        console.warn('[runtime-installer] better-sqlite3 install error:', err)
        resolve(false)
      })
      child.once('exit', (code) => {
        clearTimeout(timeout)
        if (code === 0) {
          console.log('[runtime-installer] better-sqlite3 installed successfully')
          resolve(true)
        } else {
          console.warn(`[runtime-installer] better-sqlite3 install failed (exit code ${code}), continuing without it`)
          if (stderr) console.warn(`[runtime-installer] better-sqlite3 stderr: ${stderr.slice(-500)}`)
          resolve(false)
        }
      })
    })

  return new Promise<DownloadResult>((resolve) => {
    let child: ChildProcess
    let timer: NodeJS.Timeout | undefined
    let resolved = false

    const finish = (r: DownloadResult) => {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)
      resolve(r)
    }

    try {
      child = spawn(env.npm, npmArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: needsShell,
        windowsHide: true
      })
    } catch (err) {
      console.error('[runtime-installer] spawn npm failed:', err)
      finish({ ok: false, error: `鍚姩 npm 澶辫触: ${err instanceof Error ? err.message : String(err)}` })
      return
    }

    installProcesses.set(name, child)

    // 鎬昏秴鏃朵繚鎶わ細5 鍒嗛挓鏈畬鎴愬垯寮哄埗鏉€姝昏繘绋?    timer = setTimeout(() => {
      console.error(`[runtime-installer] ${name} install timed out after ${INSTALL_TIMEOUT_MS}ms`)
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      finish({ ok: false, error: '瀹夎瓒呮椂锛岃閲嶈瘯' })
    }, INSTALL_TIMEOUT_MS)

    let stdoutData = ''
    let stderrData = ''
    let progressPercent = 0

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdoutData += text
      console.log(`[runtime-installer:${name}] ${text.trim()}`)

      // 瑙ｆ瀽 npm 杩涘害锛坣pm 杈撳嚭鏃犲浐瀹氱櫨鍒嗘瘮鏍煎紡锛岀敤鍚彂寮忎及绠楋級
      // 甯歌杈撳嚭: "added 123 packages in 45s"
      const addedMatch = text.match(/added (\d+) packages?/)
      if (addedMatch) {
        progressPercent = 90
        onProgress?.({ percent: progressPercent, speedKBs: 0, etaSec: 0 })
      } else if (text.includes('npm warn')) {
        progressPercent = Math.min(progressPercent + 5, 80)
        onProgress?.({ percent: progressPercent, speedKBs: 0, etaSec: 0 })
      } else if (text.includes('idealTree') || text.includes('reify')) {
        progressPercent = Math.min(progressPercent + 10, 70)
        onProgress?.({ percent: progressPercent, speedKBs: 0, etaSec: 0 })
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrData += text
      // npm 鐨勮繘搴︿俊鎭湁鏃惰緭鍑哄埌 stderr
      if (!text.includes('npm warn')) {
        console.warn(`[runtime-installer:${name}] ${text.trim()}`)
      }
    })

    child.once('error', (err) => {
      console.error(`[runtime-installer] ${name} spawn error:`, err)
      installProcesses.delete(name)
      finish({ ok: false, error: `npm 杩涚▼鍚姩澶辫触: ${err.message}` })
    })

    child.once('exit', async (code) => {
      installProcesses.delete(name)
      // 绔嬪嵆娓呴櫎瓒呮椂瀹氭椂鍣紝閬垮厤涓庡悗缁?async 宸ヤ綔绔炰簤
      if (timer) clearTimeout(timer)

      if (cancelFlags.has(name)) {
        console.log(`[runtime-installer] ${name} cancelled`)
        finish({ ok: false, error: '瀹夎宸插彇娑? })
        return
      }

      if (code === 0) {
        // n8n 瀹夎鎴愬姛鍚庤ˉ瑁?better-sqlite3锛堜笉浣跨敤 --ignore-scripts锛屼互渚夸笅杞介缂栬瘧浜岃繘鍒讹級
        if (name === 'n8n') {
          const sqliteOk = await installBetterSqlite3()
          if (!sqliteOk) {
            console.warn('[runtime-installer] better-sqlite3 fallback install failed; n8n will use sqlite3 as fallback')
          }
        }

        onProgress?.({ percent: 100, speedKBs: 0, etaSec: 0 })
        console.log(`[runtime-installer] ${name} installed successfully`)
        // 鏇存柊 local manifest
        const installedVersion = (await getInstalledVersion(pkgInfo.pkg)) ?? 'latest'
        updateLocalManifest(name, installedVersion)
        finish({ ok: true })
      } else {
        console.error(`[runtime-installer] ${name} npm install failed (exit code ${code})`)
        if (stderrData) {
          console.error(`[runtime-installer] stderr: ${stderrData.slice(-500)}`)
        }
        const errorMsg = stderrData.slice(-300).trim() || `npm install 澶辫触 (閫€鍑虹爜 ${code})`
        finish({ ok: false, error: errorMsg })
      }
    })
  })
}

/** 褰掓。瑙ｅ帇瓒呮椂锛堟绉掞級锛? 鍒嗛挓 */
const EXTRACT_TIMEOUT_MS = 2 * 60 * 1000

/**
 * 浣跨敤绯荤粺鑷甫 tar 瑙ｅ帇 .tar.gz 褰掓。鍒扮洰鏍囩洰褰曪紙瑕嗙洊锛? *
 * - Windows 10+ 鑷甫 tar.exe锛沵acOS / Linux 鑷甫 bsdtar / gnutar
 * - 浣跨敤 execFile + 鍙傛暟鏁扮粍锛岄伩鍏?execSync 瀛楃涓叉嫾鎺ュ鑷寸殑鍛戒护娉ㄥ叆
 *
 * @throws Error 瑙ｅ帇澶辫触鎴栬秴鏃? */
async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  try {
    await execFile('tar', ['-xzf', archivePath, '-C', destDir], {
      windowsHide: true,
      timeout: EXTRACT_TIMEOUT_MS
    })
  } catch (err) {
    throw new Error(
      `杩愯鏃跺綊妗ｈВ鍘嬪け璐ワ紝鍙兘鏂囦欢鎹熷潖锛?{err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * 浠?CDN 涓嬭浇杩愯鏃跺綊妗ｅ苟瑙ｅ帇鍒?userData/runtime/<service>/
 *
 * 娴佺▼锛? * 1. 璋冪敤 downloadRuntimeArchive() 涓嬭浇褰掓。 + SHA-256 鏍￠獙
 * 2. 瑙ｅ帇鍒?userData/runtime/<service>/ 鐩綍
 * 3. 鏇存柊 local manifest 鐗堟湰鍙? * 4. 娓呯悊涓存椂褰掓。鏂囦欢锛坱ry/finally 纭繚娓呯悊锛? *
 * @returns 鎴愬姛杩斿洖 { ok: true }锛涘け璐ヨ繑鍥?{ ok: false, error: '...' }
 */
async function cdnInstall(
  name: ServiceName,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  let archivePath: string | null = null
  try {
    console.log(`[runtime-downloader] ${name} downloading from CDN`)
    // 1. 涓嬭浇褰掓。 + SHA-256 鏍￠獙锛堝け璐ユ椂 downloadRuntimeArchive 浼氭姏閿欙級
    archivePath = await downloadRuntimeArchive(name, onProgress)

    // 2. 瑙ｅ帇鍒?userData/runtime/<service>/
    const targetDir = path.join(app.getPath('userData'), 'runtime', name)
    await fs.promises.mkdir(targetDir, { recursive: true })
    await extractArchive(archivePath, targetDir)
    console.log(`[runtime-downloader] ${name} extracted to ${targetDir}`)

    // 3. 鏇存柊 local manifest 鐗堟湰鍙?    const version = getServiceVersion(name)
    updateLocalManifest(name, version)

    onProgress?.({ percent: 100, speedKBs: 0, etaSec: 0 })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[runtime-downloader] ${name} CDN install failed:`, msg)
    return { ok: false, error: msg }
  } finally {
    // 4. 娓呯悊涓存椂褰掓。鏂囦欢锛堟棤璁烘垚鍔熷け璐ワ級
    if (archivePath) {
      try {
        await fs.promises.unlink(archivePath)
      } catch {
        // 鏂囦欢鍙兘宸茶鍒犻櫎鎴栦粠鏈垱寤猴紝蹇界暐
      }
    }
  }
}

/** 鏇存柊 userData 涓嬬殑 manifest.json 涓殑鏈嶅姟鐗堟湰鍙?*/
function updateLocalManifest(name: ServiceName, version: string): void {
  const localDir = path.join(app.getPath('userData'), 'runtime')
  const localPath = path.join(localDir, 'manifest.json')

  // 璇诲彇鍐呯疆 manifest 浣滀负鍩虹
  const builtinPath = path.join(
    app.isPackaged ? process.resourcesPath : process.cwd(),
    'runtime',
    'manifest.json'
  )

  let manifest: Record<string, unknown>
  try {
    if (fs.existsSync(localPath)) {
      manifest = JSON.parse(fs.readFileSync(localPath, 'utf-8'))
    } else if (fs.existsSync(builtinPath)) {
      manifest = JSON.parse(fs.readFileSync(builtinPath, 'utf-8'))
    } else {
      manifest = { version: '1.0.0', services: {} }
    }
  } catch {
    manifest = { version: '1.0.0', services: {} }
  }

  const services = (manifest.services ?? {}) as Record<string, Record<string, unknown>>
  if (!services[name]) {
    services[name] = {}
  }
  services[name].version = version
  manifest.services = services

  try {
    fs.mkdirSync(localDir, { recursive: true })
    fs.writeFileSync(localPath, JSON.stringify(manifest, null, 2), 'utf-8')
  } catch (err) {
    console.error('[runtime-installer] update local manifest failed:', err)
  }
}

/** 鍙栨秷姝ｅ湪杩涜鐨勫畨瑁?*/
export function cancelDownload(name: ServiceName): void {
  // cloud 绫诲瀷鏈嶅姟鏃犳湰鍦颁笅杞借繘绋嬶紝鐩存帴杩斿洖
  const manifest = loadManifest()
  if (manifest?.services?.[name]?.type === 'cloud') {
    console.log(`[runtime-downloader] ${name} is cloud service, skip cancel`)
    return
  }
  cancelFlags.add(name)
  const child = installProcesses.get(name)
  if (child) {
    try {
      child.kill('SIGTERM')
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
      }, 3000)
    } catch {
      // ignore
    }
  }
}
