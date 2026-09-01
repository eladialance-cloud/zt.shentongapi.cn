// 自动化工作台 API 封装（场景模板/实例/审计）
import { httpClient } from "./http-client";
import type { AutomationTemplate, AutomationInstance, AutomationAuditLog } from "@/types/automation";

/** GET /automation/templates */
export async function listTemplates(): Promise<AutomationTemplate[]> {
  return httpClient.get<AutomationTemplate[]>("/automation/templates");
}

/** GET /automation/instances */
export async function listInstances(): Promise<AutomationInstance[]> {
  return httpClient.get<AutomationInstance[]>("/automation/instances");
}

/** POST /automation/instances */
export async function createInstance(dto: {
  templateId: number;
  name?: string;
  params?: Record<string, unknown>;
  deviceId?: string;
}): Promise<AutomationInstance> {
  return httpClient.post<AutomationInstance>("/automation/instances", dto);
}

/** PATCH /automation/instances/:id */
export async function updateInstance(
  id: number,
  dto: Partial<{ name: string; params: Record<string, unknown>; enabled: number | boolean; deviceId: string | null }>,
): Promise<AutomationInstance> {
  return httpClient.patch<AutomationInstance>(`/automation/instances/${id}`, dto);
}

/** DELETE /automation/instances/:id */
export async function deleteInstance(id: number): Promise<void> {
  await httpClient.delete<void>(`/automation/instances/${id}`);
}

/** GET /automation/audit */
export async function listAuditLogs(limit?: number): Promise<AutomationAuditLog[]> {
  return httpClient.get<AutomationAuditLog[]>("/automation/audit", {
    params: limit ? { limit } : undefined,
  });
}