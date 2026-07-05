import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminAuditService } from './admin-audit.service';
import { SensitiveWordQueryDto } from './dto/sensitive-word-query.dto';
import { CreateSensitiveWordDto } from './dto/create-sensitive-word.dto';
import { BatchCreateSensitiveWordDto } from './dto/batch-create-sensitive-word.dto';

/**
 * 管理端敏感词控制器
 * 数据合同真源：Task 25 - 内容审核 / frontend admin-audit-api.ts
 *
 * 端点：
 *   GET    /admin/sensitive-words        敏感词列表
 *   POST   /admin/sensitive-words        新增敏感词
 *   POST   /admin/sensitive-words/batch  批量导入敏感词
 *   DELETE /admin/sensitive-words/:id    删除敏感词
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-敏感词')
@ApiBearerAuth()
@Public()
@Controller('admin/sensitive-words')
@UseGuards(AdminGuard)
export class AdminSensitiveWordController {
  constructor(private readonly service: AdminAuditService) {}

  @Get()
  @ApiOperation({ summary: '敏感词列表' })
  async list(@Query() query: SensitiveWordQueryDto) {
    return this.service.listSensitiveWords(query);
  }

  @Post()
  @ApiOperation({ summary: '新增敏感词' })
  async create(@Body() dto: CreateSensitiveWordDto) {
    return this.service.createSensitiveWord(dto);
  }

  @Post('batch')
  @ApiOperation({ summary: '批量导入敏感词' })
  async batchCreate(@Body() dto: BatchCreateSensitiveWordDto) {
    return this.service.batchCreateSensitiveWords(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除敏感词' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteSensitiveWord(id);
    return null;
  }
}
