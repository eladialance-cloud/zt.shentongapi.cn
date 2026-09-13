// path-policy 策略层测试（安全审计 S-03 / S-21 / S-22）
// 纯函数，无 electron 依赖，可在 jest 直接运行。
import {
  evaluateOpenPath,
  evaluateReadPath,
  isInsideRoot,
  isUncPath,
} from '../../electron/main/policy/path-policy'

const ROOT = 'C:\\work\\ctx'

describe('isUncPath', () => {
  it('识别 UNC 与协议相对路径', () => {
    expect(isUncPath('\\\\evil\\share\\x.lnk')).toBe(true)
    expect(isUncPath('//evil/share/x')).toBe(true)
    expect(isUncPath('C:\\work\\a.md')).toBe(false)
    expect(isUncPath('')).toBe(false)
  })
})

describe('isInsideRoot', () => {
  it('根内为真、根外为假、前缀相似但不是子目录为假', () => {
    expect(isInsideRoot('C:\\work\\ctx\\a.md', ROOT, 'win32')).toBe(true)
    expect(isInsideRoot('C:\\work\\other\\a.md', ROOT, 'win32')).toBe(false)
    expect(isInsideRoot('C:\\work\\ctx-evil\\a.md', ROOT, 'win32')).toBe(false)
  })
  it('Windows 大小写不敏感，posix 大小写敏感', () => {
    expect(isInsideRoot('c:\\WORK\\CTX\\a.md', ROOT, 'win32')).toBe(true)
    expect(isInsideRoot('/home/u/a.md', '/home/u', 'linux')).toBe(true)
    expect(isInsideRoot('/HOME/u/a.md', '/home/u', 'linux')).toBe(false)
  })
  it('根为空时一律为假（fail-closed）', () => {
    expect(isInsideRoot('C:\\work\\ctx\\a.md', '', 'win32')).toBe(false)
  })
})

describe('evaluateOpenPath', () => {
  it('拒绝空值与非字符串', () => {
    expect(evaluateOpenPath('', [ROOT])).toEqual({ ok: false, reason: 'EMPTY' })
    expect(evaluateOpenPath('   ', [ROOT])).toEqual({ ok: false, reason: 'EMPTY' })
    expect(evaluateOpenPath(123, [ROOT])).toEqual({ ok: false, reason: 'EMPTY' })
    expect(evaluateOpenPath(undefined, [ROOT])).toEqual({ ok: false, reason: 'EMPTY' })
  })
  it('拒绝 UNC（含 SMB 外带路径）', () => {
    expect(evaluateOpenPath('\\\\evil\\s\\x.md', [ROOT])).toEqual({ ok: false, reason: 'UNC' })
  })
  it('拒绝相对路径', () => {
    expect(evaluateOpenPath('docs\\a.md', [ROOT])).toEqual({ ok: false, reason: 'NOT_ABSOLUTE' })
  })
  it('拒绝可执行与快捷方式扩展名（S-03 核心）', () => {
    const blocked = [
      'a.exe', 'a.bat', 'a.cmd', 'a.com', 'a.scr', 'a.pif', 'a.msi', 'a.msp', 'a.dll', 'a.sys',
      'a.vbs', 'a.vbe', 'a.wsf', 'a.wsh', 'a.ps1', 'a.psm1', 'a.reg', 'a.jar', 'a.lnk', 'a.url',
      'a.hta', 'a.cpl', 'a.jse', 'a.js', 'a.mjs', 'a.cjs', 'a.sh', 'a.bash',
    ]
    for (const f of blocked) {
      expect(evaluateOpenPath('C:\\work\\ctx\\' + f, [ROOT])).toEqual({ ok: false, reason: 'EXECUTABLE' })
    }
  })
  it('拒绝根外路径', () => {
    expect(evaluateOpenPath('C:\\Windows\\win.ini', [ROOT])).toEqual({ ok: false, reason: 'OUTSIDE_ROOTS' })
  })
  it('根目录未配置时一律拒绝（fail-closed）', () => {
    expect(evaluateOpenPath('C:\\work\\ctx\\a.md', [])).toEqual({ ok: false, reason: 'OUTSIDE_ROOTS' })
  })
  it('用 .. 逃逸根目录仍被拒（判定基于归一化结果）', () => {
    expect(evaluateOpenPath('C:\\work\\ctx\\..\\..\\Windows\\win.ini', [ROOT])).toEqual({
      ok: false,
      reason: 'OUTSIDE_ROOTS',
    })
  })
  it('放行根内文本文件，并返回折叠后的路径', () => {
    expect(evaluateOpenPath('C:\\work\\ctx\\a.md', [ROOT])).toEqual({
      ok: true,
      path: 'C:\\work\\ctx\\a.md',
    })
  })
  it('放行根内 . 与 .. 组合后的合法路径时输出已折叠路径', () => {
    expect(evaluateOpenPath('C:\\work\\ctx\\.\\sub\\..\\a.md', [ROOT])).toEqual({
      ok: true,
      path: 'C:\\work\\ctx\\a.md',
    })
  })
  it('非可执行类型的普通文件仍可打开（本策略只拦可执行/快捷方式）', () => {
    expect(evaluateOpenPath('C:\\work\\ctx\\a.zip', [ROOT]).ok).toBe(true)
    expect(evaluateOpenPath('C:\\work\\ctx\\report.pdf', [ROOT]).ok).toBe(true)
  })
})

describe('evaluateReadPath', () => {
  it('根内放行、根外拒绝、UNC 拒绝（S-22）', () => {
    expect(evaluateReadPath('C:\\work\\ctx\\auth.json', [ROOT])).toEqual({
      ok: true,
      path: 'C:\\work\\ctx\\auth.json',
    })
    expect(evaluateReadPath('C:\\Users\\Administrator\\.ssh\\id_rsa', [ROOT])).toEqual({
      ok: false,
      reason: 'OUTSIDE_ROOTS',
    })
    expect(evaluateReadPath('\\\\evil\\s\\a.txt', [ROOT])).toEqual({ ok: false, reason: 'UNC' })
  })
  it('读取不限制扩展名（只限根）', () => {
    expect(evaluateReadPath('C:\\work\\ctx\\a.exe', [ROOT]).ok).toBe(true)
  })
  it('支持多根目录', () => {
    const roots = ['C:\\work\\ctx', 'D:\\shared']
    expect(evaluateReadPath('D:\\shared\\x.md', roots).ok).toBe(true)
    expect(evaluateReadPath('E:\\other\\x.md', roots).ok).toBe(false)
  })
})
