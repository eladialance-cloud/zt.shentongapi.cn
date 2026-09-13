/**
 * 内容合规校验（SOUL/素材去品牌防线）。
 *
 * 用途:检查 SOUL 或内容资产是否含禁用品牌 token，以及是否覆盖必需小节。
 * 后续任务(Task 2/3/6)复用本模块对写入库的资产做合规校验。
 *
 * 运行方式:作为模块被 Jest 单测引用，也可被清洗/入库脚本调用。
 */

export const BANNED_TOKENS = ["RRClaw", "造造天幕", "开界", "Siver", "wxautox4"];

export const REQUIRED_SECTIONS = ["角色定位", "工作职责", "工作流程", "协作关系", "边界与禁用"];

export interface ProfileCheck {
  pass: boolean;
  banned: string[];
  missingSections: string[];
}

export function checkProfile(input: { content: string; role: string }): ProfileCheck {
  const banned = BANNED_TOKENS.filter((t) => input.content.includes(t));
  const missingSections = REQUIRED_SECTIONS.filter((s) => !input.content.includes(s));
  return { pass: banned.length === 0 && missingSections.length === 0, banned, missingSections };
}
