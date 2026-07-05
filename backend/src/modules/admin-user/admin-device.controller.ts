import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminUserService } from './admin-user.service';
import { DeviceQueryDto } from './dto/device-query.dto';

/**
 * 管理端设备控制器
 * 数据合同真源：Task 18 - 用户管理
 *
 * 端点：
 *   GET     /admin/devices       设备列表
 *   DELETE  /admin/devices/:id   远程解绑设备
 */
@ApiTags('管理端-设备')
@ApiBearerAuth()
@Public()
@Controller('admin/devices')
@UseGuards(AdminGuard)
export class AdminDeviceController {
  constructor(private readonly service: AdminUserService) {}

  @Get()
  @ApiOperation({ summary: '设备列表' })
  async list(@Query() query: DeviceQueryDto) {
    return this.service.listDevices(query);
  }

  @Delete(':id')
  @ApiOperation({ summary: '远程解绑设备' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteDevice(id);
  }
}
