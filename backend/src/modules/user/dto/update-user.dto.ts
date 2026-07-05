import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ description: '用户名', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, { message: '用户名格式不正确' })
  username?: string;

  @ApiProperty({ description: '邮箱', required: false })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;

  @ApiProperty({ description: '手机号', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '手机号长度不超过20' })
  phone?: string;

  @ApiProperty({ description: '头像URL', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(512, { message: '头像URL长度不超过512' })
  avatar?: string;
}
