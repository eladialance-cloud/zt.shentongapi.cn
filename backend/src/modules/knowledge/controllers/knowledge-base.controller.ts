import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
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
import { KnowledgeBaseService } from '../services/knowledge-base.service';
import { Public } from '../../../common/decorators/public.decorator';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { generateFileName } from '../../../common/utils/file.util';
import { CreateKnowledgeBaseDto } from '../dto/create-knowledge-base.dto';
import { SearchKnowledgeDto } from '../dto/search-knowledge.dto';

/** 知识库上传目录（相对后端工作目录） */
const KNOWLEDGE_UPLOAD_DIR = './uploads/knowledge';

/** 允许上传的文件类型（与 file 模块保持一致） */
const ALLOWED_UPLOAD_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
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
  'application/x-rar-compressed',
  'application/gzip',
  'application/x-7z-compressed',
  'application/json',
  'application/xml',
  'text/csv',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/octet-stream',
];

/**
 * 知识库健康检查（保留原路径 /knowledge-bases/health）
 */
@ApiTags('知识库')
@ApiBearerAuth()
@Controller('knowledge-bases')
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.knowledgeBaseService.health();
  }
}

/**
 * 知识库 API（与桌面端 desktop/src/api/knowledge-api.ts 契约一致）
 * 路径前缀：/api/knowledge/bases
 */
@ApiTags('知识库')
@ApiBearerAuth()
@Controller('knowledge/bases')
export class KnowledgeBasesController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  @ApiOperation({ summary: '当前用户知识库列表' })
  list(@CurrentUser() user: ICurrentUser) {
    return this.knowledgeBaseService.listAllBases(user.userId);
  }

  @Post()
  @ApiOperation({ summary: '创建知识库' })
  create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.createBase(user.userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除知识库' })
  async delete(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.knowledgeBaseService.deleteBase(user.userId, id);
    return { success: true };
  }

  @Get(':id/documents')
  @ApiOperation({ summary: '知识库文档列表' })
  listDocuments(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.knowledgeBaseService.listAllDocuments(user.userId, id);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: '上传文档' })
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
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!ALLOWED_UPLOAD_MIMES.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              '不支持的文件类型: ' + file.mimetype,
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
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.knowledgeBaseService.uploadDocument(user.userId, id, file);
  }

  @Delete(':id/documents/:docId')
  @ApiOperation({ summary: '删除文档' })
  async deleteDocument(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    await this.knowledgeBaseService.deleteDocument(user.userId, id, docId);
    return { success: true };
  }

  @Post('search-all')
  @ApiOperation({ summary: '跨库检索（全局模式：本人库+已发布官方库）' })
  searchAll(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: SearchKnowledgeDto,
  ) {
    return this.knowledgeBaseService.searchAll(user.userId, dto);
  }

  @Post(':id/search')
  @ApiOperation({ summary: '知识库检索' })
  search(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SearchKnowledgeDto,
  ) {
    return this.knowledgeBaseService.search(user.userId, id, dto);
  }
}
