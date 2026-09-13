// 远程窗口加固策略回归测试（安全审计 S-11 / S-12 残口）
// 被测对象：security.ts 新增的远程窗口导航/新窗口判定 + hardenRemoteWindow 接线。
// security.ts 保持零 electron 运行时依赖（仅 type-only import），故可在 jest 直跑。
import {
  hardenRemoteWindow,
  isAllowedRemoteNavigation,
  isAllowedRemoteNewWindow,
} from '../../electron/main/security'

describe('isAllowedRemoteNavigation', () => {
  it('允许任意 https 主机（登录链路要跳第三方 OAuth 域）', () => {
    expect(isAllowedRemoteNavigation('https://creator.douyin.com/')).toBe(true)
    expect(isAllowedRemoteNavigation('https://open.weixin.qq.com/connect/qrconnect?x=1')).toBe(true)
    expect(isAllowedRemoteNavigation('https://mp.weixin.qq.com/cgi-bin/login')).toBe(true)
  })

  it('拒绝一切非 http(s) 协议（S-11 核心）', () => {
    const bad = [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'ms-msdt:/id',
      'search-ms:query=x',
      'about:blank',
      'data:text/html,<script>alert(1)</script>',
      'blob:https://a.com/1234',
      'vscode://x',
    ]
    for (const u of bad) expect(isAllowedRemoteNavigation(u)).toBe(false)
  })

  it('明文 http 只放行本机地址', () => {
    expect(isAllowedRemoteNavigation('http://127.0.0.1:5678/workflow')).toBe(true)
    expect(isAllowedRemoteNavigation('http://localhost:3000/x')).toBe(true)
    expect(isAllowedRemoteNavigation('http://evil.com/x')).toBe(false)
    expect(isAllowedRemoteNavigation('http://192.168.1.10/')).toBe(false)
  })

  it('给了主机白名单时按白名单收口（含子域）', () => {
    const allow = ['bilibili.com']
    expect(isAllowedRemoteNavigation('https://bilibili.com/x', allow)).toBe(true)
    expect(isAllowedRemoteNavigation('https://member.bilibili.com/x', allow)).toBe(true)
    expect(isAllowedRemoteNavigation('https://evil.com/x', allow)).toBe(false)
    expect(isAllowedRemoteNavigation('https://bilibili.com.evil.com/x', allow)).toBe(false)
    expect(isAllowedRemoteNavigation('https://notbilibili.com/x', allow)).toBe(false)
  })

  it('空值 / 非字符串 / 不可解析一律拒绝（fail-closed）', () => {
    for (const u of ['', null, undefined, 42, {}, [], 'http://']) {
      expect(isAllowedRemoteNavigation(u as unknown)).toBe(false)
    }
  })
})

describe('isAllowedRemoteNewWindow', () => {
  it('与导航判定同规则：https 放行、非 http(s) 拒绝', () => {
    expect(isAllowedRemoteNewWindow('https://open.weixin.qq.com/x')).toBe(true)
    expect(isAllowedRemoteNewWindow('file:///C:/evil.exe')).toBe(false)
    expect(isAllowedRemoteNewWindow('javascript:alert(1)')).toBe(false)
    expect(isAllowedRemoteNewWindow('http://evil.com')).toBe(false)
  })
})

interface FakeContents {
  handlers: Record<string, (event: { preventDefault: () => void }, url: string) => void>
  windowOpen: ((details: { url: string }) => { action: string; overrideBrowserWindowOptions?: unknown }) | null
  permission: ((wc: unknown, permission: string, cb: (granted: boolean) => void) => void) | null
}

function makeFakeContents(): { contents: unknown; fake: FakeContents } {
  const fake: FakeContents = { handlers: {}, windowOpen: null, permission: null }
  const contents = {
    on(event: string, cb: (event: { preventDefault: () => void }, url: string) => void) {
      fake.handlers[event] = cb
      return contents
    },
    setWindowOpenHandler(fn: FakeContents['windowOpen']) {
      fake.windowOpen = fn
      return contents
    },
    session: { setPermissionRequestHandler(fn: FakeContents['permission']) { fake.permission = fn } },
  }
  return { contents, fake }
}

describe('hardenRemoteWindow', () => {
  it('注册三件套：新窗口、导航、权限', () => {
    const { contents, fake } = makeFakeContents()
    hardenRemoteWindow(contents as never, { openExternal: () => undefined })
    expect(typeof fake.windowOpen).toBe('function')
    expect(typeof fake.handlers['will-navigate']).toBe('function')
    expect(typeof fake.handlers['will-redirect']).toBe('function')
    expect(typeof fake.permission).toBe('function')
  })

  it('新窗口：https 允许但强制安全偏好；file:/自定义协议拒绝且不交给系统', () => {
    const opened: string[] = []
    const { contents, fake } = makeFakeContents()
    hardenRemoteWindow(contents as never, { openExternal: (u) => opened.push(u) })
    const allow = fake.windowOpen!({ url: 'https://open.weixin.qq.com/x' })
    expect(allow.action).toBe('allow')
    const override = allow.overrideBrowserWindowOptions as { webPreferences?: Record<string, unknown> } | undefined
    expect(override?.webPreferences?.sandbox).toBe(true)
    expect(override?.webPreferences?.contextIsolation).toBe(true)
    expect(override?.webPreferences?.nodeIntegration).toBe(false)

    expect(fake.windowOpen!({ url: 'file:///C:/evil.exe' }).action).toBe('deny')
    expect(fake.windowOpen!({ url: 'javascript:alert(1)' }).action).toBe('deny')
    expect(opened).toEqual([])

    expect(fake.windowOpen!({ url: 'mailto:a@b.com' }).action).toBe('deny')
    expect(opened).toEqual(['mailto:a@b.com'])
  })

  it('导航：https 放行、file: 与自定义协议 preventDefault', () => {
    const { contents, fake } = makeFakeContents()
    hardenRemoteWindow(contents as never, { openExternal: () => undefined })
    let prevented = false
    const evt = { preventDefault: () => { prevented = true } }
    fake.handlers['will-navigate'](evt, 'https://creator.douyin.com/creator-micro/home')
    expect(prevented).toBe(false)
    prevented = false
    fake.handlers['will-navigate'](evt, 'file:///C:/evil.exe')
    expect(prevented).toBe(true)
    prevented = false
    fake.handlers['will-redirect'](evt, 'ms-msdt:/id')
    expect(prevented).toBe(true)
  })

  it('权限请求一律拒绝（相机/麦克风/通知等）', () => {
    const { contents, fake } = makeFakeContents()
    hardenRemoteWindow(contents as never, { openExternal: () => undefined })
    const granted: boolean[] = []
    fake.permission!(null, 'media', (ok: boolean) => granted.push(ok))
    fake.permission!(null, 'notifications', (ok: boolean) => granted.push(ok))
    fake.permission!(null, 'geolocation', (ok: boolean) => granted.push(ok))
    expect(granted).toEqual([false, false, false])
  })
})
