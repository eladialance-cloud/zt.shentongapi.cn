import { IsOptional, IsBoolean, IsString, IsEnum, IsObject, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

/**
 * OSS服务商类型
 */
export type OssProvider = 'local' | 'aliyun' | 'tencent' | 'qiniu' | 'minio' | 'aws';

/**
 * 创建OSS配置DTO
 */
export class CreateOssConfigDto {
  @IsString()
  @MaxLength(64)
  name: string;

  @IsEnum(['local', 'aliyun', 'tencent', 'qiniu', 'minio', 'aws'])
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

  /** 是否启用（兼容旧前端字段 isEnabled，创建时即可指定） */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  /** CDN 域名（落 extra_config.cdnUrl，用于生成公有读外链） */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  domain?: string;

  @IsOptional()
  @IsObject()
  extraConfig?: Record<string, unknown>;
}

/**
 * 更新OSS配置DTO
 * 继承自 CreateOssConfigDto 的部分字段
 */
export class UpdateOssConfigDto extends PartialType(CreateOssConfigDto) {}
