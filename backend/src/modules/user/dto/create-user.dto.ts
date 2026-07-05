import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ description: '用户名' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: '邮箱' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '已哈希的密码' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: '邀请码（用户自己的分享码，可选）', required: false })
  @IsOptional()
  @IsString()
  inviteCode?: string;

  @ApiProperty({ description: '邀请人 ID', required: false })
  @IsOptional()
  inviterId?: number;

  @ApiProperty({ description: '注册来源', required: false })
  @IsOptional()
  @IsString()
  registerSource?: 'direct' | 'invite' | 'promotion';
}
