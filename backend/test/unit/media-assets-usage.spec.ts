/**
 * MediaAssetService.list() usage 推导字段单元测试
 * 覆盖：无引用 → unused / 草稿、待审引用 → selected / 批准、已发布引用 → in_use /
 *       多计划引用时取最高优先级（in_use > selected > unused）/ 仅统计本人 userId 的计划
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MediaAssetService } from '../../src/modules/media-assets/services/media-asset.service';
import { MediaAssetEntity } from '../../src/modules/media-assets/entities/media-asset.entity';

function makeAsset(overrides: Partial<MediaAssetEntity> = {}): MediaAssetEntity {
  return {
    id: 1,
    userId: 1,
    sourceType: 'manual',
    sourceId: null,
    title: '测试素材',
    assetType: 'file',
    url: 'https://example.com/asset.png',
    mimeType: null,
    fileSize: null,
    tags: null,
    archived: false,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  } as MediaAssetEntity;
}

function makePlan(overrides: Record<string, unknown> = {}): any {
  return {
    id: 1,
    userId: 1,
    title: '发布计划',
    targetPlatforms: ['douyin'],
    mode: 'manual',
    status: 'draft',
    reviewStatus: 'pending',
    assetIds: [],
    ...overrides,
  };
}

/** 最小 find-only repo mock：按 where 全等过滤 */
function makeFindRepo(rows: any[]) {
  return {
    find: async ({ where }: any = {}) =>
      rows.filter((row: any) =>
        Object.entries(where ?? {}).every(([k, v]) => row[k] === v),
      ),
  };
}

function makeService(opts: { assets?: MediaAssetEntity[]; plans?: any[] } = {}) {
  const assetRepo = {
    findAndCount: async ({ where, order, skip, take }: any = {}) => {
      let list = (opts.assets ?? []).filter((row: any) =>
        Object.entries(where ?? {}).every(([k, v]) => row[k] === v),
      );
      const total = list.length;
      if (order?.createdAt === 'DESC') {
        list = [...list].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
            (b.id ?? 0) - (a.id ?? 0),
        );
      }
      const start = skip ?? 0;
      const size = take ?? total;
      return [list.slice(start, start + size), total];
    },
  };
  const publishPlanRepo = makeFindRepo(opts.plans ?? []);
  const svc = new MediaAssetService(
    assetRepo as any,
    {} as any,
    {} as any,
    {} as any,
    publishPlanRepo as any,
  );
  return { svc };
}

async function usageMap(svc: MediaAssetService): Promise<Record<number, string>> {
  const res = await svc.list(1, {});
  return Object.fromEntries(res.list.map((a) => [a.id, (a as any).usage]));
}

describe('MediaAssetService.list usage 推导', () => {
  it('无任何发布计划引用 → unused', async () => {
    const { svc } = makeService({ assets: [makeAsset({ id: 1 })] });
    assert.deepEqual(await usageMap(svc), { 1: 'unused' });
  });

  it('被 draft / pending_review 计划引用 → selected', async () => {
    const { svc } = makeService({
      assets: [makeAsset({ id: 1 }), makeAsset({ id: 2 })],
      plans: [
        makePlan({ id: 11, status: 'draft', assetIds: [1] }),
        makePlan({ id: 12, status: 'pending_review', assetIds: [2] }),
      ],
    });
    assert.deepEqual(await usageMap(svc), { 1: 'selected', 2: 'selected' });
  });

  it('被 approved / published 计划引用 → in_use', async () => {
    const { svc } = makeService({
      assets: [makeAsset({ id: 1 }), makeAsset({ id: 2 })],
      plans: [
        makePlan({ id: 11, status: 'approved', assetIds: [1] }),
        makePlan({ id: 12, status: 'published', assetIds: [2] }),
      ],
    });
    assert.deepEqual(await usageMap(svc), { 1: 'in_use', 2: 'in_use' });
  });

  it('rejected / failed 计划不参与引用 → 视为 unused', async () => {
    const { svc } = makeService({
      assets: [makeAsset({ id: 1 }), makeAsset({ id: 2 })],
      plans: [
        makePlan({ id: 11, status: 'rejected', assetIds: [1] }),
        makePlan({ id: 12, status: 'failed', assetIds: [2] }),
      ],
    });
    assert.deepEqual(await usageMap(svc), { 1: 'unused', 2: 'unused' });
  });

  it('被多个计划引用时按最高优先级：in_use > selected > unused', async () => {
    const { svc } = makeService({
      assets: [makeAsset({ id: 1 }), makeAsset({ id: 2 }), makeAsset({ id: 3 })],
      plans: [
        // 1: draft + approved → in_use
        makePlan({ id: 11, status: 'draft', assetIds: [1] }),
        makePlan({ id: 12, status: 'approved', assetIds: [1] }),
        // 2: 仅 pending_review → selected
        makePlan({ id: 13, status: 'pending_review', assetIds: [2] }),
        // 3: rejected + published → in_use
        makePlan({ id: 14, status: 'rejected', assetIds: [3] }),
        makePlan({ id: 15, status: 'published', assetIds: [3] }),
      ],
    });
    assert.deepEqual(await usageMap(svc), { 1: 'in_use', 2: 'selected', 3: 'in_use' });
  });

  it('只统计本人 userId 的计划：他人计划引用不生效', async () => {
    const { svc } = makeService({
      assets: [makeAsset({ id: 1 }), makeAsset({ id: 2 })],
      plans: [
        makePlan({ id: 11, userId: 2, status: 'published', assetIds: [1] }),
        makePlan({ id: 12, userId: 2, status: 'draft', assetIds: [2] }),
      ],
    });
    assert.deepEqual(await usageMap(svc), { 1: 'unused', 2: 'unused' });
  });
});
