import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AutomationTemplateEntity } from "./entities/automation-template.entity";
import { AutomationInstanceEntity } from "./entities/automation-instance.entity";
import { AutomationAuditLogEntity } from "./entities/automation-audit-log.entity";

/** 解析后的执行步骤 */
export interface ResolvedStep extends Record<string, unknown> {
  type: string;
  name?: string;
}

/** IM 入站消息结构（供 matchInstance 使用） */
export interface InboundTextMessage {
  content: string;
}

/**
 * 自动化工作台 - 场景模板/实例/审计服务（方案 B4/B6）
 * 路由规则（B7-lite）：IM 消息 → 先匹配用户已启用实例（实例名/模板关键词）
 * → 命中则解析模板步骤（{{params.xxx}} 用实例参数替换）→ 推送 remote:command 执行
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @InjectRepository(AutomationTemplateEntity)
    private readonly templateRepo: Repository<AutomationTemplateEntity>,
    @InjectRepository(AutomationInstanceEntity)
    private readonly instanceRepo: Repository<AutomationInstanceEntity>,
    @InjectRepository(AutomationAuditLogEntity)
    private readonly auditRepo: Repository<AutomationAuditLogEntity>,
  ) {}

  health() {
    return { status: "ok", module: "automation" };
  }

  // ============ 模板 ============

  /** 模板列表（active，内置+后台配置） */
  async listTemplates(): Promise<AutomationTemplateEntity[]> {
    return this.templateRepo.find({
      where: { status: "active" },
      order: { builtIn: "DESC", id: "ASC" },
    });
  }

  // ============ 实例 ============

  /** 用户实例列表 */
  async listInstances(userId: number): Promise<AutomationInstanceEntity[]> {
    return this.instanceRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  /** 实例详情 */
  async getInstance(userId: number, instanceId: number): Promise<AutomationInstanceEntity> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId, userId } });
    if (!instance) throw new NotFoundException("自动化实例不存在");
    return instance;
  }

  /** 创建实例（选模板填参数） */
  async createInstance(
    userId: number,
    data: { templateId: number; name?: string; params?: Record<string, unknown>; deviceId?: string },
  ): Promise<AutomationInstanceEntity> {
    const template = await this.templateRepo.findOne({ where: { id: data.templateId, status: "active" } });
    if (!template) throw new BadRequestException("模板不存在或已下线");

    const instance = this.instanceRepo.create({
      userId,
      templateId: template.id,
      name: (data.name ?? template.name).trim().slice(0, 128),
      params: data.params ?? {},
      deviceId: data.deviceId,
      enabled: 1,
    });
    return this.instanceRepo.save(instance);
  }

  /** 更新实例（名称/参数/启停/设备绑定） */
  async updateInstance(
    userId: number,
    instanceId: number,
    data: Partial<{
      name: string;
      params: Record<string, unknown>;
      enabled: number | boolean;
      deviceId: string | null;
    }>,
  ): Promise<AutomationInstanceEntity> {
    const instance = await this.getInstance(userId, instanceId);
    if (data.name !== undefined) instance.name = data.name.trim().slice(0, 128);
    if (data.params !== undefined) instance.params = data.params;
    if (data.enabled !== undefined) instance.enabled = data.enabled ? 1 : 0;
    if (data.deviceId !== undefined) instance.deviceId = data.deviceId || undefined;
    return this.instanceRepo.save(instance);
  }

  /** 删除实例 */
  async deleteInstance(userId: number, instanceId: number): Promise<void> {
    const instance = await this.getInstance(userId, instanceId);
    await this.instanceRepo.delete({ id: instance.id });
  }

  // ============ 场景匹配（B7-lite） ============

  /**
   * IM 消息匹配用户已启用的场景实例
   * 命中条件：消息包含实例名 或 模板关键词（不区分大小写）
   * @returns 命中实例 + 解析后的执行步骤
   */
  async matchInstance(
    userId: number,
    text: string,
  ): Promise<{ instance: AutomationInstanceEntity; steps: ResolvedStep[] } | null> {
    const normalized = text.toLowerCase();
    if (!normalized) return null;

    const instances = await this.instanceRepo.find({
      where: { userId, enabled: 1 },
      order: { createdAt: "DESC" },
    });
    if (instances.length === 0) return null;

    for (const instance of instances) {
      const template = await this.templateRepo
        .findOne({ where: { id: instance.templateId, status: "active" } })
        .catch(() => null);
      if (!template) continue;

      const keywords = [instance.name, template.name, template.keywords ?? ""]
        .join(",")
        .toLowerCase();
      const hit = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .some((k) => normalized.includes(k));
      if (!hit) continue;

      const steps = this.resolveSteps(template.stepsJson, instance.params ?? {});
      if (steps.length === 0) continue;
      return { instance, steps };
    }
    return null;
  }

  /** 模板步骤参数替换：{{params.xxx}} → 实例参数值（支持数组元素） */
  private resolveSteps(
    stepsJson: Array<Record<string, unknown>>,
    params: Record<string, unknown>,
  ): ResolvedStep[] {
    if (!Array.isArray(stepsJson)) return [];
    return stepsJson.map((step) => {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(step ?? {})) {
        resolved[key] = this.resolveValue(value, params);
      }
      return resolved as ResolvedStep;
    });
  }

  private resolveValue(value: unknown, params: Record<string, unknown>): unknown {
    if (typeof value === "string") {
      return value.replace(/\{\{params\.(\w+)\}\}/g, (_, key: string) =>
        params?.[key] !== undefined ? String(params[key]) : "",
      );
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveValue(item, params));
    }
    if (value && typeof value === "object") {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        obj[k] = this.resolveValue(v, params);
      }
      return obj;
    }
    return value;
  }

  /** 记录实例最近执行时间 */
  async markInstanceRun(userId: number, instanceId: number): Promise<void> {
    try {
      await this.instanceRepo.update(
        { id: instanceId, userId },
        { lastRunAt: new Date() },
      );
    } catch (err) {
      this.logger.debug(`[automation] markInstanceRun 失败: ${(err as Error).message}`);
    }
  }

  // ============ 审计（B6） ============

  /** 写审计日志（失败不影响主流程） */
  async logAudit(
    userId: number,
    entry: {
      commandId?: string;
      instanceId?: number;
      direction?: string;
      command?: string;
      commandType?: string;
      status?: string;
      message?: string;
      replyContext?: unknown;
      deviceId?: string;
    },
  ): Promise<void> {
    try {
      const log = this.auditRepo.create({
        userId,
        commandId: entry.commandId,
        instanceId: entry.instanceId,
        direction: entry.direction ?? "in",
        command: entry.command ? String(entry.command).slice(0, 512) : undefined,
        commandType: entry.commandType,
        status: entry.status,
        message: entry.message ? String(entry.message).slice(0, 1024) : undefined,
        replyContext: entry.replyContext,
        deviceId: entry.deviceId,
      });
      await this.auditRepo.save(log);
    } catch (err) {
      this.logger.debug(`[automation] 审计写入失败: ${(err as Error).message}`);
    }
  }

  /** 用户审计日志 */
  async listAuditLogs(userId: number, limit = 100): Promise<AutomationAuditLogEntity[]> {
    return this.auditRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
      take: Math.min(Math.max(Number(limit) || 100, 1), 500),
    });
  }
}