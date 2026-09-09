// Hermes 对话页本地偏好持久化（localStorage；非浏览器/隐私模式降级为空）
export const PERSONA_STORAGE_KEY = 'hermes_chat.persona';
export const MEMORY_TARGET_STORAGE_KEY = 'hermes_chat.memory_target';
export const REASONING_EFFORT_STORAGE_KEY = 'hermes_chat.reasoning_effort';
export const HERMES_DEFAULT_PERSONA = '';

/** 读取本地偏好；key 缺失或 localStorage 不可用时返回 '' */
export function readLocalPref(key: string): string {
  try {
    return (window.localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

/** 写入本地偏好；写入失败静默降级（不影响主流程） */
export function writeLocalPref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** 持久化的人格 id 合法值：非空字符串 */
export function normalizePersonaId(v: string): string {
  return v && v.trim() ? v.trim() : HERMES_DEFAULT_PERSONA;
}

/** 持久化的记忆 tab 合法值：仅 profile / memory */
export function normalizeMemoryTarget(v: string): 'profile' | 'memory' {
  return v === 'memory' ? 'memory' : 'profile';
}
