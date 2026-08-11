import { HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';

import { PurchasedItemEntity, MarketItemType } from './entities/purchased-item.entity';
import { HermesSkillEntity } from '../hermes/entities/hermes-skill.entity';
import { PluginEntity } from '../plugin/entities/plugin.entity';
import { WorkflowEntity } from '../admin-workflow/entities/workflow.entity';
import { AgentEntity } from '../agent/entities/agent.entity';
import { McpCatalogEntity } from '../admin-mcp/entities/mcp-catalog.entity';
import { McpServerEntity } from '../mcp/entities/mcp-server.entity';
import { CreditsService } from '../credits/services/credits.service';
import {
  buildSkillPackage,
  buildPluginPackage,
  buildWorkflowPackage,
  buildAgentPackage,
  buildMcpPackage,
  canonicalJson,
  MarketPackage,
} from './packagers/package-builder';

export interface ResolvedItem {
  price: number;
  version: string;
  pkg: MarketPackage;
}

/**
 * 官方内容市场：购买 / 已购清单 / 下载安装包
 * - 购买：扣积分（freeze+settle，与聊天计费同一机制）
 * - 下载：返回单一 JSON 安装包 + sha256（canonicalJson 确定性校验）
 */
@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    @InjectRepository(PurchasedItemEntity)
    private readonly purchasedRepo: Repository<PurchasedItemEntity>,
    @InjectRepository(HermesSkillEntity)
    private readonly skillRepo: Repository<HermesSkillEntity>,
    @InjectRepository(PluginEntity)
    private readonly pluginRepo: Repository<PluginEntity>,
    @InjectRepository(WorkflowEntity)
    private readonly workflowRepo: Repository<WorkflowEntity>,
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
    @InjectRepository(McpCatalogEntity)
    private readonly mcpCatalogRepo: Repository<McpCatalogEntity>,
    @InjectRepository(McpServerEntity)
    private readonly mcpServerRepo: Repository<McpServerEntity>,
    private readonly creditsService: CreditsService,
  ) {}

  /** 查找内容并解析价格/版本/安装包（不存在或未上架抛 404） */
  async resolveItem(type: MarketItemType, itemId: number): Promise<ResolvedItem> {
    switch (type) {
      case 'skill': {
        const s = await this.skillRepo.findOne({ where: { id: itemId } });
        if (!s || !s.isActive) throw new NotFoundException('技能包不存在或已下架');
        return { price: s.pricePerMinute || 0, version: s.version || '1.0.0', pkg: buildSkillPackage(s) };
      }
      case 'plugin': {
        const p = await this.pluginRepo.findOne({ where: { id: itemId } });
        if (!p || !p.isActive) throw new NotFoundException('插件不存在或已下架');
        return { price: 0, version: p.version || '1.0.0', pkg: buildPluginPackage(p) };
      }
      case 'workflow': {
        const w = await this.workflowRepo.findOne({ where: { id: itemId } });
        if (!w || !w.isActive || w.reviewStatus !== 'approved') {
          throw new NotFoundException('工作流不存在或未发布');
        }
        return { price: w.pricePerExecution || 0, version: w.version || '1.0.0', pkg: buildWorkflowPackage(w) };
      }
      case 'agent': {
        const a = await this.agentRepo.findOne({ where: { id: itemId } });
        if (!a || a.status !== 'published') throw new NotFoundException('Agent 不存在或未发布');
        return { price: a.pricePerCall || 0, version: String(a.version ?? 1), pkg: buildAgentPackage(a) };
      }
      case 'mcp': {
        const c = await this.mcpCatalogRepo.findOne({ where: { id: itemId, enabled: true } });
        if (!c) throw new NotFoundException('MCP 目录条目不存在或已下架');
        return { price: 0, version: c.version || '1.0.0', pkg: buildMcpPackage(c) };
      }
      default:
        throw new NotFoundException('不支持的内容类型');
    }
  }

  /** 已购记录（幂等：已购买直接返回，不重复扣费） */
  async purchase(userId: number, type: MarketItemType, itemId: number): Promise<PurchasedItemEntity> {
    const { price, version } = await this.resolveItem(type, itemId);
    const existing = await this.purchasedRepo.findOne({
      where: { userId, itemType: type, itemId },
    });
    if (existing) return existing;

    if (price > 0) {
      const sourceId = `market:${type}:${itemId}`;
      const frozen = await this.creditsService.freezeCredits(userId, price, 'market_purchase', sourceId);
      await this.creditsService.settleCredits(userId, frozen.id, price);
    }

    const rec = this.purchasedRepo.create({
      userId,
      itemType: type,
      itemId,
      version,
      price,
    });
    return this.purchasedRepo.save(rec);
  }

  /** 已购清单（换机重下依据） */
  listPurchased(userId: number): Promise<PurchasedItemEntity[]> {
    return this.purchasedRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 下载安装包：校验已购或免费，返回 pkg + sha256 + size */
  async getDownloadPackage(userId: number, type: MarketItemType, itemId: number) {
    const { price, version, pkg } = await this.resolveItem(type, itemId);
    if (price > 0) {
      const rec = await this.purchasedRepo.findOne({
        where: { userId, itemType: type, itemId },
      });
      if (!rec) throw new HttpException('请先购买该内容', 402);
    }
    let mcpServerId: number | null = null;
    if (type === 'mcp') {
      const catalog = await this.mcpCatalogRepo.findOne({ where: { id: itemId } });
      if (catalog) {
        const existing = await this.mcpServerRepo.findOne({ where: { userId, catalogId: itemId, source: 'official' } });
        if (existing) {
          mcpServerId = existing.id;
        } else {
          const env: Record<string, string> = {};
          for (const t of catalog.envTemplate || []) {
            if (t.default) env[t.key] = t.default;
          }
          // 创建实例 + downloadCount 递增在同一事务内，避免并发下记录与计数不一致
          const created = await this.mcpServerRepo.manager.transaction(async (manager) => {
            const saved = await manager.save(
              McpServerEntity,
              manager.create(McpServerEntity, {
                userId,
                name: catalog.name,
                description: catalog.description,
                transportType: catalog.transportType,
                command: catalog.command,
                args: catalog.args,
                env,
                url: catalog.url,
                headers: catalog.headers,
                source: 'official',
                catalogId: catalog.id,
                enabled: false,
                status: 'pending',
              }),
            );
            await manager.increment(McpCatalogEntity, { id: catalog.id }, 'downloadCount', 1);
            return saved;
          });
          mcpServerId = created.id;
        }
      }
    }
    const json = canonicalJson(pkg);
    const sha256 = crypto.createHash('sha256').update(json, 'utf8').digest('hex');
    return {
      type,
      id: itemId,
      version,
      name: pkg.name,
      sha256,
      size: Buffer.byteLength(json, 'utf8'),
      pkg,
      mcpServerId,
    };
  }
}
