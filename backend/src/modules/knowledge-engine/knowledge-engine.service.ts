import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { KnowledgeBaseEntity } from '../knowledge/entities/knowledge-base.entity';
import { KnowledgeBaseDocumentEntity } from '../knowledge/entities/knowledge-base-document.entity';
import { IndustryCategoryEntity } from '../knowledge/entities/industry-category.entity';
import {
  KnowledgeEngineClient,
  EngineUploadFile,
} from './engine-client.interface';
import { MaxkbException } from './maxkb.client';
import * as fs from 'fs';
import * as path from 'path';

/** 桌面端检索结果契约（与 knowledge-base.service.ts SearchResultDto 对齐） */
export interface EngineSearchResultDto {
  id: string;
  content: string;
  score: number;
  documentId: number;
  documentName: string;
  metadata?: unknown;
}

export interface OfficialKnowledgeBaseDto {
  id: number;
  name: string;
  description?: string;
  industryId?: number;
  industryName?: string;
  documentCount: number;
  publishStatus: string;
  engineKbId?: string;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * 知识库引擎编排服务
 * 负责：官方库引擎数据集同步、文档上传同步、检索、官方库列表
 * 降级原则：引擎不可用时本地 CRUD 仍可用，文档标记 engine_status=failed，不阻断主流程
 */
@Injectable()
export class KnowledgeEngineService {
  private readonly logger = new Logger(KnowledgeEngineService.name);

  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly kbRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeBaseDocumentEntity)
    private readonly docRepo: Repository<KnowledgeBaseDocumentEntity>,
    @InjectRepository(IndustryCategoryEntity)
    private readonly industryRepo: Repository<IndustryCategoryEntity>,
    private readonly engine: KnowledgeEngineClient,
  ) {}

  /** 引擎配置与连通性状态 */
  async getEngineStatus(): Promise<{ configured: boolean; reachable: boolean }> {
    const configured = this.engine.enabled;
    let reachable = false;
    if (configured) {
      reachable = await this.engine.ping();
    }
    return { configured, reachable };
  }

  /**
   * 在引擎创建数据集并回填 engine_kb_id
   * 失败抛出 MaxkbException（由调用方决定是否降级）
   */
  async createEngineKb(
    kbId: number,
    name: string,
    description?: string,
  ): Promise<string> {
    const kb = await this.kbRepo.findOne({ where: { id: kbId } });
    if (!kb) throw new NotFoundException('知识库不存在');
    if (kb.engineKbId) return kb.engineKbId;
    const engineKbId = await this.engine.createKnowledgeBase(name, description);
    kb.engineKbId = engineKbId;
    await this.kbRepo.save(kb);
    this.logger.log(`知识库 ${kbId} 已同步引擎数据集 ${engineKbId}`);
    return engineKbId;
  }

  /** 删除引擎数据集并清空 engine_kb_id（引擎失败仅告警） */
  async deleteEngineKb(kbId: number): Promise<void> {
    const kb = await this.kbRepo.findOne({ where: { id: kbId } });
    if (!kb) return;
    if (kb.engineKbId) {
      try {
        await this.engine.deleteKnowledgeBase(kb.engineKbId);
      } catch (err) {
        this.logger.warn(`删除引擎数据集失败 kb=${kbId}: ${(err as Error).message}`);
      }
      kb.engineKbId = null as unknown as string;
      await this.kbRepo.save(kb);
    }
  }

  /**
   * 文档上传到引擎（尽力同步）
   * 失败不抛出：标记 engine_status=failed，管理员可在列表看到未同步状态
   */
  async syncDocumentToEngine(
    kbId: number,
    docId: number,
    file: EngineUploadFile,
  ): Promise<void> {
    try {
      const kb = await this.kbRepo.findOne({ where: { id: kbId } });
      if (!kb || !kb.engineKbId) {
        throw new MaxkbException('知识库未同步到引擎');
      }
      const doc = await this.docRepo.findOne({ where: { id: docId } });
      if (!doc) throw new NotFoundException('文档不存在');
      if (doc.engineDocumentId) return;
      const res = await this.engine.uploadDocument(kb.engineKbId, file);
      doc.engineDocumentId = res.engineDocumentId;
      doc.engineStatus = res.status === 'completed' ? 'completed' : res.status === 'failed' ? 'failed' : 'processing';
      if (res.errorMessage) doc.error = res.errorMessage.slice(0, 512);
      await this.docRepo.save(doc);
      this.logger.log(`文档 ${docId} 已同步引擎 ${res.engineDocumentId}`);
    } catch (err) {
      this.logger.warn(`文档 ${docId} 引擎同步失败: ${(err as Error).message}`);
      try {
        await this.docRepo.update({ id: docId }, { engineStatus: 'failed', error: (err as Error).message.slice(0, 512) });
      } catch {
        // 忽略标记失败
      }
    }
  }


  /** 重试引擎同步：用于上传时引擎不可用 / 未同步失败的文档 */
  async retryEngineSync(kbId: number, docId: number): Promise<void> {
    const kb = await this.kbRepo.findOne({ where: { id: kbId } });
    if (!kb || !kb.engineKbId) {
      throw new MaxkbException('知识库未同步到引擎');
    }
    const doc = await this.docRepo.findOne({ where: { id: docId, knowledgeBaseId: kbId } });
    if (!doc) throw new NotFoundException('文档不存在');
    if (doc.engineDocumentId) return; // 已同步无需重试
    if (!doc.filePath) throw new MaxkbException('文档缺少文件路径，无法重试');
    const filePath = path.resolve('.', doc.filePath.replace(/^\/uploads\//, 'uploads/'));
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch (err) {
      throw new MaxkbException(`读取文档文件失败: ${(err as Error).message}`);
    }
    await this.syncDocumentToEngine(kbId, docId, {
      originalname: doc.name,
      buffer,
      mimetype: doc.mimeType ?? 'application/octet-stream',
    });
  }
  /** 删除引擎文档并清空 engine_document_id（引擎失败仅告警） */
  async deleteEngineDocument(kbId: number, docId: number): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id: docId, knowledgeBaseId: kbId } });
    if (!doc) return;
    if (doc.engineDocumentId) {
      try {
        const kb = await this.kbRepo.findOne({ where: { id: kbId } });
        if (kb?.engineKbId) {
          await this.engine.deleteDocument(kb.engineKbId, doc.engineDocumentId);
        }
      } catch (err) {
        this.logger.warn(`删除引擎文档失败 doc=${docId}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * 聊天注入用检索：带权限校验（本人私有库 或 已发布官方库）
   * 无权限 / 未同步引擎 / 引擎不可用时返回空数组（聊天行为退化为无知识库）
   */
  async retrieveForChat(
    userId: number,
    kbId: number,
    query: string,
    topK = 5,
  ): Promise<EngineSearchResultDto[]> {
    const kb = await this.kbRepo.findOne({ where: { id: kbId } });
    if (!kb) return [];
    const isOwner = kb.userId === userId;
    const isOfficialPublished =
      !!kb.isOfficial && kb.publishStatus === 'published';
    if (!isOwner && !isOfficialPublished) return [];
    if (!kb.engineKbId) return [];
    return this.retrieveEngine(kbId, query, topK);
  }

  /**
   * 引擎语义检索（调用方已完成权限校验）
   * 引擎未配置 / 未同步 / 检索失败时降级返回空数组
   */
  async retrieveEngine(
    kbId: number,
    query: string,
    topK = 5,
  ): Promise<EngineSearchResultDto[]> {
    const kb = await this.kbRepo.findOne({ where: { id: kbId } });
    if (!kb || !kb.engineKbId) return [];
    try {
      const hits = await this.engine.retrieve(kb.engineKbId, query, topK);
      return hits.map((hit) => ({
        id: hit.id ?? String(Math.random()).slice(2),
        content: hit.content,
        score: Math.round(hit.score * 10000) / 10000,
        documentId: hit.documentId ? Number(hit.documentId) || 0 : 0,
        documentName: hit.documentName ?? '',
        metadata: hit.metadata,
      }));
    } catch (err) {
      this.logger.warn(`引擎检索失败 kb=${kbId}: ${(err as Error).message}`);
      return [];
    }
  }

  /** 行业分类列表（用户端官方库筛选用） */
  async listIndustries() {
    return this.industryRepo.find({ order: { sortOrder: 'ASC' } });
  }

  /** 已发布官方知识库列表（按行业筛选 + 分页） */
  async listOfficialBases(query: {
    page?: number;
    pageSize?: number;
    industryId?: number;
  }): Promise<{
    list: OfficialKnowledgeBaseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {
      isOfficial: true,
      publishStatus: 'published',
    };
    if (query.industryId) where.industryId = query.industryId;
    const [rows, total] = await this.kbRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    // 批量查行业名（避免 join 带来的 TypeORM 排序/分页兼容问题）
    const industryIds = [
      ...new Set(
        rows
          .map((r) => r.industryId)
          .filter((v): v is number => !!v),
      ),
    ];
    const industryMap = new Map<number, string>();
    if (industryIds.length > 0) {
      const cats = await this.industryRepo.find({ where: { id: In(industryIds) } });
      for (const c of cats) industryMap.set(c.id, c.name);
    }
    return {
      list: rows.map((kb) => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        industryId: kb.industryId,
        industryName: kb.industryId ? industryMap.get(kb.industryId) : undefined,
        documentCount: kb.documentCount,
        publishStatus: kb.publishStatus,
        engineKbId: kb.engineKbId ?? undefined,
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
