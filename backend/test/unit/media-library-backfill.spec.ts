/**
 * 素材两库历史回填单元测试（db-migration.backfillMediaAssetLibraries）
 * 覆盖：脏数据自愈（manual + 生成标记）/ 业务型输入资产 / 生成来源 / 幂等（已正确的行不写回）/
 *       tags 为 JSON 字符串或非法值 / 空表
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  backfillMediaAssetLibraries,
  mergeDigitalHumanAssetsToMediaAssets,
} from '../../src/common/utils/db-migration';

function fakeRunner(rows: any[]) {
  const updates: Array<{ params: any[] }> = [];
  return {
    updates,
    query: async (sql: string, params?: unknown[]) => {
      if (/^\s*SELECT/i.test(sql)) return rows;
      updates.push({ params: (params ?? []) as any[] });
      return {};
    },
  };
}

const silentLogger = { log: () => undefined, warn: () => undefined };

describe('backfillMediaAssetLibraries 两库历史回填', () => {
  it('官署产出脏数据（manual + edict:// 占位 url）→ 修正为 output/copy/agent', async () => {
    const runner = fakeRunner([
      {
        id: 1,
        bizType: 'media',
        sourceType: 'manual',
        assetType: 'file',
        url: 'edict://text/T-1',
        tags: ['三省六部', 'T-1'],
        library: 'input',
        kind: 'file',
      },
    ]);
    const updated = await backfillMediaAssetLibraries(runner, silentLogger);
    assert.equal(updated, 1);
    assert.deepEqual(runner.updates[0].params, ['output', 'copy', 'agent', 1]);
  });

  it('我的声音 / IP 档案 → 输入库对应 kind', async () => {
    const runner = fakeRunner([
      { id: 2, bizType: 'voice_asset', sourceType: 'manual', assetType: 'audio', url: 'https://oss/v.mp3', tags: null, library: 'input', kind: 'file' },
      { id: 3, bizType: 'ip_archive', sourceType: 'manual', assetType: 'file', url: 'https://x.com/a', tags: null, library: 'input', kind: 'file' },
    ]);
    const updated = await backfillMediaAssetLibraries(runner, silentLogger);
    assert.equal(updated, 2);
    assert.deepEqual(runner.updates[0].params, ['input', 'voice', 'manual', 2]);
    assert.deepEqual(runner.updates[1].params, ['input', 'ip_archive', 'manual', 3]);
  });

  it('生成来源（task）→ 生成库，文本落 copy、视频落 video', async () => {
    const runner = fakeRunner([
      { id: 4, bizType: 'media', sourceType: 'task', assetType: 'video', url: 'https://oss/v.mp4', tags: null, library: 'input', kind: 'file' },
      { id: 5, bizType: 'media', sourceType: 'task', assetType: 'file', url: 'https://oss/t.md', tags: null, library: 'input', kind: 'file' },
    ]);
    const updated = await backfillMediaAssetLibraries(runner, silentLogger);
    assert.equal(updated, 2);
    assert.deepEqual(runner.updates[0].params, ['output', 'video', 'task', 4]);
    assert.deepEqual(runner.updates[1].params, ['output', 'copy', 'task', 5]);
  });

  it('用户上传（manual + 普通 url）→ 输入库，kind 按物理类型', async () => {
    const runner = fakeRunner([
      { id: 6, bizType: 'media', sourceType: 'manual', assetType: 'image', url: 'https://oss/a.png', tags: ['海报'], library: 'input', kind: 'file' },
    ]);
    const updated = await backfillMediaAssetLibraries(runner, silentLogger);
    assert.equal(updated, 1);
    assert.deepEqual(runner.updates[0].params, ['input', 'image', 'manual', 6]);
  });

  it('幂等：口径一致的行不写回，返回 0', async () => {
    const runner = fakeRunner([
      { id: 7, bizType: 'media', sourceType: 'manual', assetType: 'image', url: 'https://oss/a.png', tags: null, library: 'input', kind: 'image' },
      { id: 8, bizType: 'media', sourceType: 'agent', assetType: 'video', url: 'edict://v/1', tags: null, library: 'output', kind: 'video' },
    ]);
    const updated = await backfillMediaAssetLibraries(runner, silentLogger);
    assert.equal(updated, 0);
    assert.equal(runner.updates.length, 0);
  });

  it('tags 为 JSON 字符串时同样识别生成标记（口播工坊 → media_job）', async () => {
    const runner = fakeRunner([
      { id: 9, bizType: 'media', sourceType: 'manual', assetType: 'video', url: 'https://oss/f.mp4', tags: '["口播工坊"]', library: 'input', kind: 'file' },
    ]);
    const updated = await backfillMediaAssetLibraries(runner, silentLogger);
    assert.equal(updated, 1);
    assert.deepEqual(runner.updates[0].params, ['output', 'video', 'media_job', 9]);
  });

  it('tags 为非法 JSON 字符串时不抛错（按无标记处理）', async () => {
    const runner = fakeRunner([
      { id: 10, bizType: 'media', sourceType: 'manual', assetType: 'image', url: 'https://oss/a.png', tags: '{不是JSON', library: 'input', kind: 'file' },
    ]);
    const updated = await backfillMediaAssetLibraries(runner, silentLogger);
    assert.equal(updated, 1);
    assert.deepEqual(runner.updates[0].params, ['input', 'image', 'manual', 10]);
  });

  it('未知来源值归一为 manual（不因脏值写坏 source_type）', async () => {
    const runner = fakeRunner([
      { id: 11, bizType: 'media', sourceType: 'weird', assetType: 'audio', url: 'https://oss/a.mp3', tags: null, library: 'input', kind: 'audio' },
    ]);
    const updated = await backfillMediaAssetLibraries(runner, silentLogger);
    assert.equal(updated, 1);
    assert.deepEqual(runner.updates[0].params, ['input', 'audio', 'manual', 11]);
  });

  it('空表返回 0 且不写回', async () => {
    const runner = fakeRunner([]);
    assert.equal(await backfillMediaAssetLibraries(runner, silentLogger), 0);
    assert.equal(runner.updates.length, 0);
  });
});

/** 形象合并迁移用 fake runner：模拟 INFORMATION_SCHEMA 探测 + 插入/更新 */
function fakeAvatarRunner(opts: {
  avatars?: any[];
  existing?: Record<number, number>;
  affectedJobs?: number;
  columns?: string[];
  tableExists?: boolean;
  archivedExists?: boolean;
}) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  let nextAssetId = 500;
  const columns =
    opts.columns ??
    ['id', 'user_id', 'name', 'kind', 'cloud_id', 'video_url', 'image_url', 'preview_url', 'authorized', 'status', 'description', 'created_at'];
  return {
    calls,
    inserts: [] as any[][],
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: (params ?? []) as any[] });
      if (/INFORMATION_SCHEMA\.TABLES/.test(sql)) {
        if (/digital_human_assets_archived/.test(sql)) return opts.archivedExists ? [{ TABLE_NAME: 'x' }] : [];
        return opts.tableExists === false ? [] : [{ TABLE_NAME: 'digital_human_assets' }];
      }
      if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) return columns.map((c) => ({ COLUMN_NAME: c }));
      if (/SELECT id FROM media_assets/.test(sql)) {
        const oldId = Number(params?.[0]);
        const found = opts.existing?.[oldId];
        return found ? [{ id: found }] : [];
      }
      if (/FROM digital_human_assets/.test(sql)) return opts.avatars ?? [];
      if (/INSERT INTO media_assets/.test(sql)) {
        const id = nextAssetId++;
        return { insertId: id };
      }
      if (/INSERT INTO media_asset_avatar/.test(sql)) return {};
      if (/UPDATE oral_workshop_jobs/.test(sql)) return { affectedRows: opts.affectedJobs ?? 0 };
      return {};
    },
  };
}

const baseAvatar = {
  id: 7,
  userId: 3,
  name: '主播小美',
  kind: 'cloud',
  cloudId: 'dh_001',
  videoUrl: null,
  imageUrl: null,
  previewUrl: null,
  authorized: 1,
  status: 'ready',
  description: '形象描述',
  createdAt: new Date('2026-08-01T00:00:00Z'),
};

describe('mergeDigitalHumanAssetsToMediaAssets 形象合并', () => {
  it('cloud 形象 → 输入库·avatar 主体 + 扩展行 + 任务重映射 + 旧表归档', async () => {
    const runner = fakeAvatarRunner({ avatars: [{ ...baseAvatar }], affectedJobs: 2 });
    const res = await mergeDigitalHumanAssetsToMediaAssets(runner, silentLogger);
    assert.deepEqual(res, { migrated: 1, skipped: 0, remappedJobs: 2 });
    const assetInsert = runner.calls.find((c) => /INSERT INTO media_assets/.test(c.sql));
    assert.ok(assetInsert);
    const p = assetInsert!.params;
    assert.equal(p[0], 3); // user_id
    assert.equal(p[1], '主播小美'); // title
    assert.equal(p[2], 'file'); // asset_type（cloud 无媒体文件）
    assert.equal(p[3], 'avatar://cloud/dh_001'); // 占位 URL
    assert.deepEqual(JSON.parse(String(p[4])), ['形象']); // tags
    assert.equal(p[5], '形象描述'); // description
    const meta = JSON.parse(String(p[6]));
    assert.equal(meta.avatarOldId, 7);
    assert.equal(meta.avatarKind, 'cloud');
    const extInsert = runner.calls.find((c) => /INSERT INTO media_asset_avatar/.test(c.sql));
    assert.ok(extInsert);
    assert.deepEqual(extInsert!.params.slice(0, 3), [500, 'cloud', 'dh_001']);
    assert.ok(runner.calls.some((c) => /RENAME TABLE digital_human_assets TO digital_human_assets_archived/.test(c.sql)));
  });

  it('video 形象 → assetType=video，url 取视频直链', async () => {
    const runner = fakeAvatarRunner({
      avatars: [{ ...baseAvatar, id: 8, kind: 'video', cloudId: 'local-video-1', videoUrl: 'https://oss/x/a.mp4' }],
    });
    await mergeDigitalHumanAssetsToMediaAssets(runner, silentLogger);
    const p = runner.calls.find((c) => /INSERT INTO media_assets/.test(c.sql))!.params;
    assert.equal(p[2], 'video');
    assert.equal(p[3], 'https://oss/x/a.mp4');
  });

  it('幂等：已并入的形象跳过插入，但仍重映射任务引用', async () => {
    const runner = fakeAvatarRunner({ avatars: [{ ...baseAvatar }], existing: { 7: 321 }, affectedJobs: 1 });
    const res = await mergeDigitalHumanAssetsToMediaAssets(runner, silentLogger);
    assert.deepEqual(res, { migrated: 0, skipped: 1, remappedJobs: 1 });
    assert.equal(runner.calls.filter((c) => /INSERT INTO media_assets/.test(c.sql)).length, 0);
    const update = runner.calls.find((c) => /UPDATE oral_workshop_jobs/.test(c.sql));
    assert.deepEqual(update!.params, [7, 321, 7]);
  });

  it('旧表不存在（新装库 / 已归档）→ 全 0，不执行任何写入', async () => {
    const runner = fakeAvatarRunner({ tableExists: false });
    const res = await mergeDigitalHumanAssetsToMediaAssets(runner, silentLogger);
    assert.deepEqual(res, { migrated: 0, skipped: 0, remappedJobs: 0 });
    assert.equal(runner.calls.some((c) => /INSERT INTO|RENAME TABLE/.test(c.sql)), false);
  });

  it('旧表缺 description/kind 列时按兜底值合并（不失败）', async () => {
    const runner = fakeAvatarRunner({
      avatars: [{ ...baseAvatar, kind: null, description: null }],
      columns: ['id', 'user_id', 'name', 'cloud_id', 'authorized', 'status', 'created_at'],
    });
    const res = await mergeDigitalHumanAssetsToMediaAssets(runner, silentLogger);
    assert.equal(res.migrated, 1);
    const p = runner.calls.find((c) => /INSERT INTO media_assets/.test(c.sql))!.params;
    assert.equal(p[5], null); // description 兜底
    assert.equal(JSON.parse(String(p[6])).avatarKind, 'cloud'); // kind 兜底
  });
});

