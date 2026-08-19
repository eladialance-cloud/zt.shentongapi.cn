// 建团向导纯函数/常量（可单测，不依赖 React/API）
// 约定：与 Dashboard/cards.ts 相同——纯函数/纯数据独立成模块，组件只做渲染
// 覆盖：TEAM_TEMPLATES / applyTemplate / toggleMember / selectedCount / buildCreatePayload

import type { SelectableAgent, CreateTeamDto } from "@/types/team";

/** 模板建议角色 */
export interface TemplateRole {
  roleTitle: string;
  roleEmoji: string;
}

/** 建团模板（内容/运营/电商/空白） */
export interface TeamTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** 建议角色（Step2 预选提示，可重复如 文案写手×2） */
  suggestedRoles: TemplateRole[];
  /** 模板预选 Agent（按角色库 id 精确匹配；模板只作预选提示，可空） */
  presetAgentIds?: Array<number | string>;
  /** 推荐模板（默认选中） */
  recommended?: boolean;
}

/** 四类模板：空白默认选中（用户拍板：默认空白团队从 0 开始加员工） */
export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: "blank",
    name: "空白团队",
    emoji: "➕",
    description: "从 0 开始自己加员工",
    suggestedRoles: [],
    recommended: true,
  },
  {
    id: "content",
    name: "内容团队模板",
    emoji: "📝",
    description: "预置：选题策划 / 文案写手×2 / 设计师 / 质检员",
    suggestedRoles: [
      { roleTitle: "选题策划", roleEmoji: "✍️" },
      { roleTitle: "文案写手", roleEmoji: "✍️" },
      { roleTitle: "文案写手", roleEmoji: "✍️" },
      { roleTitle: "设计师", roleEmoji: "🎨" },
      { roleTitle: "质检员", roleEmoji: "🔍" },
    ],
  },
  {
    id: "operations",
    name: "运营团队模板",
    emoji: "📣",
    description: "预置：发布运营 / 数据采集 / 增长分析师",
    suggestedRoles: [
      { roleTitle: "发布运营", roleEmoji: "📣" },
      { roleTitle: "数据采集", roleEmoji: "📊" },
      { roleTitle: "增长分析师", roleEmoji: "📈" },
    ],
  },
  {
    id: "ecommerce",
    name: "电商团队模板",
    emoji: "🛒",
    description: "预置：选品 / 上架 / 客服 / 售后",
    suggestedRoles: [
      { roleTitle: "选品", roleEmoji: "🛒" },
      { roleTitle: "上架", roleEmoji: "📦" },
      { roleTitle: "客服", roleEmoji: "🎧" },
      { roleTitle: "售后", roleEmoji: "🔧" },
    ],
  },
];

/** 默认选中的模板（空白团队） */
export const DEFAULT_TEMPLATE_ID = "blank";

/** 成员主题色板（Office 工位区分，与 Detail 页一致） */
export const MEMBER_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

/** 向导中已勾选成员（含自定义职能：roleTitle/roleEmoji/themeColor） */
export interface WizardMember {
  agentId: number | string;
  agentName: string;
  roleTitle: string;
  roleEmoji?: string;
  themeColor?: string;
  roleDescription?: string;
}

/** 勾选候选（角色库 Agent + 可选模板角色） */
export interface MemberCandidate {
  agent: SelectableAgent;
  roleTitle?: string;
  roleEmoji?: string;
}

/** Agent 统一 key（number/string 归一） */
export function keyOf(agentId: number | string): string {
  return String(agentId);
}

function memberOf(candidate: MemberCandidate, index: number): WizardMember {
  return {
    agentId: candidate.agent.id,
    agentName: candidate.agent.name,
    roleTitle: candidate.roleTitle || "团队成员",
    roleEmoji: candidate.roleEmoji,
    themeColor: MEMBER_COLORS[index % MEMBER_COLORS.length],
  };
}

/** 模板预选应用到成员选择：空白=空；presetAgentIds 精确匹配优先，其次按建议角色关键词匹配角色库 */
export function applyTemplate(
  template: TeamTemplate,
  agents: SelectableAgent[],
): WizardMember[] {
  if (!template || template.id === "blank") return [];
  const selected: WizardMember[] = [];
  const used = new Set<string>();
  const push = (candidate: MemberCandidate) => {
    const key = keyOf(candidate.agent.id);
    if (used.has(key)) return;
    used.add(key);
    selected.push(memberOf(candidate, selected.length));
  };
  for (const pid of template.presetAgentIds ?? []) {
    const agent = agents.find((a) => keyOf(a.id) === keyOf(pid));
    if (agent) push({ agent, roleTitle: "团队成员", roleEmoji: template.emoji });
  }
  for (const role of template.suggestedRoles) {
    const agent = agents.find(
      (a) => !used.has(keyOf(a.id)) && a.name.includes(role.roleTitle),
    );
    if (agent) push({ agent, roleTitle: role.roleTitle, roleEmoji: role.roleEmoji });
  }
  return selected;
}

/** 成员勾选状态切换：已选则移除，未选则加入（不修改原数组） */
export function toggleMember(
  selected: WizardMember[],
  candidate: MemberCandidate,
): WizardMember[] {
  const key = keyOf(candidate.agent.id);
  if (selected.some((m) => keyOf(m.agentId) === key)) {
    return selected.filter((m) => keyOf(m.agentId) !== key);
  }
  return [...selected, memberOf(candidate, selected.length)];
}

/** 已勾选成员数 */
export function selectedCount(selected: WizardMember[]): number {
  return selected.length;
}

/** 修改成员自定义职能（不修改原数组） */
export function updateMemberRole(
  selected: WizardMember[],
  agentId: number | string,
  roleTitle: string,
): WizardMember[] {
  return selected.map((m) =>
    keyOf(m.agentId) === keyOf(agentId) ? { ...m, roleTitle } : m,
  );
}

/** 修改成员职能 emoji（不修改原数组） */
export function updateMemberEmoji(
  selected: WizardMember[],
  agentId: number | string,
  roleEmoji: string,
): WizardMember[] {
  return selected.map((m) =>
    keyOf(m.agentId) === keyOf(agentId) ? { ...m, roleEmoji } : m,
  );
}

/** 团队基础信息（Step1/Step2 顶部填写） */
export interface TeamInfoInput {
  name: string;
  description?: string;
  knowledgeBaseId?: number;
}

/** 组装 createTeam dto（含 members: [{agentId, roleTitle, ...}]） */
export function buildCreatePayload(
  teamInfo: TeamInfoInput,
  selected: WizardMember[],
): CreateTeamDto {
  const members = selected.map((m) => ({
    agentId: m.agentId,
    agentName: m.agentName,
    roleTitle: m.roleTitle || "团队成员",
    roleEmoji: m.roleEmoji,
    themeColor: m.themeColor,
  }));
  return {
    name: (teamInfo.name || "").trim(),
    description: teamInfo.description?.trim() || undefined,
    knowledgeBaseId: teamInfo.knowledgeBaseId,
    members: members.length > 0 ? members : undefined,
    memberAgentIds: members.length === 0 ? [] : undefined,
  };
}

/** 模板对应的建议团队名（"内容团队模板" → "内容团队"） */
export function templateTeamName(template: TeamTemplate): string {
  return template.name.replace(/模板$/, "").trim();
}

/** 未创建的模板团队（按建议团队名去重，排除空白模板） */
export function findUncreatedTemplates(
  teams: Array<{ name: string }>,
  templates: TeamTemplate[] = TEAM_TEMPLATES,
): TeamTemplate[] {
  const names = new Set(teams.map((t) => t.name.trim()));
  return templates.filter(
    (t) => t.id !== "blank" && !names.has(templateTeamName(t)),
  );
}

/** 本周产出：最近 7 天（含今天）已完成任务数（completedAt 缺失时回退 createdAt） */
export function countWeekOutput(
  tasks: Array<{ status?: string; completedAt?: string; createdAt?: string }>,
  now = new Date(),
): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - 6);
  const startMs = start.getTime();
  return tasks.filter((t) => {
    if (t.status !== "completed") return false;
    const ts = new Date(t.completedAt ?? t.createdAt ?? "").getTime();
    return !Number.isNaN(ts) && ts >= startMs;
  }).length;
}
