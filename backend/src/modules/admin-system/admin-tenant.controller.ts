import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminSystemService } from './admin-system.service';
import { TenantQueryDto } from './dto/tenant-query.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

/**
 * 管理端租户控制器
 * 数据合同真源：Task 28 - 系统配置 / frontend admin-system-api.ts
 *
 * 端点：
 *   GET    /admin/tenants           租户列表
 *   POST   /admin/tenants           新增租户
 *   PATCH  /admin/tenants/:id       编辑租户
 *   POST   /admin/tenants/:id/suspend  停用/恢复租户
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-租户')
@ApiBearerAuth()
@Public()
@Controller('admin/tenants')
@UseGuards(AdminGuard)
export class AdminTenantController {
  constructor(private readonly service: AdminSystemService) {}

  @Get()
  @ApiOperation({ summary: '租户列表' })
  async list(@Query() query: TenantQueryDto) {
    return this.service.listTenants(query);
  }

  @Post()
  @ApiOperation({ summary: '新增租户' })
  async create(@Body() dto: CreateTenantDto) {
    return this.service.createTenant(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑租户' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTenantDto,
  ) {
    await this.service.updateTenant(id, dto);
    return null;
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: '停用/恢复租户' })
  async suspend(@Param('id', ParseIntPipe) id: number) {
    await this.service.suspendTenant(id);
    return null;
  }
}
