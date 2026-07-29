import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { KnowledgeBaseEntity } from '../entities/knowledge-base.entity';
import { KnowledgeBaseDocumentEntity } from '../entities/knowledge-base-document.entity';
import { KnowledgeBaseChunkEntity } from '../entities/knowledge-base-chunk.entity';
import {
  PaginationQuery,
  PaginatedResult,
} from '../../../common/types/pagination.type';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly kbRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeBaseDocumentEntity)
    private readonly docRepo: Repository<KnowledgeBaseDocumentEntity>,
    @InjectRepository(KnowledgeBaseChunkEntity)
    private readonly chunkRepo: Repository<KnowledgeBaseChunkEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'knowledgeBase' };
  }

  // ============ 知识库 CRUD ============

  /** 当前用户的知识库列表 */
  async listBases(
    userId: number,
    query: PaginationQuery,
  ): Promise<PaginatedResult<KnowledgeBaseEntity>> {
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
        kw: `%${query.keyword}%`,
      });
    }

    const [list, total] = await qb.getManyAndCount();
    return {
      list,
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
  ): Promise<KnowledgeBaseEntity> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('知识库名称不能为空');
    }

    const kb = this.kbRepo.create({
      userId,
      name: dto.name.trim(),
      description: dto.description?.trim() || undefined,
      // type 字段在 entity 中没有对应列，忽略
    });

    return this.kbRepo.save(kb);
  }

  /** 删除知识库（校验归属权） */
  async deleteBase(userId: number, kbId: number): Promise<void> {
    const kb = await this.kbRepo.findOne({
      where: { id: kbId },
    });

    if (!kb) {
      throw new NotFoundException('知识库不存在');
    }

    if (kb.userId !== userId) {
      throw new ForbiddenException('无权操作此知识库');
    }

    // 先删除关联的 chunks
    await this.chunkRepo.delete({ knowledgeBaseId: kbId });
    // 再删除关联的 documents
    await this.docRepo.delete({ knowledgeBaseId: kbId });
    // 最后删除知识库本身
    await this.kbRepo.delete({ id: kbId });
  }

  /** 获取知识库（校验归属权） */
  async getBase(userId: number, kbId: number): Promise<KnowledgeBaseEntity> {
    const kb = await this.kbRepo.findOne({ where: { id: kbId } });
    if (!kb) {
      throw new NotFoundException('知识库不存在');
    }
    if (kb.userId !== userId) {
      throw new ForbiddenException('无权操作此知识库');
    }
    return kb;
  }

  // ============ 文档 ============

  /** 知识库下的文档列表 */
  async listDocuments(
    userId: number,
    kbId: number,
    query: PaginationQuery,
  ): Promise<PaginatedResult<KnowledgeBaseDocumentEntity>> {
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
      qb.andWhere('doc.name LIKE :kw', { kw: `%${query.keyword}%` });
    }

    const [list, total] = await qb.getManyAndCount();
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
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
  }

  // ============ 搜索 ============

  /** 搜索知识库（简单的 LIKE 搜索） */
  async search(
    userId: number,
    kbId: number,
    dto: { query: string; limit?: number },
  ): Promise<
    Array<{
      id: number;
      content: string;
      chunkIndex: number;
      documentId: number;
      documentName?: string;
    }>
  > {
    // 校验知识库归属权
    await this.getBase(userId, kbId);

    if (!dto.query || !dto.query.trim()) {
      throw new BadRequestException('搜索内容不能为空');
    }

    const limit = Math.min(dto.limit ?? 10, 50);

    // 在 chunks 表中做 LIKE 搜索
    const chunks = await this.chunkRepo.find({
      where: {
        knowledgeBaseId: kbId,
        content: Like(`%${dto.query.trim()}%`),
      },
      take: limit,
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

    return chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      documentId: chunk.documentId,
      documentName: docMap.get(chunk.documentId),
    }));
  }
}
