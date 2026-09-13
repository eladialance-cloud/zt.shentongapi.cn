/**
 * launch-flags —— 启动开关收敛（安全审计 S-14 / S-15）。
 *
 * 背景：主进程在 app.whenReady 之前无条件追加了三个降低 Chromium 隔离强度的开关，
 * 并为了内嵌 n8n 登录全局关闭第三方 Cookie 与存储分区：
 *
 *   app.commandLine.appendSwitch('ignore-gpu-blocklist')      // 不影响沙箱，保留
 *   app.commandLine.appendSwitch('disable-gpu-sandbox')       // 关掉了渲染进程的 GPU 沙箱
 *   app.commandLine.appendSwitch('enable-unsafe-swiftshader') // 放开不安全的软件渲染后端
 *   app.commandLine.appendSwitch('disable-features',
 *     'ThirdPartyCookies,ThirdPartyStoragePartitioning')      // 全局降级，影响所有站点
 *
 * 其中 GPU 沙箱与 SwiftShader 只在「GPU 不兼容」环境（远程桌面 / 老驱动 / 虚拟机）才有必要；
 * 第三方 Cookie 降级是全局行为，只该作为登录应急开关存在。本模块把三者收敛为
 * 「默认最小降级 + 显式回退」，判定与接线分离（接线段见 electron/main/index.ts）。
 *
 * 回退方式：
 *   - 远程桌面/老显卡出现 WebGL 异常 → ST_GPU_COMPAT=1（关 GPU 沙箱 + SwiftShader）
 *   - 只需要软件渲染、想保留 GPU 沙箱 → ST_SOFTWARE_RENDER=1
 *   - 内嵌 n8n 登录转圈 → ST_N8N_COOKIE_COMPAT=1（全局降级第三方 Cookie，排查完请移除）
 *
 * 纯函数、零 electron 依赖：只做数据判定，调用方负责真正 appendSwitch。
 */

export type LaunchEnv = Record<string, string | undefined>

/** 一个待追加的命令行开关（value 缺省表示裸开关） */
export interface LaunchSwitch {
  name: string
  value?: string
}

export interface LaunchFlagInput {
  platform: NodeJS.Platform
  env: LaunchEnv
  /** 调用方自带的远程会话判定（企业 VDI 等）；缺省按平台规则从 env 推断 */
  isRemoteSession?: boolean
}

export interface LaunchFlags {
  /** 依次追加到 app.commandLine 的开关 */
  extraSwitches: LaunchSwitch[]
  /** app.commandLine.appendSwitch('disable-features', joined) 的取值；空数组 = 不追加 */
  disableFeatures: string[]
  /** 决策说明（进日志，便于支持排查「为什么 GPU 沙箱被关了」） */
  notes: string[]
}

/** 布尔环境变量：1/true/yes/on（大小写、首尾空白不敏感）；其余一律为假 */
export function isTruthyFlag(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

/** WebGL 被 Chromium 黑名单误拦时使用；只放宽 GPU 特性判定，不触碰任何沙箱 */
export const IGNORE_GPU_BLOCKLIST: LaunchSwitch = { name: 'ignore-gpu-blocklist' }
/** 关闭 GPU 进程沙箱：仅在 GPU 兼容档追加 */
export const DISABLE_GPU_SANDBOX: LaunchSwitch = { name: 'disable-gpu-sandbox' }
/** 允许 SwiftShader 软件渲染：仅在 GPU 兼容档或显式软件渲染时追加 */
export const ENABLE_UNSAFE_SWIFTSHADER: LaunchSwitch = { name: 'enable-unsafe-swiftshader' }

/** 全局降级的特性集（第三方 Cookie + 存储分区） */
export const THIRD_PARTY_COOKIE_FEATURES: readonly string[] = [
  'ThirdPartyCookies',
  'ThirdPartyStoragePartitioning',
]

export function resolveLaunchFlags(input: LaunchFlagInput): LaunchFlags {
  const env: LaunchEnv = input?.env ?? {}
  const platform: NodeJS.Platform = input?.platform ?? 'win32'
  const notes: string[] = []
  const extraSwitches: LaunchSwitch[] = [IGNORE_GPU_BLOCKLIST]

  // 远程会话判定：Windows 远程桌面会把 SESSIONNAME 置为 RDP-*。
  // macOS/Linux 没有等价可靠信号，刻意不臆测 SSH 会话（会误伤正常的本地开发），需要时由调用方注入。
  const remoteDetected =
    input?.isRemoteSession ??
    (platform === 'win32' && /^rdp-/i.test(String(env.SESSIONNAME ?? '').trim()))

  const gpuCompatReason = isTruthyFlag(env.ST_GPU_COMPAT)
    ? 'ST_GPU_COMPAT=1'
    : remoteDetected
      ? (input?.isRemoteSession === true ? '调用方判定为远程会话' : '检测到远程会话（SESSIONNAME=RDP-*）')
      : ''

  if (gpuCompatReason) {
    extraSwitches.push(DISABLE_GPU_SANDBOX, ENABLE_UNSAFE_SWIFTSHADER)
    notes.push(
      'GPU 兼容模式已启用（' + gpuCompatReason + '）：关闭 GPU 沙箱并使用 SwiftShader 软件渲染；' +
        'GPU 沙箱是渲染进程的隔离层，非必要请勿长期开启',
    )
  } else if (isTruthyFlag(env.ST_SOFTWARE_RENDER)) {
    extraSwitches.push(ENABLE_UNSAFE_SWIFTSHADER)
    notes.push('GPU：按 ST_SOFTWARE_RENDER=1 启用 SwiftShader 软件渲染（保留 GPU 沙箱）')
  } else {
    notes.push(
      'GPU：保留 ignore-gpu-blocklist（不影响沙箱），未关闭 GPU 沙箱、未启用 SwiftShader；' +
        '远程桌面/老驱动环境下 WebGL 异常时可设 ST_GPU_COMPAT=1 或 ST_SOFTWARE_RENDER=1',
    )
  }

  const disableFeatures: string[] = []
  if (isTruthyFlag(env.ST_N8N_COOKIE_COMPAT)) {
    disableFeatures.push(...THIRD_PARTY_COOKIE_FEATURES)
    notes.push(
      '第三方 Cookie / 存储分区已全局降级（ST_N8N_COOKIE_COMPAT=1）：这是全局降级，' +
        '仅用于内嵌 n8n 登录应急，排查完成请移除该变量',
    )
  } else {
    notes.push(
      '第三方 Cookie / 存储分区保持 Chromium 默认；内嵌 n8n 登录转圈时可设 ST_N8N_COOKIE_COMPAT=1 临时排查（会全局降级）',
    )
  }

  return { extraSwitches, disableFeatures, notes }
}
