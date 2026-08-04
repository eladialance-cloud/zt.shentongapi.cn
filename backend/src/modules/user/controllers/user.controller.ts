import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import type { Request } from 'express';
import { UserService } from '../services/user.service';
import { InviteCodeService } from '../invite-code.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';
import { UpdateNotificationSettingsDto } from '../dto/update-notification-settings.dto';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { generateFileName } from '../../../common/utils/file.util';

@ApiTags('用户')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(
    private userService: UserService,
    private inviteCodeService: InviteCodeService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: '获取个人信息' })
  async getProfile(@CurrentUser() user: ICurrentUser) {
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

  @Patch('password')
  @ApiOperation({ summary: '修改密码' })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.userService.changePassword(user.userId, dto);
  }

  @Post('avatar')
  @ApiOperation({ summary: '上传头像' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
          const filename = generateFileName(file.originalname);
          cb(null, filename);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (req: Request, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
        if (!file.mimetype.match(/^image\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new Error('只允许上传图片文件'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: ICurrentUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // 注意:实际项目中应上传到 OSS/MinIO,这里先返回本地 URL
    const avatarUrl = `/uploads/avatars/${file.filename}`;
    return this.userService.updateAvatar(user.userId, avatarUrl);
  }

  // ===== API Key 管理（设置页） =====

  @Get('api-keys')
  @ApiOperation({ summary: '查询我的 API Key 列表' })
  async listApiKeys(@CurrentUser() user: ICurrentUser) {
    return this.userService.listApiKeys(user.userId);
  }

  @Post('api-keys')
  @ApiOperation({ summary: '创建 API Key（明文仅本次返回）' })
  async createApiKey(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.userService.createApiKey(user.userId, dto.alias);
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: '删除 API Key' })
  async deleteApiKey(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.userService.deleteApiKey(user.userId, id);
    return null;
  }

  // ===== 通知设置（设置页） =====

  @Get('notification-settings')
  @ApiOperation({ summary: '获取通知设置' })
  async getNotificationSettings(@CurrentUser() user: ICurrentUser) {
    return this.userService.getNotificationSettings(user.userId);
  }

  @Patch('notification-settings')
  @ApiOperation({ summary: '更新通知设置' })
  async updateNotificationSettings(
    @Body() dto: UpdateNotificationSettingsDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.userService.updateNotificationSettings(user.userId, dto);
    return null;
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新用户信息' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    // 安全加固 P2-1: 仅允许修改自己的信息，否则返回403
    if (currentUser.userId !== id) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '仅可修改自己的信息');
    }
    return this.userService.update(id, dto);
  }

  // ===== 邀请码管理 =====

  @Post('invite-codes')
  @ApiOperation({ summary: '生成邀请码' })
  async generateInviteCode(@CurrentUser() user: ICurrentUser) {
    return this.inviteCodeService.generateCode(user.userId);
  }

  @Get('invite-codes')
  @ApiOperation({ summary: '查询我的邀请码' })
  async listMyInviteCodes(@CurrentUser() user: ICurrentUser) {
    return this.inviteCodeService.listMyCodes(user.userId);
  }

  @Get('invite-stats')
  @ApiOperation({ summary: '邀请统计' })
  async getInviteStats(@CurrentUser() user: ICurrentUser) {
    return this.inviteCodeService.getInviteStats(user.userId);
  }
}