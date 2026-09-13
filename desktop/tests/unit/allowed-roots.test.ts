// 允许根注册表 + 云端通道路径裁决（安全审计 S-03 / S-04 / S-21 / S-22）
// 重点：云端通道（remote-control）与本地 IPC 共用同一份 allowedRoots，且一个都没授权时 fail-closed。
import { RemoteControlManager } from '../../electron/main/remote-control'
import { allowedRoots, clearSessionRoots, grantRoot, revokeRoot } from '../../electron/main/services/allowed-roots'

const IS_WIN = process.platform === 'win32'
const ROOT = IS_WIN ? 'C:\\work' : '/work'
const INSIDE = IS_WIN ? 'C:\\work\\notes.txt' : '/work/notes.txt'
const INSIDE_SUB = IS_WIN ? 'C:\\work\\sub\\a.txt' : '/work/sub/a.txt'
const OUTSIDE = IS_WIN ? 'C:\\Users\\a\\.ssh\\id_rsa' : '/home/a/.ssh/id_rsa'
const EXE = IS_WIN ? 'C:\\work\\evil.exe' : '/work/evil.sh'
const SIBLING = IS_WIN ? 'C:\\work-evil\\a.txt' : '/work-evil/a.txt'

type Guard =
  | { ok: true; path: string }
  | { ok: false; message: string }

function guard(mode: 'read' | 'open', target: string): Guard {
  // 刻意不走构造器：RemoteControlManager 构造器是 private 且会启动确认清理定时器；
  // guardRemotePath 只读 allowedRoots()（无实例状态），用原型对象即可精确覆盖该判定。
  const mgr = Object.create(RemoteControlManager.prototype) as {
    guardRemotePath: (m: 'read' | 'open', p: string) => Guard
  }
  return mgr.guardRemotePath(mode, target)
}

describe('allowedRoots 注册表', () => {
  beforeEach(() => clearSessionRoots())

  it('初始（无任何用户授权）为空', () => {
    expect(allowedRoots()).toEqual([])
  })

  it('grantRoot 后可读，且重复授权不产生重复项', () => {
    grantRoot(ROOT)
    grantRoot(ROOT)
    expect(allowedRoots()).toEqual([ROOT])
  })

  it('非字符串 / 空白输入被忽略（不把 undefined 变成允许根）', () => {
    grantRoot(undefined)
    grantRoot(null)
    grantRoot(123)
    grantRoot('   ')
    grantRoot('')
    expect(allowedRoots()).toEqual([])
  })

  it('revokeRoot / clearSessionRoots 能收回授权', () => {
    grantRoot(ROOT)
    revokeRoot(ROOT)
    expect(allowedRoots()).toEqual([])
    grantRoot(ROOT)
    clearSessionRoots()
    expect(allowedRoots()).toEqual([])
  })
})

describe('remote-control 云端路径裁决（S-04）', () => {
  beforeEach(() => clearSessionRoots())
  afterEach(() => clearSessionRoots())

  it('一个目录都没授权时一律拒绝（fail-closed，不退回「可读整机」）', () => {
    const r = guard('read', INSIDE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('未授权任何目录')
  })

  it('授权根目录之内的文件可读', () => {
    grantRoot(ROOT)
    const r = guard('read', INSIDE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path.endsWith(IS_WIN ? 'notes.txt' : 'notes.txt')).toBe(true)
  })

  it('根目录之外的文件被拒绝', () => {
    grantRoot(ROOT)
    const r = guard('read', OUTSIDE)
    expect(r.ok).toBe(false)
  })

  it('同名前缀目录（work-evil）不能借 work 授权通过', () => {
    grantRoot(ROOT)
    expect(guard('read', SIBLING).ok).toBe(false)
  })

  it('相对路径被拒绝', () => {
    grantRoot(ROOT)
    expect(guard('read', 'notes.txt').ok).toBe(false)
  })

  it('open 模式拒绝可执行文件（避免云端拉起本机程序）', () => {
    grantRoot(ROOT)
    expect(guard('open', EXE).ok).toBe(false)
    expect(guard('open', INSIDE).ok).toBe(true)
  })

  it('子目录文件可读（允许根是递归的）', () => {
    grantRoot(ROOT)
    expect(guard('read', INSIDE_SUB).ok).toBe(true)
  })
})
