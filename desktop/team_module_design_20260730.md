# 团队模块设计文档 — Agent + 自定义职能

> 生成时间：2026-07-30 01:35
> 决策：替换现有 OPC 模块，团队功能完全重新设计

---

## 1. 需求概述

用户可以：
1. **创建团队** — 命名团队，选择多个Agent加入
2. **为每个Agent指定职能** — 如 CEO、渠道总监、销售经理、销售客服等，**职能名可自定义**
3. **Office 动态化** — Hermes 调用团队时，Office 页面根据团队成员的职能动态显示对应角色，不再是固定5个

## 2. 与现有 OPC 模块的差异

| 维度 | 旧 OPC | 新团队模块 |
|------|--------|-----------|
| 成员 | 真实用户 (userId) | **Agent** (agentId) |
| 职能 | 固定4种 (leader/member/reviewer/observer) | **用户自定义** (CEO/渠道/销售经理...) |
| Office 关系 | 无 | **动态生成工位** |
| Agent 关联 | opc_agent_repos（仓库式，无职能） | **团队成员=Agent+职能**，一对一绑定 |

## 3. 数据模型设计

### 3.1 后端实体

#### `team` 实体（替代 `opc_teams`）

```typescript
@Entity('teams')
export class TeamEntity extends BaseEntity {
  @Column({ length: 128 })
  name: string;

  @Column({ length: 512, nullable: true })
  avatar?: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ name: 'member_count', type: 'int', default: 0 })
  memberCount: number;

  @Index()
  @Column({ name: 'creator_id', type: 'bigint' })
  creatorId: number;
}
```

#### `team_member` 实体（替代 `opc_team_members`）

**核心变化：成员绑定的是 Agent，不是用户；有自定义职能**

```typescript
@Entity('team_members')
@Index('uniq_team_member_agent', ['teamId', 'agentId'], { unique: true })
export class TeamMemberEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_team_member_team')
  @Column({ name: 'team_id', type: 'bigint' })
  teamId: number;

  /** 关联的 Agent ID */
  @Index('idx_team_member_agent')
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  /** Agent 名称快照（冗余，方便展示） */
  @Column({ name: 'agent_name', length: 64 })
  agentName: string;

  /** Agent 头像快照 */
  @Column({ name: 'agent_avatar', length: 512, nullable: true })
  agentAvatar?: string;

  /** 自定义职能名 — 用户输入，如 CEO/渠道总监/销售经理 */
  @Column({ name: 'role_title', length: 64 })
  roleTitle: string;

  /** 职能描述（可选） */
  @Column({ name: 'role_description', length: 512, nullable: true })
  roleDescription?: string;

  /** 职能图标 emoji（可选，用户选择或输入） */
  @Column({ name: 'role_emoji', length: 16, nullable: true })
  roleEmoji?: string;

  /** 主题色（用于Office工位区分） */
  @Column({ name: 'theme_color', length: 16, nullable: true })
  themeColor?: string;

  /** 成员排序（Office工位顺序） */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** 是否激活 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'added_by', type: 'bigint' })
  addedBy: number;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;
}
```

#### `team_task` 实体（简化版，替代 `opc_tasks`）

```typescript
@Entity('team_tasks')
export class TeamTaskEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_team_task_team')
  @Column({ name: 'team_id', type: 'bigint' })
  teamId: number;

  @Column({ length: 128 })
  title: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'in_progress' | 'completed' | 'failed';

  /** 分配给哪个成员（Agent） */
  @Column({ name: 'assignee_member_id', type: 'bigint', nullable: true })
  assigneeMemberId?: number;

  @Column({ name: 'creator_id', type: 'bigint' })
  creatorId: number;

  @Column({
    type: 'enum',
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  })
  priority: 'low' | 'medium' | 'high' | 'urgent';

  @Column({ name: 'due_date', type: 'datetime', nullable: true })
  dueDate?: Date;

  @Column({ name: 'result', type: 'json', nullable: true })
  result?: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt?: Date;
}
```

### 3.2 前端类型定义

```typescript
// src/types/team.ts

/** 团队成员（Agent + 自定义职能） */
export interface TeamMember {
  id: number;
  teamId: number;
  agentId: number;
  agentName: string;
  agentAvatar?: string;
  roleTitle: string;        // 用户自定义职能名
  roleDescription?: string;
  roleEmoji?: string;       // 如 💼 📝 🚚 💰 🎧 👑 📊 🤝
  themeColor?: string;
  sortOrder: number;
  isActive: boolean;
  joinedAt: string;
}

/** 团队 */
export interface Team {
  id: number;
  name: string;
  avatar?: string;
  description?: string;
  memberCount: number;
  createdAt: string;
}

/** 创建团队 DTO */
export interface CreateTeamDto {
  name: string;
  description?: string;
  avatar?: string;
  /** 初始成员 */
  members?: Array<{
    agentId: number;
    roleTitle: string;
    roleDescription?: string;
    roleEmoji?: string;
    themeColor?: string;
  }>;
}

/** 添加成员 DTO */
export interface AddMemberDto {
  agentId: number;
  roleTitle: string;
  roleDescription?: string;
  roleEmoji?: string;
  themeColor?: string;
}

/** 更新成员 DTO */
export interface UpdateMemberDto {
  roleTitle?: string;
  roleDescription?: string;
  roleEmoji?: string;
  themeColor?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/** 预设职能模板（仅前端建议，不限制用户输入） */
export const PRESET_ROLES = [
  { title: 'CEO', emoji: '👑', color: '#FF6B6B', description: '首席执行官，负责整体战略决策' },
  { title: 'CTO', emoji: '🔧', color: '#4ECDC4', description: '首席技术官，负责技术方向' },
  { title: '渠道总监', emoji: '📊', color: '#45B7D1', description: '负责渠道拓展与管理' },
  { title: '销售经理', emoji: '💼', color: '#FFA07A', description: '负责销售业务推进' },
  { title: '销售客服', emoji: '🎧', color: '#98D8C8', description: '负责客户服务与支持' },
  { title: '内容总监', emoji: '📝', color: '#F7DC6F', description: '负责内容策划与生产' },
  { title: '财务总监', emoji: '💰', color: '#BB8FCE', description: '负责财务审核与管理' },
  { title: '交付经理', emoji: '🚚', color: '#85C1E9', description: '负责项目交付与执行' },
] as const;

/** 预设主题色（Office 工位用） */
export const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#82E0AA', '#F1948A', '#AED6F1', '#D7BDE2',
];
```

## 4. API 设计

### 4.1 后端路由

```
# 团队 CRUD
GET    /api/teams                    团队列表
POST   /api/teams                    创建团队（含初始成员）
GET    /api/teams/:teamId            团队详情
PATCH  /api/teams/:teamId            更新团队
DELETE /api/teams/:teamId            删除团队

# 成员管理
GET    /api/teams/:teamId/members    成员列表
POST   /api/teams/:teamId/members    添加成员（Agent + 职能）
PATCH  /api/teams/:teamId/members/:memberId  更新成员（改职能/排序/激活）
DELETE /api/teams/:teamId/members/:memberId  移除成员

# 任务管理
GET    /api/teams/:teamId/tasks      任务列表
POST   /api/teams/:teamId/tasks      创建任务
PATCH  /api/teams/:teamId/tasks/:taskId   更新任务
DELETE /api/teams/:teamId/tasks/:taskId   删除任务

# 可用 Agent 列表（用于添加成员时选择）
GET    /api/agents/selectable        可选 Agent 列表
```

### 4.2 前端 API 封装

```typescript
// src/api/team-api.ts
export async function listTeams(): Promise<Team[]>
export async function createTeam(dto: CreateTeamDto): Promise<Team>
export async function getTeamDetail(id: number): Promise<{ team: Team; members: TeamMember[] }>
export async function updateTeam(id: number, dto: Partial<CreateTeamDto>): Promise<Team>
export async function deleteTeam(id: number): Promise<void>

export async function listMembers(teamId: number): Promise<TeamMember[]>
export async function addMember(teamId: number, dto: AddMemberDto): Promise<TeamMember>
export async function updateMember(teamId: number, memberId: number, dto: UpdateMemberDto): Promise<TeamMember>
export async function removeMember(teamId: number, memberId: number): Promise<void>

export async function listTasks(teamId: number): Promise<TeamTask[]>
export async function createTask(teamId: number, dto: ...): Promise<TeamTask>
export async function updateTask(teamId: number, taskId: number, dto: ...): Promise<TeamTask>
```

## 5. 前端页面设计

### 5.1 团队列表页（`/team`，替代 `/opc`）

**布局：** 顶部标题栏 + 卡片网格

**卡片内容：**
- 团队名称 + 头像
- 描述
- 成员数（显示几个Agent头像叠加）
- 创建时间
- 操作：查看详情 / 删除

**创建团队弹窗（核心交互）：**
```
┌─────────────────────────────────────────┐
│  创建团队                                │
├─────────────────────────────────────────┤
│  团队名称:  [________________]           │
│  团队描述:  [________________]           │
│                                          │
│  ── 团队成员 ──                          │
│  ┌─────────────────────────────────┐    │
│  │ Agent: [选择Agent ▼]             │    │
│  │ 职能:  [输入或选择 ▼]            │    │
│  │        💡 预设: CEO 渠道 销售...  │    │
│  │ Emoji: [🎯]  颜色: [🔴]          │    │
│  │ 职能描述: [________________]      │    │
│  │            [+ 添加成员]           │    │
│  └─────────────────────────────────┘    │
│                                          │
│  已添加成员:                             │
│  ✅ AgentA - CEO 👑                      │
│  ✅ AgentB - 销售经理 💼                  │
│  ✅ AgentC - 内容总监 📝                 │
│                                          │
│           [取消]  [创建团队]              │
└─────────────────────────────────────────┘
```

**关键交互：**
- 职能名输入框支持自由输入 + 预设下拉建议
- 每添加一个成员，列表实时更新
- 可拖拽排序成员（影响Office工位顺序）
- Emoji 和颜色可选，不选则根据职能名自动分配

### 5.2 团队详情页（`/team/:id`）

**布局：**

```
┌─────────────────────────────────────────────┐
│  ← 返回    团队名称              [看板视图]  │
├─────────────────────────────────────────────┤
│                                              │
│  ── 团队信息 ──                              │
│  名称 | 成员数 | 创建时间 | 描述             │
│                                              │
│  ── 团队成员 ──                    [+添加]   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ 👑   │ │ 💼   │ │ 📝   │ │ 🎧   │       │
│  │CEO   │ │销售  │ │内容  │ │客服  │       │
│  │AgentA│ │AgentB│ │AgentC│ │AgentD│       │
│  │[编辑]│ │[编辑]│ │[编辑]│ │[编辑]│       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│                                              │
│  ── 任务列表 ──                              │
│  任务名 | 负责人 | 状态 | 优先级 | 截止      │
│  ...                                         │
│                                              │
│  ── 协作流程 ──                              │
│  CEO → 销售经理 → 内容总监 → 交付 → 财务     │
│                                              │
└─────────────────────────────────────────────┘
```

**成员卡片可编辑：**
- 点击编辑修改职能名、emoji、颜色
- 可拖拽调整顺序
- 可设置激活/停用

### 5.3 Office 动态化

**核心改动：`employees.ts` → 从团队数据动态生成**

```typescript
// 新增: src/pages/Office/dynamic-employees.ts
import type { AIEmployee, AIEmployeeStatus } from './types';
import type { TeamMember } from '@/types/team';

/** 预设角色到精灵图目录的映射（按顺序分配） */
const SPRITE_DIRS = [
  'office/iso/characters/ai-employee-01',
  'office/iso/characters/ai-employee-02',
  'office/iso/characters/ai-employee-03',
  'office/iso/characters/ai-employee-04',
  'office/iso/characters/ai-employee-05',
];

// 扩展支持更多员工（循环使用5套精灵图）
const EXTENDED_SPRITE_DIRS = [...SPRITE_DIRS, ...SPRITE_DIRS, ...SPRITE_DIRS];

/** 从团队成员生成 Office 员工 */
export function createEmployeesFromTeam(
  members: TeamMember[],
  workstationXs: number[],
  workstationY: number,
  now: number,
): AIEmployee[] {
  return members
    .filter(m => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m, idx) => {
      const x = workstationXs[idx % workstationXs.length];
      const color = m.themeColor || PRESET_COLORS[idx % PRESET_COLORS.length];

      return {
        id: `member-${m.id}`,
        name: m.roleTitle,           // Office 显示职能名
        emoji: m.roleEmoji || '🤖',
        role: 'custom' as any,        // 扩展类型
        themeColor: color,
        themeColorLight: color + '33',
        workstation: { x, y: workstationY },
        currentPos: { x, y: workstationY },
        targetPos: { x, y: workstationY },
        status: 'IDLE' as AIEmployeeStatus,
        statusStartTime: now,
        path: [],
        todayCompleted: 0,
        todoCount: 0,
        moveSpeed: 60,
        charTemplateDir: EXTENDED_SPRITE_DIRS[idx % EXTENDED_SPRITE_DIRS.length],
        // 扩展字段
        agentId: m.agentId,
        agentName: m.agentName,
        roleTitle: m.roleTitle,
        memberId: m.id,
      } as AIEmployee;
    });
}
```

**类型扩展（`types.ts`）：**

```typescript
// role 从固定枚举扩展为 string（支持自定义）
export interface AIEmployee {
  // ... 现有字段 ...
  role: string;              // 改为 string，支持任意职能名
  agentId?: number;          // 关联的 Agent
  agentName?: string;        // Agent 真实名
  roleTitle?: string;        // 职能名（与 name 相同）
  memberId?: number;         // 团队成员 ID
}
```

**Office 页面加载流程：**

```typescript
// Office2DPage.tsx 改动
useEffect(() => {
  // 1. 获取当前活跃团队
  const team = await teamApi.getActiveTeam();
  if (!team) {
    // 无团队，使用默认5个员工
    setEmployees(createEmployees());
    return;
  }
  // 2. 从团队成员生成 Office 员工
  const members = await teamApi.listMembers(team.id);
  setEmployees(createEmployeesFromTeam(members, WORKSTATION_XS, WORKSTATION_Y, Date.now()));
}, []);
```

### 5.4 officeBridge 动态化

**当前问题：** `ROLE_TO_EMPLOYEE` 硬编码5个角色映射

```typescript
// 旧
export const ROLE_TO_EMPLOYEE = {
  business: 'business',
  content: 'content',
  ...
};
```

**改为动态映射：**

```typescript
// officeBridge.ts 改动
let dynamicRoleMap: Record<string, string> = {};

/** 设置当前团队的角色映射 */
export function setTeamRoles(members: TeamMember[]) {
  dynamicRoleMap = {};
  members.forEach(m => {
    // 职能名 → 成员ID
    dynamicRoleMap[m.roleTitle] = `member-${m.id}`;
  });
}

// 所有函数中的硬编码 employeeId 改为查 dynamicRoleMap
export function onChatMessageSent(): void {
  safeRun('onChatMessageSent', () => {
    const managerId = dynamicRoleMap['CEO'] || Object.values(dynamicRoleMap)[0];
    // ... 用 managerId 操作
  });
}
```

## 6. 路由变更

```typescript
// router/index.tsx 变更

// 删除
const OPCTeamList = lazy(() => import('@/pages/OPC'))
const OPCTeamDetail = lazy(() => import('@/pages/OPC/Detail'))
const OPCBoard = lazy(() => import('@/pages/OPC/Board'))

// 新增
const TeamList = lazy(() => import('@/pages/Team'))
const TeamDetail = lazy(() => import('@/pages/Team/Detail'))
const TeamBoard = lazy(() => import('@/pages/Team/Board'))

// 路由变更
{ path: '/team', element: withSuspense(TeamList) },
{ path: '/team/:id', element: withSuspense(TeamDetail) },
{ path: '/team/:id/board', element: withSuspense(TeamBoard) },

// 旧路由重定向（兼容）
{ path: '/opc', element: <Navigate to="/team" replace /> },
{ path: '/opc/:id', element: <Navigate to="/team" replace /> },
```

## 7. 文件清单

### 新增文件

**后端：**
- `backend/src/modules/team/team.module.ts`
- `backend/src/modules/team/controllers/team.controller.ts`
- `backend/src/modules/team/services/team.service.ts`
- `backend/src/modules/team/entities/team.entity.ts`
- `backend/src/modules/team/entities/team-member.entity.ts`
- `backend/src/modules/team/entities/team-task.entity.ts`
- `backend/src/modules/team/dto/team.dto.ts`

**前端：**
- `src/types/team.ts` — 类型定义
- `src/api/team-api.ts` — API 封装
- `src/pages/Team/index.tsx` — 团队列表
- `src/pages/Team/Detail.tsx` — 团队详情
- `src/pages/Team/Board.tsx` — 看板视图
- `src/pages/Team/styles.module.css`
- `src/pages/Team/components/MemberEditor.tsx` — 成员编辑器（选择Agent+职能）
- `src/pages/Team/components/RolePicker.tsx` — 职能选择器（预设+自定义输入）
- `src/pages/Office/dynamic-employees.ts` — 动态员工生成

### 修改文件

- `src/router/index.tsx` — 路由变更
- `src/pages/Office/types.ts` — role 类型扩展为 string
- `src/pages/Office/employees.ts` — 保留默认5个，新增从团队生成的方法
- `src/pages/Office/office-2d-config.ts` — 工位坐标动态化（支持>5个）
- `src/pages/Office/services/officeBridge.ts` — 角色映射动态化
- `src/pages/Office/Office2DPage.tsx` — 加载团队数据
- `src/components/MainLayout.tsx` 或侧边栏 — 菜单项 OPC → 团队
- `backend/src/app.module.ts` — 注册新 Team 模块，移除 OPC

### 删除文件（或保留但不再引用）

- `src/pages/OPC/` 整个目录
- `backend/src/modules/opc/` 整个目录
- `src/types/opc.ts`
- `src/api/opc-api.ts`

## 8. 数据迁移

如果数据库中已有 OPC 数据：
1. 创建新 `teams`、`team_members`、`team_tasks` 表
2. 将 `opc_teams` 数据迁移到 `teams`
3. `opc_agent_repos` 中的记录迁移到 `team_members`（agentId → agentId，无职能则默认"团队成员"）
4. `opc_tasks` 迁移到 `team_tasks`
5. 删除旧表

**简化方案：** 如果用户数据量小，直接建新表，旧表保留不动。

## 9. 实现顺序

| 步骤 | 内容 | 依赖 |
|------|------|------|
| 1 | 后端实体 + Service + Controller + Module | 无 |
| 2 | 前端类型定义 + API 封装 | 步骤1 |
| 3 | 团队列表页（列表+创建弹窗） | 步骤2 |
| 4 | 团队详情页（成员管理+任务列表） | 步骤3 |
| 5 | Office 动态化（types + employees + bridge） | 步骤2 |
| 6 | 路由变更 + 侧边栏更新 | 步骤3+4 |
| 7 | 看板视图 | 步骤4 |
| 8 | 测试 + 验证 | 全部 |

## 10. 关键设计决策

1. **职能名完全自由输入** — 不做枚举限制，只提供预设建议。用户可以输入"宇宙大将军"都行
2. **Emoji + 颜色可选** — 不选则按排序自动分配，确保Office视觉有区分
3. **Agent 可在多个团队中** — 同一个Agent可以加入不同团队，担任不同职能
4. **Office 工位动态扩展** — 超过5个成员时循环使用精灵图，工位坐标自动计算
5. **保留看板视图** — 团队任务的看板（待办/进行中/已完成）仍然保留
