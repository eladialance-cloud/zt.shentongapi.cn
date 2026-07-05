import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: '重置令牌（64 字符）', example: 'a1b2c3...' })
  @IsString()
  @Length(64, 64, { message: '重置令牌格式不正确' })
  token: string;

  @ApiProperty({ description: '新密码', example: 'NewPass1234' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  newPassword: string;
}
