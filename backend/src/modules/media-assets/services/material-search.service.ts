/**
 * 素材中心语义检索服务（对标参考软件 material:vectorize/search）
 *
 * 复用仓库既有基础设施：QdrantService（common/services）+ SystemLlmService.embed()（oral-workshop）
 * 检索策略与知识库一致：向量语义检索优先，Qdrant 不可用时降级 MySQL LIKE 兜底。
 */
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, FindOptionsWhere } from 'typeorm';
import { MediaAssetEntity, MediaAssetType } from '../entities/media-asset.entity';
import { QdrantService } from '../../../common/services/qdrant.service';
import { SystemLlmService } from '../../oral-workshop/system-llm.service';

const MATERIAL_COLLECTION = 'media_assets_v1';

/** 汇总素材可检索文本（标题 + 标签 + 描述 + meta 摘要字段） */
export function buildAssetSearchText(asset: MediaAssetEntity): string {
  const parts: string[] = [asset.title];
  if (asset.tags?.length) parts.push(asset.tags.join(' '));
  if (asset.description) parts.push(asset.description);
  if (asset.meta && typeof asset.meta === 'object') {
    const m = asset.meta as Record<string, unknown>;
    for (const key of ['summary', 'transcript', 'genre', 'style', 'keywords']) {
      if (typeof m[key] === 'string' && String(m[key]).trim()) parts.push(String(m[key]).trim());
    }
  }
  return parts.filter(Boolean).join(' ');
}

export interface MaterialSearchResult {
  asset: MediaAssetEntity;
  score: number;
}

@Injectable()
export class MaterialSearchService {
  private readonly logger = new Logger(MaterialSearchService.name);

  constructor(
    @InjectRepository(MediaAssetEntity)
    private readonly assetRepo: Repository<MediaAssetEntity>,
    private readonly qdrant: QdrantService,
    private readonly llm: SystemLlmService,
  ) {}

  /** 向量化单个素材：文本 → embedding → Qdrant upsert；失败标记 failed 不抛错 */
  async vectorizeAsset(userId: number, id: number): Promise<MediaAssetEntity> {
    const asset = await this.assetRepo.findOne({ where: { id, userId } });
    if (!asset) throw new NotFoundException('素材不存在');

    const text = buildAssetSearchText(asset);
    if (!text) {
      asset.vectorStatus = 'failed';
      return this.assetRepo.save(asset);
    }
    try {
      const vectors = await this.llm.embed([text]);
      await this.qdrant.ensureCollection(MATERIAL_COLLECTION, vectors[0].length);
      await this.qdrant.upsertPoints(MATERIAL_COLLECTION, [
        {
          id: asset.id,
          vector: vectors[0],
          payload: {
            userId: Number(asset.userId),
            assetId: asset.id,
            assetType: asset.assetType,
            title: asset.title,
          },
        },
      ]);
      asset.vectorStatus = 'ready';
    } catch (err) {
      this.logger.warn('[material-search] 向量化失败 asset#' + id + ': ' + (err as Error).message);
      asset.vectorStatus = 'failed';
    }
    return this.assetRepo.save(asset);
  }

  /** 语义检索：Qdrant 优先，失败降级 MySQL LIKE（与知识库引擎降级策略一致） */
  async search(
    userId: number,
    dto: { q: string; type?: MediaAssetType; topK?: number },
  ): Promise<MaterialSearchResult[]> {
    const q = dto.q?.trim();
    if (!q) throw new BadRequestException('搜索内容不能为空');
    const topK = Math.min(dto.topK ?? 10, 50);
    const typeFilter = dto.type;

    try {
      const vectors = await this.llm.embed([q]);
      const must: Array<{ key: string; match: { value: string | number } }> = [
        { key: 'userId', match: { value: Number(userId) } },
      ];
      if (typeFilter) must.push({ key: 'assetType', match: { value: typeFilter } });
      const hits = await this.qdrant.search(MATERIAL_COLLECTION, vectors[0], topK, { must });
      if (hits.length > 0) {
        const ids = hits.map((h) => Number(h.id));
        const assets = await this.assetRepo.find({ where: { id: In(ids), userId } });
        const byId = new Map(assets.map((a) => [a.id, a]));
        const found = hits
          .filter((h) => byId.has(Number(h.id)))
          .map((h) => ({ asset: byId.get(Number(h.id)) as MediaAssetEntity, score: h.score }));
        if (found.length > 0) return found;
      }
    } catch (err) {
      this.logger.warn('[material-search] 语义检索不可用，降级 LIKE: ' + (err as Error).message);
    }

    // 降级：MySQL LIKE（title / description），类型过滤可选
    const escapedQ = q.replace(/[\\%_]/g, (m) => '\\' + m);
    const like = Like('%' + escapedQ + '%');
    const conditions: FindOptionsWhere<MediaAssetEntity>[] = [
      { userId, bizType: 'media', title: like },
      { userId, bizType: 'media', description: like },
    ];
    if (typeFilter) {
      conditions.forEach((c) => (c.assetType = typeFilter));
    }
    const rows = await this.assetRepo.find({
      where: conditions,
      take: topK,
      order: { createdAt: 'DESC' },
    });
    return rows.map((asset) => ({ asset, score: 0 }));
  }
}
