import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  RUNTIME_FINGERPRINT_FILE,
  runtimeDirOf,
  fingerprintMarkerPath,
  readRuntimeFingerprint,
  writeRuntimeFingerprint,
  isRuntimeContentStale,
  computeDirectoryFingerprint,
  runtimeBackupRoot,
  moveRuntimeToBackup,
  restoreRuntimeFromBackup,
  listRuntimeBackups,
  pruneRuntimeBackups,
  recordReinstallAudit,
  readReinstallAudit,
} from '../../electron/main/service-registry/fingerprint'

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fp-test-'))
}

describe('service-registry fingerprint', () => {
  test('runtimeDirOf / fingerprintMarkerPath', () => {
    expect(runtimeDirOf('/root', 'video-claw')).toBe(path.join('/root', 'video-claw'))
    expect(fingerprintMarkerPath('/root/video-claw')).toBe(path.join('/root/video-claw', RUNTIME_FINGERPRINT_FILE))
  })

  test('readRuntimeFingerprint 缺失时返回 null', () => {
    const dir = tmpdir()
    expect(readRuntimeFingerprint(dir)).toBeNull()
  })

  test('writeRuntimeFingerprint 原子写入并可读回；临时文件不残留', () => {
    const dir = tmpdir()
    writeRuntimeFingerprint(dir, 'abc123')
    expect(readRuntimeFingerprint(dir)).toBe('abc123')
    expect(fs.existsSync(path.join(dir, RUNTIME_FINGERPRINT_FILE + '.tmp'))).toBe(false)
  })

  test('isRuntimeContentStale 空期望视为不强制；匹配→false；缺失/不匹配→true', () => {
    const dir = tmpdir()
    expect(isRuntimeContentStale(dir, '')).toBe(false)
    writeRuntimeFingerprint(dir, 'fp1')
    expect(isRuntimeContentStale(dir, 'fp1')).toBe(false)
    expect(isRuntimeContentStale(dir, 'fp2')).toBe(true)
    const empty = tmpdir()
    expect(isRuntimeContentStale(empty, 'fp1')).toBe(true)
  })

  test('computeDirectoryFingerprint 确定性且忽略易变目录与指纹标记', () => {
    const dir = tmpdir()
    fs.mkdirSync(path.join(dir, 'app'))
    fs.writeFileSync(path.join(dir, 'app', 'main.txt'), 'hello')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'world')
    fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'junk.txt'), 'noise')
    fs.writeFileSync(path.join(dir, RUNTIME_FINGERPRINT_FILE), 'ignored')
    const fp1 = computeDirectoryFingerprint(dir)!
    const fp2 = computeDirectoryFingerprint(dir)!
    expect(fp1).toBe(fp2)
    expect(fp1).toMatch(/^[0-9a-f]{64}$/)
    // 变更内容应改变指纹
    fs.writeFileSync(path.join(dir, 'app', 'main.txt'), 'hello2')
    expect(computeDirectoryFingerprint(dir)).not.toBe(fp1)
    expect(computeDirectoryFingerprint(path.join(dir, 'does-not-exist'))).toBeNull()
  })

  test('moveRuntimeToBackup + restoreRuntimeFromBackup 往返', async () => {
    const root = tmpdir()
    const backupRoot = runtimeBackupRoot(root)
    const runtimeDir = runtimeDirOf(root, 'video-claw')
    fs.mkdirSync(runtimeDir, { recursive: true })
    fs.writeFileSync(path.join(runtimeDir, 'e.txt'), 'v1')
    const backup = (await moveRuntimeToBackup(runtimeDir, backupRoot, 'video-claw'))!
    expect(backup).toBeTruthy()
    expect(fs.existsSync(runtimeDir)).toBe(false)
    expect(fs.existsSync(backup)).toBe(true)
    expect(readRuntimeFingerprint(backup)).toBeNull()

    // restore 回来
    expect(restoreRuntimeFromBackup(backup, runtimeDir)).toBe(true)
    expect(fs.existsSync(runtimeDir)).toBe(true)
    expect(fs.readFileSync(path.join(runtimeDir, 'e.txt'), 'utf-8')).toBe('v1')
    expect(fs.existsSync(backup)).toBe(false)
  })

  test('moveRuntimeToBackup 目录不存在返回 null', async () => {
    const root = tmpdir()
    expect(await moveRuntimeToBackup(runtimeDirOf(root, 'nope'), runtimeBackupRoot(root), 'nope')).toBeNull()
  })

  test('listRuntimeBackups 与 pruneRuntimeBackups', async () => {
    const root = tmpdir()
    const backupRoot = runtimeBackupRoot(root)
    const runtimeDir = runtimeDirOf(root, 'm')
    fs.mkdirSync(runtimeDir, { recursive: true })
    const b1 = (await moveRuntimeToBackup(runtimeDir, backupRoot, 'm'))!
    fs.mkdirSync(runtimeDir, { recursive: true })
    const b2 = (await moveRuntimeToBackup(runtimeDir, backupRoot, 'm'))!
    fs.mkdirSync(runtimeDir, { recursive: true })
    const b3 = (await moveRuntimeToBackup(runtimeDir, backupRoot, 'm'))!
    let list = listRuntimeBackups(backupRoot, 'm')
    expect(list.length).toBe(3)
    pruneRuntimeBackups(backupRoot, 'm', 1)
    list = listRuntimeBackups(backupRoot, 'm')
    expect(list.length).toBe(1)
    expect(list[0]).toBe(b3)
    expect(fs.existsSync(b1)).toBe(false)
    expect(fs.existsSync(b2)).toBe(false)
  })

  test('recordReinstallAudit 写入并可过滤读取', () => {
    const root = tmpdir()
    recordReinstallAudit(root, 'video-claw', 'reinstall', 'content stale')
    recordReinstallAudit(root, 'hermes', 'install')
    const all = readReinstallAudit(root)
    expect(all.length).toBe(2)
    const vc = readReinstallAudit(root, 'video-claw')
    expect(vc.length).toBe(1)
    expect(vc[0].rowId).toBe('video-claw')
    expect(vc[0].event).toBe('reinstall')
    expect(vc[0].detail).toBe('content stale')
  })
})