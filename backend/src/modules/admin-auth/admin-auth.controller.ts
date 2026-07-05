import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard } from './admin.guard';
import { AdminLoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';

/**
 * 管理端认证控制器
 * 数据合同真源：Task 17 - 管理端认证与权限
 *
 * 端点：
 *   POST /admin/auth/login    管理员登录（公开）
 *   POST /admin/auth/logout   管理员登出（需 adminToken）
 *   GET  /admin/auth/profile  当前管理员信息 + 权限（需 adminToken）
 *
 * 注：全局 JwtAuthGuard 使用用户端 JWT_SECRET，会拦截 adminToken，
 * 故控制器整体标注 @Public() 跳过全局守卫，由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-认证')
@ApiBearerAuth()
@Controller('admin/auth')
@Public()
export class AdminAuthController {
  constructor(private readonly service: AdminAuthService) {}

  @Post('login')
  @ApiOperation({ summary: '管理员登录' })
  async login(@Body() dto: AdminLoginDto) {
    return this.service.login(dto.username, dto.password);
  }

  @Post('logout')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '管理员登出' })
  async logout() {
    await this.service.logout();
    return null;
  }

  @Get('profile')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '当前管理员信息与权限' })
  async profile(@Req() req: any) {
    return this.service.getProfile(req.adminUser.id);
  }
}
