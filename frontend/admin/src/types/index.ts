// 管理端类型定义统一导出
//
// 注意：admin-finance.ts 与 admin-user.ts 均独立定义了 RechargeOrderStatus，
// 且多个模块通过 `export type { AdminPaginatedResult }` 再导出 admin-auth 的同名类型。
// 直接 `export *` 会产生命名冲突，因此对 admin-user 采用显式再导出，
// 复用 admin-finance 的 RechargeOrderStatus 与 admin-auth 的 AdminPaginatedResult。

export * from './admin-auth'
export * from './admin-agent'
export * from './admin-api-key-pool'
export * from './admin-audit'
export * from './admin-finance'
export * from './admin-model'
export * from './admin-plugin'
export * from './admin-stats'
export * from './admin-system'
export type {
  UserStatus,
  AdminUserItem,
  AdminUserQuery,
  BanUserDto,
  UserLevel,
  UpdateUserLevelDto,
  AdminCreditsAccount,
  CreditsAdjustDto,
  AdminCreditTransaction,
  RechargeOrder,
  RechargeOrderQuery,
  RefundDto,
  AdminDevice,
  AdminDeviceQuery
} from './admin-user'
export * from './admin-version'
export * from './admin-workflow'
