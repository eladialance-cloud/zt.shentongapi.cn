import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DeviceService } from './device.service';
import { BindDeviceDto } from './dto/bind-device.dto';
import { CurrentUser, ICurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

/** 从请求中提取客户端 IP（兼容反向代理 x-forwarded-for） */
function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip || '0.0.0.0';
}

/**
 * 用户设备绑定控制器
 * 数据合同真源：Task 4 - 设备指纹与绑定机制
 */
@ApiTags('设备绑定')
@ApiBearerAuth()
@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DeviceController {
  constructor(private deviceService: DeviceService) {}

  @Post('bind')
  @ApiOperation({ summary: '绑定当前设备（登录后调用）' })
  async bind(
    @Body() dto: BindDeviceDto,
    @CurrentUser() user: ICurrentUser,
    @Req() req: Request,
  ) {
    const ip = getClientIp(req);
    return this.deviceService.bindDevice(user.userId, dto, ip);
  }

  @Get()
  @ApiOperation({ summary: '查询当前用户设备列表' })
  async list(@CurrentUser() user: ICurrentUser) {
    return this.deviceService.listDevices(user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '解绑设备' })
  async unbind(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.deviceService.unbindDevice(user.userId, id);
    return null;
  }
}

/**
 * 管理端设备管理控制器
 * 仅 super_admin / admin 角色可访问
 */
@ApiTags('设备绑定-管理端')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class AdminDeviceController {
  constructor(private deviceService: DeviceService) {}

  @Get(':userId/devices')
  @ApiOperation({ summary: '管理端-查询用户设备列表' })
  async listUserDevices(@Param('userId', ParseIntPipe) userId: number) {
    return this.deviceService.adminListDevices(userId);
  }

  @Delete(':userId/devices/:deviceId')
  @ApiOperation({ summary: '管理端-远程解绑用户设备' })
  async unbindUserDevice(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    // userId 用于路由语义校验，实际删除按 deviceId
    void userId;
    await this.deviceService.adminUnbindDevice(deviceId);
    return null;
  }
}
