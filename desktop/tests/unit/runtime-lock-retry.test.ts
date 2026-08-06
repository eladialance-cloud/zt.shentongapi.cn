// 运行时解压/删除的 Windows 文件占用（EBUSY/EPERM）重试助手测试
// 覆盖：isLockError 判定、retryFsOperation 占用重试、removeDirWithRetry 占用重试
jest.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => require('node:path').join(process.cwd(), 'test-userdata'),
    getAppPath: () => process.cwd()
  }
}))
import { isLockError, retryFsOperation, removeDirWithRetry } from '../../electron/main/runtime-downloader'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

describe('isLockError 文件占用错误判定', () => {
  test('EBUSY/EPERM/ENOTEMPTY/EACCES 判定为占用错误', () => {
    expect(isLockError(Object.assign(new Error('busy'), { code: 'EBUSY' }))).toBe(true)
    expect(isLockError(Object.assign(new Error('perm'), { code: 'EPERM' }))).toBe(true)
    expect(isLockError(Object.assign(new Error('notempty'), { code: 'ENOTEMPTY' }))).toBe(true)
    expect(isLockError(Object.assign(new Error('acc'), { code: 'EACCES' }))).toBe(true)
  })

  test('非占用错误返回 false', () => {
    expect(isLockError(Object.assign(new Error('noent'), { code: 'ENOENT' }))).toBe(false)
    expect(isLockError(new Error('plain'))).toBe(false)
    expect(isLockError(null)).toBe(false)
  })
})

describe('retryFsOperation 占用时自动重试', () => {
  test('连续 EBUSY 后成功：按间隔重试直至成功', async () => {
    let calls = 0
    const op = () => {
      calls++
      if (calls < 3) {
        const err = new Error('resource busy') as NodeJS.ErrnoException
        err.code = 'EBUSY'
        throw err
      }
    }
    await retryFsOperation(op, 5, 10)
    expect(calls).toBe(3)
  })

  test('非占用错误直接抛出，不重试', async () => {
    let calls = 0
    const op = () => {
      calls++
      const err = new Error('missing') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    }
    await expect(retryFsOperation(op, 5, 10)).rejects.toThrow('missing')
    expect(calls).toBe(1)
  })
})

describe('removeDirWithRetry 目录清理重试', () => {
  let tmp: string
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-retry-'))
  })
  afterEach(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  test('正常目录一次删除成功', async () => {
    const dir = path.join(tmp, 'a')
    fs.mkdirSync(dir)
    await removeDirWithRetry(dir, 3, 5)
    expect(fs.existsSync(dir)).toBe(false)
  })
})
