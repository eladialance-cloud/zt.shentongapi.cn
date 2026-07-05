// 客户端本地服务管理 - 渲染进程类型定义（Task 16）
// 直接复用主进程共享类型（@shared/types 已在 tsconfig.web.json 中声明）

export type {
  ServiceName,
  ServiceStatus,
  ServiceInfo,
  ServiceEnvCheck,
  ServiceStatusChangedPayload,
  ServiceErrorPayload
} from '@shared/types'
