import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { RagService } from '../services/rag.service';

@ApiTags('RAG')
@ApiBearerAuth()
@Controller('rag')
export class RagController {
  constructor(private readonly service: RagService) {}

  @Public()
  @Get('health')
  health() {
    return this.service.health();
  }
}
