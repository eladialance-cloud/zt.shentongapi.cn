import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileEntity } from '../../file/entities/file.entity';
import { ModelEntity } from '../../model/entities/model.entity';
import { VideoFrameService } from '../../../common/services/video-frame.service';

/** 附件引用：历史消息为对象（含 fileId/url），当前发送为 fileId 字符串数组 */
export type AttachmentRef = string | { fileId?: string | number; url?: string; name?: string; mimeType?: string };

/** 归一化后的附件信息（与桌面端 Attachment 类型对齐） */
export interface ResolvedAttachment {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

/**
 * 多模态内容服务
 *
 * 把用户上传的图片/视频附件构造成 OpenAI 多模态 content：
 * - 图片 → image_url 内容块（base64 data URL，不依赖公网可达）
 * - 视频 → 抽帧 N 张 → 多个 image_url 内容块 + 文本说明
 * - 其他文件 → 仅文本说明
 * - 模型不支持视觉 → 整体降级为文本，不报错
 */
@Injectable()
export class MediaContentService {
  private readonly logger = new Logger(MediaContentService.name);

  constructor(
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
    @InjectRepository(ModelEntity)
    private readonly modelRepo: Repository<ModelEntity>,
    private readonly videoFrameService: VideoFrameService,
  ) {}

  /** 模型是否支持视觉（查 ai_models.supports_vision；模型不存在视为不支持，避免默认模型发图报错） */
  async modelSupportsVision(modelId: string): Promise<boolean> {
    try {
      const model = await this.modelRepo.findOne({ where: { modelId } });
      return model?.supportsVision === true;
    } catch {
      return false;
    }
  }

  /** 解析附件引用为文件记录（校验归属权） */
  private async resolveFile(userId: number, ref: AttachmentRef): Promise<FileEntity | null> {
    try {
      if (typeof ref === 'string') {
        const trimmed = ref.trim();
        if (/^\d+$/.test(trimmed)) {
          return await this.fileRepo.findOne({ where: { id: Number(trimmed), userId } });
        }
        if (trimmed.startsWith('/uploads/')) {
          return await this.fileRepo.findOne({ where: { path: trimmed, userId } });
        }
        return null;
      }
      if (ref.fileId && /^\d+$/.test(String(ref.fileId))) {
        return await this.fileRepo.findOne({ where: { id: Number(ref.fileId), userId } });
      }
      if (ref.url && ref.url.startsWith('/uploads/')) {
        return await this.fileRepo.findOne({ where: { path: ref.url, userId } });
      }
      return null;
    } catch (err) {
      this.logger.warn(`附件解析失败: ${(err as Error).message}`);
      return null;
    }
  }

  /** 把附件引用解析为归一化附件列表（供消息落库/历史回放） */
  async describeAttachments(userId: number, refs?: AttachmentRef[] | null): Promise<ResolvedAttachment[]> {
    if (!refs || refs.length === 0) return [];
    const out: ResolvedAttachment[] = [];
    for (const ref of refs) {
      const file = await this.resolveFile(userId, ref);
      if (!file) continue;
      out.push({
        fileId: String(file.id),
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.mimeType || 'application/octet-stream',
        url: file.path,
      });
    }
    return out;
  }

  /**
   * 构造用户消息 content（多模态）
   * @returns 有视觉媒体时返回内容数组；否则返回纯文本字符串
   */
  async buildUserContent(
    userId: number,
    text: string,
    refs?: AttachmentRef[] | null,
    opts: { vision?: boolean } = {},
  ): Promise<string | Array<Record<string, unknown>>> {
    const vision = opts.vision ?? true;
    const files = refs && refs.length > 0 ? await this.describeAttachments(userId, refs) : [];

    if (files.length === 0) return text;

    if (!vision) {
      // 模型不支持视觉：仅以文本说明附件，避免上游报错
      const names = files.map((f) => f.fileName).join('、');
      const note = `（用户上传了附件：${names}）`;
      return text ? `${text}
${note}` : note;
    }

    const parts: Array<Record<string, unknown>> = [];
    if (text) parts.push({ type: 'text', text });
    const notes: string[] = [];

    for (const file of files) {
      const mime = file.mimeType || '';
      try {
        if (mime.startsWith('image/')) {
          const imgPath = await this.videoFrameService.downscaleImage(file.url);
          parts.push({
            type: 'image_url',
            image_url: { url: this.videoFrameService.toDataUrl(imgPath, 'image/jpeg') },
          });
        } else if (mime.startsWith('video/')) {
          const frames = await this.videoFrameService.extractFrames(file.url, 4);
          for (const frame of frames) {
            parts.push({
              type: 'image_url',
              image_url: { url: this.videoFrameService.toDataUrl(frame, 'image/jpeg') },
            });
          }
          notes.push(`用户上传了视频「${file.fileName}」，已抽取 ${frames.length} 帧供参考`);
        } else {
          notes.push(`用户上传了文件：${file.fileName}（${mime || '未知类型'}）`);
        }
      } catch (err) {
        this.logger.warn(`附件处理失败 ${file.fileName}: ${(err as Error).message}`);
        notes.push(`用户上传了文件：${file.fileName}（处理失败）`);
      }
    }

    if (notes.length > 0) parts.push({ type: 'text', text: notes.join('\n') });

    // 只有纯文本（无可视媒体）→ 返回字符串，保持与原来行为一致
    const visualCount = parts.filter((p) => p.type === 'image_url').length;
    if (visualCount === 0) {
      const textParts = parts
        .filter((p) => p.type === 'text')
        .map((p) => String((p as { text?: string }).text ?? ''))
        .filter(Boolean);
      return textParts.join('\n') || text;
    }
    return parts;
  }
}
