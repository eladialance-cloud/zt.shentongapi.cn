import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_CATEGORIES,
  MCP_CATEGORIES,
  WORKFLOW_SCENE_CATEGORIES,
  normalizeTags,
  pickGitHubSourceFields,
} from '../../src/common/utils/asset-common';

describe('分类枚举与设计文档 2/3 节一致', () => {
  it('AGENT_CATEGORIES', () => {
    assert.deepEqual(AGENT_CATEGORIES, [
      'office', 'programming', 'copywriting', 'data_analysis', 'other',
    ]);
  });

  it('WORKFLOW_SCENE_CATEGORIES', () => {
    assert.deepEqual(WORKFLOW_SCENE_CATEGORIES, [
      'hotspot_monitor', 'multi_platform_distribution', 'comment_dm_ops', 'commercial_data_review', 'other',
    ]);
  });

  it('MCP_CATEGORIES', () => {
    assert.deepEqual(MCP_CATEGORIES, [
      'database', 'search', 'browser', 'git', 'files', 'messaging', 'ai', 'devops', 'other',
    ]);
  });
});

describe('normalizeTags', () => {
  it('undefined/null/非数组 → []', () => {
    assert.deepEqual(normalizeTags(undefined), []);
    assert.deepEqual(normalizeTags(null), []);
    assert.deepEqual(normalizeTags('plain string'), []);
  });

  it('过滤非字符串/去空白/截断 32 字符', () => {
    assert.deepEqual(normalizeTags([' a ', 'a', '', 1, false, 'b'.repeat(40)]), [
      'a',
      'b'.repeat(32),
    ]);
  });

  it('以截断后值去重（先截断再去重）', () => {
    assert.deepEqual(normalizeTags(['x'.repeat(40), 'x'.repeat(35)]), ['x'.repeat(32)]);
  });
});

describe('pickGitHubSourceFields', () => {
  it('默认 manual 且空值剔除', () => {
    assert.deepEqual(pickGitHubSourceFields({}), {
      sourceType: 'manual',
      githubTopics: [],
    });
    const f = pickGitHubSourceFields({ sourceType: 'github', sourceRepo: '', sourcePath: ' ' });
    assert.equal(f.sourceRepo, undefined);
    assert.equal(f.sourcePath, undefined);
  });

  it('完整字段透传', () => {
    assert.deepEqual(
      pickGitHubSourceFields({
        sourceType: 'github',
        sourceRepo: 'https://github.com/x/y',
        sourcePath: 'workflows/a.json',
        githubTopics: ['ai', 'agent'],
        pricing: { perCall: 5 },
      }),
      {
        sourceType: 'github',
        sourceRepo: 'https://github.com/x/y',
        sourcePath: 'workflows/a.json',
        githubTopics: ['ai', 'agent'],
        pricing: { perCall: 5 },
      }
    );
  });

  it('sourceRepo/sourcePath 首尾空白被 trim', () => {
    assert.deepEqual(
      pickGitHubSourceFields({
        sourceType: 'github',
        sourceRepo: ' https://github.com/x/y ',
        sourcePath: ' workflows/a.json ',
      }),
      {
        sourceType: 'github',
        sourceRepo: 'https://github.com/x/y',
        sourcePath: 'workflows/a.json',
        githubTopics: [],
      }
    );
  });

  it('sourceType 非 github → manual', () => {
    assert.equal(pickGitHubSourceFields({ sourceType: 'other' }).sourceType, 'manual');
  });

  it('pricing null/数组被拒绝', () => {
    assert.equal(pickGitHubSourceFields({ pricing: null }).pricing, undefined);
    assert.equal(pickGitHubSourceFields({ pricing: [1, 2] }).pricing, undefined);
  });
});
