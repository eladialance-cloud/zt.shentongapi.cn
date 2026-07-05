import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensitiveWordEntity } from './entities/sensitive-word.entity';
import { AiAuditConfigEntity } from './entities/ai-audit-config.entity';
import { AuditQueueEntity } from './entities/audit-queue.entity';
import { RejectAuditDto } from './dto/reject-audit.dto';
import { CreateSensitiveWordDto } from './dto/create-sensitive-word.dto';
import { BatchCreateSensitiveWordDto } from './dto/batch-create-sensitive-word.dto';
import { SensitiveWordQueryDto } from './dto/sensitive-word-query.dto';
import { AuditQueueQueryDto } from './dto/audit-queue-query.dto';
import { UpdateAuditConfigDto } from './dto/update-audit-config.dto';
import { AuditTestDto } from './dto/audit-test.dto';

/** AI 审核配置单行记录主键（固定为 1） */
const AUDIT_CONFIG_ID = 1;

/** 默认 AI 审核配置（首次访问时初始化） */
const DEFAULT_AUDIT_CONFIG = {
  enabled: false,
  modelId: '',
  sensitiveThreshold: 0.5,
  violenceThreshold: 0.5,
  pornThreshold: 0.5,
  autoProcess: false,
};

/**
 * 管理端内容审核服务
 * 数据合同真源：Task 25 - 内容审核 / frontend admin-audit-api.ts
 *
 * 提供：
 *   - 审核队列（audit_queue 表）查询/批准/驳回/误报
 *   - 敏感词（sensitive_words 表）CRUD 与批量导入
 *   - AI 审核配置（ai_audit_config 表，单行 JSON）读写与测试
 */
@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AuditQueueEntity)
    private readonly queueRepo: Repository<AuditQueueEntity>,
    @InjectRepository(SensitiveWordEntity)
    private readonly wordRepo: Repository<SensitiveWordEntity>,
    @InjectRepository(AiAuditConfigEntity)
    private readonly configRepo: Repository<AiAuditConfigEntity>,
  ) {}

  // ============ 审核队列 ============

  /** 审核队列列表（分页） */
  async listQueue(query: AuditQueueQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.queueRepo.createQueryBuilder('q');
    if (query.type) {
      qb.andWhere('q.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('q.status = :status', { status: query.status });
    }
    qb.orderBy('q.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return {
      list: rows.map((r) => this.toQueueItem(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 审核通过 */
  async approve(id: number, adminUser: { id: number; username: string }) {
    const item = await this.queueRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`审核记录 ${id} 不存在`);
    }
    item.status = 'approved';
    item.processedBy = adminUser.username;
    item.processedAt = new Date();
    await this.queueRepo.save(item);
  }

  /** 审核驳回 */
  async reject(
    id: number,
    dto: RejectAuditDto,
    adminUser: { id: number; username: string },
  ) {
    const item = await this.queueRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`审核记录 ${id} 不存在`);
    }
    item.status = 'rejected';
    item.processedBy = adminUser.username;
    item.processedAt = new Date();
    item.processRemark = dto.reason;
    await this.queueRepo.save(item);
  }

  /** 标记误报 */
  async markFalsePositive(
    id: number,
    adminUser: { id: number; username: string },
  ) {
    const item = await this.queueRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`审核记录 ${id} 不存在`);
    }
    item.status = 'false_positive';
    item.processedBy = adminUser.username;
    item.processedAt = new Date();
    await this.queueRepo.save(item);
  }

  // ============ 敏感词 ============

  /** 敏感词列表（分页） */
  async listSensitiveWords(query: SensitiveWordQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.wordRepo.createQueryBuilder('w');
    if (query.category) {
      qb.andWhere('w.category = :category', { category: query.category });
    }
    if (query.keyword) {
      qb.andWhere('w.word LIKE :kw', { kw: `%${query.keyword}%` });
    }
    qb.orderBy('w.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return {
      list: rows.map((r) => this.toSensitiveWord(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 新增敏感词 */
  async createSensitiveWord(dto: CreateSensitiveWordDto) {
    const entity = this.wordRepo.create({
      word: dto.word,
      category: dto.category,
      level: dto.level,
      replacement: dto.replacement,
    });
    const saved = await this.wordRepo.save(entity);
    return this.toSensitiveWord(saved);
  }

  /** 批量导入敏感词 */
  async batchCreateSensitiveWords(dto: BatchCreateSensitiveWordDto) {
    const entities = dto.words.map((w) =>
      this.wordRepo.create({
        word: w.word,
        category: w.category,
        level: w.level,
      }),
    );
    // 忽略唯一约束冲突的词，仅统计成功插入数
    let created = 0;
    for (const entity of entities) {
      try {
        await this.wordRepo.insert(entity);
        created++;
      } catch {
        // 唯一冲突/其它错误：跳过
      }
    }
    return { created };
  }

  /** 删除敏感词 */
  async deleteSensitiveWord(id: number) {
    const item = await this.wordRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`敏感词 ${id} 不存在`);
    }
    await this.wordRepo.remove(item);
  }

  // ============ AI 审核配置 ============

  /** 获取 AI 审核配置 */
  async getAuditConfig() {
    const row = await this.configRepo.findOne({
      where: { id: AUDIT_CONFIG_ID },
    });
    if (!row) {
      return { ...DEFAULT_AUDIT_CONFIG };
    }
    return { ...DEFAULT_AUDIT_CONFIG, ...row.config, updatedAt: row.updatedAt };
  }

  /** 更新 AI 审核配置 */
  async updateAuditConfig(dto: UpdateAuditConfigDto) {
    const existing = await this.configRepo.findOne({
      where: { id: AUDIT_CONFIG_ID },
    });
    const merged: Record<string, unknown> = existing
      ? { ...existing.config }
      : { ...DEFAULT_AUDIT_CONFIG };
    if (dto.enabled !== undefined) merged.enabled = dto.enabled;
    if (dto.modelId !== undefined) merged.modelId = dto.modelId;
    if (dto.sensitiveThreshold !== undefined)
      merged.sensitiveThreshold = dto.sensitiveThreshold;
    if (dto.violenceThreshold !== undefined)
      merged.violenceThreshold = dto.violenceThreshold;
    if (dto.pornThreshold !== undefined)
      merged.pornThreshold = dto.pornThreshold;
    if (dto.autoProcess !== undefined) merged.autoProcess = dto.autoProcess;

    if (existing) {
      existing.config = merged;
      await this.configRepo.save(existing);
    } else {
      const created = this.configRepo.create({
        id: AUDIT_CONFIG_ID,
        config: merged,
      });
      await this.configRepo.save(created);
    }
  }

  /** AI 审核测试（基于敏感词库的本地模拟） */
  async testAudit(dto: AuditTestDto) {
    const words = await this.wordRepo.find();
    const text = dto.text || '';
    const hitWords: string[] = [];
    for (const w of words) {
      if (w.word && text.includes(w.word)) {
        hitWords.push(w.word);
      }
    }
    const flagged = hitWords.length > 0;
    const riskScore = Math.min(1, hitWords.length * 0.3);
    const suggestion: 'allow' | 'review' | 'block' = flagged
      ? riskScore >= 0.7
        ? 'block'
        : 'review'
      : 'allow';
    return {
      flagged,
      riskScore,
      categories: {
        sensitive: flagged ? Math.min(1, riskScore) : 0,
        violence: 0,
        porn: 0,
      },
      hitWords,
      suggestion,
    };
  }

  // ============ 映射 ============

  private toQueueItem(r: AuditQueueEntity) {
    return {
      id: r.id,
      type: r.type,
      contentSummary: r.contentSummary,
      content: r.content,
      userId: r.userId,
      username: r.username,
      triggerReason: r.triggerReason,
      hitWords: r.hitWords,
      riskLevel: r.riskLevel,
      status: r.status,
      createdAt: r.createdAt,
      processedBy: r.processedBy,
      processedAt: r.processedAt,
      processRemark: r.processRemark,
    };
  }

  private toSensitiveWord(r: SensitiveWordEntity) {
    return {
      id: r.id,
      word: r.word,
      category: r.category,
      level: r.level,
      replacement: r.replacement,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
