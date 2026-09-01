/** 素材中心语义检索单元测试（对标参考软件 material:vectorize/search） */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  MaterialSearchService,
  buildAssetSearchText,
} from '../../src/modules/media-assets/services/material-search.service';
import type { SystemLlmService } from '../../src/modules/oral-workshop/system-llm.service';
import type { QdrantService } from '../../src/common/services/qdrant.service';

// ===== fakes =====
function fakeAssetRepo(seed: any[] = []) {
  const rows: any[] = [...seed];
  let nextId = seed.length + 1;
  return {
    rows,
    findOne: async (opts: any) => {
      const w = opts?.where ?? {};
      return rows.find((r: any) => Object.keys(w).every((k) => r[k] === w[k])) ?? null;
    },
    find: async (opts: any) => {
      const w = opts?.where ?? {};
      const conds = Array.isArray(w) ? w : [w];
      const matched = rows.filter((r: any) =>
        conds.some((cond: any) =>
          Object.keys(cond).every((k: string) => {
            const want = cond[k];
            if (want && typeof want === 'object' && '_value' in want) {
              const needle = String((want as any)._value).replace(/%/g, '');
              return needle ? String(r[k] ?? '').includes(needle) : false;
            }
            return r[k] === want;
          }),
        ),
      );
      return matched.slice(0, opts?.take ?? 100);
    },
    create: (d: any) => ({ id: nextId++, ...d }),
    save: async (e: any) => {
      const idx = rows.findIndex((r: any) => r.id === e.id);
      if (idx >= 0) rows[idx] = e; else rows.push(e);
      return e;
    },
  };
}

function fakeQdrant(behavior: 'ok' | 'down' = 'ok') {
  const points: any[] = [];
  return {
    points,
    ensureCollection: async () => undefined,
    upsertPoints: async (_c: string, ps: any[]) => { points.push(...ps); },
    search: async (_c: string, _v: number[], topK: number, filter?: any) => {
      if (behavior === 'down') throw new Error('Qdrant connection refused');
      // 模拟真实 Qdrant 的 must/match 语义（过滤 userId / assetType）
      const musts: Array<{ key: string; match: { value: string | number } }> = filter?.must ?? [];
      return points
        .filter((p) => musts.every((m) => p.payload[m.key] === m.match.value))
        .slice(0, topK)
        .map((p) => ({ id: p.id, score: 0.9, payload: p.payload }));
    },
  };
}

function fakeLlm(embedImpl: (texts: string[]) => Promise<number[][]>) {
  return { embed: embedImpl } as unknown as SystemLlmService;
}

function newService(seed: any[] = [], qdrantBehavior: 'ok' | 'down' = 'ok', embedImpl?: (t: string[]) => Promise<number[][]>) {
  const assetRepo = fakeAssetRepo(seed);
  const qdrant = fakeQdrant(qdrantBehavior);
  const svc = new MaterialSearchService(
    assetRepo as any,
    qdrant as unknown as QdrantService,
    fakeLlm(embedImpl ?? (async (t: string[]) => t.map(() => [0.1, 0.2, 0.3]))),
  );
  return { svc, assetRepo, qdrant };
}

// ===== tests =====
describe('MaterialSearchService 素材向量化', () => {
  it('vectorizeAsset：embedding + Qdrant upsert，状态置 ready', async () => {
    const { svc, assetRepo, qdrant } = newService([
      { id: 1, userId: 7, title: '科技风宣传片', assetType: 'video', tags: ['宣传'], description: '蓝色科技感背景' },
    ]);
    const asset = await svc.vectorizeAsset(7, 1);
    assert.equal(asset.vectorStatus, 'ready');
    assert.equal(qdrant.points.length, 1);
    assert.equal(qdrant.points[0].payload.userId, 7);
    assert.equal(qdrant.points[0].payload.assetId, 1);
    assert.deepEqual(qdrant.points[0].vector, [0.1, 0.2, 0.3]);
    assert.equal(assetRepo.rows[0].vectorStatus, 'ready');
  });

  it('vectorizeAsset：素材不存在抛 NotFound', async () => {
    const { svc } = newService([]);
    await assert.rejects(() => svc.vectorizeAsset(7, 999), NotFoundException);
  });

  it('vectorizeAsset：embedding 失败标记 failed 不抛错', async () => {
    const { svc, assetRepo } = newService(
      [{ id: 1, userId: 7, title: 'x' }],
      'ok',
      async () => { throw new Error('embedding 服务不可用'); },
    );
    const asset = await svc.vectorizeAsset(7, 1);
    assert.equal(asset.vectorStatus, 'failed');
    assert.equal(assetRepo.rows[0].vectorStatus, 'failed');
  });

  it('buildAssetSearchText：标题+标签+描述+meta 摘要拼接', () => {
    const text = buildAssetSearchText({
      title: '产品海报',
      tags: ['电商', '海报'],
      description: '促销活动',
      meta: { summary: '618 大促主视觉', genre: '电商' },
    } as any);
    assert.ok(text.includes('产品海报'));
    assert.ok(text.includes('电商'));
    assert.ok(text.includes('促销活动'));
    assert.ok(text.includes('618 大促主视觉'));
  });
});

describe('MaterialSearchService 语义检索', () => {
  it('search：Qdrant 命中返回按相似度排序的素材', async () => {
    const { svc, qdrant } = newService([
      { id: 1, userId: 7, title: '科技风宣传片', assetType: 'video', vectorStatus: 'ready' },
      { id: 2, userId: 7, title: '美食探店', assetType: 'video', vectorStatus: 'ready' },
      { id: 3, userId: 8, title: '别人的素材', assetType: 'video', vectorStatus: 'ready' },
    ]);
    qdrant.points.push(
      { id: 1, vector: [0.1, 0.2, 0.3], payload: { userId: 7, assetId: 1, assetType: 'video', title: '科技风宣传片' } },
      { id: 3, vector: [0.1, 0.2, 0.3], payload: { userId: 8, assetId: 3, assetType: 'video', title: '别人的素材' } },
    );
    const hits = await svc.search(7, { q: '科技', topK: 5 });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].asset.id, 1);
    assert.ok(hits[0].score > 0);
  });

  it('search：Qdrant 不可用降级 LIKE（title/description 模糊匹配）', async () => {
    const { svc } = newService(
      [
        { id: 1, userId: 7, bizType: 'media', title: '科技风宣传片', assetType: 'video' },
        { id: 2, userId: 7, bizType: 'media', title: '美食探店', assetType: 'video' },
      ],
      'down',
    );
    const hits = await svc.search(7, { q: '宣传', topK: 5 });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].asset.id, 1);
    assert.equal(hits[0].score, 0);
  });

  it('search：空关键词抛 BadRequest', async () => {
    const { svc } = newService([]);
    await assert.rejects(() => svc.search(7, { q: '   ' }), BadRequestException);
  });
});
