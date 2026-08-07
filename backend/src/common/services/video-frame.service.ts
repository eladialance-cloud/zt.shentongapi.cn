import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

/**
 * 视频/图片媒体处理服务（依赖服务器 ffmpeg）
 *
 * 用途：
 * - 视频抽帧：用户上传视频 → 均匀抽取 N 帧 JPEG，让多模态模型"看懂"视频
 * - 图片压缩：大图压缩到 maxWidth，避免 base64 请求体过大
 * - base64 转换：把产物转成 data URL 直传上游（不依赖公网可达性）
 */
@Injectable()
export class VideoFrameService {
  private readonly logger = new Logger(VideoFrameService.name);
  private readonly framesDir = path.resolve('./uploads/files/frames');

  /** 把数据库里存的相对路径（/uploads/...）解析为服务器绝对路径 */
  resolveAbsPath(relPath: string): string {
    return path.resolve('.', relPath.replace(/^\//, ''));
  }

  /** 读取文件并转 base64 data URL */
  toDataUrl(relPath: string, mime = 'image/jpeg'): string {
    const abs = this.resolveAbsPath(relPath);
    if (!fs.existsSync(abs)) {
      throw new BadRequestException('媒体文件不存在: ' + relPath);
    }
    const buf = fs.readFileSync(abs);
    return `data:${mime};base64,${buf.toString('base64')}`;
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.framesDir)) {
      fs.mkdirSync(this.framesDir, { recursive: true });
    }
  }

  private async runFfmpeg(args: string[]): Promise<void> {
    try {
      await execFileAsync('ffmpeg', args, { timeout: 60000, maxBuffer: 20 * 1024 * 1024 });
    } catch (err) {
      const msg = (err as Error).message || '';
      if (/ENOENT/.test(msg)) {
        throw new BadRequestException('视频处理失败：服务器未安装 ffmpeg，请先执行 apt install ffmpeg');
      }
      this.logger.error(`ffmpeg 执行失败: ${msg}`);
      throw new BadRequestException('视频/图片处理失败，文件可能已损坏');
    }
  }

  private async probeDuration(videoAbsPath: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoAbsPath],
        { timeout: 15000 },
      );
      const d = parseFloat(stdout.trim());
      return Number.isFinite(d) && d > 0 ? d : null;
    } catch {
      return null;
    }
  }

  /**
   * 从视频均匀抽取 N 帧 JPEG，返回相对路径数组（/uploads/files/frames/xxx.jpg）
   * @param videoRelPath 视频相对路径（files.path）
   * @param maxFrames 最多抽帧数（默认 4）
   * @param maxWidth 帧图最大宽度（默认 768，不放大）
   */
  async extractFrames(videoRelPath: string, maxFrames = 4, maxWidth = 768): Promise<string[]> {
    const videoAbs = this.resolveAbsPath(videoRelPath);
    if (!fs.existsSync(videoAbs)) {
      throw new BadRequestException('视频文件不存在: ' + videoRelPath);
    }
    this.ensureDir();

    const duration = await this.probeDuration(videoAbs);
    const count = Math.min(maxFrames, Math.max(1, Math.floor((duration ?? 6) / 2) || 1));
    const base = `frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const scaleFilter = `scale=min(${maxWidth}\,iw):-2`;
    const outputs: string[] = [];

    for (let i = 0; i < count; i++) {
      const fileName = `${base}-${i}.jpg`;
      const outAbs = path.join(this.framesDir, fileName);
      const args: string[] = ['-y'];
      if (duration && duration > 0) {
        // 均匀取帧：第 i 帧时间点 = i * duration / count
        args.push('-ss', String((i * duration) / count), '-i', videoAbs, '-frames:v', '1');
      } else {
        // 拿不到时长：直接取前 count 帧
        args.push('-i', videoAbs, '-vf', `select='eq(n,${i})'`);
      }
      args.push('-vf', scaleFilter, '-q:v', '3', outAbs);
      await this.runFfmpeg(args);
      outputs.push(`/uploads/files/frames/${fileName}`);
    }
    return outputs;
  }

  /**
   * 大图压缩为 JPEG（保持宽高比，不放大）；小图原样返回
   * @param imageRelPath 图片相对路径（files.path）
   * @param maxWidth 最大宽度（默认 1024）
   * @param thresholdBytes 超过该大小才压缩（默认 1.5MB）
   */
  async downscaleImage(imageRelPath: string, maxWidth = 1024, thresholdBytes = 1.5 * 1024 * 1024): Promise<string> {
    const imageAbs = this.resolveAbsPath(imageRelPath);
    if (!fs.existsSync(imageAbs)) {
      throw new BadRequestException('图片文件不存在: ' + imageRelPath);
    }
    const stat = fs.statSync(imageAbs);
    if (stat.size < thresholdBytes) return imageRelPath;

    this.ensureDir();
    const fileName = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const outAbs = path.join(this.framesDir, fileName);
    await this.runFfmpeg([
      '-y',
      '-i', imageAbs,
      '-vf', `scale=min(${maxWidth}\,iw):-2`,
      '-q:v', '2',
      outAbs,
    ]);
    return `/uploads/files/frames/${fileName}`;
  }
}
