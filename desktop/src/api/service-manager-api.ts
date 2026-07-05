// 客户端本地服务管理 API（Task 16）
// 通过 IPC 调用主进程（非 HTTP），封装 window.electronAPI.service
//
// 端点契约（IPC channel）：
//   service:list     获取所有服务完整信息
//   service:status   获取单个服务完整信息
//   service:start    启动服务
//   service:stop     停止服务
//   service:restart  重启服务
//   service:status-changed (push) 状态变更事件
//   service:error          (push) 服务错误事件

import type {
  ServiceName,
  ServiceInfo,
  ServiceStatusChangedPayload,
  ServiceErrorPayload
} from '@/types/service-manager'

/** electronAPI 是否可用（preload 未注入时降级） */
function getService() {
  const svc = window.electronAPI?.service
  if (!svc) {
    throw new Error('electronAPI.service 不可用（preload 未注入）')
  }
  return svc
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

export default {
  listServices,
  getServiceStatus,
  startService,
  stopService,
  restartService,
  onServiceStatusChanged,
  onServiceError
}
