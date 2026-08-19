// 渠道 API 封装
import { httpClient } from "./http-client";
import type {
  Channel, CreateChannelDto, UpdateChannelDto,
  PublishPlan, CreatePublishPlanDto,
} from "@/types/channel";

// ============ 渠道管理 ============

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
  listChannels, createChannel, getChannel, updateChannel, deleteChannel,
  listPublishPlans, createPublishPlan, getPublishPlan,
  updatePublishPlan,
  submitForReview, reviewPlan, executePublish, cancelPublish,
};
