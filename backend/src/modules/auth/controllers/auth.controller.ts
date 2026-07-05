import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { TokenService } from '../services/token.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserService } from '../../user/services/user.service';

/** 从请求中提取客户端 IP（兼容反向代理 x-forwarded-for） */
function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip || '0.0.0.0';
}

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private tokenService: TokenService,
    private userService: UserService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '用户登录' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, getClientIp(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '刷新Token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: '退出登录' })
  async logout(@Body() body: { refreshToken?: string }) {
    return this.authService.logout(body?.refreshToken || '');
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: '忘记密码（发送重置邮件）' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: '重置链接已发送到您的邮箱（30 分钟内有效）' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: '重置密码' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: '密码重置成功' };
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  async profile(@CurrentUser() user: ICurrentUser) {
    const fullUser = await this.userService.findById(user.userId);
    const roles = await this.userService.findUserRoles(user.userId);
    return {
      id: fullUser.id,
      username: fullUser.username,
      email: fullUser.email,
      phone: fullUser.phone,
      avatar: fullUser.avatar,
      status: fullUser.status,
      level: fullUser.level,
      roles,
      createdAt: fullUser.createdAt,
      updatedAt: fullUser.updatedAt,
    };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息(前端兼容)' })
  async me(@CurrentUser() user: ICurrentUser) {
    return this.profile(user);
  }
}
