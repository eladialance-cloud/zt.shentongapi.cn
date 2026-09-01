/** 自动化工作台 - 场景模板/实例/审计类型 */

export interface AutomationTemplate {
  id: number;
  name: string;
  description?: string;
  stepsJson: Array<Record<string, unknown>>;
  paramsSchema?: Array<{ key: string; label: string; required?: boolean }>;
  keywords?: string;
  status: string;
  builtIn: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationInstance {
  id: number;
  userId: number;
  templateId: number;
  name: string;
  params?: Record<string, unknown>;
  enabled: number;
  deviceId?: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationAuditLog {
  id: number;
  commandId?: string;
  instanceId?: number;
  direction: string;
  command?: string;
  commandType?: string;
  status?: string;
  message?: string;
  createdAt: string;
}