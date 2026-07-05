import {
  Body,
  Controller,
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
import type { Request } from 'express';
import { UserService } from '../services/user.service';
import { InviteCodeService } from '../invite-code.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
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

  @Patch(':id')
  @ApiOperation({ summary: '更新用户信息' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    // 简单权限校验:只能修改自己的信息
    if (currentUser.userId !== id) {
      return this.userService.update(currentUser.userId, dto);
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
