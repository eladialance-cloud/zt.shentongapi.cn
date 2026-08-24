/**
 * 口播工坊视频合成输入组装（M5-5）—— 纯函数，便于单测
 *
 * 1. 文案 → 字幕分段（无 ASR 时的兜底时间轴：按句切分，每段固定时长）
 * 2. 改写文案 / LLM 标题 → h1/h2 标题对
 * 3. AI 角标占位 PNG（合规强制；正式素材由管理后台配置替换）
 */
import * as fs from 'fs';
import * as path from 'path';
import { deflateSync } from 'zlib';
import type { SubtitleSegment } from './ass';

export interface TitlePair {
  h1: string;
  h2: string;
}

/** 文案 → 字幕分段：按句（。！？!?；;）切分并保留标点，每段默认 4 秒、单段不超过 22 字 */
export function segmentScript(
  text: string,
  opts: { secondsPerSegment?: number; maxCharsPerSegment?: number } = {},
): SubtitleSegment[] {
  const seconds = Math.max(opts.secondsPerSegment ?? 4, 1);
  const maxChars = Math.max(opts.maxCharsPerSegment ?? 22, 6);
  const parts: string[] = [];
  for (const line of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    parts.push(...trimmed.split(/(?<=[。！？!?；;])/));
  }
  const segments: SubtitleSegment[] = [];
  let cursor = 0;
  for (const part of parts) {
    for (const chunk of splitChunks(part, maxChars)) {
      segments.push({ start: round2(cursor), end: round2(cursor + seconds), text: chunk });
      cursor += seconds;
    }
  }
  if (segments.length === 0 && String(text ?? '').trim()) {
    segments.push({ start: 0, end: seconds, text: String(text).trim() });
  }
  return segments;
}

function splitChunks(s: string, max: number): string[] {
  const chars = Array.from(s);
  if (chars.length <= max) return [s];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += max) out.push(chars.slice(i, i + max).join(''));
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 双语字幕分段：每对中英行 = 一段（text 为 zh\nen，ASS 渲染为双行），默认每段 3.5 秒 */
export function segmentScriptBilingual(
  pairs: Array<{ zh: string; en: string }>,
  secondsPerSegment = 3.5,
): SubtitleSegment[] {
  const seconds = Math.max(secondsPerSegment, 1);
  const segments: SubtitleSegment[] = [];
  let cursor = 0;
  for (const p of pairs ?? []) {
    const zh = String(p?.zh ?? '').trim();
    const en = String(p?.en ?? '').trim();
    if (!zh && !en) continue;
    const text = [zh, en].filter(Boolean).join('\n');
    segments.push({ start: round2(cursor), end: round2(cursor + seconds), text });
    cursor += seconds;
  }
  return segments;
}

/** 从改写文案 / LLM 标题推导 h1 主标题 + h2 副标题（LLM 输出不可用时兜底截取） */
export function deriveTitle(script: string, llmTitle?: string): TitlePair {
  const raw = String(llmTitle ?? '').trim();
  if (raw) {
    const parts = raw.split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { h1: parts[0], h2: parts[1] };
    return { h1: parts[0] || '口播短视频', h2: '' };
  }
  const clean = String(script ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return { h1: '口播短视频', h2: '' };
  const chars = Array.from(clean);
  return {
    h1: chars.slice(0, 12).join('') || '口播短视频',
    h2: chars.slice(12, 24).join(''),
  };
}

/** 生成 AI 角标占位 PNG（200x80，黑底白色块状 "AI" 字样，确保合成时角标可见） */
export function buildBadgePng(width = 200, height = 80): Buffer {
  const stride = 1 + width * 4;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    pixels[y * stride] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const i = y * stride + 1 + x * 4;
      pixels[i] = 0;
      pixels[i + 1] = 0;
      pixels[i + 2] = 0;
      pixels[i + 3] = 255;
    }
  }
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < Math.min(y + h, height); yy++) {
      for (let xx = x; xx < Math.min(x + w, width); xx++) {
        const i = yy * stride + 1 + xx * 4;
        pixels[i] = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
        pixels[i + 3] = 255;
      }
    }
  };
  // 字母 A：两竖 + 横杠
  fill(26, 16, 16, 44);
  fill(60, 16, 16, 44);
  fill(26, 33, 50, 10);
  // 字母 I：竖条 + 上下横杠
  fill(104, 14, 16, 48);
  fill(100, 14, 24, 8);
  fill(100, 58, 24, 8);
  return encodePng(width, height, pixels);
}

/** 确保角标图片存在（缺失时写入占位 PNG），返回文件路径 */
export function ensureBadgeImage(outputDir: string, filename = 'badge.png'): string {
  const file = path.join(outputDir, filename);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(file, buildBadgePng());
  return file;
}

function encodePng(width: number, height: number, raw: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = deflateSync(raw);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

let crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
