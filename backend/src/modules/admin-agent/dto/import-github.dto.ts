import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * GitHub 仓库导入请求
 * 数据合同真源：optimize-agent-batch-import spec
 *
 * 支持真实克隆、解析、批量入库，可配置目标状态、默认模型、
 * 是否 dry-run（仅解析不入库）、是否覆盖已存在记录。
 *
 * 默认值约定（在 service 中应用，DTO 不做运行时默认值赋值）：
 * - targetStatus 默认 'published'
 * - defaultModelId 默认 'gpt-4o-mini'
 * - defaultCreatorId 默认 1
 * - dryRun 默认 false
 * - overwriteExisting 默认 false
 */
export class ImportGithubDto {
  @IsString()
  @MaxLength(512)
  repoUrl: string;

  /** 目标状态，默认 published 直接上架 */
  @IsOptional()
  @IsIn(['published', 'pending_review', 'draft'])
  targetStatus?: 'published' | 'pending_review' | 'draft';

  /** 默认模型 ID */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultModelId?: string;

  /** 默认创建者 ID（admin 用户） */
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultCreatorId?: number;

  /** dry-run 模式：仅解析不入库 */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** 是否覆盖已存在的导入记录 */
  @IsOptional()
  @IsBoolean()
  overwriteExisting?: boolean;
}
