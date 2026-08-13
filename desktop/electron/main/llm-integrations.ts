/**
 * 自定义大模型接入（本机保存，OpenAI 兼容端点）
 *
 * 数据文件：userData/llm-integrations.json
 * - API Key 仅存本机，不上传云端；
 * - 对话时由主进程直连用户填写的 Base URL（不经平台 llm-proxy，不扣平台积分）；
 * - 测试连接：POST {base}/chat/completions 发一条最小消息验证 Key/URL/模型。
 * - API Key 明文存储于 userData/llm-integrations.json（本地应用可接受；如需更高安全可改用 Windows Credential Manager）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  LlmIntegration,
  LlmIntegrationStoreResult,
  LlmIntegrationTestResult,
} from '../shared/types'

/** 归一化聊天端点：支持 https://host/v1 或 https://host/v1/chat/completions */
export function normalizeChatEndpoint(baseUrl: string): string {
  let base = (baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('Base URL 不能为空')
  if (!/^https?:\/\//i.test(base)) {
    throw new Error('Base URL 必须以 http(s):// 开头')
  }
  if (/\/chat\/completions$/i.test(base)) return base
  return base + '/chat/completions'
}

export class LlmIntegrationsStore {
  constructor(private readonly filePath: string) {}

  list(): LlmIntegration[] {
    try {
      if (!existsSync(this.filePath)) return []
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as { integrations?: LlmIntegration[] } | LlmIntegration[] | null
      if (!parsed) return []
      const list = Array.isArray(parsed) ? parsed : parsed.integrations
      return Array.isArray(list) ? list : []
    } catch {
      // 文件损坏时回退空列表，避免整个设置页不可用
      return []
    }
  }

  save(integration: LlmIntegration): LlmIntegrationStoreResult {
    try {
      if (!integration || typeof integration.id !== 'string' || !integration.id) {
        return { ok: false, integrations: this.list(), error: '接入配置无效' }
      }
      if (!integration.name || !integration.name.trim()) {
        return { ok: false, integrations: this.list(), error: '请填写接入名称' }
      }
      if (!integration.baseUrl || !integration.baseUrl.trim()) {
        return { ok: false, integrations: this.list(), error: '请填写 Base URL' }
      }
      if (!/^https?:\/\//i.test(integration.baseUrl.trim())) {
        return { ok: false, integrations: this.list(), error: 'Base URL 必须以 http(s):// 开头' }
      }
      if (!Array.isArray(integration.models) || integration.models.length === 0) {
        return { ok: false, integrations: this.list(), error: '请至少添加一个模型 ID' }
      }
      const now = Date.now()
      const list = this.list()
      const idx = list.findIndex((i) => i.id === integration.id)
      const record: LlmIntegration = {
        ...integration,
        name: integration.name.trim(),
        baseUrl: integration.baseUrl.trim(),
        apiKey: integration.apiKey?.trim() ?? '',
        models: integration.models
          .filter((m) => m && typeof m.id === 'string' && m.id.trim())
          .map((m) => ({
            id: m.id.trim(),
            name: m.name?.trim() || undefined,
            modelType: m.modelType === 'vision' ? 'vision' : 'chat',
          })),
        createdAt: idx >= 0 ? list[idx].createdAt : now,
        updatedAt: now,
      }
      if (record.models.length === 0) {
        return { ok: false, integrations: list, error: '请至少添加一个模型 ID' }
      }
      const next = idx >= 0 ? [...list] : [...list, record]
      if (idx >= 0) next[idx] = record
      this.write(next)
      return { ok: true, integrations: next }
    } catch (err) {
      return {
        ok: false,
        integrations: this.list(),
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  remove(id: string): LlmIntegrationStoreResult {
    try {
      const next = this.list().filter((i) => i.id !== id)
      this.write(next)
      return { ok: true, integrations: next }
    } catch (err) {
      return {
        ok: false,
        integrations: this.list(),
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async test(
    baseUrl: string,
    apiKey: string,
    model: string,
  ): Promise<LlmIntegrationTestResult> {
    try {
      const url = normalizeChatEndpoint(baseUrl)
      if (!apiKey?.trim()) {
        return { ok: false, message: '请填写 API Key' }
      }
      if (!model?.trim()) {
        return { ok: false, message: '请填写模型 ID' }
      }
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey.trim(),
        },
        body: JSON.stringify({
          model: model.trim(),
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        return { ok: false, message: 'HTTP ' + resp.status + ' ' + text.slice(0, 200) }
      }
      return { ok: true, message: '连接成功' }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private write(list: LlmIntegration[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(
      this.filePath,
      JSON.stringify({ integrations: list }, null, 2),
      'utf-8',
    )
  }
}

export default LlmIntegrationsStore
