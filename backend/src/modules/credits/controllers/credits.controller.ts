import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreditsService, CreditTxnQuery } from '../services/credits.service';
import { RechargeService } from '../services/recharge.service';
import { CreateRechargeDto } from '../dto/create-recharge.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';

class AdminAdjustDto {
  userId: number;
  amount: number;
  remark?: string;
}

/**
 * 积分控制器
 * 数据合同真源：Task 29 - 积分数据流完整链路
 */
@ApiTags('积分')
@ApiBearerAuth()
@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(
    private readonly creditsService: CreditsService,
    private readonly rechargeService: RechargeService,
  ) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.creditsService.health();
  }

  @Get('account')
  @ApiOperation({ summary: '查询当前用户积分账户' })
  async getAccount(@CurrentUser() user: ICurrentUser) {
    return this.creditsService.getAccount(user.userId);
  }

  @Get('balance')
  @ApiOperation({ summary: '查询当前用户积分账户（桌面端别名，与 account 同构）' })
  async getBalance(@CurrentUser() user: ICurrentUser) {
    return this.creditsService.getAccount(user.userId);
  }

  @Get('recharge-plans')
  @ApiOperation({ summary: '获取充值套餐列表' })
  getRechargePlans() {
    return this.rechargeService.getRechargePlans();
  }

  @Post('recharge')
  @ApiOperation({ summary: '创建充值订单（返回支付信息）' })
  async createRecharge(
    @Body() dto: CreateRechargeDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.rechargeService.createRecharge(user.userId, dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: '分页查询当前用户积分流水' })
  async getTransactions(
    @CurrentUser() user: ICurrentUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('source') source?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('keyword') keyword?: string,
  ) {
    const query: CreditTxnQuery = {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 10,
      keyword,
      type: type as CreditTxnQuery['type'],
      source: source as CreditTxnQuery['source'],
      startDate,
      endDate,
    };
    return this.creditsService.getTransactions(user.userId, query);
  }
}

/**
 * 积分管理端控制器
 * 数据合同真源：Task 29 - 积分数据流完整链路
 */
@ApiTags('积分-管理端')
@ApiBearerAuth()
@Controller('admin/credits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminCreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Post('adjust')
  @ApiOperation({ summary: '管理员调整用户积分' })
  async adjust(
    @Body() dto: AdminAdjustDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.creditsService.adminAdjust(dto.userId, dto.amount, user.userId, dto.remark);
  }
}
