import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { StorageService } from '../services/storage.service';

@ApiTags('存储')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly service: StorageService) {}

  @Public()
  @Get('health')
  health() {
    return this.service.health();
  }
}
