// 需求单离线暂存与补传（三期 3.3 / T5）
//
// 创建链路：
//   1. 在线 → 直接调云端 POST /briefs
//   2. 断网 / 网络错误 / 服务端 5xx → 落本地 local_briefs + 写入 local_sync_queue
//      （entity_type='brief'，client_txn_id=local-brief-{clientBriefId}）
//   3. 网络恢复后由 syncService 用 POST /briefs 补建，成功后本地标 cloud_synced=1
//
// 边界（三期不做）：仅覆盖「新建」；离线编辑/删除/取消不纳入同步。
import { createBrief } from './brief-api'
import type { BriefItem, CreateBriefPayload } from './brief-api'
import { createLocalBrief } from './local-brief-api'
import type { LocalBrief } from '@shared/types'
import { offlineQueue } from './offline-queue'
import { BusinessError, NetworkError } from '@/utils/errors'

export type BriefCreateResult =
  | { source: 'cloud'; brief: BriefItem }
  | { source: 'local'; brief: LocalBrief }

export interface CreateBriefFallbackOptions {
  userId: number
  payload: CreateBriefPayload
}

/** 本地需求单 → 同步队列 payload（字段与云端 CreateBriefDto 对齐） */
export function toBriefSyncPayload(brief: LocalBrief): CreateBriefPayload {
  return {
    title: brief.title,
    goal: brief.goal ?? undefined,
    targetAudience: brief.targetAudience ?? undefined,
    platforms: brief.platforms ?? undefined,
    style: brief.style ?? undefined,
    deadline: brief.deadline ?? undefined,
    sourceChatSessionId: brief.sourceChatSessionId ?? undefined,
    sourceChatSummary: brief.sourceChatSummary ?? undefined,
  }
}

/** 是否属于可离线回退的网络类错误（断网/超时/服务端 5xx），业务 4xx 不回退 */
export function isOfflineFallbackError(err: unknown): boolean {
  if (err instanceof NetworkError) return true
  if (err instanceof BusinessError && err.code >= 500) return true
  return false
}

/**
 * 创建需求单：在线走云端；断网/服务不可用自动落本地并排队补传。
 * 业务错误（4xx）原样抛出，由调用方提示。
 */
export async function createBriefWithOfflineFallback(
  options: CreateBriefFallbackOptions,
): Promise<BriefCreateResult> {
  if (!offlineQueue.isOnline()) {
    return saveLocalAndEnqueue(options)
  }
  try {
    const brief = await createBrief(options.payload)
    return { source: 'cloud', brief }
  } catch (err) {
    if (!isOfflineFallbackError(err)) throw err
    return saveLocalAndEnqueue(options)
  }
}

/** 落本地 local_briefs 并写入同步队列 */
async function saveLocalAndEnqueue(
  options: CreateBriefFallbackOptions,
): Promise<BriefCreateResult> {
  const { userId, payload } = options
  const local = await createLocalBrief({
    userId,
    title: payload.title,
    goal: payload.goal,
    targetAudience: payload.targetAudience,
    platforms: payload.platforms,
    style: payload.style,
    deadline: payload.deadline ?? null,
    sourceChatSessionId: payload.sourceChatSessionId ?? null,
    sourceChatSummary: payload.sourceChatSummary ?? null,
  })
  if (!local) {
    throw new Error('本地保存失败，请检查本地数据库状态后重试')
  }
  await offlineQueue.enqueue({
    client_txn_id: `local-brief-${local.clientBriefId}`,
    entity_type: 'brief',
    entity_id: local.clientBriefId,
    operation: 'create',
    payload: toBriefSyncPayload(local),
  })
  return { source: 'local', brief: local }
}

export default createBriefWithOfflineFallback
