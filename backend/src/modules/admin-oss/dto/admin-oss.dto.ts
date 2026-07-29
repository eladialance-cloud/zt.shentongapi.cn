import { IsOptional, IsBoolean, IsString, IsEnum, IsObject, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

/**
 * OSS服务商类型
 */
export type OssProvider = 'local' | 'aliyun' | 'tencent' | 'qiniu' | 'minio';

/**
 * 创建OSS配置DTO
 */
export class CreateOssConfigDto {
  @IsString()
  @MaxLength(64)
  name: string;

  @IsEnum(['local', 'aliyun', 'tencent', 'qiniu', 'minio'])
  provider: OssProvider;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  endpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  bucket?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  accessKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  secretKey?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsObject()
  extraConfig?: Record<string, unknown>;
}

/**
 * 更新OSS配置DTO
 * 继承自 CreateOssConfigDto 的部分字段，额外增加 isActive 字段
 */
export class UpdateOssConfigDto extends PartialType(CreateOssConfigDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
