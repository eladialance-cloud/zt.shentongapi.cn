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

/** where 值匹配：支持 TypeORM FindOperator（In / Not(In) / Like / Raw-tag），其余按全等 */
function matchValue(actual: any, want: any): boolean {
  if (want && typeof want === 'object' && typeof want._type === 'string') {
    if (want._type === 'in') return (want._value as any[]).includes(actual);
    if (want._type === 'not') return !matchValue(actual, want._value);
    if (want._type === 'like') {
      const needle = String(want._value).replace(/%/g, '');
      return needle ? String(actual ?? '').includes(needle) : true;
    }
    if (want._type === 'raw') {
      // 仅覆盖标签过滤用的 JSON_CONTAINS 片段（真实 SQL 见 library-kind.tagContainsSql），
      // 这里是它的内存等价实现：tags 数组精确包含该标签（tags 非数组/为 null 即不匹配，等价于 JSON_VALID 兜底）
      const sql = String(want._getSql ? want._getSql('tags') : '');
      if (!/JSON_CONTAINS/i.test(sql)) return true;
      const tag = JSON.parse(String(want._objectLiteralParameters?.tag ?? '""'));
      return Array.isArray(actual) && actual.map(String).includes(String(tag));
    }
  }
  return actual === want;
}

/** where 全键匹配 */
function matchWhere(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]) => matchValue(row?.[k], v));
}

/** 最小内存 Repository mock：支持 create/save/findOne/find/findAndCount，find 支持 In/Not 操作符 */
function makeRepo(seed: MediaAssetEntity[] = []) {
  const rows: MediaAssetEntity[] = [...seed];
  let nextId = seed.reduce((max, r) => Math.max(max, r.id ?? 0), 0) + 1;

  const matches = matchWhere;

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

  describe('两库归属（library/kind）', () => {
    it('用户上传 → 输入库，kind 按物理类型（image→image / file→file）', async () => {
      const { svc } = makeService();
      const img = await svc.create(1, { title: '封面', url: 'https://oss/a.png', assetType: 'image' });
      assert.equal(img.library, 'input');
      assert.equal(img.kind, 'image');
      assert.equal(img.sourceType, 'manual');
      const doc = await svc.create(1, { title: '合同', url: 'https://oss/a.pdf' });
      assert.equal(doc.library, 'input');
      assert.equal(doc.kind, 'file');
    });

    it('官署产出（edict:// 占位 url）→ 生成库·文案 + sourceType=agent', async () => {
      const { svc } = makeService();
      const asset = await svc.create(1, {
        title: '三省六部产出 T-1',
        url: 'edict://text/T-1',
        assetType: 'file',
        tags: ['三省六部', 'T-1'],
      });
      assert.equal(asset.library, 'output');
      assert.equal(asset.kind, 'copy');
      assert.equal(asset.sourceType, 'agent');
    });

    it('口播工坊产物标签 → 生成库 + sourceType=media_job', async () => {
      const { svc } = makeService();
      const asset = await svc.create(1, {
        title: '成片视频',
        url: 'https://oss/final.mp4',
        assetType: 'video',
        tags: ['口播工坊'],
      });
      assert.equal(asset.library, 'output');
      assert.equal(asset.kind, 'video');
      assert.equal(asset.sourceType, 'media_job');
    });

    it('服务端注入 origin：task → 生成库；voice_asset → 输入库·声音', async () => {
      const { svc } = makeService();
      const generated = await svc.create(
        1,
        { title: '产出图', url: 'https://oss/g.png', assetType: 'image' },
        { sourceType: 'task', sourceId: 7 },
      );
      assert.deepEqual(
        [generated.library, generated.kind, generated.sourceType, generated.sourceId],
        ['output', 'image', 'task', 7],
      );
      const voice = await svc.create(
        1,
        { title: '我的声音', url: 'https://oss/ref.mp3', assetType: 'audio' },
        { bizType: 'voice_asset' },
      );
      assert.deepEqual([voice.library, voice.kind], ['input', 'voice']);
    });

    it('list：显式传 library 才返回声音/IP 档案；不传保持旧行为排除它们', async () => {
      const seed = [
        makeAsset({ id: 1, library: 'input', kind: 'image' }),
        makeAsset({ id: 2, library: 'input', kind: 'voice', bizType: 'voice_asset' }),
        makeAsset({ id: 3, library: 'input', kind: 'ip_archive', bizType: 'ip_archive' }),
        makeAsset({ id: 4, library: 'output', kind: 'video', sourceType: 'agent' }),
      ];
      const { svc } = makeService({ assets: seed });
      const input = await svc.list(1, { library: 'input' });
      assert.deepEqual(input.list.map((a) => a.id).sort(), [1, 2, 3]);
      const output = await svc.list(1, { library: 'output' });
      assert.deepEqual(output.list.map((a) => a.id), [4]);
      const legacy = await svc.list(1, {});
      assert.deepEqual(legacy.list.map((a) => a.id).sort(), [1, 4]);
    });

    it('list：kind / sourceType 过滤', async () => {
      const seed = [
        makeAsset({ id: 1, library: 'output', kind: 'copy', sourceType: 'agent' }),
        makeAsset({ id: 2, library: 'output', kind: 'video', sourceType: 'media_job' }),
      ];
      const { svc } = makeService({ assets: seed });
      const copy = await svc.list(1, { kind: 'copy' });
      assert.deepEqual(copy.list.map((a) => a.id), [1]);
      const agent = await svc.list(1, { sourceType: 'agent' });
      assert.deepEqual(agent.list.map((a) => a.id), [1]);
    });

    it('list：tag 过滤（成片=口播工坊标签；精确匹配，不吃子串与脏数据）', async () => {
      const seed = [
        makeAsset({ id: 1, library: 'output', kind: 'video', sourceType: 'media_job', tags: ['口播工坊'] }),
        makeAsset({ id: 2, library: 'output', kind: 'video', sourceType: 'media_job', tags: ['媒体生成'] }),
        makeAsset({ id: 3, library: 'output', kind: 'image', sourceType: 'agent', tags: ['三省六部'] }),
        makeAsset({ id: 4, library: 'output', kind: 'audio', sourceType: 'media_job', tags: null }),
      ];
      const { svc } = makeService({ assets: seed });
      const oral = await svc.list(1, { library: 'output', tag: '口播工坊' });
      assert.deepEqual(oral.list.map((a) => a.id), [1]);
      // 不传 tag 时行为不变（不会误筛掉没有标签的成品，例如官署文案）
      const all = await svc.list(1, { library: 'output' });
      assert.equal(all.total, 4);
      // 标签是精确匹配：'口播' 不等于 '口播工坊'
      const partial = await svc.list(1, { library: 'output', tag: '口播' });
      assert.equal(partial.total, 0);
    });

    it('import（task 输出）→ 生成库；文本落 copy', async () => {
      const { svc } = makeService({
        tasks: [{ id: 5, userId: 1 }],
        taskItems: [
          { id: 51, taskId: 5, outputType: 'image', fileUrl: 'https://oss/i.png', content: '图' },
          { id: 52, taskId: 5, outputType: 'text', fileUrl: 'https://oss/t.md', content: '文案正文' },
        ],
      });
      const res = await svc.import(1, { taskId: 5 });
      assert.equal(res.imported, 2);
      assert.deepEqual(
        res.list.map((a) => [a.library, a.kind, a.sourceType]),
        [
          ['output', 'image', 'task'],
          ['output', 'copy', 'task'],
        ],
      );
    });

    it('import（media_jobs）→ 生成库', async () => {
      const { svc } = makeService({
        jobs: [
          {
            id: 9,
            userId: 1,
            status: 'done',
            type: 'video',
            prompt: '成片',
            resultUrls: ['https://oss/v.mp4'],
          },
        ],
      });
      const res = await svc.import(1, { mediaJobId: 9 });
      assert.deepEqual(
        res.list.map((a) => [a.library, a.kind, a.sourceType]),
        [['output', 'video', 'media_job']],
      );
    });
  });
});
