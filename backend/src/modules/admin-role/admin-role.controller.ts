import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminRoleService } from './admin-role.service';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { Public } from '../../common/decorators/public.decorator';

/**
 * 管理端角色控制器
 * 数据合同真源：Task 17 - 管理端认证与权限
 *
 * 端点：
 *   GET  /admin/roles                  角色列表
 *   PUT  /admin/roles/:id/permissions  更新角色权限
 */
@ApiTags('管理端-角色')
@ApiBearerAuth()
@Public()
@Controller('admin/roles')
@UseGuards(AdminGuard)
export class AdminRoleController {
  constructor(private readonly service: AdminRoleService) {}

  @Get()
  @ApiOperation({ summary: '角色列表' })
  async list() {
    return this.service.listRoles();
  }

  @Put(':id/permissions')
  @ApiOperation({ summary: '更新角色权限' })
  async updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.service.updatePermissions(id, dto.permissionCodes);
  }
}
