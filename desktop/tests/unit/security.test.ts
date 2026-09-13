// security.ts 策略层回归测试（安全审计 S-12）
// security.ts 为纯函数 + 无 electron 运行时依赖（仅 type-only import），可在 jest 直接运行。
// 注意：本文件是**特征化/回归测试** —— 被测策略在本次修复前已存在，
// 本次修复的真实改动是把它接到主窗口 setWindowOpenHandler（见 windows/main-window.ts），
// 该接线无法在无 electron mock 的情况下单测，故用类型检查 + 本测试锁定契约。
import { pathToFileURL } from 'node:url'
import {
  hardenAttachedWebContents,
  hardenWebviewPreferences,
  isAllowedAppNavigationUrl,
  isAllowedExternalUrl,
  isAllowedWebviewUrl,
} from '../../electron/main/security'

describe('isAllowedExternalUrl', () => {
  it('只放行 https / http / mailto', () => {
    expect(isAllowedExternalUrl('https://a.com/x')).toBe(true)
    expect(isAllowedExternalUrl('http://a.com')).toBe(true)
    expect(isAllowedExternalUrl('mailto:a@b.com')).toBe(true)
  })
  it('拒绝 file / javascript / 自定义协议 / 空值（S-12 核心）', () => {
    const bad = [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'ms-msdt:/id',
      'search-ms:query=x',
      'vscode://x',
      '',
      undefined,
      null,
      42,
    ]
    for (const u of bad) {
      expect(isAllowedExternalUrl(u as unknown)).toBe(false)
    }
  })
})

describe('isAllowedWebviewUrl', () => {
  it('默认只放行本地高位端口 http', () => {
    expect(isAllowedWebviewUrl('http://127.0.0.1:5678/x')).toBe(true)
    expect(isAllowedWebviewUrl('http://localhost:3000/x')).toBe(true)
    expect(isAllowedWebviewUrl('http://evil.com')).toBe(false)
    expect(isAllowedWebviewUrl('https://evil.com')).toBe(false)
  })
  it('拒绝本地低端口与非法协议', () => {
    expect(isAllowedWebviewUrl('http://127.0.0.1:80/x')).toBe(false)
    expect(isAllowedWebviewUrl('file:///etc/passwd', true)).toBe(false)
  })
  it('allowHttps 为真时放行 https', () => {
    expect(isAllowedWebviewUrl('https://a.com', true)).toBe(true)
  })
  it('about:blank 特例放行', () => {
    expect(isAllowedWebviewUrl('about:blank')).toBe(true)
  })
})

describe('isAllowedAppNavigationUrl', () => {
  const html = '/app/dist/renderer/index.html'
  it('放行应用自身 index.html（含 hash 与 query）', () => {
    const base = pathToFileURL(html).href
    expect(isAllowedAppNavigationUrl(base, html)).toBe(true)
    expect(isAllowedAppNavigationUrl(base + '#/chat', html)).toBe(true)
    expect(isAllowedAppNavigationUrl(base + '?a=1', html)).toBe(true)
  })
  it('拒绝外部站点与其它 file 路径', () => {
    expect(isAllowedAppNavigationUrl('https://evil.com', html)).toBe(false)
    expect(isAllowedAppNavigationUrl('file:///etc/passwd', html)).toBe(false)
    expect(isAllowedAppNavigationUrl('', html)).toBe(false)
  })
  it('dev server 模式下按 origin 放行', () => {
    const dev = 'http://localhost:5173'
    expect(isAllowedAppNavigationUrl('http://localhost:5173/x', html, dev)).toBe(true)
    expect(isAllowedAppNavigationUrl('http://localhost:9999/x', html, dev)).toBe(false)
  })
})

describe('hardenWebviewPreferences', () => {
  it('强制安全偏好并删除 preload / preloadURL', () => {
    const prefs = {
      preload: '/tmp/evil.js',
      preloadURL: 'file:///tmp/evil.js',
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    }
    hardenWebviewPreferences(prefs as unknown as Parameters<typeof hardenWebviewPreferences>[0])
    expect('preload' in prefs).toBe(false)
    expect('preloadURL' in prefs).toBe(false)
    expect(prefs.nodeIntegration).toBe(false)
    expect(prefs.contextIsolation).toBe(true)
    expect(prefs.sandbox).toBe(true)
    expect(prefs.webSecurity).toBe(true)
    expect(prefs.allowRunningInsecureContent).toBe(false)
  })
})

describe('hardenAttachedWebContents', () => {
  function makeWebContents() {
    const handlers: Record<string, (event: { preventDefault: () => void }, url: string) => void> = {}
    const wc = {
      setWindowOpenHandler: jest.fn(),
      on: jest.fn((event: string, cb: (event: { preventDefault: () => void }, url: string) => void) => {
        handlers[event] = cb;
      }),
    }
    return { wc, handlers }
  }

  it('新窗口一律拒绝', () => {
    const { wc } = makeWebContents()
    hardenAttachedWebContents(wc as unknown as Parameters<typeof hardenAttachedWebContents>[0])
    expect(wc.setWindowOpenHandler).toHaveBeenCalledTimes(1)
    const handler = wc.setWindowOpenHandler.mock.calls[0][0] as () => unknown
    expect(handler()).toEqual({ action: 'deny' })
  })

  it('非法导航与重定向调用 preventDefault，白名单 URL 放行', () => {
    const { wc, handlers } = makeWebContents()
    hardenAttachedWebContents(wc as unknown as Parameters<typeof hardenAttachedWebContents>[0])
    expect(typeof handlers['will-navigate']).toBe('function')
    expect(typeof handlers['will-redirect']).toBe('function')

    const blocked = { preventDefault: jest.fn() }
    handlers['will-navigate'](blocked, 'http://evil.com/x')
    expect(blocked.preventDefault).toHaveBeenCalledTimes(1)

    const allowed = { preventDefault: jest.fn() }
    handlers['will-navigate'](allowed, 'http://127.0.0.1:5678/x')
    expect(allowed.preventDefault).not.toHaveBeenCalled()

    const redirectBlocked = { preventDefault: jest.fn() }
    handlers['will-redirect'](redirectBlocked, 'https://evil.com/x')
    expect(redirectBlocked.preventDefault).toHaveBeenCalledTimes(1)
  })
})
