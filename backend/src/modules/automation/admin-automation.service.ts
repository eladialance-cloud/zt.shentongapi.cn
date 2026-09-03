import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { AutomationTemplateEntity } from "./entities/automation-template.entity";
import { AutomationInstanceEntity } from "./entities/automation-instance.entity";
import { AutomationAuditLogEntity } from "./entities/automation-audit-log.entity";
import { AutomationPolicyEntity } from "./entities/automation-policy.entity";
import { SyncGateway } from "../sync/sync.gateway";

/**
 * 管理端自动化服务（A1-A3：模板管理 / 安全策略 / 用户设备视图）
 * 方案文档: 深瞳AI自动化工作台建设方案（代码内置版）A1/A2/A3
 */
@Injectable()
export class AdminAutomationService {
  private readonly logger = new Logger(AdminAutomationService.name);

  constructor(
    @InjectRepository(AutomationTemplateEntity)
    private readonly templateRepo: Repository<AutomationTemplateEntity>,
    @InjectRepository(AutomationInstanceEntity)
    private readonly instanceRepo: Repository<AutomationInstanceEntity>,
    @InjectRepository(AutomationAuditLogEntity)
    private readonly auditRepo: Repository<AutomationAuditLogEntity>,
    @InjectRepository(AutomationPolicyEntity)
    private readonly policyRepo: Repository<AutomationPolicyEntity>,
    private readonly syncGateway: SyncGateway,
    private readonly dataSource: DataSource,
  ) {}

  // ============ A1 模板管理 ============

  /** 全部模板（含已下架） */
  async listTemplates(status?: string): Promise<AutomationTemplateEntity[]> {
    return this.templateRepo.find({
      where: status ? { status } : {},
      order: { builtIn: "DESC", id: "ASC" },
    });
  }

  /** 新建模板 */
  async createTemplate(body: Record<string, any>): Promise<AutomationTemplateEntity> {
    const tpl = this.templateRepo.create({
      name: String(body.name ?? "").trim(),
      description: body.description,
      stepsJson: Array.isArray(body.steps) ? body.steps : [],
      paramsSchema: Array.isArray(body.paramsSchema) ? body.paramsSchema : [],
      keywords: body.keywords,
      status: body.status === "disabled" ? "disabled" : "active",
      builtIn: Number(body.builtIn) > 0 ? 1 : 0,
    });
    if (!tpl.name) throw new NotFoundException("模板名称不能为空");
    return this.templateRepo.save(tpl);
  }

  /** 更新模板（名称/描述/步骤/参数/关键词/上下架） */
  async updateTemplate(id: number, body: Record<string, any>): Promise<AutomationTemplateEntity> {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException("模板不存在");
    if (body.name !== undefined) tpl.name = String(body.name).trim();
    if (body.description !== undefined) tpl.description = body.description;
    if (Array.isArray(body.steps)) tpl.stepsJson = body.steps;
    if (Array.isArray(body.paramsSchema)) tpl.paramsSchema = body.paramsSchema;
    if (body.keywords !== undefined) tpl.keywords = body.keywords;
    if (body.status === "active" || body.status === "disabled") tpl.status = body.status;
    if (body.builtIn !== undefined) tpl.builtIn = Number(body.builtIn) > 0 ? 1 : 0;
    return this.templateRepo.save(tpl);
  }

  /** 删除模板 */
  async deleteTemplate(id: number): Promise<void> {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException("模板不存在");
    await this.templateRepo.delete({ id });
  }

  // ============ A2 安全策略 ============

  /** 全部策略 */
  async listPolicies(): Promise<AutomationPolicyEntity[]> {
    return this.policyRepo.find({ order: { policyKey: "ASC" } });
  }

  /** 更新策略 */
  async updatePolicy(key: string, body: Record<string, any>): Promise<AutomationPolicyEntity> {
    const policy = await this.policyRepo.findOne({ where: { policyKey: key } });
    if (!policy) throw new NotFoundException(`策略不存在: ${key}`);
    if (body.policyValue !== undefined) policy.policyValue = body.policyValue;
    if (body.description !== undefined) policy.description = body.description;
    if (body.updatedBy !== undefined) policy.updatedBy = Number(body.updatedBy) || null;
    return this.policyRepo.save(policy);
  }

  // ============ A3 用户/设备视图 ============

  /** 用户 IM 绑定状态、设备在线状态、实例数、执行历史统计 */
  async overview(): Promise<Record<string, any>> {
    // 渠道绑定按用户聚合
    const channelRows = (await this.dataSource.query(
      `SELECT user_id, platform, status, COUNT(*) AS cnt
       FROM create_publish_channels
       GROUP BY user_id, platform, status`,
    )) as Array<{ user_id: number; platform: string; status: string; cnt: number }>;

    const userIds = Array.from(new Set(channelRows.map((r) => Number(r.user_id))));
    const users: Array<{ id: number; username: string; email: string }> = userIds.length
      ? await this.dataSource.query(
          `SELECT id, username, email FROM users WHERE id IN (?) ORDER BY id DESC`,
          [userIds],
        )
      : [];

    const instanceRows = userIds.length
      ? ((await this.dataSource.query(
          `SELECT user_id, COUNT(*) AS cnt FROM automation_instances WHERE user_id IN (?) GROUP BY user_id`,
          [userIds],
        )) as Array<{ user_id: number; cnt: number }>)
      : [];
    const instanceCount = new Map(instanceRows.map((r) => [Number(r.user_id), Number(r.cnt)]));

    const auditRows = userIds.length
      ? ((await this.dataSource.query(
          `SELECT user_id, COUNT(*) AS cnt FROM automation_audit_logs WHERE user_id IN (?) GROUP BY user_id`,
          [userIds],
        )) as Array<{ user_id: number; cnt: number }>)
      : [];
    const auditCount = new Map(auditRows.map((r) => [Number(r.user_id), Number(r.cnt)]));

    const list = [];
    for (const u of users) {
      const channels = channelRows.filter((r) => Number(r.user_id) === Number(u.id));
      const bindings: Record<string, string> = {};
      for (const c of channels) {
        if (c.status === "active") bindings[c.platform] = bindings[c.platform] ? "both" : "active";
      }
      const online = await this.syncGateway.isUserOnline(Number(u.id));
      list.push({
        userId: Number(u.id),
        username: u.username,
        email: u.email,
        bindings,
        online,
        instanceCount: instanceCount.get(Number(u.id)) ?? 0,
        auditCount: auditCount.get(Number(u.id)) ?? 0,
      });
    }
    return { users: list, total: list.length };
  }

  // ============ 审计日志 ============

  /** 分页审计日志（可按用户/关键词筛选） */
  async listAudit(query: {
    userId?: number;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: AutomationAuditLogEntity[]; total: number }> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const qb = this.auditRepo.createQueryBuilder("a").orderBy("a.id", "DESC");
    if (query.userId) qb.andWhere("a.userId = :userId", { userId: Number(query.userId) });
    if (query.keyword) {
      qb.andWhere("(a.command LIKE :kw OR a.message LIKE :kw OR a.commandId LIKE :kw)", {
        kw: `%${query.keyword}%`,
      });
    }
    const [list, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { list, total };
  }
}