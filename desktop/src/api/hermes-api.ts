// Hermes 技能包市场 API
//
// 端点契约：
//   GET    /hermes/skills/market                      技能包市场
//   GET    /hermes/skills/installed                   已安装技能包
//   POST   /hermes/skills/:skillId/install            安装技能包
// （Hermes 实例管理端点已随实例功能下线删除）

import { httpClient } from "./http-client";
import type {
  HermesSkill,
  InstalledSkill,
} from "@/types/hermes";

/**
 * 技能包市场
 * GET /hermes/skills/market
 */
export async function listSkillMarket(): Promise<HermesSkill[]> {
  return httpClient.get<HermesSkill[]>("/hermes/skills/market");
}

/**
 * 已安装技能包
 * GET /hermes/skills/installed
 */
export async function listInstalledSkills(): Promise<InstalledSkill[]> {
  return httpClient.get<InstalledSkill[]>("/hermes/skills/installed");
}

/**
 * 安装技能包
 * POST /hermes/skills/:skillId/install
 */
export async function installSkill(skillId: number): Promise<HermesSkill> {
  return httpClient.post<HermesSkill>(`/hermes/skills/${skillId}/install`);
}

export default {
  listSkillMarket,
  listInstalledSkills,
  installSkill,
};
