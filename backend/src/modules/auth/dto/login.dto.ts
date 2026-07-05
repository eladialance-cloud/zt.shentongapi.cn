import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '账号(用户名或邮箱)', example: 'shentong' })
  @IsString()
  @IsNotEmpty({ message: '账号不能为空' })
  account: string;

  @ApiProperty({ description: '密码', example: 'Pass1234' })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少6位' })
  password: string;

  @ApiProperty({ description: '设备指纹（SHA-256，64 字符 hex）', required: false })
  @IsOptional()
  @IsString()
  @Length(64, 64, { message: '设备指纹必须为 64 字符的 SHA-256 哈希' })
  deviceFingerprint?: string;

  @ApiProperty({ description: '设备名称', required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiProperty({ description: '设备类型 (win32/darwin/linux)', required: false })
  @IsOptional()
  @IsString()
  @IsIn(['win32', 'darwin', 'linux'])
  deviceType?: string;
}
