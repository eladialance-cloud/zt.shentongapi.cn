import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length, MaxLength } from 'class-validator';

export class BindDeviceDto {
  @ApiProperty({ description: '设备指纹（SHA-256，64 字符 hex）', example: 'a1b2...c3d4' })
  @IsString()
  @Length(64, 64, { message: '设备指纹必须为 64 字符的 SHA-256 哈希' })
  deviceFingerprint: string;

  @ApiProperty({ description: '设备名称', example: 'DESKTOP-win32' })
  @IsString()
  @MaxLength(128, { message: '设备名称最多 128 字符' })
  deviceName: string;

  @ApiProperty({ description: '设备类型', enum: ['win32', 'darwin', 'linux'] })
  @IsString()
  @IsIn(['win32', 'darwin', 'linux'], { message: '设备类型必须为 win32/darwin/linux' })
  deviceType: string;
}
