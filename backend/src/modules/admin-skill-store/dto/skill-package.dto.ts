import { IsString, IsOptional, MaxLength, IsIn, IsArray, IsObject, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSkillPackageDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string;

  @IsOptional()
  @IsArray()
  triggerKeywords?: string[];

  @IsOptional()
  @IsArray()
  examples?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  uiConfig?: { icon?: string; color?: string; [key: string]: unknown };

  @IsOptional()
  @IsObject()
  opcAgentConfig?: Record<string, unknown>;
}

export class SkillPackageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsIn(['draft', 'reviewing', 'published', 'unpublished', 'failed'])
  status?: string;

  @IsOptional()
  @IsIn(['skill', 'workflow'])
  skillType?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  reviewStatus?: string;
}

export class RejectSkillPackageDto {
  @IsString()
  @MaxLength(512)
  reason: string;
}
