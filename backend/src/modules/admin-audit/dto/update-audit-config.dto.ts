import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * 更新 AI 审核配置请求体 (PUT /admin/audit/config)
 * 数据合同真源：Task 25 - 内容审核 / frontend UpdateAuditConfigDto
 */
export class UpdateAuditConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  sensitiveThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  violenceThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  pornThreshold?: number;

  @IsOptional()
  @IsBoolean()
  autoProcess?: boolean;
}
