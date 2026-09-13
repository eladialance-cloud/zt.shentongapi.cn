// 渠道 API 封装
import { httpClient } from "./http-client";
import type {
  Channel, CreateChannelDto, UpdateChannelDto,
  PublishPlan, CreatePublishPlanDto,
  ChannelPlatformMeta,
} from "@/types/channel";

// ============ 渠道平台元数据 ============

/** GET /channels/platforms（服务端可选平台清单；失败回退到本地内置清单） */
export async function listChannelPlatforms(): Promise<ChannelPlatformMeta[]> {
  const { CHANNEL_PLATFORMS } = await import("@/types/channel");
  try {
    const list = await httpClient.get<ChannelPlatformMeta[]>("/channels/platforms");
    return Array.isArray(list) && list.length > 0 ? list : CHANNEL_PLATFORMS;
  } catch {
    return CHANNEL_PLATFORMS;
  }
}

// ============ 渠道管理 ============

/**
 * 测试渠道连接（凭证完整性 + 适配器 healthCheck；服务端执行，20s 超时）
 * 优先走桌面端主进程（复用远端 token），浏览器/网页端回退直连后端。
 */
export async function testChannelConnection(
  id: number,
): Promise<{ ok: boolean; online: boolean; message: string; platform: string }> {
  const api = (window as unknown as { electronAPI?: { platformAccount?: { testChannel?: (id: number) => Promise<{ ok: boolean; online: boolean; message: string; platform: string }> } } }).electronAPI
  if (api?.platformAccount?.testChannel) {
    return api.platformAccount.testChannel(id)
  }
  return httpClient.post<{ ok: boolean; online: boolean; message: string; platform: string }>(`/channels/${id}/test`)
}

/** GET /channels */
export async function listChannels(): Promise<Channel[]> {
  return httpClient.get<Channel[]>("/channels");
}

/** POST /channels */
export async function createChannel(dto: CreateChannelDto): Promise<Channel> {
  return httpClient.post<Channel>("/channels", dto);
}

/** GET /channels/:id */
export async function getChannel(id: number): Promise<Channel> {
  return httpClient.get<Channel>(`/channels/${id}`);
}

/** PATCH /channels/:id */
export async function updateChannel(id: number, dto: UpdateChannelDto): Promise<Channel> {
  return httpClient.patch<Channel>(`/channels/${id}`, dto);
}

/** DELETE /channels/:id */
export async function deleteChannel(id: number): Promise<void> {
  await httpClient.delete<void>(`/channels/${id}`);
}

// ============ 发布计划 ============

/** GET /channels/publish/plans */
export async function listPublishPlans(status?: string): Promise<PublishPlan[]> {
  return httpClient.get<PublishPlan[]>("/channels/publish/plans", {
    params: status ? { status } : undefined,
  });
}

/** POST /channels/publish/plans */
export async function createPublishPlan(dto: CreatePublishPlanDto): Promise<PublishPlan> {
  return httpClient.post<PublishPlan>("/channels/publish/plans", dto);
}

/** PATCH /channels/publish/plans/:id（草稿/待审核可改） */
export async function updatePublishPlan(id: number, dto: Partial<CreatePublishPlanDto>): Promise<PublishPlan> {
  return httpClient.patch<PublishPlan>(`/channels/publish/plans/${id}`, dto);
}

/** GET /channels/publish/plans/:id */
export async function getPublishPlan(id: number): Promise<PublishPlan> {
  return httpClient.get<PublishPlan>(`/channels/publish/plans/${id}`);
}

/** POST /channels/publish/plans/:id/submit */
export async function submitForReview(id: number): Promise<PublishPlan> {
  return httpClient.post<PublishPlan>(`/channels/publish/plans/${id}/submit`);
}

/** POST /channels/publish/plans/:id/review */
export async function reviewPlan(
  id: number,
  data: { approved: boolean; comment?: string },
): Promise<PublishPlan> {
  return httpClient.post<PublishPlan>(`/channels/publish/plans/${id}/review`, data);
}

/** POST /channels/publish/plans/:id/execute */
export async function executePublish(id: number): Promise<PublishPlan> {
  return httpClient.post<PublishPlan>(`/channels/publish/plans/${id}/execute`);
}

/** POST /channels/publish/plans/:id/cancel */
export async function cancelPublish(id: number): Promise<PublishPlan> {
  return httpClient.post<PublishPlan>(`/channels/publish/plans/${id}/cancel`);
}

export default {
  listChannelPlatforms,
  listChannels, createChannel, getChannel, updateChannel, deleteChannel,
  testChannelConnection,
  listPublishPlans, createPublishPlan, getPublishPlan,
  updatePublishPlan,
  submitForReview, reviewPlan, executePublish, cancelPublish,
};
