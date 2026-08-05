import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import * as fs from 'fs';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { generateFileName } from '../../common/utils/file.util';
import { AdminKnowledgeService } from './admin-knowledge.service';
import { KnowledgeEngineService } from '../knowledge-engine/knowledge-engine.service';

/** 知识库上传目录（相对后端工作目录） */
const KNOWLEDGE_UPLOAD_DIR = './uploads/knowledge';

/** 允许上传的文件类型（与用户端保持一致） */
const ALLOWED_UPLOAD_MIMES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'application/json',
  'application/xml',
  'application/zip',
  'application/octet-stream',
];

@ApiTags('官方知识库管理')
@ApiBearerAuth()
@Public()
@Controller('admin/knowledge-bases')
@UseGuards(AdminGuard)
export class AdminKnowledgeController {
  constructor(
    private readonly service: AdminKnowledgeService,
    private readonly engineService: KnowledgeEngineService,
  ) {}

  @Get()
  @ApiOperation({ summary: '官方知识库列表（分页 + 筛选）' })
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('industryId') industryId?: string,
    @Query('publishStatus') publishStatus?: string,
  ) {
    return this.service.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      keyword: keyword || undefined,
      industryId: industryId ? Number(industryId) : undefined,
      publishStatus: publishStatus || undefined,
    });
  }

  @Get('engine-status')
  @ApiOperation({ summary: '知识库引擎（MaxKB）配置状态' })
  engineStatus() {
    return this.engineService.getEngineStatus();
  }

  @Post()
  @ApiOperation({ summary: '创建官方知识库' })
  create(
    @Body()
    dto: { name: string; description?: string; industryId?: number; visibility?: string },
  ) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑官方知识库' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: { name?: string; description?: string; industryId?: number; visibility?: string },
  ) {
    await this.service.update(id, dto);
    return null;
  }

  @Post(':id/publish')
  @ApiOperation({ summary: '发布官方知识库' })
  async publish(@Param('id', ParseIntPipe) id: number) {
    await this.service.publish(id);
    return null;
  }

  @Post(':id/unpublish')
  @ApiOperation({ summary: '下架官方知识库' })
  async unpublish(@Param('id', ParseIntPipe) id: number) {
    await this.service.unpublish(id);
    return null;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除官方知识库（级联引擎与文档）' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return null;
  }

  @Get(':id/documents')
  @ApiOperation({ summary: '官方知识库文档列表' })
  listDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.service.listDocuments(id);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: '上传文档（同步引擎）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (
          _req: Request,
          _file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          fs.mkdirSync(KNOWLEDGE_UPLOAD_DIR, { recursive: true });
          cb(null, KNOWLEDGE_UPLOAD_DIR);
        },
        filename: (
          _req: Request,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          cb(null, generateFileName(file.originalname));
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!ALLOWED_UPLOAD_MIMES.includes(file.mimetype)) {
          return cb(new BadRequestException('不支持的文件类型: ' + file.mimetype), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadDocument(id, file);
  }

  @Delete(':id/documents/:docId')
  @ApiOperation({ summary: '删除文档' })
  async deleteDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    await this.service.deleteDocument(id, docId);
    return null;
  }
}
