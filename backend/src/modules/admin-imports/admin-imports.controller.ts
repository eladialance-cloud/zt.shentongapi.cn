import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { BigIntParsePipe } from '../../common/pipes/bigint-parse.pipe';
import { AdminImportsService } from './admin-imports.service';
import { CreateImportDto } from './dto/create-import.dto';
import { ImportQueryDto } from './dto/import-query.dto';

@ApiTags('管理端-资产导入')
@ApiBearerAuth()
@Controller('admin/imports')
@Public()
@UseGuards(AdminGuard)
export class AdminImportsController {
  constructor(private readonly service: AdminImportsService) {}

  @Post()
  @ApiOperation({ summary: '提交 GitHub 导入任务' })
  create(@Body() dto: CreateImportDto, @Req() req: any) {
    return this.service.create(dto, req.adminUser.id);
  }

  @Get()
  @ApiOperation({ summary: '导入任务列表' })
  list(@Query() query: ImportQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '导入任务详情（前端轮询进度）' })
  detail(@Param('id', BigIntParsePipe) id: number) {
    return this.service.detail(id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: '重试失败的导入任务' })
  retry(@Param('id', BigIntParsePipe) id: number, @Req() req: any) {
    return this.service.retry(id, req.adminUser.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除导入任务（withDrafts=true 时连带删除导入的草稿资产）' })
  remove(@Param('id', BigIntParsePipe) id: number, @Query('withDrafts') withDrafts?: string) {
    return this.service.remove(id, withDrafts === 'true' || withDrafts === '1');
  }
}
