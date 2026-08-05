import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../admin-auth/admin.guard';
import {
  RechargePlanService,
  CreateRechargePlanDto,
} from '../services/recharge-plan.service';

/**
 * 管理端充值档位控制器
 *   GET    /admin/recharge-plans
 *   POST   /admin/recharge-plans
 *   PATCH  /admin/recharge-plans/:id
 *   DELETE /admin/recharge-plans/:id
 */
@ApiTags('管理端-充值档位')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller('admin/recharge-plans')
export class AdminRechargePlanController {
  constructor(private readonly service: RechargePlanService) {}

  @Get()
  @ApiOperation({ summary: '充值档位列表' })
  async list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: '新增充值档位' })
  async create(@Body() dto: CreateRechargePlanDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新充值档位' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateRechargePlanDto>,
  ) {
    await this.service.update(id, dto);
    return null;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除充值档位' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return null;
  }
}
