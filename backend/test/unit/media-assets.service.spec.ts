/**
 * MediaAssetService 单元测试
 * 覆盖：手动登记 / 列表（分页 + type/archived 过滤 + 权限过滤）/ 详情与更新权限校验 /
 *       导入 task_output_item（归属校验、类型映射、无 fileUrl 跳过、标题摘要与兜底）/
 *       导入 media_jobs（归属校验、done 限定、多条 resultUrls 拆多条、无 resultUrls 跳过）/
 *       导入幂等（重复导入不重复插入） / 参数校验（taskId 与 mediaJobId 二选一）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MediaAssetService } from '../../src/modules/media-assets/services/media-asset.service';
import { MediaAssetEntity } from '../../src/modules/media-assets/entities/media-asset.entity';

/** 最小内存 Repository mock：支持 create/save/findOne/find/findAndCount，find 支持 In 操作符 */
function makeRepo(seed: MediaAssetEntity[] = []) {
  const rows: MediaAssetEntity[] = [...seed];
  let nextId = seed.reduce((max, r) => Math.max(max, r.id ?? 0), 0) + 1;

  const matches = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([key, value]) => {
      if (value && typeof value === 'object' && (value as any)._type === 'in') {
        return (value as any)._value.includes((row as any)[key]);
      }
      return (row as any)[key] === value;
    });

  const sortDesc = (list: MediaAssetEntity[]) =>
    [...list].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        (b.id ?? 0) - (a.id ?? 0),
    );

  return {
    rows,
    create: (data: any) => ({ ...data }),
    save: async (entity: any) => {
      const list = Array.isArray(entity) ? entity : [entity];
      const saved = list.map((rec: any) => {
        if (!rec.id) rec.id = nextId++;
        const idx = rows.findIndex((r) => r.id === rec.id);
        if (idx >= 0) rows[idx] = rec;
        else rows.push(rec);
        return rec;
      });
      return Array.isArray(entity) ? saved : saved[0];
    },
    findOne: async ({ where }: any = {}) => rows.find((r) => matches(r, where)) ?? null,
    find: async ({ where, order, take }: any = {}) => {
      let list = rows.filter((r) => matches(r, where));
      if (order?.createdAt === 'DESC') list = sortDesc(list);
      if (take !== undefined) list = list.slice(0, take);
      return list;
    },
    findAndCount: async ({ where, order, skip, take }: any = {}) => {
      let list = rows.filter((r) => matches(r, where));
      const total = list.length;
      if (order?.createdAt === 'DESC') list = sortDesc(list);
      const start = skip ?? 0;
      const size = take ?? total;
      return [list.slice(start, start + size), total];
    },
  };
}

function makeService(
  opts: {
    assets?: MediaAssetEntity[];
    taskItems?: any[];
    jobs?: any[];
    tasks?: any[];
    plans?: any[];
  } = {},
) {
  const assetRepo = makeRepo(opts.assets ?? []);
  const taskOutputRepo = {
    find: async ({ where }: any = {}) =>
      (opts.taskItems ?? []).filter((row: any) =>
        Object.entries(where ?? {}).every(([k, v]) => row[k] === v),
      ),
  };
  const mediaJobRepo = {
    findOne: async ({ where }: any = {}) =>
      (opts.jobs ?? []).find((row: any) =>
        Object.entries(where ?? {}).every(([k, v]) => row[k] === v),
      ) ?? null,
  };
  const agentTaskRepo = {
    findOne: async ({ where }: any = {}) =>
      (opts.tasks ?? []).find((row: any) =>
        Object.entries(where ?? {}).every(([k, v]) => row[k] === v),
      ) ?? null,
  };
  const publishPlanRepo = makeRepo(opts.plans ?? []);
  const svc = new MediaAssetService(
    assetRepo as any,
    taskOutputRepo as any,
    mediaJobRepo as any,
    agentTaskRepo as any,
    publishPlanRepo as any,
  );
  return { svc, assetRepo, taskOutputRepo, mediaJobRepo, agentTaskRepo, publishPlanRepo };
}

function makeAsset(overrides: Partial<MediaAssetEntity> = {}): MediaAssetEntity {
  return {
    id: 1,
    userId: 1,
    sourceType: 'manual',
    sourceId: null,
    bizType: 'media',
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

const isBadRequest = (err: any) => err?.getStatus?.() === 400;
const isNotFound = (err: any) => err?.getStatus?.() === 404;

describe('MediaAssetService', () => {
  describe('create（手动登记）', () => {
    it('手动登记：sourceType=manual、assetType 默认 file、archived=false', async () => {
      const { svc, assetRepo } = makeService();
      const result = await svc.create(1, {
        title: '产品宣传图',
        url: 'https://oss.example.com/a.png',
      });
      assert.equal(result.userId, 1);
      assert.equal(result.sourceType, 'manual');
      assert.equal(result.assetType, 'file');
      assert.equal(result.archived, false);
      assert.equal(assetRepo.rows.length, 1);
    });

    it('手动登记：assetType/mimeType/fileSize/tags 透传', async () => {
      const { svc } = makeService();
      const result = await svc.create(1, {
        title: '海报',
        url: 'https://oss.example.com/poster.png',
        assetType: 'image',
        mimeType: 'image/png',
        fileSize: 204800,
        tags: ['海报', '电商'],
      });
      assert.equal(result.assetType, 'image');
      assert.equal(result.mimeType, 'image/png');
      assert.equal(result.fileSize, 204800);
      assert.deepEqual(result.tags, ['海报', '电商']);
    });
  });

  describe('list', () => {
    it('分页返回并附带 total/totalPages，倒序', async () => {
      const seed = [
        makeAsset({ id: 1, title: 'A' }),
        makeAsset({ id: 2, title: 'B' }),
        makeAsset({ id: 3, title: 'C' }),
      ];
      const { svc } = makeService({ assets: seed });
      const result = await svc.list(1, { page: 1, pageSize: 2 });
      assert.equal(result.list.length, 2);
      assert.equal(result.total, 3);
      assert.equal(result.totalPages, 2);
      assert.equal(result.list[0].id, 3); // createdAt 相同，按 id 倒序
    });

    it('type 过滤只返回对应类型', async () => {
      const seed = [
        makeAsset({ id: 1, assetType: 'image' }),
        makeAsset({ id: 2, assetType: 'video' }),
      ];
      const { svc } = makeService({ assets: seed });
      const result = await svc.list(1, { type: 'image' });
      assert.deepEqual(result.list.map((a) => a.id), [1]);
    });

    it('archived 过滤：true 只返回已归档，不传返回全部', async () => {
      const seed = [
        makeAsset({ id: 1, archived: true }),
        makeAsset({ id: 2, archived: false }),
      ];
      const { svc } = makeService({ assets: seed });
      const archived = await svc.list(1, { archived: 'true' });
      assert.deepEqual(archived.list.map((a) => a.id), [1]);
      const all = await svc.list(1, {});
      assert.equal(all.total, 2);
    });

    it('权限过滤：仅返回当前用户数据', async () => {
      const seed = [
        makeAsset({ id: 1, userId: 1 }),
        makeAsset({ id: 2, userId: 2 }),
      ];
      const { svc } = makeService({ assets: seed });
      const result = await svc.list(1, {});
      assert.deepEqual(result.list.map((a) => a.id), [1]);
    });
  });

  describe('getOne（权限校验）', () => {
    it('本人可查看详情', async () => {
      const seed = [makeAsset({ id: 5, userId: 1 })];
      const { svc } = makeService({ assets: seed });
      const result = await svc.getOne(1, 5);
      assert.equal(result.id, 5);
    });

    it('他人素材返回 NotFound', async () => {
      const seed = [makeAsset({ id: 5, userId: 2 })];
      const { svc } = makeService({ assets: seed });
      await assert.rejects(() => svc.getOne(1, 5), (err: any) => isNotFound(err));
    });
  });

  describe('update', () => {
    it('更新 title/tags/archived', async () => {
      const seed = [makeAsset({ id: 5, userId: 1 })];
      const { svc } = makeService({ assets: seed });
      const result = await svc.update(1, 5, {
        title: '新标题',
        tags: ['A'],
        archived: true,
      });
      assert.equal(result.title, '新标题');
      assert.deepEqual(result.tags, ['A']);
      assert.equal(result.archived, true);
    });

    it('他人素材返回 NotFound', async () => {
      const seed = [makeAsset({ id: 5, userId: 2 })];
      const { svc } = makeService({ assets: seed });
      await assert.rejects(
        () => svc.update(1, 5, { archived: true }),
        (err: any) => isNotFound(err),
      );
    });
  });

  describe('import（参数校验）', () => {
    it('taskId 与 mediaJobId 必须二选一：都不传', async () => {
      const { svc } = makeService();
      await assert.rejects(
        () => svc.import(1, {}),
        (err: any) => isBadRequest(err),
      );
    });

    it('taskId 与 mediaJobId 必须二选一：都传', async () => {
      const { svc } = makeService();
      await assert.rejects(
        () => svc.import(1, { taskId: 1, mediaJobId: 2 }),
        (err: any) => isBadRequest(err),
      );
    });
  });

  describe('import（task_output_item）', () => {
    const taskItems = [
      { id: 10, taskId: 5, outputType: 'image', content: '一张产品主图', fileUrl: 'https://oss.example.com/1.png', mimeType: 'image/png', fileSize: 1024 },
      { id: 11, taskId: 5, outputType: 'video', content: '', fileUrl: 'https://oss.example.com/2.mp4', mimeType: 'video/mp4', fileSize: 2048 },
      { id: 12, taskId: 5, outputType: 'text', content: '纯文本输出', fileUrl: 'https://oss.example.com/3.txt', mimeType: 'text/plain', fileSize: 512 },
    ];

    it('image/video → 对应 asset_type，text → file', async () => {
      const { svc, assetRepo } = makeService({ taskItems, tasks: [{ id: 5, userId: 1 }] });
      const result = await svc.import(1, { taskId: 5 });
      assert.equal(result.imported, 3);
      assert.equal(result.skipped, 0);
      const bySource = new Map(assetRepo.rows.map((a) => [a.sourceId, a.assetType]));
      assert.equal(bySource.get(10), 'image');
      assert.equal(bySource.get(11), 'video');
      assert.equal(bySource.get(12), 'file');
      assert.equal(assetRepo.rows[0].sourceType, 'task');
      assert.equal(assetRepo.rows[0].userId, 1);
    });

    it('title 取 content 前 50 字，空 content 用 task 输出 #taskId 兜底', async () => {
      const longContent = '长'.repeat(80);
      const { svc } = makeService({
        tasks: [{ id: 7, userId: 1 }],
        taskItems: [
          { id: 20, taskId: 7, outputType: 'image', content: longContent, fileUrl: 'https://oss.example.com/a.png' },
          { id: 21, taskId: 7, outputType: 'image', content: '', fileUrl: 'https://oss.example.com/b.png' },
        ],
      });
      const result = await svc.import(1, { taskId: 7 });
      assert.equal(result.imported, 2);
      assert.equal(result.list[0].title, '长'.repeat(50));
      assert.equal(result.list[1].title, 'task 输出 #7');
    });

    it('fileUrl 为空/缺失的条目跳过', async () => {
      const { svc, assetRepo } = makeService({
        tasks: [{ id: 9, userId: 1 }],
        taskItems: [
          { id: 30, taskId: 9, outputType: 'image', content: '有地址', fileUrl: 'https://oss.example.com/a.png' },
          { id: 31, taskId: 9, outputType: 'image', content: '空地址', fileUrl: '' },
          { id: 32, taskId: 9, outputType: 'image', content: '无地址', fileUrl: null },
        ],
      });
      const result = await svc.import(1, { taskId: 9 });
      assert.equal(result.imported, 1);
      assert.equal(result.skipped, 2);
      assert.equal(assetRepo.rows.length, 1);
    });

    it('幂等：重复导入不重复插入', async () => {
      const { svc, assetRepo } = makeService({ taskItems, tasks: [{ id: 5, userId: 1 }] });
      const first = await svc.import(1, { taskId: 5 });
      assert.equal(first.imported, 3);
      const second = await svc.import(1, { taskId: 5 });
      assert.equal(second.imported, 0);
      assert.equal(second.skipped, 3);
      assert.equal(assetRepo.rows.length, 3);
    });

    it('非本人 taskId 抛 NotFound 且不登记（归属校验）', async () => {
      const { svc, assetRepo } = makeService({ taskItems, tasks: [] });
      await assert.rejects(
        () => svc.import(1, { taskId: 5 }),
        (err: any) => isNotFound(err),
      );
      assert.equal(assetRepo.rows.length, 0);
    });
  });

  describe('import（media_jobs）', () => {
    const doneJob = {
      id: 9,
      userId: 1,
      type: 'image',
      prompt: '生成一张夏日海报',
      status: 'done',
      resultUrls: ['https://oss.example.com/1.png', 'https://oss.example.com/2.png'],
    };

    it('仅 done 任务可导入，多条 resultUrls 拆多条', async () => {
      const { svc, assetRepo } = makeService({ jobs: [doneJob] });
      const result = await svc.import(1, { mediaJobId: 9 });
      assert.equal(result.imported, 2);
      assert.equal(result.skipped, 0);
      assert.equal(result.list.length, 2);
      for (const asset of assetRepo.rows) {
        assert.equal(asset.userId, 1);
        assert.equal(asset.sourceType, 'media_job');
        assert.equal(asset.sourceId, 9);
        assert.equal(asset.assetType, 'image');
      }
      assert.deepEqual(
        assetRepo.rows.map((a) => a.url),
        ['https://oss.example.com/1.png', 'https://oss.example.com/2.png'],
      );
    });

    it('title 取 prompt 前 50 字', async () => {
      const { svc } = makeService({ jobs: [{ ...doneJob, prompt: '长'.repeat(60) }] });
      const result = await svc.import(1, { mediaJobId: 9 });
      assert.equal(result.list[0].title, '长'.repeat(50));
    });

    it('非 done 任务拒绝导入', async () => {
      const { svc } = makeService({ jobs: [{ ...doneJob, status: 'processing' }] });
      await assert.rejects(
        () => svc.import(1, { mediaJobId: 9 }),
        (err: any) => isBadRequest(err),
      );
    });

    it('不属于当前用户的 job 拒绝导入（归属校验）', async () => {
      const { svc } = makeService({ jobs: [{ ...doneJob, userId: 2 }] });
      await assert.rejects(
        () => svc.import(1, { mediaJobId: 9 }),
        (err: any) => isNotFound(err),
      );
    });

    it('无 resultUrls 跳过', async () => {
      const { svc, assetRepo } = makeService({ jobs: [{ ...doneJob, resultUrls: [] }] });
      const result = await svc.import(1, { mediaJobId: 9 });
      assert.equal(result.imported, 0);
      assert.equal(assetRepo.rows.length, 0);
    });

    it('幂等：重复导入不重复插入', async () => {
      const { svc, assetRepo } = makeService({ jobs: [doneJob] });
      const first = await svc.import(1, { mediaJobId: 9 });
      assert.equal(first.imported, 2);
      const second = await svc.import(1, { mediaJobId: 9 });
      assert.equal(second.imported, 0);
      assert.equal(second.skipped, 2);
      assert.equal(assetRepo.rows.length, 2);
    });
  });
});