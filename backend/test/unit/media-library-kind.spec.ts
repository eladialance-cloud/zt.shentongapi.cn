/**
 * 素材两库判定纯函数单元测试（library-kind.ts）
 * 覆盖：kind ↔ library 成对校验 / 物理类型推导 kind / 生成标记 → 精确来源 / 归属判定全分支
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_INPUT_KINDS,
  GENERATED_SOURCE_TYPES,
  LIBRARY_KINDS,
  generatedSourceType,
  hasGeneratedMarker,
  isKindInLibrary,
  kindFromAssetType,
  resolveAssetOrigin,
} from '../../src/modules/media-assets/library-kind';

describe('library-kind 两库定义', () => {
  it('kind ↔ library 成对：声音/形象/IP 档案/文件 只属于输入库，文案只属于生成库', () => {
    for (const kind of ['voice', 'avatar', 'ip_archive', 'file'] as const) {
      assert.equal(isKindInLibrary('input', kind), true, kind + ' 应属于输入库');
      assert.equal(isKindInLibrary('output', kind), false, kind + ' 不应属于生成库');
    }
    assert.equal(isKindInLibrary('output', 'copy'), true);
    assert.equal(isKindInLibrary('input', 'copy'), false);
  });

  it('image/video/audio 两库通用（用户上传与软件产出都可能是这三种）', () => {
    for (const kind of ['image', 'video', 'audio'] as const) {
      assert.equal(isKindInLibrary('input', kind), true);
      assert.equal(isKindInLibrary('output', kind), true);
    }
  });

  it('业务型输入 kind（默认列表排除项）都是输入库 kind', () => {
    for (const kind of BUSINESS_INPUT_KINDS) assert.equal(isKindInLibrary('input', kind), true);
  });

  it('LIBRARY_KINDS 无重复项', () => {
    for (const lib of ['input', 'output'] as const) {
      assert.equal(new Set(LIBRARY_KINDS[lib]).size, LIBRARY_KINDS[lib].length);
    }
  });

  it('kindFromAssetType：物理类型直通；生成库的 file 视为文案 copy', () => {
    assert.equal(kindFromAssetType('input', 'image'), 'image');
    assert.equal(kindFromAssetType('output', 'video'), 'video');
    assert.equal(kindFromAssetType('input', 'file'), 'file');
    assert.equal(kindFromAssetType('output', 'file'), 'copy');
  });
});

describe('generatedSourceType 生成标记 → 精确来源', () => {
  it('edict:// 占位 url → agent（官署产出）', () => {
    assert.equal(generatedSourceType({ url: 'edict://text/T-1' }), 'agent');
  });

  it('三省六部 标签 → agent', () => {
    assert.equal(generatedSourceType({ url: 'https://oss/a.png', tags: ['三省六部'] }), 'agent');
  });

  it('口播工坊 标签 → media_job', () => {
    assert.equal(generatedSourceType({ url: 'https://oss/a.mp4', tags: ['口播工坊'] }), 'media_job');
  });

  it('同时带两类标签时优先 media_job（口播工坊走媒体生成任务）', () => {
    assert.equal(generatedSourceType({ tags: ['三省六部', '口播工坊'] }), 'media_job');
  });

  it('无标记 → null，且 hasGeneratedMarker 同步为 false', () => {
    assert.equal(generatedSourceType({ url: 'https://oss/a.png', tags: ['海报'] }), null);
    assert.equal(hasGeneratedMarker({ url: 'https://oss/a.png' }), false);
  });
});

describe('resolveAssetOrigin 归属判定', () => {
  it('biz_type=voice_asset → 输入库·声音；ip_archive → 输入库·IP 档案', () => {
    assert.deepEqual(resolveAssetOrigin({ bizType: 'voice_asset', assetType: 'audio' }), {
      library: 'input',
      kind: 'voice',
      sourceType: 'manual',
    });
    assert.deepEqual(resolveAssetOrigin({ bizType: 'ip_archive', assetType: 'file' }), {
      library: 'input',
      kind: 'ip_archive',
      sourceType: 'manual',
    });
  });

  it('服务端声明生成来源（task/media_job/agent/flow）→ 生成库', () => {
    for (const sourceType of GENERATED_SOURCE_TYPES) {
      const origin = resolveAssetOrigin({ sourceType, assetType: 'image' });
      assert.equal(origin.library, 'output');
      assert.equal(origin.kind, 'image');
      assert.equal(origin.sourceType, sourceType);
    }
  });

  it('生成库的文本产出 → kind=copy', () => {
    assert.deepEqual(resolveAssetOrigin({ sourceType: 'agent', assetType: 'file' }), {
      library: 'output',
      kind: 'copy',
      sourceType: 'agent',
    });
  });

  it('用户上传 → 输入库，kind 按物理类型，来源 manual', () => {
    assert.deepEqual(
      resolveAssetOrigin({ sourceType: 'manual', assetType: 'image', url: 'https://oss/a.png' }),
      { library: 'input', kind: 'image', sourceType: 'manual' },
    );
  });

  it('历史脏数据自愈：manual + 生成标记 → 生成库 + 精确来源', () => {
    assert.deepEqual(
      resolveAssetOrigin({ sourceType: 'manual', assetType: 'file', url: 'edict://text/T-1' }),
      { library: 'output', kind: 'copy', sourceType: 'agent' },
    );
    assert.deepEqual(
      resolveAssetOrigin({ sourceType: 'manual', assetType: 'video', tags: ['口播工坊'] }),
      { library: 'output', kind: 'video', sourceType: 'media_job' },
    );
  });

  it('未知来源值按用户上传归一（不因脏值写坏 source_type）', () => {
    assert.deepEqual(resolveAssetOrigin({ sourceType: 'weird', assetType: 'audio' }), {
      library: 'input',
      kind: 'audio',
      sourceType: 'manual',
    });
  });
});
