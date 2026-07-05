import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileService } from '../services/file.service';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('文件')
@ApiBearerAuth()
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.fileService.health();
  }
}
