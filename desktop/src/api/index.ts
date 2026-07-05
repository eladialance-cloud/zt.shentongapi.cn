// API 通信层 - 统一导出
//
// 模块组成：
// - httpClient:   HTTP 客户端（axios + HMAC 签名 + 401 刷新）
// - wsClient:     WebSocket 客户端（socket.io + 心跳 + 重连）
// - syncService:  数据同步服务（上行/下行同步）
// - offlineQueue: 离线调用队列（网络状态管理）

export { httpClient } from './http-client'
export { wsClient } from './ws-client'
export { syncService } from './sync-service'
export { offlineQueue } from './offline-queue'

export type { SyncServiceEvent } from './sync-service'
export type { WsPushEvent, WsClientEvent } from './ws-client'
