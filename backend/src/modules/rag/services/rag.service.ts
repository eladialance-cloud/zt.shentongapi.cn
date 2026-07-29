import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { RagDocumentEntity } from '../entities/rag-document.entity';

/**
 * RAG 服务
 *
 * 提供文档摄入、检索与删除能力。
 * 当前为简化版：分块存储 + 关键词搜索。
 * 后续可接入向量搜索引擎（如 Milvus / pgvector）实现语义搜索。
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  /** 默认分块大小（字符数） */
  private readonly chunkSize = 1000;

  /** 分块重叠（字符数） */
  private readonly chunkOverlap = 200;

  constructor(
    @InjectRepository(RagDocumentEntity)
    private readonly docRepo: Repository<RagDocumentEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'rag' };
  }

  /**
   * 摄入文档：分块后存储到数据库
   *
   * @param userId 用户 ID
   * @param documentId 文档标识
   * @param content 文档内容
   * @param metadata 附加元数据
   */
  async ingest(
    userId: number,
    documentId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(
      `Ingesting document '${documentId}' for user ${userId} (${content.length} chars)`,
    );

    // 删除旧分块（如果重新摄入）
    await this.docRepo.delete({ userId, documentId });

    // 文档分块
    const chunks = this.splitContent(content, this.chunkSize, this.chunkOverlap);

    // 批量插入分块
    const entities: RagDocumentEntity[] = chunks.map((chunk, index) => {
      const entity = new RagDocumentEntity();
      entity.userId = userId;
      entity.documentId = documentId;
      entity.title = metadata?.title as string | undefined;
      entity.chunkIndex = index;
      entity.content = chunk;
      entity.chunkSize = chunk.length;
      entity.metadata = metadata;
      return entity;
    });

    await this.docRepo.save(entities);

    this.logger.log(
      `Document '${documentId}' ingested: ${chunks.length} chunks stored`,
    );
  }

  /**
   * 检索文档（简化版：关键词搜索）
   *
   * @param userId 用户 ID
   * @param query 查询字符串
   * @param topK 返回结果数（默认 5）
   * @returns 匹配的分块列表
   */
  async search(
    userId: number,
    query: string,
    topK?: number,
  ): Promise<unknown[]> {
    const limit = topK ?? 5;

    this.logger.log(
      `Searching documents for user ${userId}, query: '${query}', topK: ${limit}`,
    );

    // 使用 LIKE 进行关键词搜索（后续替换为向量搜索）
    const results = await this.docRepo.find({
      where: { userId, content: Like(`%${query}%`) },
      order: { documentId: 'ASC', chunkIndex: 'ASC' },
      take: limit,
    });

    return results.map((r) => ({
      documentId: r.documentId,
      chunkIndex: r.chunkIndex,
      content: r.content,
      score: 1, // 关键词搜索暂无评分，后续接入向量搜索后替换
      metadata: r.metadata,
    }));
  }

  /**
   * 删除文档及其所有分块
   *
   * @param userId 用户 ID
   * @param documentId 文档标识
   */
  async deleteDocument(
    userId: number,
    documentId: string,
  ): Promise<void> {
    const result = await this.docRepo.delete({ userId, documentId });

    if (result.affected === 0) {
      throw new NotFoundException(
        `Document '${documentId}' not found for user ${userId}`,
      );
    }

    this.logger.log(
      `Document '${documentId}' deleted for user ${userId} (${result.affected} chunks removed)`,
    );
  }

  /**
   * 文档分块逻辑（滑动窗口）
   */
  private splitContent(
    content: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    if (!content || content.length === 0) {
      return [];
    }
    if (content.length <= chunkSize) {
      return [content];
    }
    if (overlap >= chunkSize) {
      // 防止重叠大于分块大小导致无限循环
      overlap = Math.floor(chunkSize * 0.2);
    }

    const chunks: string[] = [];
    let start = 0;
    let guard = 0; // 安全阀防止无限循环
    const maxIterations = Math.ceil(content.length / (chunkSize - overlap)) + 10;

    while (start < content.length && guard < maxIterations) {
      guard++;
      const end = Math.min(start + chunkSize, content.length);
      const chunk = content.slice(start, end);

      // 尝试在句子边界处截断（避免 falsy 陷阱：使用 >= 0 检查而非 ||）
      const cnPeriod = chunk.lastIndexOf('。');
      const enPeriod = chunk.lastIndexOf('. ');
      const newline = chunk.lastIndexOf('\n');
      let lastSentenceEnd = -1;
      // 选择最靠后的句子边界
      for (const pos of [cnPeriod, enPeriod, newline]) {
        if (pos > lastSentenceEnd) lastSentenceEnd = pos;
      }

      let finalChunk = chunk;
      let actualEnd = end;

      // 仅在句子边界位于后半段且不是末尾时截断
      if (lastSentenceEnd >= chunkSize * 0.5 && end < content.length) {
        finalChunk = chunk.slice(0, lastSentenceEnd + 1);
        actualEnd = start + lastSentenceEnd + 1;
      }

      chunks.push(finalChunk);

      // 防止前进量为 0 导致无限循环
      const nextStart = actualEnd - overlap;
      if (nextStart <= start) {
        // 强制前进至少 1 字符
        start = start + 1;
      } else {
        start = nextStart;
      }

      if (start < 0) start = 0;
      if (actualEnd >= content.length) break;
    }

    return chunks;
  }
}
