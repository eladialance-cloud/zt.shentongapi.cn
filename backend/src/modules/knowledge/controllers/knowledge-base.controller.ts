import {
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
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { KnowledgeBaseService } from '../services/knowledge-base.service';
import { Public } from '../../../common/decorators/public.decorator';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { generateFileName } from '../../../common/utils/file.util';

@ApiTags('鐭ヨ瘑搴?)
@ApiBearerAuth()
@Controller('knowledge-bases')
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '鍋ュ悍妫€鏌? })
  health() {
    return this.knowledgeBaseService.health();
  }

  @Post()
  @ApiOperation({ summary: '鍒涘缓鐭ヨ瘑搴? })
  create(
    @Body() body: { name: string; description?: string; visibility?: 'private' | 'public' },
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.knowledgeBaseService.create(user.userId, body);
  }

  @Get()
  @ApiOperation({ summary: '鐭ヨ瘑搴撳垪琛? })
  list(
    @CurrentUser() user: ICurrentUser,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.knowledgeBaseService.list(
      user.userId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '鐭ヨ瘑搴撹鎯? })
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.knowledgeBaseService.detail(id, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: '鏇存柊鐭ヨ瘑搴? })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<{ name: string; description?: string; visibility?: 'private' | 'public' }>,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.knowledgeBaseService.update(id, user.userId, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '鍒犻櫎鐭ヨ瘑搴? })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.knowledgeBaseService.remove(id, user.userId);
    return null;
  }

  @Post(':id/documents')
  @ApiOperation({ summary: '涓婁紶鏂囨。鍒扮煡璇嗗簱' })
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
        destination: './uploads/knowledge',
        filename: (
          _req: any,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          cb(null, generateFileName(file.originalname));
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (
        _req: any,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const allowedMimes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/markdown',
          'text/csv',
          'application/json',
          'image/png',
          'image/jpeg',
          'image/gif',
          'image/webp',
        ];
        if (!allowedMimes.includes(file.mimetype)) {
          return cb(new Error('涓嶆敮鎸佺殑鏂囦欢绫诲瀷'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadDocument(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.knowledgeBaseService.uploadDocument(id, user.userId, file);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: '鐭ヨ瘑搴撴枃妗ｅ垪琛? })
  listDocuments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.knowledgeBaseService.listDocuments(
      id,
      user.userId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Post(':id/search')
  @ApiOperation({ summary: '鐭ヨ瘑搴撴绱? })
  async search(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { query: string; topK?: number },
    @CurrentUser() user: ICurrentUser,
  ) {
    // RAG 妫€绱㈠緟瀹炵幇锛岃繑鍥炵┖缁撴灉
    return [];
  }

  @Delete(':id/documents/:docId')
  @ApiOperation({ summary: '鍒犻櫎鐭ヨ瘑搴撴枃妗? })
  async deleteDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.knowledgeBaseService.deleteDocument(id, docId, user.userId);
    return null;
  }
}
