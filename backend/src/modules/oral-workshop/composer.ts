/**
 * 口播工坊视频合成器（M5-1）—— ffmpeg 命令构造（纯函数，不执行）
 *
 * 合成管线（服务器 ffmpeg）：
 *   1. 人声轨 + BGM 混音（可选）
 *   2. 数字人视频 + ASS 字幕烧录 + AI 角标强制叠加（合规，不可关闭）
 *   3. 封面首帧渲染（h1/h2 标题，模板样式）
 * 命令断言可单测（不真跑 ffmpeg）。
 */
import { buildAss, type SubtitleSegment } from './ass';
import type { OralWorkshopTemplate } from './template-loader';

/** 合成输入（M5-5 由流水线步骤产物组装） */
export interface ComposeJobOptions {
  /** 人声轨（voice.mp3 或本地 TTS 产物） */
  voicePath: string;
  /** BGM（可选，来自模板 auto_bgm 或后台 BGM 库） */
  bgmPath?: string;
  /** BGM 音量（0-1，默认 0.2） */
  bgmVolume?: number;
  /** 数字人视频（火山数字人合成产物） */
  humanVideoPath: string;
  /** 品牌水印（免费档叠加；AI 角标为合规强制，独立于此） */
  watermark?: { text: string; fontPath?: string };
  /** 字幕分段（ASR/文案分段时间轴） */
  subtitles?: SubtitleSegment[];
  /** 关键词高亮（来自模板 content_prompts 提取） */
  highlightKeywords?: string[];
  /** 双语字幕：字幕内容为中英双行（zh\nen），字号按比例缩小 */
  bilingual?: boolean;
  /** 模板（决定分辨率/字幕配置/角标样式） */
  template?: OralWorkshopTemplate;
  /** AI 角标图片（合规强制，必填） */
  badgeImagePath: string;
  /** 中文字体目录（字幕 fontsdir，如 C:/Windows/Fonts 或服务器字体目录） */
  fontDir?: string;
  /** 封面字体路径（渲染封面 drawtext 用） */
  fontPath?: string;
  /** 封面标题（h1/h2） */
  coverTitle?: { h1?: string; h2?: string };
  /** 输出目录（中间产物与最终视频都写这里） */
  outputDir: string;
  /** 最终视频文件名（默认 final.mp4） */
  outputName?: string;
}

export interface FfmpegPlan {
  /** 依次执行的 ffmpeg 命令（每条为完整 argv 数组） */
  commands: string[][];
  /** 需要清理的中间产物（混音文件等） */
  tempFiles: string[];
  /** 最终视频路径 */
  finalVideoPath: string;
  /** 生成的 ASS 字幕内容（调用方写入 assPath 后再执行命令） */
  assContent?: string;
}

export class ComposerError extends Error {
  name = 'ComposerError';
  constructor(message: string) {
    super(message);
  }
}

/** 过滤器路径转义：反斜杠→正斜杠、冒号转义、单引号处理 */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/** drawtext 文本转义（逗号/冒号/引号/反斜杠/方括号） */
export function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/:/g, '\\:')
    .replace(/;/g, '\\;')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

/** 步骤 1：人声 + BGM 混音（无 BGM 返回 null，直接用原声轨） */
export function buildAudioMixCommand(opts: {
  voicePath: string;
  bgmPath?: string;
  bgmVolume?: number;
  outputPath: string;
}): string[] | null {
  if (!opts.bgmPath) return null;
  const voiceVol = 1.0;
  const bgmVol = Math.min(Math.max(opts.bgmVolume ?? 0.2, 0), 1);
  const filter =
    '[0:a]volume=' + voiceVol + '[a0];' +
    '[1:a]volume=' + bgmVol + '[a1];' +
    '[a0][a1]amix=inputs=2:duration=longest:dropout_transition=2[aout]';
  return [
    'ffmpeg', '-y',
    '-i', opts.voicePath,
    '-i', opts.bgmPath,
    '-filter_complex', filter,
    '-map', '[aout]',
    '-c:a', 'aac', '-b:a', '192k',
    opts.outputPath,
  ];
}

/** 步骤 2：数字人视频 + 字幕 + AI 角标（合规强制） → 最终视频 */
export function buildFinalVideoCommand(opts: {
  humanVideoPath: string;
  audioPath: string;
  assPath?: string;
  badgeImagePath: string;
  watermarkText?: string;
  watermarkFontPath?: string;
  width: number;
  height: number;
  fps: number;
  fontDir?: string;
  outputPath: string;
}): string[] {
  if (!opts.badgeImagePath) {
    throw new ComposerError('AI 角标为合规强制项，badgeImagePath 不能为空');
  }
  let videoFilter = '[0:v]';
  if (opts.assPath) {
    let sub = 'subtitles=' + escapeFilterPath(opts.assPath);
    if (opts.fontDir) sub += ':fontsdir=' + escapeFilterPath(opts.fontDir);
    videoFilter += sub + '[vs];[vs]';
  }
  // 品牌水印（左下角，半透明；需中文字体路径）
  if (opts.watermarkText && opts.watermarkFontPath) {
    videoFilter +=
      'drawtext=fontfile=' + escapeFilterPath(opts.watermarkFontPath) +
      ':text=' + escapeDrawText(opts.watermarkText) +
      ':fontsize=28:fontcolor=white@0.45:x=40:y=H-76:enable=1[wm];[wm]';
  }
  // AI 角标叠加（右下角，40px 边距；enable 覆盖全片）
  videoFilter += 'overlay=W-w-40:H-h-40:enable=1[badged]';
  const args = [
    'ffmpeg', '-y',
    '-i', opts.humanVideoPath,
    '-i', opts.audioPath,
    '-filter_complex', videoFilter,
    '-map', '[badged]',
    '-map', '1:a',
    '-r', String(opts.fps),
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    opts.outputPath,
  ];
  return args;
}

/** 步骤 3：封面渲染（首帧 + h1/h2 标题，模板样式） */
export function buildCoverCommand(opts: {
  videoPath: string;
  outputPath: string;
  title?: { h1?: string; h2?: string };
  template?: OralWorkshopTemplate;
  fontPath?: string;
}): string[] {
  const h1 = opts.title?.h1 || '';
  const h2 = opts.title?.h2 || '';
  const els = opts.template?.global_elements || {};
  const h1Style = els.h1?.style;
  const h2Style = els.h2?.style;
  const vfParts: string[] = [];
  if (h1 && h1Style && opts.fontPath) {
    vfParts.push(
      'drawtext=fontfile=' + escapeFilterPath(opts.fontPath) +
      ':text=' + escapeDrawText(h1) +
      ':fontsize=' + Math.round(h1Style.fontSize) +
      ':fontcolor=' + (h1Style.color || '#FFFFFF').replace('#', '0x') +
      ':x=' + Math.round(h1Style.position?.[0] ?? 540) + ':y=' + Math.round(h1Style.position?.[1] ?? 120)
    );
  }
  if (h2 && h2Style && opts.fontPath) {
    vfParts.push(
      'drawtext=fontfile=' + escapeFilterPath(opts.fontPath) +
      ':text=' + escapeDrawText(h2) +
      ':fontsize=' + Math.round(h2Style.fontSize) +
      ':fontcolor=' + (h2Style.color || '#FFFFFF').replace('#', '0x') +
      ':x=' + Math.round(h2Style.position?.[0] ?? 540) + ':y=' + Math.round(h2Style.position?.[1] ?? 260)
    );
  }
  const vf = vfParts.length ? vfParts.join(',') : 'null';
  return [
    'ffmpeg', '-y',
    '-i', opts.videoPath,
    '-ss', '0', '-frames:v', '1',
    '-vf', vf,
    opts.outputPath,
  ];
}

/** 数字人兜底：纯字幕卡片视频（静态背景色 + 语音轨，字幕由 videoEdit 叠加） */
export function buildCardVideoCommand(opts: {
  audioPath: string;
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
  background?: string;
}): string[] {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1920;
  const fps = opts.fps ?? 30;
  const bg = (opts.background ?? '#000000').replace('#', '0x');
  return [
    'ffmpeg', '-y',
    '-f', 'lavfi',
    '-i', 'color=c=' + bg + ':s=' + width + 'x' + height + ':r=' + fps,
    '-i', opts.audioPath,
    '-shortest',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-r', String(fps),
    opts.outputPath,
  ];
}

/** 总入口：组装完整合成计划（含 ASS 生成） */
export function composePlan(opts: ComposeJobOptions): FfmpegPlan {
  const template = opts.template;
  const width = template?.project_settings.width ?? 1080;
  const height = template?.project_settings.height ?? 1920;
  const fps = template?.project_settings.fps ?? 30;
  const outputName = opts.outputName || 'final.mp4';
  const finalVideoPath = opts.outputDir.replace(/\\+$/, '') + '/' + outputName;

  // 1. 混音
  const commands: string[][] = [];
  const tempFiles: string[] = [];
  let audioPath = opts.voicePath;
  if (opts.bgmPath) {
    const mixedPath = opts.outputDir.replace(/\\+$/, '') + '/mixed_audio.m4a';
    const mix = buildAudioMixCommand({
      voicePath: opts.voicePath,
      bgmPath: opts.bgmPath,
      bgmVolume: opts.bgmVolume,
      outputPath: mixedPath,
    });
    if (mix) {
      commands.push(mix);
      tempFiles.push(mixedPath);
      audioPath = mixedPath;
    }
  }

  // 2. ASS 字幕
  let assPath: string | undefined;
  let assContent: string | undefined;
  if (opts.subtitles?.length && template?.subtitle_config) {
    assPath = opts.outputDir.replace(/\\+$/, '') + '/subs.ass';
    assContent = buildAss(opts.subtitles, {
      width,
      height,
      position: template.subtitle_config.position,
      style: template.subtitle_config.style,
      animationOptions: template.subtitle_config.animation_options,
      highlightStyle: template.subtitle_config.highlight_style,
      highlightKeywords: opts.highlightKeywords,
      bilingual: opts.bilingual,
    });
    tempFiles.push(assPath);
  }

  // 3. 最终视频
  commands.push(
    buildFinalVideoCommand({
      humanVideoPath: opts.humanVideoPath,
      audioPath,
      assPath,
      badgeImagePath: opts.badgeImagePath,
      watermarkText: opts.watermark?.text,
      watermarkFontPath: opts.watermark?.fontPath,
      width,
      height,
      fps,
      fontDir: opts.fontDir,
      outputPath: finalVideoPath,
    }),
  );

  // 4. 封面
  if (opts.coverTitle?.h1 || opts.coverTitle?.h2) {
    const coverPath = opts.outputDir.replace(/\\+$/, '') + '/cover.png';
    commands.push(
      buildCoverCommand({
        videoPath: finalVideoPath,
        outputPath: coverPath,
        title: opts.coverTitle,
        template,
        fontPath: opts.fontPath,
      }),
    );
  }

  return { commands, tempFiles, finalVideoPath, assContent };
}