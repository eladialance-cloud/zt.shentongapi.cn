/** ASS 字幕生成器单元测试
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-ass.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAss,
  formatAssTime,
  hexToAssColor,
  escapeAssText,
  highlightText,
  animationTags,
  type SubtitleSegment,
} from '../../src/modules/oral-workshop/ass';
import type { TemplateTextStyle } from '../../src/modules/oral-workshop/template-loader';

const baseStyle: TemplateTextStyle = {
  fontSize: 95,
  fontFamily: '思源黑体',
  color: '#FFFFFF',
  position: [540, 1500],
  shadow: { color: '#000000', distance: 3, opacity: 0.7 },
};

const segments: SubtitleSegment[] = [
  { start: 0.5, end: 2.0, text: '大家好' },
  { start: 2.2, end: 4.0, text: '今天聊聊AI' },
];

describe('ASS 字幕生成器', () => {
  it('formatAssTime：秒 → H:MM:SS.cc', () => {
    assert.equal(formatAssTime(0), '0:00:00.00');
    assert.equal(formatAssTime(65.5), '0:01:05.50');
    assert.equal(formatAssTime(3661.125), '1:01:01.13');
  });

  it('hexToAssColor：#RRGGBB → &H00BBGGRR&', () => {
    assert.equal(hexToAssColor('#F6EE7C'), '&H007CEEF6&');
    assert.equal(hexToAssColor('#FFFFFF'), '&H00FFFFFF&');
    assert.equal(hexToAssColor('abc'), '&H00CCBBAA&');
    assert.equal(hexToAssColor('#FF0'), '&H0000FFFF&');
  });

  it('escapeAssText：转义花括号与换行', () => {
    assert.equal(escapeAssText('a{b}c'), 'a\\{b\\}c');
    assert.equal(escapeAssText('line1\nline2'), 'line1\\Nline2');
  });

  it('animationTags：fade_in / zoom_in / zoom_out / bounce_in / none', () => {
    assert.equal(animationTags('fade_in'), '\\fad(200,200)');
    assert.ok(animationTags('zoom_in').includes('\\fscx88\\fscy88'));
    assert.ok(animationTags('zoom_in').includes('\\t(0,300,'));
    assert.ok(animationTags('zoom_out').includes('\\fscx112'));
    assert.equal(animationTags('bounce_in').match(/\\t\(/g)?.length, 2);
    assert.equal(animationTags('none'), '');
    assert.equal(animationTags(undefined), '');
  });

  it('highlightText：包裹全部关键词高亮标签', () => {
    const out = highlightText('今天聊聊AI和AI应用', ['AI'], { color: '#F6EE7C', bold: true });
    assert.ok(out.includes('{\\c&H007CEEF6&\\b1}AI{\\r}'));
    // 两处 AI 都被高亮包裹
    assert.equal(out.split('}AI{').length - 1, 2);
  });

  it('buildAss：输出完整 ASS 骨架（Script Info/Styles/Events）', () => {
    const ass = buildAss(segments, {
      width: 1080,
      height: 1920,
      position: [540, 1500],
      style: baseStyle,
      animationOptions: ['fade_in'],
    });
    assert.ok(ass.includes('[Script Info]'));
    assert.ok(ass.includes('PlayResX: 1080'));
    assert.ok(ass.includes('PlayResY: 1920'));
    assert.ok(ass.includes('[V4+ Styles]'));
    assert.ok(ass.includes('Style: Default,思源黑体,95,&H00FFFFFF&,'));
    assert.ok(ass.includes('[Events]'));
    assert.ok(ass.includes('Dialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,'));
    assert.ok(ass.includes('Dialogue: 0,0:00:02.20,0:00:04.00,Default,,0,0,0,,'));
  });

  it('buildAss：对话行含位置与动画标签', () => {
    const ass = buildAss(segments, {
      width: 1080,
      height: 1920,
      position: [540, 1500],
      style: baseStyle,
      animation: 'zoom_in',
    });
    assert.ok(ass.includes('{\\pos(540,1500)\\fscx88\\fscy88\\t(0,300,\\fscx100\\fscy100)}'));
  });

  it('buildAss：默认动画取 animationOptions[0]', () => {
    const ass = buildAss(segments, {
      width: 1080,
      height: 1920,
      position: [540, 1500],
      style: baseStyle,
      animationOptions: ['bounce_in'],
    });
    assert.ok(ass.includes('\\t(0,220,'));
  });

  it('buildAss：关键词高亮与动画共存', () => {
    const ass = buildAss([{ start: 0, end: 1, text: 'AI改变世界' }], {
      width: 1080,
      height: 1920,
      position: [540, 1500],
      style: baseStyle,
      animation: 'fade_in',
      highlightStyle: { color: '#F6EE7C', bold: true },
      highlightKeywords: ['AI'],
    });
    assert.ok(ass.includes('{\\c&H007CEEF6&\\b1}AI{\\r}'));
    assert.ok(ass.includes('\\fad(200,200)'));
  });
});
  it('buildAss：bilingual 时字号按 0.72 缩小（适配中英双行）', () => {
    const ass = buildAss(segments, {
      width: 1080,
      height: 1920,
      position: [540, 1500],
      style: baseStyle,
      bilingual: true,
    });
    // 95 * 0.72 = 68.4 → round 68
    assert.ok(ass.includes('Style: Default,思源黑体,68,'));
  });
