import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: '用户名', example: 'shentong' })
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, { message: '用户名只能包含字母、数字、下划线,长度3-32' })
  username: string;

  @ApiProperty({ description: '邮箱', example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @ApiProperty({ description: '密码', example: 'Pass1234' })
  @IsString()
  @MinLength(8, { message: '密码至少8位' })
  @MaxLength(64, { message: '密码最多64位' })
  password: string;

  @ApiProperty({ description: '邀请码', required: false })
  @IsOptional()
  @IsString()
  inviteCode?: string;
}
