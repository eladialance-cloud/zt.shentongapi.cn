/**
 * 动态员工生成 — 从团队数据动态生成 Office AI 员工
 * 设计文档: team_module_design_20260730.md Section 5
 *
 * 当团队有成员时，使用团队成员的 Agent + 自定义职能替换默认 5 个固定员工；
 * 无团队数据时回退到默认 employees.ts。
 */

import type { AIEmployee } from "./types";
import { COLORS, WORKSTATION_XS, WORKSTATION_Y } from "./office-2d-config";
import * as teamApi from "@/api/team-api";
import type { TeamMember } from "@/types/team";

/** 默认 5 个角色的颜色映射 (回退用) */
const ROLE_COLORS: Record<string, { color: string; light: string }> = {
  business: { color: COLORS.business, light: COLORS.businessLight },
  content: { color: COLORS.content, light: COLORS.contentLight },
  delivery: { color: COLORS.delivery, light: COLORS.deliveryLight },
  finance: { color: COLORS.finance, light: COLORS.financeLight },
  service: { color: COLORS.service, light: COLORS.serviceLight },
};

/** 额外颜色（超过 5 人时循环使用） */
const EXTRA_COLORS = [
  { color: "#ec4899", light: "#fce7f3" },
  { color: "#f97316", light: "#fff7ed" },
  { color: "#eab308", light: "#fefce8" },
  { color: "#22c55e", light: "#f0fdf4" },
  { color: "#14b8a6", light: "#f0fdfa" },
  { color: "#06b6d4", light: "#ecfeff" },
  { color: "#8b5cf6", light: "#f5f3ff" },
  { color: "#f43f5e", light: "#fff1f2" },
];

function getColorForIndex(index: number): { color: string; light: string } {
  const all = [...Object.values(ROLE_COLORS), ...EXTRA_COLORS];
  return all[index % all.length];
}

const CHAR_TEMPLATES = [
  "office/iso/characters/ai-employee-01",
  "office/iso/characters/ai-employee-02",
  "office/iso/characters/ai-employee-03",
  "office/iso/characters/ai-employee-04",
  "office/iso/characters/ai-employee-05",
];

/**
 * 将团队成员转换为 AIEmployee 列表
 * 超过 5 人时循环使用 5 套精灵图 + 工位坐标
 */
export function membersToEmployees(
  members: TeamMember[],
  now: number,
): AIEmployee[] {
  if (!members || members.length === 0) return [];

  const activeMembers = members
    .filter((m) => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return activeMembers.slice(0, 10).map((member, index) => {
    const colors = member.themeColor
      ? { color: member.themeColor, light: member.themeColor + "33" }
      : getColorForIndex(index);

    const wsIndex = index % WORKSTATION_XS.length;
    const pos = { x: WORKSTATION_XS[wsIndex], y: WORKSTATION_Y };
    const templateIndex = index % CHAR_TEMPLATES.length;

    return {
      id: `team-member-${member.id}`,
      name: member.agentName,
      emoji: member.roleEmoji || "🤖",
      role: member.roleTitle,
      themeColor: colors.color,
      themeColorLight: colors.light,
      workstation: pos,
      currentPos: pos,
      targetPos: { ...pos },
      status: "IDLE" as const,
      statusStartTime: now,
      path: [],
      todayCompleted: 0,
      todoCount: 0,
      moveSpeed: 60,
      charTemplateDir: CHAR_TEMPLATES[templateIndex],
    };
  });
}

/**
 * 动态角色映射 (供 officeBridge 使用)
 * 将自定义职能名映射为 bridge 角色 key (manager/writer/retriever/marketer/reviewer)
 */
export function buildDynamicRoleMap(
  members: TeamMember[],
): Record<string, string> {
  const roleMap: Record<string, string> = {};
  const activeMembers = members
    .filter((m) => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const bridgeRoles = ["manager", "writer", "retriever", "marketer", "reviewer"];

  activeMembers.forEach((member, index) => {
    const employeeId = `team-member-${member.id}`;
    const bridgeRole = bridgeRoles[index % bridgeRoles.length];
    roleMap[bridgeRole] = employeeId;
  });

  return roleMap;
}

/**
 * 从团队 ID 加载动态员工
 * @param teamId 团队 ID，null 则返回 null（回退到默认员工）
 */
export async function loadTeamEmployees(
  teamId: number | null,
): Promise<{ employees: AIEmployee[]; roleMap: Record<string, string> } | null> {
  if (!teamId) return null;

  try {
    const members = await teamApi.listMembers(teamId);
    if (!members || members.length === 0) return null;

    const now = Date.now();
    const employees = membersToEmployees(members, now);
    const roleMap = buildDynamicRoleMap(members);

    return { employees, roleMap };
  } catch (err) {
    console.error("[dynamic-employees] load failed:", err);
    return null;
  }
}

export default {
  membersToEmployees,
  buildDynamicRoleMap,
  loadTeamEmployees,
};
