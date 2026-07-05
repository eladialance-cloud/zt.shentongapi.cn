import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: '原密码' })
  @IsString()
  @IsNotEmpty({ message: '原密码不能为空' })
  oldPassword: string;

  @ApiProperty({ description: '新密码' })
  @IsString()
  @MinLength(8, { message: '新密码至少8位' })
  @MaxLength(64, { message: '新密码最多64位' })
  newPassword: string;
}
