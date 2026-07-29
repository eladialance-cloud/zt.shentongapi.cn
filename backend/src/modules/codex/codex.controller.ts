import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CodexService } from './codex.service';

/**
 * CodeX 代码沙箱控制器
 * 所有接口均需 JWT 认证，不接受匿名访问
 */
@ApiTags('CodeX 代码沙箱')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('codex')
export class CodexController {
  constructor(private readonly service: CodexService) {}

  @Get('status')
  @ApiOperation({ summary: '获取沙箱状态' })
  getStatus() {
    return this.service.getStatus();
  }

  @Get('mcp-tools')
  @ApiOperation({ summary: '获取 MCP 工具定义' })
  getMcpTools() {
    return this.service.getMcpToolDefinitions();
  }

  @Post('execute')
  @ApiOperation({ summary: '执行代码（骨架）' })
  executeCode(
    @Body('language') language: string,
    @Body('code') code: string,
    @Body('timeout') timeout?: number,
  ) {
    return this.service.executeCode(language, code, timeout);
  }
}
