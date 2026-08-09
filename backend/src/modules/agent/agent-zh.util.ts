/**
 * Agent 中文化对照表（英文名 → 中文显示名/描述）
 * 命中后自动覆盖 displayName/description，未命中保持后台录入原样。
 * 新增英文 Agent 只需在此表加一行。
 */
export const AGENT_ZH_MAP: Record<string, { displayName: string; description?: string }> = {
  'DeepSeek Chat': {
    displayName: 'DeepSeek 对话',
    description: 'DeepSeek 通用大语言模型，支持多轮对话、代码与文本生成。',
  },
  'DeepSeek-V3': {
    displayName: 'DeepSeek V3',
    description: 'DeepSeek V3 大语言模型，擅长推理、代码与长文本处理。',
  },
  'DeepSeek-R1': {
    displayName: 'DeepSeek R1',
    description: 'DeepSeek R1 推理模型，擅长逻辑推理与复杂问题求解。',
  },
  'Web Search': {
    displayName: '联网搜索',
    description: '联网搜索工具 Agent，可实时检索互联网信息并整理回答。',
  },
  'Image Generator': {
    displayName: '图片生成',
    description: 'AI 图片生成 Agent，根据文字描述生成图片。',
  },
};

export interface AgentZhResult {
  displayName?: string;
  description?: string;
}

/** 按 name/displayName 命中中文化对照表，未命中返回 null */
export function resolveAgentZh(
  name?: string,
  displayName?: string
): AgentZhResult | null {
  return AGENT_ZH_MAP[name || ''] || AGENT_ZH_MAP[displayName || ''] || null;
}
