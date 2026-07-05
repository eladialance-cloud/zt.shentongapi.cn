import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard } from './admin.guard';
import { AdminLoginDto, AdminChangePasswordDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';

/**
 * 管理端认证控制器
 * 数据合同真源：Task 17 - 管理端认证与权限
 *
 * 端点：
 *   POST /admin/auth/login             管理员登录（公开）
 *   POST /admin/auth/logout            管理员登出（需 adminToken）
 *   GET  /admin/auth/profile           当前管理员信息+权限（需 adminToken）
 *   POST /admin/auth/change-password   修改管理员密码（需 adminToken）
 *
 * 所有 admin 端点均标注 @Public() 跳过全局 JwtAuthGuard（用户端 secret），
 * 由 AdminGuard 用 ADMIN_JWT_SECRET 统一校验。
 * adminToken 由 ADMIN_JWT_SECRET 签发，无法通过用户端 secret 校验，
 * 故必须 @Public() 跳过全局守卫。
 */
@ApiTags('管理端-认证')
@ApiBearerAuth()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly service: AdminAuthService) {}

  @Post('login')
  @Public()
  @ApiOperation({ summary: '管理员登录' })
  async login(@Body() dto: AdminLoginDto) {
    return this.service.login(dto.username, dto.password);
  }

  @Post('logout')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '管理员登出' })
  async logout() {
    await this.service.logout();
    return null;
  }

  @Get('profile')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '当前管理员信息与权限' })
  async profile(@Req() req: any) {
    return this.service.getProfile(req.adminUser.id);
  }

  @Post('change-password')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '修改管理员密码（首次登录强制改密）' })
  async changePassword(@Req() req: any, @Body() dto: AdminChangePasswordDto) {
    await this.service.changePassword(
      req.adminUser.id,
      dto.oldPassword,
      dto.newPassword,
    );
    return null;
  }
}
