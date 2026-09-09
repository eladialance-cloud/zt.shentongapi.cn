/**
 * 运行时内容指纹 + 重装回滚/审计（A3）。
 *
 * 纯函数模块，不 import electron，保证可单测。
 *
 * 语义：
 * - 内容指纹采用两种来源：
 *   1) 清单 sha256（manifest.sha256[platform-arch]，官方校验值；下载器成功后写入
 *      `.runtime-sha256` 标记文件）。
 *   2) 磁盘目录内容哈希（computeDirectoryFingerprint），供无清单条目 / 结构审计比对。
 * - 重装前把旧运行时目录原子重命名到受控备份区（回滚点）；下载/校验失败时恢复，
 *   成功后清理旧备份并写审计。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

export const RUNTIME_FINGERPRINT_FILE = '.runtime-sha256'

function isLockError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as NodeJS.ErrnoException).code
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY' || code === 'EACCES'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 运行时目录：<runtimeRoot>/<rowId>。与 runtime-downloader / service-manager 约定一致。 */
export function runtimeDirOf(runtimeRoot: string, rowId: string): string {
  return path.join(runtimeRoot, rowId)
}

/** 指纹标记文件路径。 */
export function fingerprintMarkerPath(runtimeDir: string): string {
  return path.join(runtimeDir, RUNTIME_FINGERPRINT_FILE)
}

/** 读取现行指纹；不存在/为空返回 null。 */
export function readRuntimeFingerprint(runtimeDir: string): string | null {
  try {
    const v = fs.readFileSync(fingerprintMarkerPath(runtimeDir), 'utf-8').trim()
    return v || null
  } catch {
    return null
  }
}

/** 原子写入指纹（先写临时文件再 rename，避免进程崩溃后写半截）。 */
export function writeRuntimeFingerprint(runtimeDir: string, fingerprint: string): void {
  fs.mkdirSync(runtimeDir, { recursive: true })
  const marker = fingerprintMarkerPath(runtimeDir)
  const tmp = marker + '.tmp'
  fs.writeFileSync(tmp, fingerprint, 'utf-8')
  fs.renameSync(tmp, marker)
}

/** 运行时内容是否过期：期望值为空视为不强制；否则标记缺失或与期望不一致视为过期。 */
export function isRuntimeContentStale(runtimeDir: string, expectedFingerprint: string): boolean {
  if (!expectedFingerprint) return false
  const cur = readRuntimeFingerprint(runtimeDir)
  return cur !== expectedFingerprint
}

/**
 * 计算目录内容哈希（确定性 sha256）。
 * - 排序路径、递归哈希，忽略默认易变目录（node_modules/.git/缓存/temp/日志/指纹标记）。
 * - 目录不存在返回 null。
 */
const DEFAULT_IGNORE = new Set([
  '.git', 'node_modules', '.cache', '.npm', '.yarn', 'cache', 'tmp', 'temp',
  '.tmp', 'logs', 'log', 'logcat', 'runtime-sha256', RUNTIME_FINGERPRINT_FILE,
])

export function computeDirectoryFingerprint(
  dir: string,
  opts?: { ignore?: ReadonlySet<string> },
): string | null {
  if (!dir || !fs.existsSync(dir)) return null
  const skip = opts?.ignore ?? DEFAULT_IGNORE
  const files: string[] = []
  const walk = (cur: string): void => {
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, ent.name)
      const rel = path.relative(dir, abs)
      const segs = rel.split(/[\\/]/)
      if (segs.some((s) => skip.has(s))) continue
      if (ent.isDirectory()) walk(abs)
      else if (ent.isFile()) files.push(rel)
    }
  }
  walk(dir)
  files.sort()
  const h = crypto.createHash('sha256')
  for (const f of files) {
    h.update(f.replace(/[\\/]/g, '/'))
    h.update('\0')
    h.update(fs.readFileSync(path.join(dir, f)))
    h.update('\0')
  }
  return h.digest('hex')
}

/** 重装备份区根目录：<userData>/service-registry/runtime-backups。 */
export function runtimeBackupRoot(userDataDir: string): string {
  return path.join(userDataDir, 'service-registry', 'runtime-backups')
}

/**
 * 把旧运行时目录原子重命名到备份区（回滚点）。
 * 返回备份目录绝对路径；目录不存在返回 null。
 * 同名冲突追加序号；Windows 目录重命名偶发 EPERM/EBUSY 时短暂重试。
 */
export async function moveRuntimeToBackup(runtimeDir: string, backupRoot: string, rowId: string): Promise<string | null> {
  if (!fs.existsSync(runtimeDir)) return null
  fs.mkdirSync(backupRoot, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let backupDir = path.join(backupRoot, `${rowId}-${stamp}`)
  let n = 0
  while (fs.existsSync(backupDir)) {
    n += 1
    backupDir = path.join(backupRoot, `${rowId}-${stamp}-${n}`)
  }
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.renameSync(runtimeDir, backupDir)
      return backupDir
    } catch (err) {
      lastErr = err
      if (!isLockError(err)) throw err
      await sleep(50)
    }
  }
  throw lastErr
}

/** 从备份恢复运行时目录（回滚）。返回是否成功。 */
export function restoreRuntimeFromBackup(backupDir: string, runtimeDir: string): boolean {
  if (!backupDir || !fs.existsSync(backupDir)) return false
  fs.mkdirSync(path.dirname(runtimeDir), { recursive: true })
  try {
    fs.rmSync(runtimeDir, { recursive: true, force: true })
  } catch {
    // 若当前目录仍被占用，重命名到备份会失败，交上层处理
  }
  fs.renameSync(backupDir, runtimeDir)
  return true
}

/** 列出某 row 的备份目录（按时间排序，旧→新）。 */
export function listRuntimeBackups(backupRoot: string, rowId: string): string[] {
  if (!fs.existsSync(backupRoot)) return []
  return fs
    .readdirSync(backupRoot)
    .filter((s) => s.startsWith(rowId + '-'))
    .sort()
    .map((s) => path.join(backupRoot, s))
}

/** 清理多余备份，保留最新 keep 份（默认 1）。 */
export function pruneRuntimeBackups(backupRoot: string, rowId: string, keep = 1): void {
  const list = listRuntimeBackups(backupRoot, rowId)
  while (list.length > keep) {
    const old = list.shift()!
    try {
      fs.rmSync(old, { recursive: true, force: true })
    } catch {
      // 删除失败不阻塞主流程（备份残留无害）
    }
  }
}

export interface ReinstallAuditRecord {
  ts: string
  rowId: string
  event: string
  detail?: string
}

/** 审计文件：<userData>/service-registry/reinstall-audit.jsonl。 */
export function reinstallAuditPath(userDataDir: string): string {
  return path.join(userDataDir, 'service-registry', 'reinstall-audit.jsonl')
}

/** 追加一条重装/回滚审计。 */
export function recordReinstallAudit(userDataDir: string, rowId: string, event: string, detail?: string): void {
  const p = reinstallAuditPath(userDataDir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const rec: ReinstallAuditRecord = { ts: new Date().toISOString(), rowId, event, detail }
  fs.appendFileSync(p, JSON.stringify(rec) + '\n', 'utf-8')
}

/** 读取审计（可按 rowId 过滤）；文件不存在/损坏返回空数组。 */
export function readReinstallAudit(userDataDir: string, rowId?: string): ReinstallAuditRecord[] {
  try {
    const lines = fs.readFileSync(reinstallAuditPath(userDataDir), 'utf-8').split(/\r?\n/).filter(Boolean)
    return lines
      .map((l) => {
        try {
          return JSON.parse(l) as ReinstallAuditRecord
        } catch {
          return null
        }
      })
      .filter((r): r is ReinstallAuditRecord => Boolean(r && (!rowId || r.rowId === rowId)))
  } catch {
    return []
  }
}