import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, MaxLength, ValidateIf } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: '原密码（旧字段名，兼容旧客户端）' })
  @ValidateIf((o) => o.currentPassword === undefined)
  @IsString()
  @IsNotEmpty({ message: '原密码不能为空' })
  oldPassword?: string;

  @ApiProperty({ description: '原密码（桌面端字段名）' })
  @ValidateIf((o) => o.oldPassword === undefined)
  @IsString()
  @IsNotEmpty({ message: '原密码不能为空' })
  currentPassword?: string;

  @ApiProperty({ description: '新密码' })
  @IsString()
  @MinLength(8, { message: '新密码至少8位' })
  @MaxLength(64, { message: '新密码最多64位' })
  newPassword: string;
}
