import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeBaseEntity } from '../knowledge/entities/knowledge-base.entity';
import { KnowledgeBaseDocumentEntity } from '../knowledge/entities/knowledge-base-document.entity';
import { KnowledgeBaseChunkEntity } from '../knowledge/entities/knowledge-base-chunk.entity';
import { IndustryCategoryEntity } from '../knowledge/entities/industry-category.entity';
import { FileEntity } from '../file/entities/file.entity';
import { KnowledgeEngineService } from '../knowledge-engine/knowledge-engine.service';

export interface AdminKnowledgeListResult {
  list: Array<KnowledgeBaseEntity & { industryName?: string }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 官方知识库管理（管理后台 /admin/knowledge-bases） */
@Injectable()
export class AdminKnowledgeService {
  private readonly logger = new Logger(AdminKnowledgeService.name);

  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly kbRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeBaseDocumentEntity)
    private readonly docRepo: Repository<KnowledgeBaseDocumentEntity>,
    @InjectRepository(KnowledgeBaseChunkEntity)
    private readonly chunkRepo: Repository<KnowledgeBaseChunkEntity>,
    @InjectRepository(IndustryCategoryEntity)
    private readonly industryRepo: Repository<IndustryCategoryEntity>,
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
    private readonly engineService: KnowledgeEngineService,
  ) {}

  /** 官方知识库列表（分页 + 行业/关键词/状态筛选） */
  async list(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    industryId?: number;
    publishStatus?: string;
  }): Promise<AdminKnowledgeListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { isOfficial: true };
    if (query.keyword) where.name = Like(`%${query.keyword}%`);
    if (query.industryId) where.industryId = query.industryId;
    if (query.publishStatus) where.publishStatus = query.publishStatus;

    const [rows, total] = await this.kbRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    // 批量查行业名（避免原始 join + select + getManyAndCount 的 TypeORM 兼容问题）
    const industryIds = [
      ...new Set(rows.map((r) => r.industryId).filter((v): v is number => !!v)),
    ];
    const industryMap = new Map<number, string>();
    if (industryIds.length > 0) {
      const cats = await this.industryRepo.find({ where: { id: In(industryIds) } });
      for (const c of cats) industryMap.set(c.id, c.name);
    }
    return {
      list: rows.map((kb) => ({
        ...kb,
        industryName: kb.industryId ? industryMap.get(kb.industryId) : undefined,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 创建官方知识库：本地落库 + 引擎建数据集（失败降级，不阻断） */
  async create(dto: {
    name: string;
    description?: string;
    industryId?: number;
    visibility?: string;
  }): Promise<KnowledgeBaseEntity> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('知识库名称不能为空');
    if (dto.industryId) {
      const cat = await this.industryRepo.findOne({ where: { id: dto.industryId } });
      if (!cat) throw new BadRequestException('行业分类不存在');
    }
    const kb = await this.kbRepo.save(
      this.kbRepo.create({
        userId: 0,
        name,
        description: dto.description?.trim() || undefined,
        industryId: dto.industryId || undefined,
        visibility: dto.visibility === 'private' ? 'private' : 'public',
        isOfficial: true,
        publishStatus: 'draft',
        status: 'active',
      }),
    );
    // 引擎尽力同步（MaxKB 未部署时仅告警，本地库照常可用）
    try {
      await this.engineService.createEngineKb(kb.id, kb.name, kb.description);
    } catch (err) {
      this.logger.warn(`官方知识库 ${kb.id} 引擎建库失败: ${(err as Error).message}`);
    }
    return kb;
  }

  async update(
    id: number,
    dto: { name?: string; description?: string; industryId?: number; visibility?: string },
  ): Promise<void> {
    const kb = await this.getOfficialBase(id);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('知识库名称不能为空');
      kb.name = name;
    }
    if (dto.description !== undefined) kb.description = dto.description?.trim() || undefined;
    if (dto.industryId !== undefined) kb.industryId = dto.industryId || undefined;
    if (dto.visibility !== undefined) kb.visibility = dto.visibility === 'private' ? 'private' : 'public';
    await this.kbRepo.save(kb);
  }

  /** 发布：确保引擎数据集存在后置为 published（引擎失败仅告警） */
  async publish(id: number): Promise<void> {
    const kb = await this.getOfficialBase(id);
    if (!kb.engineKbId) {
      try {
        await this.engineService.createEngineKb(kb.id, kb.name, kb.description);
      } catch (err) {
        this.logger.warn(`官方知识库 ${kb.id} 发布前引擎建库失败: ${(err as Error).message}`);
      }
    }
    kb.publishStatus = 'published';
    await this.kbRepo.save(kb);
  }

  /** 下架 */
  async unpublish(id: number): Promise<void> {
    const kb = await this.getOfficialBase(id);
    kb.publishStatus = 'unpublished';
    await this.kbRepo.save(kb);
  }

  /** 删除官方知识库（级联：引擎数据集 + 本地文档/分块/文件） */
  async remove(id: number): Promise<void> {
    const kb = await this.getOfficialBase(id);
    await this.engineService.deleteEngineKb(kb.id);
    const docs = await this.docRepo.find({ where: { knowledgeBaseId: kb.id } });
    await this.chunkRepo.delete({ knowledgeBaseId: kb.id });
    await this.docRepo.delete({ knowledgeBaseId: kb.id });
    await this.kbRepo.delete({ id: kb.id });
    for (const doc of docs) {
      await this.removeStoredFile(doc.filePath);
    }
  }

  /** 官方知识库文档列表 */
  async listDocuments(kbId: number): Promise<KnowledgeBaseDocumentEntity[]> {
    await this.getOfficialBase(kbId);
    return this.docRepo.find({
      where: { knowledgeBaseId: kbId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 上传文档：本地落盘记录 + 引擎尽力同步（失败标 engine_status=failed） */
  async uploadDocument(
    kbId: number,
    file: Express.Multer.File,
  ): Promise<KnowledgeBaseDocumentEntity> {
    const kb = await this.getOfficialBase(kbId);
    if (!file) throw new BadRequestException('文件不能为空');

    const fileUrl = '/uploads/knowledge/' + file.filename;
    await this.fileRepo.save(
      this.fileRepo.create({
        userId: 0,
        name: file.originalname,
        path: fileUrl,
        size: file.size,
        mimeType: file.mimetype,
        storageType: 'minio',
      }),
    );

    const doc = await this.docRepo.save(
      this.docRepo.create({
        knowledgeBaseId: kbId,
        name: file.originalname,
        filePath: fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        chunkCount: 0,
        tokenCount: 0,
        status: 'pending',
      }),
    );
    await this.kbRepo.increment({ id: kbId }, 'documentCount', 1);

    // 引擎尽力同步（不阻断上传）；diskStorage 模式需从磁盘读回文件内容
    let buffer: Buffer;
    try {
      buffer = file.buffer || fs.readFileSync(path.resolve('.', 'uploads/knowledge/' + file.filename));
    } catch (err) {
      this.logger.warn(`读取上传文件失败: ${(err as Error).message}`);
      return doc;
    }
    await this.engineService.syncDocumentToEngine(kbId, doc.id, {
      originalname: file.originalname,
      buffer,
      mimetype: file.mimetype,
    });
    // 返回数据库最新实体（同步完成后带上 engineDocumentId / engineStatus）
    const synced = await this.docRepo.findOne({ where: { id: doc.id } });
    return synced ?? doc;
  }

  /** 重试文档引擎同步 */
  async retryEngineSync(kbId: number, docId: number): Promise<void> {
    await this.getOfficialBase(kbId);
    await this.engineService.retryEngineSync(kbId, docId);
  }

  async deleteDocument(kbId: number, docId: number): Promise<void> {
    await this.getOfficialBase(kbId);
    const doc = await this.docRepo.findOne({ where: { id: docId, knowledgeBaseId: kbId } });
    if (!doc) throw new NotFoundException('文档不存在');
    await this.engineService.deleteEngineDocument(kbId, docId);
    await this.chunkRepo.delete({ documentId: docId });
    await this.docRepo.delete({ id: docId });
    await this.kbRepo.decrement({ id: kbId }, 'documentCount', 1);
    await this.kbRepo.decrement({ id: kbId }, 'totalChunks', doc.chunkCount);
    await this.removeStoredFile(doc.filePath);
  }

  private async getOfficialBase(id: number): Promise<KnowledgeBaseEntity> {
    const kb = await this.kbRepo.findOne({ where: { id } });
    if (!kb || !kb.isOfficial) throw new NotFoundException('官方知识库不存在');
    return kb;
  }

  /** 删除物理文件与 files 表记录（尽力而为） */
  private async removeStoredFile(filePath?: string | null): Promise<void> {
    if (!filePath) return;
    try {
      await this.fileRepo.delete({ userId: 0, path: filePath });
    } catch (err) {
      this.logger.warn(`删除 files 记录失败: ${filePath} - ${(err as Error).message}`);
    }
    const relativePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const absPath = path.resolve('.', relativePath);
    try {
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (err) {
      this.logger.warn(`删除物理文件失败: ${absPath} - ${(err as Error).message}`);
    }
  }
}
