import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { McpService } from '../services/mcp.service';
import { McpCatalogQueryDto } from '../../admin-mcp/dto/admin-mcp-catalog.dto';

/**
 * MCP 官方目录控制器
 *
 * 提供用户端官方 MCP 目录浏览与详情能力。
 */
@ApiTags('MCP')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mcp')
export class McpCatalogController {
  constructor(private readonly service: McpService) {}

  @Get('catalog')
  list(
    @CurrentUser() user: ICurrentUser,
    @Query() query: McpCatalogQueryDto,
  ) {
    return this.service.listCatalog(user.userId, query);
  }

  @Get('catalog/:id')
  get(@CurrentUser() user: ICurrentUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.getCatalog(user.userId, id);
  }
}