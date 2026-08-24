/** 口播工坊视频合成输入组装（M5-5）单元测试 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildBadgePng, deriveTitle, ensureBadgeImage, segmentScript, segmentScriptBilingual } from '../../src/modules/oral-workshop/compose-inputs';

describe('compose-inputs', () => {
  it('segmentScript：按句切分并保留标点，时间轴连续', () => {
    const segs = segmentScript('第一句。第二句！第三句');
    assert.equal(segs.length, 3);
    assert.equal(segs[0].text, '第一句。');
    assert.equal(segs[1].text, '第二句！');
    assert.equal(segs[2].text, '第三句');
    assert.equal(segs[0].start, 0);
    assert.equal(segs[0].end, 4);
    assert.equal(segs[1].start, 4);
    assert.equal(segs[2].start, 8);
  });

  it('segmentScript：超长句按 maxCharsPerSegment 切分', () => {
    const long = '这是一句非常非常长的话'.repeat(5);
    const segs = segmentScript(long, { maxCharsPerSegment: 10 });
    assert.ok(segs.length > 1);
    assert.ok(segs.every((s) => Array.from(s.text).length <= 10));
    for (let i = 1; i < segs.length; i++) {
      assert.equal(segs[i].start, segs[i - 1].end);
    }
  });

  it('segmentScript：空文本/空白返回空数组', () => {
    assert.deepEqual(segmentScript(''), []);
    assert.deepEqual(segmentScript('  \n  '), []);
  });

  it('segmentScript：无标点单句兜底为一段', () => {
    const segs = segmentScript('单句无标点文案');
    assert.equal(segs.length, 1);
    assert.equal(segs[0].text, '单句无标点文案');
  });

  it('deriveTitle：优先使用 LLM 标题（| 分隔 h1/h2）', () => {
    assert.deepEqual(deriveTitle('脚本', '主标题 | 副标题'), { h1: '主标题', h2: '副标题' });
    assert.deepEqual(deriveTitle('脚本', '只有主标题'), { h1: '只有主标题', h2: '' });
  });

  it('deriveTitle：无 LLM 标题时按文案截取兜底', () => {
    const script = '这是一段很长的口播文案，用于生成视频标题。';
    const t = deriveTitle(script);
    const chars = Array.from(script);
    assert.equal(t.h1, chars.slice(0, 12).join(''));
    assert.equal(t.h2, chars.slice(12, 24).join(''));
    assert.deepEqual(deriveTitle(''), { h1: '口播短视频', h2: '' });
  });

  it('buildBadgePng：输出合法 PNG（签名 + IHDR 尺寸）', () => {
    const buf = buildBadgePng();
    assert.ok(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
    assert.equal(buf.readUInt32BE(16), 200);
    assert.equal(buf.readUInt32BE(20), 80);
  });

  it('ensureBadgeImage：首次生成占位 PNG，再次调用复用不重复写', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-badge-'));
    try {
      const p1 = ensureBadgeImage(dir);
      assert.ok(fs.existsSync(p1));
      const m1 = fs.statSync(p1).mtimeMs;
      const p2 = ensureBadgeImage(dir);
      assert.equal(p1, p2);
      assert.equal(fs.statSync(p2).mtimeMs, m1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

  it('segmentScriptBilingual：每对中英行生成一段（zh\\nen 双行），时间轴连续', () => {
    const segs = segmentScriptBilingual([
      { zh: '你好世界', en: 'Hello world' },
      { zh: '明天见', en: 'See you tomorrow' },
    ]);
    assert.equal(segs.length, 2);
    assert.equal(segs[0].text, '你好世界\nHello world');
    assert.equal(segs[1].text, '明天见\nSee you tomorrow');
    assert.equal(segs[0].start, 0);
    assert.equal(segs[1].start, 3.5);
    assert.equal(segs[1].end, 7);
  });

  it('segmentScriptBilingual：空行/空数组兜底', () => {
    assert.deepEqual(segmentScriptBilingual([]), []);
    assert.deepEqual(segmentScriptBilingual([{ zh: '', en: '' }]), []);
  });
