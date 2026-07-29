import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Qdrant 向量数据库服务
 * 提供 Qdrant 客户端连接与集合管理
 * 环境变量：QDRANT_URL（默认 http://localhost:6333）
 */
@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('QDRANT_URL', 'http://localhost:6333');
    this.logger.log(`Initializing Qdrant client, url=${url}`);
    this.client = new QdrantClient({ url });
  }

  /**
   * 获取 Qdrant 客户端实例
   */
  getClient(): QdrantClient {
    return this.client;
  }

  /**
   * 健康检查：验证 Qdrant 连接是否正常
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await (this.client as unknown as { getClustersInfo: () => Promise<{ status: string }> }).getClustersInfo();
      return result?.status === 'ok';
    } catch (err) {
      this.logger.error(`Qdrant health check failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * 创建集合（如不存在）
   * @param collectionName 集合名称
   * @param vectorSize 向量维度（默认 1536，适配 text-embedding-ada-002）
   */
  async ensureCollection(
    collectionName: string,
    vectorSize = 1536,
  ): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === collectionName,
      );
      if (!exists) {
        await this.client.createCollection(collectionName, {
          vectors: { size: vectorSize, distance: 'Cosine' },
        });
        this.logger.log(
          `Collection "${collectionName}" created (vectorSize=${vectorSize})`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to ensure collection "${collectionName}": ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * 删除集合
   */
  async deleteCollection(collectionName: string): Promise<void> {
    try {
      await this.client.deleteCollection(collectionName);
      this.logger.log(`Collection "${collectionName}" deleted`);
    } catch (err) {
      this.logger.error(
        `Failed to delete collection "${collectionName}": ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * 插入或更新向量点
   */
  async upsertPoints(
    collectionName: string,
    points: Array<{ id: string | number; vector: number[]; payload?: Record<string, unknown> }>,
  ): Promise<void> {
    await this.client.upsert(collectionName, {
      wait: true,
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });
  }

  /**
   * 语义搜索：通过向量检索最相似的点
   */
  async search(
    collectionName: string,
    vector: number[],
    topK = 5,
    filter?: Record<string, unknown>,
  ): Promise<Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>> {
    const results = await this.client.search(collectionName, {
      vector,
      limit: topK,
      filter,
      with_payload: true,
    });

    return results.map((r) => ({
      id: r.id as string | number,
      score: r.score,
      payload: (r.payload ?? undefined) as Record<string, unknown> | undefined,
    }));
  }

  /**
   * 删除向量点
   */
  async deletePoints(
    collectionName: string,
    ids: Array<string | number>,
  ): Promise<void> {
    await this.client.delete(collectionName, {
      wait: true,
      points: ids,
    });
  }
}
