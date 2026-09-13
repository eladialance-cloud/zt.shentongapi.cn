// 自定义大模型接入（渲染层封装）
// 优先走 electron IPC（userData/llm-integrations.json）；Web 开发模式（无 electronAPI）退化为
// **仅本次会话的内存态**——记录里含 API Key，任何形式都不再落 localStorage 明文（安全审计 S-53）。

import type {
  LlmIntegration,
  LlmIntegrationStoreResult,
  LlmIntegrationTestResult,
} from '@shared/types'

interface ElectronApiLike {
  llmIntegrations?: {
    list(): Promise<LlmIntegration[]>
    save(integration: LlmIntegration): Promise<LlmIntegrationStoreResult>
    remove(id: string): Promise<LlmIntegrationStoreResult>
    test(baseUrl: string, apiKey: string, model: string): Promise<LlmIntegrationTestResult>
  }
}

const api = (window as unknown as { electronAPI?: ElectronApiLike }).electronAPI

/** Web 调试模式的进程内后备存储（不再落 localStorage：内容含 API Key） */
let memoryIntegrations: LlmIntegration[] | null = null

function readLocal(): LlmIntegration[] {
  return memoryIntegrations ? memoryIntegrations.map((i) => ({ ...i })) : []
}

function writeLocal(list: LlmIntegration[]): void {
  memoryIntegrations = list.map((i) => ({ ...i }))
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
