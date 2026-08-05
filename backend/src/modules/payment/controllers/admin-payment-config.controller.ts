import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../admin-auth/admin.guard';
import {
  PaymentConfigService,
  UpdatePaymentConfigDto,
  PaymentChannel,
} from '../services/payment-config.service';

/**
 * 管理端支付渠道配置控制器
 *   GET /admin/payment-configs
 *   PUT /admin/payment-configs/:channel
 */
@ApiTags('管理端-支付配置')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller('admin/payment-configs')
export class AdminPaymentConfigController {
  constructor(private readonly service: PaymentConfigService) {}

  @Get()
  @ApiOperation({ summary: '支付渠道配置列表' })
  async list() {
    return this.service.list();
  }

  @Put(':channel')
  @ApiOperation({ summary: '更新支付渠道配置' })
  async update(
    @Param('channel') channel: PaymentChannel,
    @Body() dto: UpdatePaymentConfigDto,
  ) {
    return this.service.update(channel, dto);
  }
}
