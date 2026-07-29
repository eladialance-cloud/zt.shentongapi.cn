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
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { McpService } from '../services/mcp.service';
import { CreateMcpServerDto, UpdateMcpServerDto, CallMcpToolDto } from '../dto/mcp.dto';

/**
 * MCP 用户端控制器
 *
 * 提供用户级别的 MCP Server 管理、探测、工具调用能力。
 */
@ApiTags('MCP')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mcp')
export class McpController {
  constructor(private readonly service: McpService) {}

  // ============ 基础信息 ============

  @Get()
  @ApiOperation({ summary: 'MCP 网关信息' })
  async getInfo(@CurrentUser() user: ICurrentUser) {
    return this.service.getInfo(user.userId);
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.service.health();
  }

  // ============ Server CRUD ============

  @Get('servers')
  @ApiOperation({ summary: '获取 MCP Server 列表' })
  async listServers(
    @CurrentUser() user: ICurrentUser,
    @Query('keyword') keyword?: string,
  ) {
    return this.service.listServers(user.userId, keyword);
  }

  @Get('servers/:id')
  @ApiOperation({ summary: '获取 MCP Server 详情' })
  async getServer(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getServer(user.userId, id);
  }

  @Post('servers')
  @ApiOperation({ summary: '创建 MCP Server' })
  async createServer(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateMcpServerDto,
  ) {
    return this.service.createServer(user.userId, dto);
  }

  @Put('servers/:id')
  @ApiOperation({ summary: '更新 MCP Server' })
  async updateServer(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMcpServerDto,
  ) {
    return this.service.updateServer(user.userId, id, dto);
  }

  @Delete('servers/:id')
  @ApiOperation({ summary: '删除 MCP Server' })
  async deleteServer(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.deleteServer(user.userId, id);
  }

  // ============ 探测 & 工具 ============

  @Post('servers/:serverId/probe')
  @ApiOperation({ summary: '探测 MCP Server 连通性' })
  async probeServer(
    @CurrentUser() user: ICurrentUser,
    @Param('serverId', ParseIntPipe) serverId: number,
  ) {
    return this.service.probeServer(user.userId, serverId);
  }

  @Get('servers/:serverId/tools')
  @ApiOperation({ summary: '获取 MCP Server 工具列表' })
  async listTools(
    @CurrentUser() user: ICurrentUser,
    @Param('serverId', ParseIntPipe) serverId: number,
  ) {
    return this.service.listTools(user.userId, serverId);
  }

  // ============ 工具调用 ============

  @Post('call')
  @ApiOperation({ summary: '调用 MCP 工具' })
  async callTool(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CallMcpToolDto,
  ) {
    return this.service.callTool(user.userId, {
      serverId: dto.serverId,
      toolName: dto.toolName,
      args: dto.args ?? {},
    });
  }
}
