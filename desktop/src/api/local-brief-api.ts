// 本地需求单 API（一期 MVP：window.electronAPI.db.briefs 直连本地 SQLCipher）
// 二期切换云端 briefs 时保持同签名，仅替换实现。
import type { LocalBrief } from '@shared/types'

export type LocalBriefStatus = LocalBrief['status']

export interface CreateLocalBriefInput {
  userId: number
  title: string
  goal?: string
  targetAudience?: string
  platforms?: string[]
  style?: string
  deadline?: string | null
  status?: LocalBriefStatus
  sourceChatSessionId?: number | null
  sourceChatSummary?: string | null
}

export type UpdateLocalBriefPatch = Partial<
  Pick<LocalBrief, 'title' | 'goal' | 'targetAudience' | 'platforms' | 'style' | 'deadline' | 'status'>
>

export async function listLocalBriefs(): Promise<LocalBrief[]> {
  if (!window.electronAPI?.db?.briefs) return []
  try {
    return await window.electronAPI.db.briefs.list()
  } catch (err) {
    console.error('[local-brief-api] list failed:', err)
    return []
  }
}

export async function createLocalBrief(input: CreateLocalBriefInput): Promise<LocalBrief | null> {
  if (!window.electronAPI?.db?.briefs) return null
  try {
    return await window.electronAPI.db.briefs.create(input)
  } catch (err) {
    console.error('[local-brief-api] create failed:', err)
    return null
  }
}

export async function updateLocalBrief(
  id: number,
  patch: UpdateLocalBriefPatch
): Promise<LocalBrief | undefined> {
  if (!window.electronAPI?.db?.briefs) return undefined
  try {
    return await window.electronAPI.db.briefs.update(id, patch)
  } catch (err) {
    console.error('[local-brief-api] update failed:', err)
    return undefined
  }
}

export async function markLocalBriefSynced(clientBriefId: string): Promise<void> {
  if (!window.electronAPI?.db?.briefs?.markSynced) return
  try {
    await window.electronAPI.db.briefs.markSynced(clientBriefId)
  } catch (err) {
    console.error('[local-brief-api] markSynced failed:', err)
  }
}

export async function removeLocalBrief(id: number): Promise<void> {
  if (!window.electronAPI?.db?.briefs) return
  try {
    await window.electronAPI.db.briefs.remove(id)
  } catch (err) {
    console.error('[local-brief-api] remove failed:', err)
  }
}

export default { listLocalBriefs, createLocalBrief, updateLocalBrief, removeLocalBrief, markLocalBriefSynced }
