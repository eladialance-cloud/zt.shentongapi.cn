import type { ResolvedRuntime } from '../../shared/types'
import type { ResolvedModelDefaults } from '../model-defaults'

/**
 * 行实现白名单：patch 是声明，env/preStart/postInstall/configSync/launch 的“实现”
 * 只能在底座侧白名单注册（行 key 索引），patch 文件禁止带任意 JS/代码（安全边界）。
 * Task 5 将 service-manager.ts 中的专属实现搬进本文件。
 */
export interface ServiceHookCtx {
  rowId: string
  runtimeKey: string
  /** spawn 前解析到的运行时（未安装时为 null/undefined） */
  resolved?: ResolvedRuntime | null
  /** configSync 触发事件（对应行 restartOn 的触发源） */
  event?: 'proxyKey' | 'modelDefaults'
  /** llm-proxy 静态 Key（setLlmProxyKey 注入） */
  proxyKey?: string
  /** modelDefaults 同步结果（event=modelDefaults 时注入） */
  modelSync?: ResolvedModelDefaults | null
  /** 平台启用模型列表（llm-proxy /v1/models 快照，event=modelDefaults 时注入） */
  platformModels?: Array<{ id: string; type?: string; name?: string; supportsVision?: boolean }> | null
}

export type EnvBuilder = (ctx: ServiceHookCtx) => NodeJS.ProcessEnv
export type PreStartHandler = (ctx: ServiceHookCtx) => Promise<void>
export type PostInstallHandler = (ctx: ServiceHookCtx) => Promise<boolean>
export type ConfigSyncHandler = (ctx: ServiceHookCtx) => Promise<boolean>

export const ENV_BUILDERS: Record<string, EnvBuilder> = {}
export const PRE_START_HANDLERS: Record<string, PreStartHandler> = {}
export const POST_INSTALL_HANDLERS: Record<string, PostInstallHandler> = {}
export const CONFIG_SYNC_HANDLERS: Record<string, ConfigSyncHandler> = {}

export function hasHookKey(kind: 'env' | 'preStart' | 'postInstall' | 'configSync', key: string | undefined): boolean {
  if (!key) return false
  const table =
    kind === 'env' ? ENV_BUILDERS
      : kind === 'preStart' ? PRE_START_HANDLERS
        : kind === 'postInstall' ? POST_INSTALL_HANDLERS
          : CONFIG_SYNC_HANDLERS
  return Object.prototype.hasOwnProperty.call(table, key)
}
