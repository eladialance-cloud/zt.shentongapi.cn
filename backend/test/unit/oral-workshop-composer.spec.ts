/** 口播工坊 composer（ffmpeg 命令构造）单元测试
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-composer.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAudioMixCommand,
  buildFinalVideoCommand,
  buildCardVideoCommand,
  buildCoverCommand,
  composePlan,
  escapeFilterPath,
  escapeDrawText,
  ComposerError,
  type FfmpegPlan,
} from '../../src/modules/oral-workshop/composer';
import type { OralWorkshopTemplate } from '../../src/modules/oral-workshop/template-loader';

const tpl: OralWorkshopTemplate = {
  template_id: 't1',
  name: '经典黄白',
  version: '1.0',
  project_settings: { width: 1080, height: 1920, fps: 30, duration: 30, background: '#000000' },
  global_elements: {
    h1: { content: '{{h1_content}}', style: { fontSize: 125, fontFamily: '思源黑体', color: '#F6EE7C', position: [540, 120], bold: true } },
    h2: { content: '{{h2_content}}', style: { fontSize: 120, fontFamily: '思源黑体', color: '#FFFFFF', position: [540, 260] } },
  },
  subtitle_config: {
    position: [540, 1500],
    style: { fontSize: 95, fontFamily: '思源黑体', color: '#FFFFFF', position: [540, 1500] },
    animation_options: ['fade_in'],
    highlight_style: { color: '#F6EE7C', bold: true },
  },
  pip_config: { position: 'center', scale: 1 },
};

describe('composer ffmpeg 命令构造', () => {
  it('buildAudioMixCommand：有 BGM 时生成混音命令（音量 + amix）', () => {
    const cmd = buildAudioMixCommand({
      voicePath: 'C:/tmp/voice.mp3',
      bgmPath: 'C:/tmp/bgm.mp3',
      bgmVolume: 0.2,
      outputPath: 'C:/tmp/mixed.m4a',
    });
    assert.ok(cmd);
    const joined = cmd!.join(' ');
    assert.ok(joined.includes('-filter_complex'));
    assert.ok(joined.includes('volume=1[a0]'));
    assert.ok(joined.includes('volume=0.2[a1]'));
    assert.ok(joined.includes('amix=inputs=2:duration=longest'));
    assert.ok(joined.endsWith('C:/tmp/mixed.m4a'));
  });

  it('buildAudioMixCommand：无 BGM 返回 null（直接用原声轨）', () => {
    const cmd = buildAudioMixCommand({ voicePath: 'v.mp3', outputPath: 'o.m4a' });
    assert.equal(cmd, null);
  });

  it('buildFinalVideoCommand：字幕 + 角标 + 编码参数齐全', () => {
    const cmd = buildFinalVideoCommand({
      humanVideoPath: 'C:/tmp/human.mp4',
      audioPath: 'C:/tmp/mixed.m4a',
      assPath: 'C:/tmp/subs.ass',
      badgeImagePath: 'C:/tmp/ai_badge.png',
      width: 1080,
      height: 1920,
      fps: 30,
      fontDir: 'C:/Windows/Fonts',
      outputPath: 'C:/tmp/final.mp4',
    });
    const joined = cmd.join(' ');
    assert.ok(joined.includes('subtitles=C' + String.fromCharCode(92) + ':/tmp/subs.ass'));
    assert.ok(joined.includes('fontsdir=C' + String.fromCharCode(92) + ':/Windows/Fonts'));
    assert.ok(joined.includes('overlay=W-w-40:H-h-40'));
    assert.ok(joined.includes('-c:v libx264'));
    assert.ok(joined.includes('-pix_fmt yuv420p'));
    assert.ok(joined.includes('-map 1:a'));
    assert.ok(joined.includes('-shortest'));
    assert.ok(joined.includes('-r 30'));
  });

  it('buildFinalVideoCommand：无角标抛 ComposerError（合规强制）', () => {
    assert.throws(
      () => buildFinalVideoCommand({
        humanVideoPath: 'h.mp4',
        audioPath: 'a.m4a',
        badgeImagePath: '',
        width: 1080, height: 1920, fps: 30,
        outputPath: 'o.mp4',
      }),
      ComposerError,
    );
  });

  it('buildFinalVideoCommand：无字幕时仍叠加角标', () => {
    const cmd = buildFinalVideoCommand({
      humanVideoPath: 'h.mp4',
      audioPath: 'a.m4a',
      badgeImagePath: 'b.png',
      width: 1080, height: 1920, fps: 30,
      outputPath: 'o.mp4',
    });
    const joined = cmd.join(' ');
    assert.ok(!joined.includes('subtitles='));
    assert.ok(joined.includes('overlay=W-w-40:H-h-40'));
  });

  it('buildCoverCommand：h1/h2 drawtext（字体/字号/颜色/位置）', () => {
    const cmd = buildCoverCommand({
      videoPath: 'C:/tmp/final.mp4',
      outputPath: 'C:/tmp/cover.png',
      title: { h1: '三分钟讲透AI', h2: '口播工坊' },
      template: tpl,
      fontPath: 'C:/Windows/Fonts/msyh.ttc',
    });
    const joined = cmd.join(' ');
    assert.ok(joined.includes('drawtext=fontfile=C' + String.fromCharCode(92) + ':/Windows/Fonts/msyh.ttc'));
    assert.ok(joined.includes('fontsize=125'));
    assert.ok(joined.includes('fontcolor=0xF6EE7C'));
    assert.ok(joined.includes('fontsize=120'));
    assert.ok(joined.includes('y=120'));
    assert.ok(joined.includes('y=260'));
  });

  it('escapeFilterPath：反斜杠转正斜杠、冒号转义', () => {
    assert.equal(escapeFilterPath('C:' + String.fromCharCode(92) + 'dir' + String.fromCharCode(92) + 'subs.ass'), 'C' + String.fromCharCode(92) + ':/dir/subs.ass');
  });

  it('escapeDrawText：逗号/冒号/引号转义', () => {
    assert.equal(escapeDrawText('你好,世界:AI'), '你好\\,世界\\:AI');
    assert.equal(escapeDrawText("it's"), "it\\'s");
  });

  it('composePlan：完整流程（混音→字幕→视频→封面）', () => {
    const plan: FfmpegPlan = composePlan({
      voicePath: 'C:/tmp/voice.mp3',
      bgmPath: 'C:/tmp/bgm.mp3',
      humanVideoPath: 'C:/tmp/human.mp4',
      subtitles: [{ start: 0.5, end: 2, text: '大家好' }],
      highlightKeywords: ['AI'],
      template: tpl,
      badgeImagePath: 'C:/tmp/ai_badge.png',
      fontDir: 'C:/Windows/Fonts',
      coverTitle: { h1: '标题' },
      outputDir: 'C:/tmp/out',
    });
    assert.equal(plan.commands.length, 3); // mix + final + cover
    assert.ok(plan.assContent?.includes('[Script Info]'));
    assert.ok(plan.tempFiles.some((f) => f.endsWith('mixed_audio.m4a')));
    assert.ok(plan.tempFiles.some((f) => f.endsWith('subs.ass')));
    assert.equal(plan.finalVideoPath, 'C:/tmp/out/final.mp4');
  });

  it('composePlan：无 BGM 时跳过混音（2 条命令）', () => {
    const plan = composePlan({
      voicePath: 'C:/tmp/voice.mp3',
      humanVideoPath: 'C:/tmp/human.mp4',
      badgeImagePath: 'C:/tmp/ai_badge.png',
      coverTitle: { h1: '标题' },
      outputDir: 'C:/tmp/out',
    });
    assert.equal(plan.commands.length, 2); // final + cover
  });

  it('composePlan：无 coverTitle 时不生成封面命令', () => {
    const plan = composePlan({
      voicePath: 'v.mp3',
      humanVideoPath: 'h.mp4',
      badgeImagePath: 'b.png',
      outputDir: 'out',
    });
    assert.equal(plan.commands.length, 1);
  });

  it('buildFinalVideoCommand：品牌水印 drawtext 与 AI 角标共存', () => {
    const cmd = buildFinalVideoCommand({
      humanVideoPath: 'h.mp4',
      audioPath: 'a.m4a',
      badgeImagePath: 'b.png',
      watermarkText: '深瞳AI',
      watermarkFontPath: 'C:/Windows/Fonts/msyh.ttc',
      width: 1080, height: 1920, fps: 30,
      outputPath: 'o.mp4',
    });
    const joined = cmd.join(' ');
    assert.ok(joined.includes('drawtext=fontfile=C' + String.fromCharCode(92) + ':/Windows/Fonts/msyh.ttc'));
    assert.ok(joined.includes('text=深瞳AI'));
    assert.ok(joined.includes('fontcolor=white@0.45'));
    assert.ok(joined.includes('x=40:y=H-76'));
    assert.ok(joined.includes('overlay=W-w-40:H-h-40'));
  });

  it('buildFinalVideoCommand：无水印字体路径时不叠加品牌水印（仅 AI 角标）', () => {
    const cmd = buildFinalVideoCommand({
      humanVideoPath: 'h.mp4',
      audioPath: 'a.m4a',
      badgeImagePath: 'b.png',
      watermarkText: '深瞳AI',
      width: 1080, height: 1920, fps: 30,
      outputPath: 'o.mp4',
    });
    const joined = cmd.join(' ');
    assert.ok(!joined.includes('drawtext='));
    assert.ok(joined.includes('overlay=W-w-40:H-h-40'));
  });

  it('buildCardVideoCommand：生成纯字幕卡片视频（背景色 + 语音轨）', () => {
    const cmd = buildCardVideoCommand({
      audioPath: 'C:/tmp/voice.wav',
      outputPath: 'C:/tmp/human.mp4',
      width: 1080, height: 1920, fps: 30,
      background: '#1A1A2E',
    });
    const joined = cmd.join(' ');
    assert.ok(joined.includes('-f lavfi'));
    assert.ok(joined.includes('color=c=0x1A1A2E:s=1080x1920:r=30'));
    assert.ok(joined.includes('-shortest'));
    assert.ok(joined.includes('-c:v libx264'));
    assert.ok(joined.includes('-pix_fmt yuv420p'));
    assert.equal(cmd[cmd.length - 1], 'C:/tmp/human.mp4');
  });

  it('composePlan：watermark 透传到最终合成命令', () => {
    const plan = composePlan({
      voicePath: 'C:/tmp/voice.mp3',
      humanVideoPath: 'C:/tmp/human.mp4',
      badgeImagePath: 'C:/tmp/ai_badge.png',
      watermark: { text: '深瞳AI', fontPath: 'C:/Windows/Fonts/msyh.ttc' },
      outputDir: 'C:/tmp/out',
    });
    const finalCmd = plan.commands[plan.commands.length - 1];
    assert.ok(finalCmd.some((a) => a.includes('text=深瞳AI')));
    assert.ok(finalCmd.some((a) => a.includes('overlay=W-w-40:H-h-40')));
  });
});