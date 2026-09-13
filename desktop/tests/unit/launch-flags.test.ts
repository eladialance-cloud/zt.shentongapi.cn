/**
 * launch-flags 单测（安全审计 S-14 / S-15）。
 *
 * 背景：主进程在 app.whenReady 之前无条件追加了三个「降低沙箱强度」的开关，
 * 并且为了内嵌 n8n 登录全局关闭了第三方 Cookie 与存储分区：
 *   app.commandLine.appendSwitch('disable-gpu-sandbox')
 *   app.commandLine.appendSwitch('enable-unsafe-swiftshader')
 *   app.commandLine.appendSwitch('disable-features', 'ThirdPartyCookies,ThirdPartyStoragePartitioning')
 * 前两者本该只在「GPU 不兼容」环境（远程桌面 / 老驱动 / 虚拟机）才需要，第三项是全局降级。
 * 本模块把这些开关收敛成「默认安全 + 显式回退」：
 *   - 默认：保留 ignore-gpu-blocklist（不影响沙箱），不关 GPU 沙箱，不全局降级 Cookie；
 *   - ST_GPU_COMPAT=1 或 Windows 远程桌面会话 → 追加 GPU 兼容项；
 *   - ST_SOFTWARE_RENDER=1 → 只加软件渲染，仍保留 GPU 沙箱；
 *   - ST_N8N_COOKIE_COMPAT=1 → 才全局降级第三方 Cookie（登录应急开关）。
 */
import { describe, it, expect, afterEach } from '@jest/globals'
import { isTruthyFlag, resolveLaunchFlags } from '../../electron/shared/launch-flags'

const win = (env: Record<string, string | undefined> = {}, isRemoteSession?: boolean) =>
  resolveLaunchFlags({ platform: 'win32', env, isRemoteSession })

const names = (flags: ReturnType<typeof resolveLaunchFlags>) => flags.extraSwitches.map((s) => s.name)

describe('resolveLaunchFlags：默认档（最小降级）', () => {
  it('默认保留 ignore-gpu-blocklist，但不关 GPU 沙箱、不开 SwiftShader', () => {
    const flags = win({})
    expect(names(flags)).toEqual(['ignore-gpu-blocklist'])
  })

  it('默认不全局关闭第三方 Cookie / 存储分区', () => {
    expect(win({}).disableFeatures).toEqual([])
  })

  it('默认 notes 非空（说明生效档位，便于支持排查）', () => {
    const flags = win({})
    expect(flags.notes.length).toBeGreaterThan(0)
    expect(flags.notes.join()).toContain('GPU')
  })

  it('只读传入的 env，不读 process.env（可用空 env 隔离）', () => {
    const saved = process.env.ST_N8N_COOKIE_COMPAT
    process.env.ST_N8N_COOKIE_COMPAT = '1'
    try {
      expect(win({}).disableFeatures).toEqual([])
    } finally {
      if (saved === undefined) delete process.env.ST_N8N_COOKIE_COMPAT
      else process.env.ST_N8N_COOKIE_COMPAT = saved
    }
  })

  it('纯函数：同样输入两次调用结果一致', () => {
    expect(win({ SESSIONNAME: 'Console' })).toEqual(win({ SESSIONNAME: 'Console' }))
  })
})

describe('resolveLaunchFlags：GPU 兼容档（S-14）', () => {
  it('ST_GPU_COMPAT=1 → 关 GPU 沙箱 + SwiftShader，并写 note', () => {
    const flags = win({ ST_GPU_COMPAT: '1' })
    expect(names(flags)).toEqual(['ignore-gpu-blocklist', 'disable-gpu-sandbox', 'enable-unsafe-swiftshader'])
    expect(flags.notes.join()).toContain('兼容')
  })

  it('Windows 远程桌面会话（SESSIONNAME=RDP-*）自动进入兼容档', () => {
    const flags = win({ SESSIONNAME: 'RDP-Tcp#12' })
    expect(names(flags)).toContain('disable-gpu-sandbox')
    expect(flags.notes.join()).toContain('远程会话')
  })

  it('远程会话判定限定 Windows：macOS 上 SESSIONNAME 不触发（也不读 SSH 变量臆测）', () => {
    const mac = resolveLaunchFlags({ platform: 'darwin', env: { SESSIONNAME: 'RDP-Tcp#12' } })
    expect(names(mac)).not.toContain('disable-gpu-sandbox')
  })

  it('isRemoteSession 可显式覆盖（供调用方自带判定 / 测试注入）', () => {
    const flags = resolveLaunchFlags({ platform: 'linux', env: {}, isRemoteSession: true })
    expect(names(flags)).toContain('disable-gpu-sandbox')
    expect(flags.notes.join()).toContain('远程会话')
  })

  it('ST_SOFTWARE_RENDER=1 → 只加 SwiftShader，保留 GPU 沙箱', () => {
    const flags = win({ ST_SOFTWARE_RENDER: '1' })
    expect(names(flags)).toEqual(['ignore-gpu-blocklist', 'enable-unsafe-swiftshader'])
    expect(names(flags)).not.toContain('disable-gpu-sandbox')
  })

  it('两个开关同时给：开关不重复', () => {
    const flags = win({ ST_GPU_COMPAT: '1', ST_SOFTWARE_RENDER: '1' })
    const list = names(flags)
    expect(new Set(list).size).toBe(list.length)
    expect(list.filter((n) => n === 'enable-unsafe-swiftshader')).toHaveLength(1)
  })

  it('其它取值（0 / false / 空）不触发兼容档', () => {
    for (const v of ['0', 'false', 'no', '', ' ']) {
      expect(names(win({ ST_GPU_COMPAT: v }))).toEqual(['ignore-gpu-blocklist'])
    }
  })
})

describe('resolveLaunchFlags：第三方 Cookie 降级开关（S-15）', () => {
  it('默认不降级，且 note 给出排查指引', () => {
    const flags = win({})
    expect(flags.disableFeatures).toEqual([])
    expect(flags.notes.join()).toContain('ST_N8N_COOKIE_COMPAT')
  })

  it('ST_N8N_COOKIE_COMPAT=1 → 追加第三方 Cookie 与存储分区降级，并提示是全局降级', () => {
    const flags = win({ ST_N8N_COOKIE_COMPAT: '1' })
    expect(flags.disableFeatures).toEqual(['ThirdPartyCookies', 'ThirdPartyStoragePartitioning'])
    expect(flags.notes.join()).toContain('全局')
  })

  it('宽松布尔：true / YES / on 均生效；0 / off 不生效', () => {
    for (const v of ['true', 'YES', 'on', ' 1 ']) {
      expect(win({ ST_N8N_COOKIE_COMPAT: v }).disableFeatures).toHaveLength(2)
    }
    for (const v of ['0', 'off', 'false', '']) {
      expect(win({ ST_N8N_COOKIE_COMPAT: v }).disableFeatures).toEqual([])
    }
  })
})

describe('isTruthyFlag', () => {
  it('识别 1/true/yes/on（大小写与空白不敏感），其余为假', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' On ']) expect(isTruthyFlag(v)).toBe(true)
    for (const v of ['0', 'false', 'no', 'off', '', '  ', undefined, null, 1, true]) {
      expect(isTruthyFlag(v)).toBe(false)
    }
  })
})
