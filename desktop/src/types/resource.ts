// 三级资源体系（官方/团队/用户）共享类型定义
// Task 13: Three-tier resource system (official/team/user)
//
// 数据合同真源：Task 13 - 三级资源体系
// TODO(backend): 后端需要在 agent / workflow / mcp_server 等资源表上新增以下列：
//   owner_type  VARCHAR(16)  NOT NULL DEFAULT 'user'   -- 'official' | 'team' | 'user'
//   owner_id    VARCHAR(64)  NULL                       -- team 资源对应团队 ID；user 资源对应用户 ID
//   version     VARCHAR(32)  NOT NULL DEFAULT '1.0.0'   -- 资源版本号
// 列表查询接口需支持 ?ownerType=official|team|user 过滤参数。

import type { MemberRole } from '@/types/opc'

/** 资源归属类型 */
export type OwnerType = 'official' | 'team' | 'user'

/** 资源归属字段（需要被各资源类型以 intersection 形式扩展） */
export interface OwnershipFields {
  /** 资源归属类型 */
  ownerType: OwnerType
  /** 归属 ID（团队资源为团队 ID；用户资源为用户 ID；官方资源可为空） */
  ownerId: string
  /** 资源版本号 */
  version: string
}

/** 归属类型 → 中文标签 */
export const OWNER_TYPE_LABELS: Record<OwnerType, string> = {
  official: '官方',
  team: '团队',
  user: '我的'
}

/** 归属类型 → antd Tag color */
export const OWNER_TYPE_TAG_COLOR: Record<OwnerType, string> = {
  official: 'blue',
  team: 'green',
  user: 'default'
}

/** 资源卡片支持的操作按钮 */
export type ActionButton =
  | 'use' // 使用 / 运行
  | 'detail' // 查看详情
  | 'edit' // 编辑
  | 'delete' // 删除
  | 'saveAsMine' // 另存为我的
  | 'publishToTeam' // 发布到团队
  | 'testConnection' // 测试连接（MCP 专用）
  | 'viewTools' // 查看工具（MCP 专用）

/**
 * 根据资源归属类型 + 用户在团队中的角色，计算允许显示的操作按钮列表。
 *
 * 规则：
 *   - official：只读，仅显示「使用」「另存为我的」（+ 详情/查看工具）
 *   - user：完整权限（编辑/删除/发布到团队/使用/详情）
 *   - team：依据团队角色
 *       - leader：完整权限（编辑/删除/使用）
 *       - member / reviewer：可编辑、可使用，不可删除
 *       - observer 或未知：只读，仅「使用」
 *
 * @param ownerType 资源归属类型
 * @param userRole 当前用户在团队中的角色（仅 team 资源需要）
 */
export function getAllowedActions(
  ownerType: OwnerType,
  userRole?: MemberRole | null
): ActionButton[] {
  switch (ownerType) {
    case 'official':
      return ['use', 'detail', 'saveAsMine', 'viewTools', 'testConnection']
    case 'user':
      return [
        'use',
        'detail',
        'edit',
        'delete',
        'publishToTeam',
        'viewTools',
        'testConnection'
      ]
    case 'team': {
      const role = userRole ?? null
      if (role === 'leader') {
        return [
          'use',
          'detail',
          'edit',
          'delete',
          'viewTools',
          'testConnection'
        ]
      }
      if (role === 'member' || role === 'reviewer') {
        return ['use', 'detail', 'edit', 'viewTools', 'testConnection']
      }
      // observer 或未知：只读
      return ['use', 'detail', 'viewTools', 'testConnection']
    }
    default:
      return ['use', 'detail']
  }
}

/** 判断某操作按钮是否被允许 */
export function isActionAllowed(
  action: ActionButton,
  ownerType: OwnerType,
  userRole?: MemberRole | null
): boolean {
  return getAllowedActions(ownerType, userRole).includes(action)
}
