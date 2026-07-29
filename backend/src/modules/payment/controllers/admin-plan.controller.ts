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
import { PaymentService } from '../services/payment.service';
import { CreatePlanDto, UpdatePlanDto } from '../dto/plan.dto';

/**
 * 管理端套餐控制器
 *
 * 端点：
 *   GET    /admin/plans          套餐列表（含停用）
 *   POST   /admin/plans          创建套餐
 *   PATCH  /admin/plans/:id      更新套餐
 *   DELETE /admin/plans/:id      删除套餐
 */
@ApiTags('管理端-套餐管理')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller('admin/plans')
export class AdminPlanController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @ApiOperation({ summary: '套餐列表（含停用）' })
  async list() {
    // 管理端需要看到所有套餐（含 isActive=false）
    return this.paymentService.getAllPlans();
  }

  @Post()
  @ApiOperation({ summary: '创建套餐' })
  async create(@Body() dto: CreatePlanDto) {
    return this.paymentService.createPlan(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新套餐' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
  ) {
    await this.paymentService.updatePlan(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除套餐' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.paymentService.deletePlan(id);
  }
}
