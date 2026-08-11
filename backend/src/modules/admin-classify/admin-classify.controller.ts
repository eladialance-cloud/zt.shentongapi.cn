import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AiClassifyService } from './ai-classify.service';

/** 手动重新分类请求体：六类资产枚举 + 记录 id */
class ReclassifyDto {
  @IsIn(['agent', 'workflow', 'mcp', 'skill', 'skill_pack', 'n8n_mcp', 'plugin'], {
    message: 'assetType 必须是 agent/workflow/mcp/skill/skill_pack/n8n_mcp/plugin',
  })
  assetType: string;

  @IsInt()
  id: number;
}

@ApiTags('管理端-AI 分类')
@ApiBearerAuth()
@Controller('admin/classify')
@Public()
@UseGuards(AdminGuard)
export class AdminClassifyController {
  constructor(private readonly service: AiClassifyService) {}

  @Post()
  @ApiOperation({ summary: '手动重新分类指定资产（AI 分类并写回 category/tags）' })
  reclassify(@Body() dto: ReclassifyDto) {
    return this.service.reclassify(dto.assetType, dto.id);
  }
}
