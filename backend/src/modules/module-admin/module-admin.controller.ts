import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin-auth/admin.guard';
import { ModuleAdminService } from './module-admin.service';
import { ModuleAdminOpDto } from './dto/module-admin-op.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('管理端-模块卸载')
@ApiBearerAuth()
@Public()
@Controller('admin/module-admin')
@UseGuards(AdminGuard)
export class ModuleAdminController {
  constructor(private readonly service: ModuleAdminService) {}

  @Post('retain')
  @ApiOperation({ summary: '卸载-保留（云端数据不动）' })
  retain(@Body() dto: ModuleAdminOpDto, @Req() req: any) {
    return this.service.retain(dto.moduleId, req.adminUser);
  }

  @Post('export')
  @ApiOperation({ summary: '卸载-导出（云端数据打包下载）' })
  exportData(@Body() dto: ModuleAdminOpDto, @Req() req: any) {
    return this.service.exportData(dto.moduleId, req.adminUser);
  }

  @Post('delete')
  @ApiOperation({ summary: '卸载-彻底删除（云端数据删除）' })
  deleteData(@Body() dto: ModuleAdminOpDto, @Req() req: any) {
    return this.service.deleteData(dto.moduleId, req.adminUser);
  }

  @Post('describe')
  @ApiOperation({ summary: '卸载-描述（云端数据清单）' })
  describe(@Body() dto: ModuleAdminOpDto) {
    return this.service.describe(dto.moduleId);
  }
}