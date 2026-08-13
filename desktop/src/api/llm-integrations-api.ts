// 自定义大模型接入（渲染层封装）
// 优先走 electron IPC（userData/llm-integrations.json）；Web 开发模式（无 electronAPI）回退 localStorage。

import type {
  LlmIntegration,
  LlmIntegrationStoreResult,
  LlmIntegrationTestResult,
} from '@shared/types'

const LOCAL_KEY = 'st-claw:llm-integrations:v1'

interface ElectronApiLike {
  llmIntegrations?: {
    list(): Promise<LlmIntegration[]>
    save(integration: LlmIntegration): Promise<LlmIntegrationStoreResult>
    remove(id: string): Promise<LlmIntegrationStoreResult>
    test(baseUrl: string, apiKey: string, model: string): Promise<LlmIntegrationTestResult>
  }
}

const api = (window as unknown as { electronAPI?: ElectronApiLike }).electronAPI

function readLocal(): LlmIntegration[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LlmIntegration[] | null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(list: LlmIntegration[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
  } catch {
    // 忽略本地存储失败
  }
}

export async function listLlmIntegrations(): Promise<LlmIntegration[]> {
  if (api?.llmIntegrations) return api.llmIntegrations.list()
  return readLocal()
}

export async function saveLlmIntegration(
  integration: LlmIntegration,
): Promise<LlmIntegrationStoreResult> {
  if (api?.llmIntegrations) return api.llmIntegrations.save(integration)
  const list = readLocal()
  const idx = list.findIndex((i) => i.id === integration.id)
  const record: LlmIntegration = {
    ...integration,
    createdAt: idx >= 0 ? list[idx].createdAt : Date.now(),
    updatedAt: Date.now(),
  }
  const next = idx >= 0 ? list.map((i) => (i.id === integration.id ? record : i)) : [...list, record]
  writeLocal(next)
  return { ok: true, integrations: next }
}

export async function removeLlmIntegration(id: string): Promise<LlmIntegrationStoreResult> {
  if (api?.llmIntegrations) return api.llmIntegrations.remove(id)
  const next = readLocal().filter((i) => i.id !== id)
  writeLocal(next)
  return { ok: true, integrations: next }
}

export async function testLlmIntegration(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<LlmIntegrationTestResult> {
  if (api?.llmIntegrations) return api.llmIntegrations.test(baseUrl, apiKey, model)
  // Web 模式无法跨域调用第三方端点，提示用户到桌面端使用
  return { ok: false, message: '请使用桌面端测试自定义大模型连接' }
}

export function newLlmIntegrationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'llm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

export default {
  listLlmIntegrations,
  saveLlmIntegration,
  removeLlmIntegration,
  testLlmIntegration,
  newLlmIntegrationId,
}
