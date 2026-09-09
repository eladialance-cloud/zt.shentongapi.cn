// Hermes 对话独立页：会话持久化 + 沉淀提示 编排（与主 Chat 页 chat-stream.ts 对齐）
// 纯 DI 设计：真实 API 由页面注入（createSession/saveMessage/analyze/apply/undo），
// 模块不静态依赖 http-client，便于 tsx 单测；所有副作用均 try/catch / fire-and-forget。

import type { SedimentNotice } from '@/store/chat-stream'
import type { ChatSession, SaveMessageDto } from '@/types/chat'

export type SedimentApplyType = 'enterprise_doc' | 'customer_profile' | 'data_update'
export type SedimentApplyTarget = 'knowledge_base' | 'hermes_memory'
export type SedimentAnalyzeType = 'enterprise_doc' | 'customer_profile' | 'requirement' | 'data_update' | 'none'

export interface HermesPipelineDeps {
  createSession: (data: { title?: string; modelId: string; knowledgeBaseId?: number }) => Promise<ChatSession>
  saveMessage: (sessionId: number, msg: SaveMessageDto) => Promise<unknown>
  analyzeSediment: (dto: {
    content: string
    history?: string[]
    model?: string
    sessionId?: number
  }) => Promise<{
    type: SedimentAnalyzeType
    target: SedimentApplyTarget | 'requirement_draft' | 'customer_profile' | null
    title: string
    content: string
    operation?: 'add' | 'replace' | 'remove'
  } | null>
  applySediment: (dto: {
    type: SedimentApplyType
    target: SedimentApplyTarget
    title: string
    content: string
    kbId?: number
    sessionId?: number
  }) => Promise<{ feedId: number; undoToken?: string; alreadyExisted?: boolean } | null>
  undoSediment: (undoToken: string) => Promise<{ ok: boolean }>
  hermesMemoryAdd?: (text: string) => Promise<{ ok: boolean }>
  hermesMemoryRemove?: (text: string) => Promise<{ ok: boolean }>
}

function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function defaultMemoryAdd(text: string): Promise<{ ok: boolean }> {
  const mem = typeof window !== 'undefined' ? window.electronAPI?.hermesMemory : undefined
  if (!mem) return Promise.resolve({ ok: false })
  return mem.add('profile', text)
}

function defaultMemoryRemove(text: string): Promise<{ ok: boolean }> {
  const mem = typeof window !== 'undefined' ? window.electronAPI?.hermesMemory : undefined
  if (!mem) return Promise.resolve({ ok: false })
  return mem.remove('profile', text)
}

/** 创建（或复用）后端会话；失败返回 0（仅本地展示，不持久化） */
export async function ensureHermesSession(
  current: number | null,
  title: string,
  opts: { modelId?: string; knowledgeBaseId?: number },
  deps: HermesPipelineDeps,
): Promise<number> {
  if (current != null && current > 0) return current
  try {
    const session = await deps.createSession({
      title: title?.slice(0, 50) || 'Hermes 对话',
      modelId: opts.modelId || 'custom/deep-shentong',
      ...(opts.knowledgeBaseId ? { knowledgeBaseId: opts.knowledgeBaseId } : {}),
    })
    return session.id
  } catch (err) {
    console.warn('[hermes-chat] 创建会话失败，仅本地展示:', err)
    return 0
  }
}

/** 持久化一条消息（非阻断，不抛出） */
export function persistHermesMessage(sessionId: number, msg: SaveMessageDto, deps: HermesPipelineDeps): void {
  if (!sessionId || sessionId <= 0) return
  void deps.saveMessage(sessionId, msg).catch((err) => console.warn('[hermes-chat] 保存消息失败:', err))
}

export interface RunSedimentParams {
  content: string
  history: string[]
  sessionId: number | null
  knowledgeBaseId?: number
  modelId?: string
}

/** 对话沉淀：识别 → 分流（本机记忆 / 云端知识库）→ 返回提示；失败静默降级 */
export async function runHermesSediment(params: RunSedimentParams, deps: HermesPipelineDeps): Promise<SedimentNotice | null> {
  const content = params.content.trim()
  if (!content || params.sessionId == null || params.sessionId <= 0) return null
  try {
    const result = await deps.analyzeSediment({
      content,
      history: params.history.slice(-6),
      model: params.modelId || undefined,
      sessionId: params.sessionId,
    })
    if (!result || result.type === 'none' || result.type === 'requirement') return null

    // 分流 1：客户画像/偏好 -> 本机 Hermes 记忆（USER.md，幂等去重）
    if (result.target === 'hermes_memory' || result.type === 'customer_profile') {
      const add = deps.hermesMemoryAdd || defaultMemoryAdd
      const entryText = [result.title, result.content].filter(Boolean).join('：')
      const write = await add(entryText)
      if (!write?.ok) return null
      return {
        id: uniqueId(),
        sessionId: params.sessionId,
        target: 'hermes_memory',
        title: result.title || '客户画像',
        memoryText: entryText,
        createdAt: Date.now(),
      }
    }

    // 分流 2：企业资料/数据更新(add) -> 云端知识库（会话关联库，无则默认「对话沉淀」库）
    if (result.type === 'data_update' && result.operation === 'remove') return null
    const type = result.type === 'data_update' ? 'data_update' : 'enterprise_doc'
    const applied = await deps.applySediment({
      type,
      target: 'knowledge_base',
      title: result.title || '对话沉淀',
      content: result.content,
      kbId: params.knowledgeBaseId,
      sessionId: params.sessionId,
    })
    if (!applied?.feedId) return null
    return {
      id: uniqueId(),
      sessionId: params.sessionId,
      target: 'knowledge_base',
      title: result.title || '对话沉淀',
      feedId: applied.feedId,
      undoToken: applied.undoToken,
      alreadyExisted: applied.alreadyExisted,
      createdAt: Date.now(),
    }
  } catch (err) {
    console.warn('[hermes-chat] 沉淀识别失败:', err)
    return null
  }
}

/** 撤回最近一次沉淀（knowledge=删知识库文档；memory=移除 USER.md 条目） */
export async function undoHermesSediment(notice: SedimentNotice, deps: HermesPipelineDeps): Promise<boolean> {
  try {
    if (notice.target === 'knowledge_base' && notice.undoToken) {
      await deps.undoSediment(notice.undoToken)
    } else if (notice.target === 'hermes_memory' && notice.memoryText) {
      const remove = deps.hermesMemoryRemove || defaultMemoryRemove
      await remove(notice.memoryText)
    }
    return true
  } catch (err) {
    console.warn('[hermes-chat] 撤回沉淀失败:', err)
    return false
  }
}
