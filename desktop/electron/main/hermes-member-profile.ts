/** 成员人设构建：team_members + agents → TeamMemberProfile[]；空团队返回 null（降级 Hermes 原生子代理） */
import type { TeamMemberProfile } from "./hermes-orchestrator";

export interface MemberRow {
  id: number;
  agentId: number;
  roleTitle: string;
  roleDescription?: string | null;
  agent?: {
    systemPrompt?: string | null;
    modelId?: string | null;
    allowedKnowledgeBaseIds?: number[] | null;
  } | null;
}

export function buildMemberProfiles(rows: MemberRow[]): TeamMemberProfile[] | null {
  const out: TeamMemberProfile[] = [];
  for (const r of rows) {
    if (!r.agent) continue; // 成员未绑 Agent 详情：跳过
    out.push({
      memberId: r.id,
      agentId: r.agentId,
      roleTitle: r.roleTitle,
      roleDescription: r.roleDescription ?? undefined,
      systemPrompt: r.agent.systemPrompt ?? undefined,
      modelId: r.agent.modelId ?? undefined,
      knowledgeBaseIds: r.agent.allowedKnowledgeBaseIds ?? [],
    });
  }
  return out.length > 0 ? out : null; // null → 降级 Hermes 原生子代理
}