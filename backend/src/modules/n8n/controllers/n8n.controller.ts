import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { N8nService } from '../services/n8n.service';

@ApiTags('N8N')
@ApiBearerAuth()
@Controller('n8n')
export class N8nController {
  constructor(private readonly service: N8nService) {}

  @Public()
  @Get('health')
  health() {
    return this.service.health();
  }

  @Get('workflows')
  @ApiOperation({ summary: '获取我的 N8N 工作流（定时任务）' })
  async workflows(
    @CurrentUser() user: ICurrentUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listWorkflows(user.userId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}