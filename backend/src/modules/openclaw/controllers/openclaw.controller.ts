import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { OpenClawService } from '../services/openclaw.service';
import { RegisterInstanceDto, UpdateConfigDto } from '../dto/openclaw.dto';

@ApiTags('OpenClaw')
@ApiBearerAuth()
@Controller('openclaw')
export class OpenClawController {
  constructor(private readonly service: OpenClawService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'OpenClaw 运行时健康检查' })
  health() {
    return this.service.healthCheck();
  }

  @Get('instances')
  @ApiOperation({ summary: '获取 OpenClaw 实例列表' })
  listInstances(@CurrentUser() user: ICurrentUser) {
    return this.service.listInstances(user.userId);
  }

  @Post('instances')
  @ApiOperation({ summary: '注册 OpenClaw 实例' })
  registerInstance(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: RegisterInstanceDto,
  ) {
    return this.service.registerInstance(user.userId, dto);
  }

  @Delete('instances/:id')
  @ApiOperation({ summary: '注销 OpenClaw 实例' })
  async deleteInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.deleteInstance(user.userId, id);
    return null;
  }

  @Post('instances/:id/sync')
  @ApiOperation({ summary: '同步 Agent 配置到 OpenClaw' })
  syncAgent(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.syncAgent(user.userId, id);
  }

  @Get('instances/:id/status')
  @ApiOperation({ summary: '查询 OpenClaw 运行时状态' })
  getStatus(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getStatus(user.userId, id);
  }

  @Put('instances/:id/config')
  @ApiOperation({ summary: '更新 OpenClaw 配置' })
  updateConfig(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConfigDto,
  ) {
    return this.service.updateConfig(user.userId, id, dto);
  }

  @Post('instances/:id/pull-status')
  @ApiOperation({ summary: '拉取 OpenClaw Agent 最新状态' })
  pullAgentStatus(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.pullAgentStatus(user.userId, id);
  }
}
