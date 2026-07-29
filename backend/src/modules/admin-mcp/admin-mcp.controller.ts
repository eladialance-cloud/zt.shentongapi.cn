import {
  Body,
  Controller,
  Delete,
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
import { AdminMcpService } from './admin-mcp.service';
import {
  CreateServerConfigDto,
  UpdateServerConfigDto,
  CreateToolRegistryDto,
  UpdateToolRegistryDto,
  CreateResourceRegistryDto,
  UpdateResourceRegistryDto,
  McpQueryDto,
} from './dto/admin-mcp.dto';

/**
 * MCP 全局管理控制器
 * 提供 MCP Server 配置、工具注册、资源注册、调用日志的管理端接口
 */
@ApiTags('管理端-MCP全局管理')
@ApiBearerAuth()
@Public()
@Controller('admin/mcp')
@UseGuards(AdminGuard)
export class AdminMcpController {
  constructor(private readonly service: AdminMcpService) {}

  // ============ 服务配置 ============

  @Get('servers')
  @ApiOperation({ summary: 'MCP服务列表' })
  async listServers(@Query() query: McpQueryDto) {
    return this.service.listServers(query);
  }

  @Post('servers')
  @ApiOperation({ summary: '创建MCP服务' })
  async createServer(@Body() dto: CreateServerConfigDto) {
    return this.service.createServer(dto);
  }

  @Patch('servers/:id')
  @ApiOperation({ summary: '更新MCP服务' })
  async updateServer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServerConfigDto,
  ) {
    return this.service.updateServer(id, dto);
  }

  @Delete('servers/:id')
  @ApiOperation({ summary: '删除MCP服务' })
  async deleteServer(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteServer(id);
  }

  @Post('servers/:id/discover')
  @ApiOperation({ summary: '自动发现工具' })
  async discover(@Param('id', ParseIntPipe) id: number) {
    return this.service.autoDiscover(id);
  }

  // ============ 工具注册 ============

  @Get('tools')
  @ApiOperation({ summary: 'MCP工具列表' })
  async listTools(@Query() query: { serverId?: number; keyword?: string }) {
    return this.service.listTools(query);
  }

  @Post('tools')
  @ApiOperation({ summary: '注册MCP工具' })
  async createTool(@Body() dto: CreateToolRegistryDto) {
    return this.service.createTool(dto);
  }

  @Patch('tools/:id')
  @ApiOperation({ summary: '更新MCP工具' })
  async updateTool(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateToolRegistryDto,
  ) {
    return this.service.updateTool(id, dto);
  }

  @Delete('tools/:id')
  @ApiOperation({ summary: '删除MCP工具' })
  async deleteTool(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteTool(id);
  }

  // ============ 资源注册 ============

  @Get('resources')
  @ApiOperation({ summary: 'MCP资源列表' })
  async listResources(@Query() query: { serverId?: number; keyword?: string }) {
    return this.service.listResources(query);
  }

  @Post('resources')
  @ApiOperation({ summary: '注册MCP资源' })
  async createResource(@Body() dto: CreateResourceRegistryDto) {
    return this.service.createResource(dto);
  }

  @Patch('resources/:id')
  @ApiOperation({ summary: '更新MCP资源' })
  async updateResource(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateResourceRegistryDto,
  ) {
    return this.service.updateResource(id, dto);
  }

  @Delete('resources/:id')
  @ApiOperation({ summary: '删除MCP资源' })
  async deleteResource(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteResource(id);
  }

  // ============ 调用日志 ============

  @Get('logs')
  @ApiOperation({ summary: 'MCP调用日志列表' })
  async listLogs(
    @Query() query: {
      serverId?: number;
      userId?: number;
      callType?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.service.listLogs(query);
  }
}
