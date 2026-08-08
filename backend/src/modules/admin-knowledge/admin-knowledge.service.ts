import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { KnowledgeBaseEntity } from '../knowledge/entities/knowledge-base.entity';
import { KnowledgeBaseDocumentEntity } from '../knowledge/entities/knowledge-base-document.entity';
import { KnowledgeBaseChunkEntity } from '../knowledge/entities/knowledge-base-chunk.entity';
import { IndustryCategoryEntity } from '../knowledge/entities/industry-category.entity';
import { FileEntity } from '../file/entities/file.entity';
import { KnowledgeEngineService } from '../knowledge-engine/knowledge-engine.service';
import { extractZipFile } from '../../common/utils/zip.util';
import { generateFileName } from '../../common/utils/file.util';

export interface AdminKnowledgeListResult {
  list: Array<KnowledgeBaseEntity & { industryName?: string }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 官方知识库管理（管理后台 /admin/knowledge-bases） */
@Injectable()
export class AdminKnowledgeService {
  private readonly logger = new Logger(AdminKnowledgeService.name);

  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly kbRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeBaseDocumentEntity)
    private readonly docRepo: Repository<KnowledgeBaseDocumentEntity>,
    @InjectRepository(KnowledgeBaseChunkEntity)
    private readonly chunkRepo: Repository<KnowledgeBaseChunkEntity>,
    @InjectRepository(IndustryCategoryEntity)
    private readonly industryRepo: Repository<IndustryCategoryEntity>,
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
    private readonly engineService: KnowledgeEngineService,
  ) {}

  /** 官方知识库列表（分页 + 行业/关键词/状态筛选） */
  async list(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    industryId?: number;
    publishStatus?: string;
  }): Promise<AdminKnowledgeListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { isOfficial: true };
    if (query.keyword) where.name = Like(`%${query.keyword}%`);
    if (query.industryId) where.industryId = query.industryId;
    if (query.publishStatus) where.publishStatus = query.publishStatus;

    const [rows, total] = await this.kbRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    // 批量查行业名（避免原始 join + select + getManyAndCount 的 TypeORM 兼容问题）
    const industryIds = [
      ...new Set(rows.map((r) => r.industryId).filter((v): v is number => !!v)),
    ];
    const industryMap = new Map<number, string>();
    if (industryIds.length > 0) {
      const cats = await this.industryRepo.find({ where: { id: In(industryIds) } });
      for (const c of cats) industryMap.set(c.id, c.name);
    }
    return {
      list: rows.map((kb) => ({
        ...kb,
        industryName: kb.industryId ? industryMap.get(kb.industryId) : undefined,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 创建官方知识库：本地落库 + 引擎建数据集（失败降级，不阻断） */
  async create(dto: {
    name: string;
    description?: string;
    industryId?: number;
    visibility?: string;
  }): Promise<KnowledgeBaseEntity> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('知识库名称不能为空');
    if (dto.industryId) {
      const cat = await this.industryRepo.findOne({ where: { id: dto.industryId } });
      if (!cat) throw new BadRequestException('行业分类不存在');
    }
    const kb = await this.kbRepo.save(
      this.kbRepo.create({
        userId: 0,
        name,
        description: dto.description?.trim() || undefined,
        industryId: dto.industryId || undefined,
        visibility: dto.visibility === 'private' ? 'private' : 'public',
        isOfficial: true,
        publishStatus: 'draft',
        status: 'active',
      }),
    );
    // 引擎尽力同步（MaxKB 未部署时仅告警，本地库照常可用）
    try {
      await this.engineService.createEngineKb(kb.id, kb.name, kb.description);
    } catch (err) {
      this.logger.warn(`官方知识库 ${kb.id} 引擎建库失败: ${(err as Error).message}`);
    }
    return kb;
  }

  async update(
    id: number,
    dto: { name?: string; description?: string; industryId?: number; visibility?: string },
  ): Promise<void> {
    const kb = await this.getOfficialBase(id);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('知识库名称不能为空');
      kb.name = name;
    }
    if (dto.description !== undefined) kb.description = dto.description?.trim() || undefined;
    if (dto.industryId !== undefined) kb.industryId = dto.industryId || undefined;
    if (dto.visibility !== undefined) kb.visibility = dto.visibility === 'private' ? 'private' : 'public';
    await this.kbRepo.save(kb);
  }

  /** 发布：确保引擎数据集存在后置为 published（引擎失败仅告警） */
  async publish(id: number): Promise<void> {
    const kb = await this.getOfficialBase(id);
    if (!kb.engineKbId) {
      try {
        await this.engineService.createEngineKb(kb.id, kb.name, kb.description);
      } catch (err) {
        this.logger.warn(`官方知识库 ${kb.id} 发布前引擎建库失败: ${(err as Error).message}`);
      }
    }
    kb.publishStatus = 'published';
    await this.kbRepo.save(kb);
  }

  /** 下架 */
  async unpublish(id: number): Promise<void> {
    const kb = await this.getOfficialBase(id);
    kb.publishStatus = 'unpublished';
    await this.kbRepo.save(kb);
  }

  /** 删除官方知识库（级联：引擎数据集 + 本地文档/分块/文件） */
  async remove(id: number): Promise<void> {
    const kb = await this.getOfficialBase(id);
    try {
      await this.engineService.deleteEngineKb(kb.id);
    } catch (err) {
      this.logger.warn(`删除官方知识库 ${id} 引擎数据集失败（本地继续删除）: ${(err as Error).message}`);
    }
    const docs = await this.docRepo.find({ where: { knowledgeBaseId: kb.id } });
    await this.chunkRepo.delete({ knowledgeBaseId: kb.id });
    await this.docRepo.delete({ knowledgeBaseId: kb.id });
    await this.kbRepo.delete({ id: kb.id });
    
    for (const doc of docs) {
      await this.removeStoredFile(doc.filePath);
    }
  }

  /** 官方知识库文档列表 */
  async listDocuments(kbId: number): Promise<KnowledgeBaseDocumentEntity[]> {
    await this.getOfficialBase(kbId);
    return this.docRepo.find({
      where: { knowledgeBaseId: kbId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 上传文档：本地落盘记录 + 引擎尽力同步（失败标 engine_status=failed） */
  async uploadDocument(
    kbId: number,
    file: Express.Multer.File,
  ): Promise<KnowledgeBaseDocumentEntity> {
    const kb = await this.getOfficialBase(kbId);
    if (!file) throw new BadRequestException('文件不能为空');

    const fileUrl = '/uploads/knowledge/' + file.filename;
    await this.fileRepo.save(
      this.fileRepo.create({
        userId: 0,
        name: file.originalname,
        path: fileUrl,
        size: file.size,
        mimeType: file.mimetype,
        storageType: 'minio',
      }),
    );

    const doc = await this.docRepo.save(
      this.docRepo.create({
        knowledgeBaseId: kbId,
        name: file.originalname,
        filePath: fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        chunkCount: 0,
        tokenCount: 0,
        status: 'pending',
      }),
    );
    await this.kbRepo.increment({ id: kbId }, 'documentCount', 1);

    // 引擎尽力同步（不阻断上传）；diskStorage 模式需从磁盘读回文件内容
    let buffer: Buffer;
    try {
      buffer = file.buffer || fs.readFileSync(path.resolve('.', 'uploads/knowledge/' + file.filename));
    } catch (err) {
      this.logger.warn(`读取上传文件失败: ${(err as Error).message}`);
      return doc;
    }
    await this.engineService.syncDocumentToEngine(kbId, doc.id, {
      originalname: file.originalname,
      buffer,
      mimetype: file.mimetype,
    });
    // 返回数据库最新实体（同步完成后带上 engineDocumentId / engineStatus）
    const synced = await this.docRepo.findOne({ where: { id: doc.id } });
    return synced ?? doc;
  }

  /** 官方知识库 zip 批量导入：解压后逐个保存文档并同步引擎 */
  async importZipDocuments(kbId: number, file: Express.Multer.File) {
    await this.getOfficialBase(kbId);
    const ext = path.extname(file?.originalname || '').toLowerCase();
    if (!file?.buffer || file.buffer.length === 0 || ext !== '.zip') {
      throw new BadRequestException('请上传 .zip 压缩包');
    }
    const stamp = Date.now();
    const zipPath = path.join(os.tmpdir(), `kb-zip-${stamp}.zip`);
    const tmpDir = path.join(os.tmpdir(), `kb-zip-${stamp}`);
    await fsPromises.writeFile(zipPath, file.buffer);
    await fsPromises.mkdir(tmpDir, { recursive: true });
    const stats = { total: 0, imported: 0, failed: 0, errors: [] as string[] };
    try {
      extractZipFile(zipPath, tmpDir);
      const files = this.collectImportFiles(tmpDir);
      stats.total = files.length;
      for (const f of files) {
        const rel = path.relative(tmpDir, f);
        try {
          const buf = fs.readFileSync(f);
          if (buf.length === 0) {
            stats.failed++;
            stats.errors.push(`${rel}: 空文件`);
            continue;
          }
          await this.persistDocument(kbId, {
            originalname: path.basename(f),
            buffer: buf,
            mimetype: this.mimeFromExt(path.extname(f)),
          });
          stats.imported++;
        } catch (e) {
          stats.failed++;
          stats.errors.push(`${rel}: ${(e as Error).message}`);
        }
      }
    } finally {
      try {
        await fsPromises.rm(zipPath, { force: true });
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // 忽略临时文件清理错误
      }
    }
    return {
      ...stats,
      message: `批量导入完成：成功 ${stats.imported}，失败 ${stats.failed}`,
    };
  }

  /** 递归收集可导入的文档文件（跳过系统目录） */
  private collectImportFiles(dir: string, depth = 0): string[] {
    if (depth > 5) return [];
    const allowedExts = [
      '.pdf', '.txt', '.md', '.markdown',
      '.doc', '.docx', '.xls', '.xlsx',
      '.ppt', '.pptx', '.csv', '.json', '.xml',
    ];
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__MACOSX') continue;
        out.push(...this.collectImportFiles(p, depth + 1));
      } else if (entry.isFile()) {
        if (entry.name === '.DS_Store') continue;
        if (allowedExts.includes(path.extname(entry.name).toLowerCase())) {
          out.push(p);
        }
      }
    }
    return out;
  }

  /** 根据扩展名推断 MIME（zip 导入用） */
  private mimeFromExt(ext: string): string {
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.xml': 'application/xml',
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
  }

  /** 落盘 + 记录 + 引擎同步（zip 批量导入复用） */
  private async persistDocument(
    kbId: number,
    file: { originalname: string; buffer: Buffer; mimetype: string },
  ) {
    const filename = generateFileName(file.originalname);
    const absDir = path.resolve('.', 'uploads/knowledge');
    fs.mkdirSync(absDir, { recursive: true });
    fs.writeFileSync(path.join(absDir, filename), file.buffer);
    const fileUrl = '/uploads/knowledge/' + filename;
    await this.fileRepo.save(
      this.fileRepo.create({
        userId: 0,
        name: file.originalname,
        path: fileUrl,
        size: file.buffer.length,
        mimeType: file.mimetype,
        storageType: 'minio',
      }),
    );
    const doc = await this.docRepo.save(
      this.docRepo.create({
        knowledgeBaseId: kbId,
        name: file.originalname,
        filePath: fileUrl,
        fileSize: file.buffer.length,
        mimeType: file.mimetype,
        chunkCount: 0,
        tokenCount: 0,
        status: 'pending',
      }),
    );
    await this.kbRepo.increment({ id: kbId }, 'documentCount', 1);
    await this.engineService.syncDocumentToEngine(kbId, doc.id, {
      originalname: file.originalname,
      buffer: file.buffer,
      mimetype: file.mimetype,
    });
    const synced = await this.docRepo.findOne({ where: { id: doc.id } });
    return synced ?? doc;
  }

  /** 重试文档引擎同步 */
  async retryEngineSync(kbId: number, docId: number): Promise<void> {
    await this.getOfficialBase(kbId);
    await this.engineService.retryEngineSync(kbId, docId);
  }

  async deleteDocument(kbId: number, docId: number): Promise<void> {
    await this.getOfficialBase(kbId);
    const doc = await this.docRepo.findOne({ where: { id: docId, knowledgeBaseId: kbId } });
    if (!doc) throw new NotFoundException('文档不存在');
    await this.engineService.deleteEngineDocument(kbId, docId);
    await this.chunkRepo.delete({ documentId: docId });
    await this.docRepo.delete({ id: docId });
    await this.kbRepo.decrement({ id: kbId }, 'documentCount', 1);
    await this.kbRepo.decrement({ id: kbId }, 'totalChunks', doc.chunkCount);
    await this.removeStoredFile(doc.filePath);
  }

  private async getOfficialBase(id: number): Promise<KnowledgeBaseEntity> {
    const kb = await this.kbRepo.findOne({ where: { id } });
    if (!kb || !kb.isOfficial) throw new NotFoundException('官方知识库不存在');
    return kb;
  }

  /** 删除物理文件与 files 表记录（尽力而为） */
  private async removeStoredFile(filePath?: string | null): Promise<void> {
    if (!filePath) return;
    try {
      await this.fileRepo.delete({ userId: 0, path: filePath });
    } catch (err) {
      this.logger.warn(`删除 files 记录失败: ${filePath} - ${(err as Error).message}`);
    }
    const relativePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const absPath = path.resolve('.', relativePath);
    try {
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (err) {
      this.logger.warn(`删除物理文件失败: ${absPath} - ${(err as Error).message}`);
    }
  }
}
