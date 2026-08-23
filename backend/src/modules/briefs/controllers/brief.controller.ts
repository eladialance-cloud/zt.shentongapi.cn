import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BriefService } from '../services/brief.service';
import {
  CreateBriefDto,
  UpdateBriefDto,
  ConfirmBriefDto,
  BriefQueryDto,
} from '../dto/brief.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

/**
 * 需求单控制器
 * 提供需求单的创建、查询、更新、确认与取消
 */
@ApiTags('需求单')
@ApiBearerAuth()
@Controller('briefs')
export class BriefController {
  constructor(private readonly briefService: BriefService) {}

  @Post()
  @ApiOperation({ summary: '创建需求单' })
  create(@CurrentUser('userId') userId: number, @Body() dto: CreateBriefDto) {
    return this.briefService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取需求单列表（分页 + 状态过滤）' })
  list(@CurrentUser('userId') userId: number, @Query() query: BriefQueryDto) {
    return this.briefService.list(userId, query);
  }

  @Get('history')
  @ApiOperation({ summary: '获取需求单历史（最近 N 条，倒序）' })
  history(@CurrentUser('userId') userId: number, @Query('limit') limit?: number) {
    return this.briefService.history(userId, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取需求单详情' })
  getOne(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.briefService.getOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新需求单（仅 draft 可改）' })
  update(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBriefDto,
  ) {
    return this.briefService.update(userId, id, dto);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: '确认需求单（draft → confirmed）' })
  confirm(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmBriefDto,
  ) {
    return this.briefService.confirm(userId, id, dto);
  }

  @Post(':id/redispatch')
  @ApiOperation({ summary: '重新拆解（AI 拆解失败后重试）' })
  redispatch(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmBriefDto,
  ) {
    return this.briefService.redispatch(userId, id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消需求单（draft/confirmed → cancelled）' })
  cancel(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.briefService.cancel(userId, id);
  }
}