import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { FileService } from '../services/file.service';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { generateFileName } from '../../../common/utils/file.util';
import { assertSafeUploadFile } from '../../../common/utils/upload-guard.util';
import { PaginationQuery } from '../../../common/types/pagination.type';

/**
 * 文件模块 - 用户端接口
 * 提供文件上传、删除、列表、详情功能
 */
@ApiTags('文件')
@ApiBearerAuth()
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.fileService.health();
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '上传文件' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/files',
        filename: (
          _req: Request,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const filename = generateFileName(file.originalname);
          cb(null, filename);
        },
      }),
      limits: { fileSize: 200 * 1024 * 1024 }, // 200MB（支持聊天视频上传）
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        // P0-7: 全局危险类型拦截（html/svg/js/xml/可执行文件等，防止存储型 XSS）
        try {
          assertSafeUploadFile(file);
        } catch (err) {
          return cb(err as Error, false);
        }
        // 允许常见文件类型
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'text/plain',
          'text/markdown',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/zip',
          'application/x-zip-compressed',
          'application/x-zip',
          'application/x-rar-compressed',
          'application/vnd.rar',
          'application/gzip',
          'application/x-7z-compressed',
          'application/x-tar',
          'application/x-bzip',
          'application/x-bzip2',
          'application/zstd',
          'application/json',
          'text/csv',
          'audio/mpeg',
          'audio/wav',
          'audio/ogg',
          'video/mp4',
          'video/webm',
          'video/quicktime',
          'application/octet-stream',
        ];
        if (!allowedMimes.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              `不支持的文件类型: ${file.mimetype}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @CurrentUser() user: ICurrentUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('文件不能为空');
    }
    return this.fileService.upload(user.userId, file);
  }

  @Delete(':fileId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除文件' })
  async delete(
    @CurrentUser() user: ICurrentUser,
    @Param('fileId') fileId: string,
  ) {
    const id = Number(fileId);
    if (isNaN(id)) {
      throw new BadRequestException('无效的文件 ID');
    }
    await this.fileService.delete(user.userId, id);
    return { success: true };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '文件列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  async list(
    @CurrentUser() user: ICurrentUser,
    @Query() query: PaginationQuery,
  ) {
    return this.fileService.list(user.userId, query);
  }

  @Get(':fileId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '文件详情' })
  async detail(
    @CurrentUser() user: ICurrentUser,
    @Param('fileId') fileId: string,
  ) {
    const id = Number(fileId);
    if (isNaN(id)) {
      throw new BadRequestException('无效的文件 ID');
    }
    return this.fileService.detail(user.userId, id);
  }
}
