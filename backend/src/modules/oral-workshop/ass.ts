/**
 * 口播工坊 ASS 字幕生成器（M5-2）
 *
 * 输入：字幕分段（秒级时间轴）+ 模板 subtitle_config → 输出 ASS 文件内容。
 * 支持动画 fade_in / zoom_in / zoom_out / bounce_in、关键词高亮、中文字体、阴影。
 * 供 composer.ts 通过 ffmpeg subtitles 滤镜烧录。
 */
import type { TemplateTextStyle } from './template-loader';

export type SubtitleAnimation = 'fade_in' | 'zoom_in' | 'zoom_out' | 'bounce_in' | 'none';

export interface SubtitleSegment {
  /** 开始时间（秒） */
  start: number;
  /** 结束时间（秒） */
  end: number;
  text: string;
}

export interface AssSubtitleOptions {
  width: number;
  height: number;
  position: [number, number];
  style: TemplateTextStyle;
  animationOptions?: string[];
  /** 默认动画（取 animationOptions[0] 或 'none'） */
  animation?: SubtitleAnimation;
  /** 关键词高亮样式（模板 highlight_style） */
  highlightStyle?: { color: string; bold?: boolean };
  /** 需要高亮的关键词（大小写不敏感匹配） */
  highlightKeywords?: string[];
  /** 双语字幕：字号按比例缩小（默认 0.72），适配中英双行 */
  bilingual?: boolean;
}

/** #RRGGBB → ASS &HAABBGGRR&（BGR + 透明通道） */
export function hexToAssColor(hex: string): string {
  let h = (hex || '#FFFFFF').replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = 'FFFFFF';
  const bgr = h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
  return '&H00' + bgr.toUpperCase() + '&';
}

/** 转义 ASS 文本：花括号转义、换行转硬换行 */
export function escapeAssText(text: string): string {
  return text
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

/** 秒 → ASS 时间 H:MM:SS.cc */
export function formatAssTime(seconds: number): string {
  const totalCs = Math.max(0, Math.round(seconds * 100));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return String(h) + ':' + pad(m) + ':' + pad(sec) + '.' + pad(cs);
}

/** 高亮关键词：把文本分段包裹 {\c...\b1}...{\r} */
export function highlightText(text: string, keywords: string[], style: { color: string; bold?: boolean }): string {
  if (!keywords.length) return escapeAssText(text);
  const colorTag = hexToAssColor(style.color);
  const boldTag = style.bold ? '\\b1' : '';
  const parts: string[] = [];
  const lower = text.toLowerCase();
  let cursor = 0;
  // 贪心匹配：每轮取最近的关键词出现位置，直到文本结束
  while (true) {
    let best: { kw: string; idx: number } | null = null;
    for (const kw of keywords) {
      const idx = lower.indexOf(kw.toLowerCase(), cursor);
      if (idx >= 0 && (!best || idx < best.idx)) best = { kw, idx };
    }
    if (!best) break;
    if (best.idx > cursor) parts.push(escapeAssText(text.slice(cursor, best.idx)));
    const end = best.idx + best.kw.length;
    parts.push('{' + '\\c' + colorTag + boldTag + '}' + escapeAssText(text.slice(best.idx, end)) + '{\\r}');
    cursor = end;
  }
  if (cursor < text.length) parts.push(escapeAssText(text.slice(cursor)));
  return parts.join('');
}

/** 生成动画标签（不含位置） */
export function animationTags(animation: SubtitleAnimation | undefined): string {
  switch (animation) {
    case 'fade_in':
      return '\\fad(200,200)';
    case 'zoom_in':
      return '\\fscx88\\fscy88\\t(0,300,\\fscx100\\fscy100)';
    case 'zoom_out':
      return '\\fscx112\\fscy112\\t(0,300,\\fscx100\\fscy100)';
    case 'bounce_in':
      return '\\fscx85\\fscy85\\t(0,220,\\fscx106\\fscy106)\\t(220,460,\\fscx100\\fscy100)';
    case 'none':
    default:
      return '';
  }
}

/** 构建 ASS 字幕文件内容 */
export function buildAss(segments: SubtitleSegment[], opts: AssSubtitleOptions): string {
  const animation = opts.animation ?? (opts.animationOptions?.[0] as SubtitleAnimation | undefined) ?? 'none';
  const style = opts.style;
  const fontSize = Math.round(style.fontSize * (opts.bilingual ? 0.72 : 1));
  const primary = hexToAssColor(style.color);
  // E5：优先使用 stroke 作为描边（Outline），无 stroke 时回退 shadow 颜色（原实现兼容）
  const strokeColor = style.stroke?.color || style.shadow?.color;
  const outline = strokeColor ? hexToAssColor(strokeColor) : '&H00000000&';
  const outlineWidth = style.stroke && style.stroke.width > 0 ? Math.round(style.stroke.width) : 0;
  const shadowDist = Math.round(style.shadow?.distance ?? 0);
  const bold = style.bold ? '-1' : '0';
  const italic = style.italic ? '-1' : '0';
  const fontFamily = style.fontFamily || '思源黑体';

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: ' + opts.width,
    'PlayResY: ' + opts.height,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,' + fontFamily + ',' + fontSize + ',' + primary + ',' + primary + ',' + outline + ',&H96000000&,' + bold + ',' + italic + ',0,0,100,100,0,0,1,' + outlineWidth + ',' + shadowDist + ',5,40,40,40,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const dialogues = segments.map((seg) => {
    const text = highlightText(seg.text, opts.highlightKeywords ?? [], opts.highlightStyle ?? { color: '#F6EE7C', bold: true });
    const tags = '{\\pos(' + opts.position[0] + ',' + opts.position[1] + ')' + animationTags(animation) + '}';
    return 'Dialogue: 0,' + formatAssTime(seg.start) + ',' + formatAssTime(seg.end) + ',Default,,0,0,0,,' + tags + text;
  });

  return [...header, ...dialogues, ''].join('\n');
}