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
import { ReconciliationService } from './services/reconciliation.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, ICurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

class AdjustDiffDto {
  amount: number;
  remark?: string;
}

class IgnoreDiffDto {
  remark?: string;
}

/**
 * 对账管理端控制器
 * 数据合同真源：Task 30 - 对账体系
 */
@ApiTags('对账-管理端')
@ApiBearerAuth()
@Controller('admin/reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.service.health();
  }

  @Get('diffs')
  @ApiOperation({ summary: '分页查询对账差异列表' })
  async getDiffs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.service.getDiffs({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 10,
      type: type as any,
      status,
    });
  }

  @Post('run')
  @ApiOperation({ summary: '手动触发全量对账' })
  async run() {
    return this.service.runAllReconciliations();
  }

  @Post(':id/adjust')
  @ApiOperation({ summary: '手动调整对账差异' })
  async adjust(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustDiffDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.service.adjustDiff(id, user.userId, dto.amount, dto.remark);
  }

  @Post(':id/ignore')
  @ApiOperation({ summary: '标记对账差异为忽略' })
  async ignore(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IgnoreDiffDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.service.ignoreDiff(id, user.userId, dto.remark);
  }
}
