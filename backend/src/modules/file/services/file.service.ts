import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { FileEntity } from '../entities/file.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import {
  PaginationQuery,
  PaginatedResult,
} from '../../../common/types/pagination.type';
import { generateFileName } from '../../../common/utils/file.util';

/**
 * 文件服务
 * 负责文件的上传、删除、列表查询、详情查询
 * 当前使用本地磁盘存储，后续可迁移到 OSS/MinIO
 */
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly uploadDir = './uploads/files';

  constructor(
    @InjectRepository(FileEntity)
    private fileRepo: Repository<FileEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'file' };
  }

  /**
   * 上传文件
   * @param userId 用户 ID
   * @param file multer 文件对象
   * @returns 文件信息
   */
  async upload(
    userId: number,
    file: Express.Multer.File,
  ): Promise<FileEntity> {
    if (!file) {
      BusinessException.throw(ErrorCode.FILE_UPLOAD_FAILED, '文件不能为空');
    }

    // 确保上传目录存在
    const absUploadDir = path.resolve(this.uploadDir);
    if (!fs.existsSync(absUploadDir)) {
      fs.mkdirSync(absUploadDir, { recursive: true });
    }

    // 文件已经在 FileInterceptor 的 diskStorage 中保存到 uploadDir
    // 这里只需写数据库记录
    const relativePath = `${this.uploadDir}/${file.filename}`;
    const fileUrl = `/uploads/files/${file.filename}`;

    const fileEntity = this.fileRepo.create({
      userId,
      name: file.originalname,
      path: fileUrl,
      size: file.size,
      mimeType: file.mimetype,
      storageType: 'minio', // entity 要求 enum，暂用 minio 占位
    });

    const saved = await this.fileRepo.save(fileEntity);
    this.logger.log(
      `用户 ${userId} 上传文件 ${file.originalname} -> ${fileUrl} (${file.size} bytes)`,
    );
    return saved;
  }

  /**
   * 删除文件（校验归属权）
   * @param userId 用户 ID
   * @param fileId 文件 ID
   */
  async delete(userId: number, fileId: number): Promise<void> {
    const file = await this.fileRepo.findOne({
      where: { id: fileId },
    });

    if (!file) {
      BusinessException.throw(ErrorCode.FILE_NOT_FOUND);
    }

    // 校验归属权
    if (file.userId !== userId) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '无权删除他人的文件');
    }

    // 删除物理文件
    const filePath = path.resolve('.', file.path.replace(/^\//, ''));
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      this.logger.warn(
        `删除物理文件失败: ${filePath} - ${(err as Error).message}`,
      );
      // 物理文件删除失败不阻塞数据库记录删除
    }

    // 删除数据库记录
    const result = await this.fileRepo.delete(fileId);
    if (result.affected === 0) {
      BusinessException.throw(ErrorCode.FILE_DELETE_FAILED);
    }

    this.logger.log(`用户 ${userId} 删除文件 ${file.name} (id=${fileId})`);
  }

  /**
   * 文件列表（分页）
   * @param userId 用户 ID
   * @param query 分页参数
   */
  async list(
    userId: number,
    query: PaginationQuery,
  ): Promise<PaginatedResult<FileEntity>> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 10;

    const where: any = { userId };
    if (query.keyword) {
      where.name = Like(`%${query.keyword}%`);
    }

    const [list, total] = await this.fileRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /**
   * 文件详情
   * @param userId 用户 ID
   * @param fileId 文件 ID
   */
  async detail(userId: number, fileId: number): Promise<FileEntity> {
    const file = await this.fileRepo.findOne({
      where: { id: fileId },
    });

    if (!file) {
      BusinessException.throw(ErrorCode.FILE_NOT_FOUND);
    }

    // 校验归属权
    if (file.userId !== userId) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '无权查看他人的文件');
    }

    return file;
  }
}
