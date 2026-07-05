import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminUserService } from './admin-user.service';
import { RechargeOrderQueryDto } from './dto/recharge-order-query.dto';
import { RefundDto } from './dto/refund.dto';

/**
 * 管理端充值订单控制器
 * 数据合同真源：Task 18 - 用户管理
 *
 * 端点：
 *   GET   /admin/recharge-orders             充值订单列表
 *   POST  /admin/recharge-orders/:id/refund  退款
 */
@ApiTags('管理端-充值订单')
@ApiBearerAuth()
@Public()
@Controller('admin/recharge-orders')
@UseGuards(AdminGuard)
export class AdminRechargeOrderController {
  constructor(private readonly service: AdminUserService) {}

  @Get()
  @ApiOperation({ summary: '充值订单列表' })
  async list(@Query() query: RechargeOrderQueryDto) {
    return this.service.listRechargeOrders(query);
  }

  @Post(':id/refund')
  @ApiOperation({ summary: '退款' })
  async refund(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefundDto,
  ) {
    await this.service.refundOrder(id, dto);
  }
}
