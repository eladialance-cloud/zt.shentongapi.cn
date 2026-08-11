import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminMcpCatalogService } from './admin-mcp-catalog.service';
import {
  CreateMcpCatalogDto,
  McpCatalogQueryDto,
  UpdateMcpCatalogDto,
} from './dto/admin-mcp-catalog.dto';

/**
 * MCP 官方目录管理控制器
 * 提供官方目录条目的 CRUD、启停切换与软删除接口
 */
@ApiTags('MCP 官方目录')
@ApiBearerAuth()
@Public()
@Controller('admin/mcp-catalog')
@UseGuards(AdminGuard)
export class AdminMcpCatalogController {
  constructor(private readonly service: AdminMcpCatalogService) {}

  @Get()
  @ApiOperation({ summary: '官方目录列表' })
  async list(@Query() query: McpCatalogQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '官方目录详情' })
  async get(@Param('id', ParseIntPipe) id: number) {
    return this.service.get(id);
  }

  @Post()
  @ApiOperation({ summary: '创建官方目录条目' })
  async create(@Body() dto: CreateMcpCatalogDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新官方目录条目' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMcpCatalogDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/toggle')
  @ApiOperation({ summary: '启停切换' })
  async toggle(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggle(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除官方目录条目' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
