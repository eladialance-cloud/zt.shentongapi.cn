import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KnowledgeBaseService } from '../services/knowledge-base.service';
import { Public } from '../../../common/decorators/public.decorator';

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
