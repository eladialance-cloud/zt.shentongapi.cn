import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 管理端创建用户 DTO
 */
export class CreateAdminUserDto {
  @ApiProperty({ description: '用户名', example: 'new_user', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_\-\u4e00-\u9fff]+$/, { message: '用户名仅支持字母、数字、下划线、连字符和中文' })
  username: string;

  @ApiProperty({ description: '密码', example: 'Abc12345!', minLength: 6, maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @ApiProperty({ description: '邮箱', example: 'user@example.com', maxLength: 128 })
  @IsEmail()
  @MaxLength(128)
  email: string;

  @ApiPropertyOptional({ description: '手机号', example: '13800138000', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '用户等级', example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  level?: number;
}
