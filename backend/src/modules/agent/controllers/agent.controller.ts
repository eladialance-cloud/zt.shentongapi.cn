import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentService } from '../services/agent.service';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Agent智能体')
@Controller('agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.agentService.health();
  }

  @Get()
  @Public()
  @ApiOperation({ summary: '获取已上架 Agent 列表' })
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('sort') sort?: string,
  ) {
    return this.agentService.listPublished({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
      category,
      keyword,
      sort,
    });
  }

  @Get('categories')
  @Public()
  @ApiOperation({ summary: '获取 Agent 分类列表' })
  async categories() {
    return this.agentService.listCategories();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: '获取 Agent 详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    const agent = await this.agentService.getDetail(id);
    if (!agent) {
      return { code: 404, message: 'Agent 不存在', data: null };
    }
    return agent;
  }
}