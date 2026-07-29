import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KnowledgeBaseService } from '../services/knowledge-base.service';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { PaginationQuery } from '../../../common/types/pagination.type';

// ============ DTOs ============

class CreateKnowledgeBaseDto {
  name: string;
  description?: string;
  type?: string;
}

class SearchDto {
  query: string;
  limit?: number;
}

@ApiTags('知识库')
@ApiBearerAuth()
@Controller('knowledge')
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

  // ============ 知识库 CRUD ============

  @Get('bases')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '当前用户的知识库列表' })
  async listBases(
    @CurrentUser() user: ICurrentUser,
    @Query() query: PaginationQuery,
  ) {
    return this.knowledgeBaseService.listBases(user.userId, query);
  }

  @Post('bases')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '创建知识库' })
  async createBase(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('知识库名称不能为空');
    }
    return this.knowledgeBaseService.createBase(user.userId, dto);
  }

  @Delete('bases/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除知识库' })
  async deleteBase(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ) {
    const kbId = Number(id);
    if (isNaN(kbId)) throw new BadRequestException('无效的知识库 ID');
    await this.knowledgeBaseService.deleteBase(user.userId, kbId);
    return { success: true };
  }

  // ============ 文档 ============

  @Get('bases/:kbId/documents')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '知识库下的文档列表' })
  async listDocuments(
    @CurrentUser() user: ICurrentUser,
    @Param('kbId') kbId: string,
    @Query() query: PaginationQuery,
  ) {
    const kbIdNum = Number(kbId);
    if (isNaN(kbIdNum)) throw new BadRequestException('无效的知识库 ID');
    return this.knowledgeBaseService.listDocuments(
      user.userId,
      kbIdNum,
      query,
    );
  }

  @Delete('bases/:kbId/documents/:docId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除文档' })
  async deleteDocument(
    @CurrentUser() user: ICurrentUser,
    @Param('kbId') kbId: string,
    @Param('docId') docId: string,
  ) {
    const kbIdNum = Number(kbId);
    const docIdNum = Number(docId);
    if (isNaN(kbIdNum)) throw new BadRequestException('无效的知识库 ID');
    if (isNaN(docIdNum)) throw new BadRequestException('无效的文档 ID');
    await this.knowledgeBaseService.deleteDocument(
      user.userId,
      kbIdNum,
      docIdNum,
    );
    return { success: true };
  }

  // ============ 搜索 ============

  @Post('bases/:kbId/search')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '搜索知识库' })
  async search(
    @CurrentUser() user: ICurrentUser,
    @Param('kbId') kbId: string,
    @Body() dto: SearchDto,
  ) {
    const kbIdNum = Number(kbId);
    if (isNaN(kbIdNum)) throw new BadRequestException('无效的知识库 ID');
    if (!dto.query || !dto.query.trim()) {
      throw new BadRequestException('搜索内容不能为空');
    }
    return this.knowledgeBaseService.search(user.userId, kbIdNum, dto);
  }
}
