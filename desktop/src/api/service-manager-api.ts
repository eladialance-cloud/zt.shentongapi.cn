// 客户端本地服务管理 API（Task 16）
// 通过 IPC 调用主进程（非 HTTP），封装 window.electronAPI.service
//
// 端点契约（IPC channel）：
//   service:list              获取所有服务完整信息
//   service:status            获取单个服务完整信息
//   service:start             启动服务
//   service:stop              停止服务
//   service:restart           重启服务
//   service:install           安装/修复服务运行时
//   service:install-progress  (push) 安装进度事件
//   service:status-changed    (push) 状态变更事件
//   service:error             (push) 服务错误事件

import type {
  ServiceName,
  ServiceInfo,
  ServiceStatusChangedPayload,
  ServiceErrorPayload,
  RuntimeDirInfo,
  ChooseRuntimeDirResult
} from '@/types/service-manager'
import type { InstallProgressPayload, ModuleInfo, ModuleDataDisposition, ModuleUninstallResult, ModuleInstallResult } from '@shared/types'

/** electronAPI 是否可用（preload 未注入时降级） */
function getService() {
  const svc = window.electronAPI?.service
  if (!svc) {
    throw new Error('electronAPI.service 不可用（preload 未注入）')
  }
  return svc
}

/** electronAPI.modules 是否可用 */
function getModulesApi() {
  const m = window.electronAPI?.modules
  if (!m) {
    throw new Error('electronAPI.modules 不可用（preload 未注入）')
  }
  return m
}

/** 获取所有服务完整信息 */
export async function listServices(): Promise<ServiceInfo[]> {
  return (await getService().list()) as ServiceInfo[]
}

/** 获取单个服务完整信息 */
export async function getServiceStatus(name: ServiceName): Promise<ServiceInfo> {
  return (await getService().status(name)) as ServiceInfo
}

/** 启动服务 */
export async function startService(name: ServiceName): Promise<boolean> {
  return getService().start(name)
}

/** 停止服务 */
export async function stopService(name: ServiceName): Promise<boolean> {
  return getService().stop(name)
}

/** 重启服务 */
export async function restartService(name: ServiceName): Promise<boolean> {
  return getService().restart(name)
}

/** 监听服务状态变更，返回取消监听函数 */
export function onServiceStatusChanged(
  callback: (payload: ServiceStatusChangedPayload) => void
): () => void {
  try {
    return getService().onStatusChanged(callback)
  } catch {
    return () => {}
  }
}

/** 安装/修复服务（下载运行时并启动） */
export async function installService(name: ServiceName): Promise<boolean> {
  return getService().install(name)
}

/** 获取当前运行时下载安装位置（路径 + 磁盘空间） */
export async function getRuntimeDir(): Promise<RuntimeDirInfo> {
  return (await getService().getRuntimeDir()) as RuntimeDirInfo
}

/** 弹窗选择新的下载安装位置（方案 B：不迁移已下载内容） */
export async function chooseRuntimeDir(): Promise<ChooseRuntimeDirResult> {
  return (await getService().chooseRuntimeDir()) as ChooseRuntimeDirResult
}

/** 监听安装进度推送，返回取消监听函数 */
export function onInstallProgress(
  callback: (payload: InstallProgressPayload) => void
): () => void {
  try {
    return getService().onInstallProgress(callback)
  } catch {
    return () => {}
  }
}

/** 监听服务错误事件，返回取消监听函数 */
export function onServiceError(
  callback: (payload: ServiceErrorPayload) => void
): () => void {
  try {
    return getService().onError(callback)
  } catch {
    return () => {}
  }
}

/** 列出服务型模块（含停用） */
export async function listModules(): Promise<ModuleInfo[]> {
  return (await getModulesApi().list()) as ModuleInfo[]
}

/** 启用/停用模块（持久化 + 重载服务行 + 广播） */
export async function setModuleEnabled(
  id: string,
  enabled: boolean,
): Promise<{ ok: boolean; added: string[]; removed: string[]; error?: string }> {
  return getModulesApi().setEnabled(id, enabled)
}

/** 手动重载服务行 */
export async function reloadModules(): Promise<{ ok: boolean; added: string[]; removed: string[]; error?: string }> {
  return getModulesApi().reload()
}

/** 装配审计 */
export async function dumpModules(): Promise<{ rows: ServiceInfo[]; modules: ModuleInfo[] }> {
  return getModulesApi().dump()
}

/** 从来源安装模块（skill/agent 装到 Hermes home；service 走 patch 流程） */
export async function installModuleFromSource(
  source: string,
  opts?: { expectedSha256?: string; signature?: string; publicKey?: string; allowUnverified?: boolean },
): Promise<ModuleInstallResult> {
  return getModulesApi().installFromSource(source, opts)
}
export async function uninstallModule(
  id: string,
  disposition: ModuleDataDisposition,
): Promise<ModuleUninstallResult> {
  return getModulesApi().uninstall(id, disposition)
}

/** 监听模块变更广播，返回取消监听函数 */
export function onModulesChanged(
  callback: (payload: { modules: ModuleInfo[] }) => void,
): () => void {
  try {
    return getModulesApi().onChanged(callback)
  } catch {
    return () => {}
  }
}

export default {
  listServices,
  getServiceStatus,
  startService,
  stopService,
  restartService,
  installService,
  onServiceStatusChanged,
  onServiceError,
  onInstallProgress,
  listModules,
  setModuleEnabled,
  reloadModules,
  dumpModules,
  onModulesChanged,
  installModuleFromSource,
}