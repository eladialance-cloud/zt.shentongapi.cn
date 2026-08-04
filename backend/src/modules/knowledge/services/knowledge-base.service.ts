import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeBaseEntity } from '../entities/knowledge-base.entity';
import { KnowledgeBaseDocumentEntity } from '../entities/knowledge-base-document.entity';
import { KnowledgeBaseChunkEntity } from '../entities/knowledge-base-chunk.entity';
import { FileEntity } from '../../file/entities/file.entity';
import {
  PaginationQuery,
  PaginatedResult,
} from '../../../common/types/pagination.type';

/**
 * 响应契约（与桌面端 desktop/src/types/knowledge.ts 对齐）
 */
export interface KnowledgeBaseDto {
  id: number;
  name: string;
  description?: string;
  documentCount: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface KnowledgeDocumentDto {
  id: number;
  knowledgeBaseId: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkStatus: 'pending' | 'processing' | 'completed' | 'failed';
  chunkCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SearchResultDto {
  id: string;
  content: string;
  score: number;
  documentId: number;
  documentName: string;
  metadata?: unknown;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly kbRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeBaseDocumentEntity)
    private readonly docRepo: Repository<KnowledgeBaseDocumentEntity>,
    @InjectRepository(KnowledgeBaseChunkEntity)
    private readonly chunkRepo: Repository<KnowledgeBaseChunkEntity>,
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'knowledgeBase' };
  }

  // ============ 知识库 CRUD ============

  /** 当前用户的知识库列表（全量，桌面端契约 KnowledgeBase[]） */
  async listAllBases(userId: number): Promise<KnowledgeBaseDto[]> {
    const bases = await this.kbRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return bases.map((kb) => this.toBaseDto(kb));
  }

  /** 当前用户的知识库列表（分页） */
  async listBases(
    userId: number,
    query: PaginationQuery,
  ): Promise<PaginatedResult<KnowledgeBaseDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.kbRepo
      .createQueryBuilder('kb')
      .where('kb.user_id = :userId', { userId })
      .orderBy('kb.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.keyword) {
      qb.andWhere('(kb.name LIKE :kw OR kb.description LIKE :kw)', {
        kw: '%' + query.keyword + '%',
      });
    }

    const [list, total] = await qb.getManyAndCount();
    return {
      list: list.map((kb) => this.toBaseDto(kb)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 创建知识库 */
  async createBase(
    userId: number,
    dto: { name: string; description?: string; type?: string },
  ): Promise<KnowledgeBaseDto> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('知识库名称不能为空');
    }

    const kb = this.kbRepo.create({
      userId,
      name: dto.name.trim(),
      description: dto.description?.trim() || undefined,
      // type 字段在 entity 中没有对应列，忽略
    });

    const saved = await this.kbRepo.save(kb);
    return this.toBaseDto(saved);
  }

  /** 删除知识库（非本人一律 404；级联删除文档/分块/文件记录） */
  async deleteBase(userId: number, kbId: number): Promise<void> {
    const kb = await this.kbRepo.findOne({
      where: { id: kbId },
    });

    if (!kb || kb.userId !== userId) {
      throw new NotFoundException('知识库不存在');
    }

    const docs = await this.docRepo.find({
      where: { knowledgeBaseId: kbId },
    });

    // 先删除关联的 chunks
    await this.chunkRepo.delete({ knowledgeBaseId: kbId });
    // 再删除关联的 documents
    await this.docRepo.delete({ knowledgeBaseId: kbId });
    // 最后删除知识库本身
    await this.kbRepo.delete({ id: kbId });

    // 清理物理文件与 files 表记录（尽力而为）
    for (const doc of docs) {
      await this.removeStoredFile(userId, doc.filePath);
    }
  }

  /** 获取知识库（不存在或非本人一律 404，避免泄露存在性） */
  async getBase(userId: number, kbId: number): Promise<KnowledgeBaseEntity> {
    const kb = await this.kbRepo.findOne({ where: { id: kbId } });
    if (!kb || kb.userId !== userId) {
      throw new NotFoundException('知识库不存在');
    }
    return kb;
  }

  // ============ 文档 ============

  /** 知识库下的文档列表（全量，桌面端契约 KnowledgeDocument[]） */
  async listAllDocuments(
    userId: number,
    kbId: number,
  ): Promise<KnowledgeDocumentDto[]> {
    // 校验归属权
    await this.getBase(userId, kbId);

    const docs = await this.docRepo.find({
      where: { knowledgeBaseId: kbId },
      order: { createdAt: 'DESC' },
    });
    return docs.map((doc) => this.toDocumentDto(doc));
  }

  /** 知识库下的文档列表（分页） */
  async listDocuments(
    userId: number,
    kbId: number,
    query: PaginationQuery,
  ): Promise<PaginatedResult<KnowledgeDocumentDto>> {
    // 校验归属权
    await this.getBase(userId, kbId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.docRepo
      .createQueryBuilder('doc')
      .where('doc.knowledge_base_id = :kbId', { kbId })
      .orderBy('doc.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.keyword) {
      qb.andWhere('doc.name LIKE :kw', { kw: '%' + query.keyword + '%' });
    }

    const [list, total] = await qb.getManyAndCount();
    return {
      list: list.map((doc) => this.toDocumentDto(doc)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 上传文档（multipart field: file）
   * 文件落盘到 ./uploads/knowledge，同时写入 files 表与知识库文档表
   */
  async uploadDocument(
    userId: number,
    kbId: number,
    file: Express.Multer.File,
  ): Promise<KnowledgeDocumentDto> {
    // 校验知识库归属权
    await this.getBase(userId, kbId);

    if (!file) {
      throw new BadRequestException('文件不能为空');
    }

    const fileUrl = '/uploads/knowledge/' + file.filename;

    // 写入 files 表（参考 file 模块上传逻辑）
    await this.fileRepo.save(
      this.fileRepo.create({
        userId,
        name: file.originalname,
        path: fileUrl,
        size: file.size,
        mimeType: file.mimetype,
        storageType: 'minio', // entity 要求 enum，暂用 minio 占位
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

    // 更新知识库文档计数
    await this.kbRepo.increment({ id: kbId }, 'documentCount', 1);

    this.logger.log(
      '用户 ' + userId + ' 上传知识库文档 ' + file.originalname + ' -> ' + fileUrl + ' (' + file.size + ' bytes)',
    );
    return this.toDocumentDto(doc);
  }

  /** 删除文档 */
  async deleteDocument(
    userId: number,
    kbId: number,
    docId: number,
  ): Promise<void> {
    // 校验知识库归属权
    await this.getBase(userId, kbId);

    const doc = await this.docRepo.findOne({
      where: { id: docId, knowledgeBaseId: kbId },
    });

    if (!doc) {
      throw new NotFoundException('文档不存在');
    }

    // 先删除关联的 chunks
    await this.chunkRepo.delete({ documentId: docId });
    // 再删除文档本身
    await this.docRepo.delete({ id: docId });

    // 更新知识库的文档数和 chunk 数
    await this.kbRepo.decrement({ id: kbId }, 'documentCount', 1);
    await this.kbRepo.decrement({ id: kbId }, 'totalChunks', doc.chunkCount);

    // 清理物理文件与 files 表记录（尽力而为）
    await this.removeStoredFile(userId, doc.filePath);
  }

  // ============ 搜索 ============

  /** 搜索知识库（chunks 表 LIKE 匹配，返回桌面端契约 SearchResult[]） */
  async search(
    userId: number,
    kbId: number,
    dto: { query: string; topK?: number },
  ): Promise<SearchResultDto[]> {
    // 校验知识库归属权
    await this.getBase(userId, kbId);

    const query = dto.query?.trim();
    if (!query) {
      throw new BadRequestException('搜索内容不能为空');
    }

    const topK = Math.min(dto.topK ?? 5, 50);

    // 在 chunks 表中做 LIKE 搜索
    const chunks = await this.chunkRepo.find({
      where: {
        knowledgeBaseId: kbId,
        content: Like('%' + query + '%'),
      },
      take: topK,
      order: { chunkIndex: 'ASC' },
    });

    if (chunks.length === 0) {
      return [];
    }

    // 批量查询关联文档名称
    const docIds = [...new Set(chunks.map((c) => c.documentId))];
    const docs = await this.docRepo.find({
      where: docIds.map((id) => ({ id })),
      select: ['id', 'name'],
    });
    const docMap = new Map(docs.map((d) => [d.id, d.name]));

    const lowerQuery = query.toLowerCase();
    return chunks
      .map((chunk) => {
        const lowerContent = chunk.content.toLowerCase();
        const idx = lowerContent.indexOf(lowerQuery);
        // 基于匹配位置的启发式分数（0-1）
        const rawScore =
          idx < 0
            ? 0.5
            : Math.max(0.1, 1 - idx / Math.max(chunk.content.length, 1));
        return {
          id: String(chunk.id),
          content: chunk.content,
          score: Math.round(rawScore * 10000) / 10000,
          documentId: chunk.documentId,
          documentName: docMap.get(chunk.documentId) ?? '',
          metadata: {
            chunkIndex: chunk.chunkIndex,
            tokenCount: chunk.tokenCount,
          },
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  // ============ 内部工具 ============

  private toBaseDto(base: KnowledgeBaseEntity): KnowledgeBaseDto {
    return {
      id: base.id,
      name: base.name,
      description: base.description,
      documentCount: base.documentCount,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    };
  }

  private toDocumentDto(
    doc: KnowledgeBaseDocumentEntity,
  ): KnowledgeDocumentDto {
    const statusMap: Record<
      KnowledgeBaseDocumentEntity['status'],
      KnowledgeDocumentDto['chunkStatus']
    > = {
      pending: 'pending',
      processing: 'processing',
      done: 'completed',
      error: 'failed',
    };
    return {
      id: doc.id,
      knowledgeBaseId: doc.knowledgeBaseId,
      fileName: doc.name,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType ?? '',
      chunkStatus: statusMap[doc.status],
      chunkCount: doc.chunkCount,
      errorMessage: doc.error ?? undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /** 删除物理文件与 files 表记录（尽力而为，不阻塞主流程） */
  private async removeStoredFile(
    userId: number,
    filePath?: string | null,
  ): Promise<void> {
    if (!filePath) {
      return;
    }
    try {
      await this.fileRepo.delete({ userId, path: filePath });
    } catch (err) {
      this.logger.warn(
        '删除 files 记录失败: ' + filePath + ' - ' + (err as Error).message,
      );
    }
    const relativePath = filePath.startsWith('/')
      ? filePath.slice(1)
      : filePath;
    const absPath = path.resolve('.', relativePath);
    try {
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
    } catch (err) {
      this.logger.warn(
        '删除物理文件失败: ' + absPath + ' - ' + (err as Error).message,
      );
    }
  }
}
