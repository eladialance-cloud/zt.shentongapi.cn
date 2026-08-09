import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 批量审核请求体（各管理端模块共用）
 * ids: 目标 ID 列表
 * reason: 批量驳回时的统一原因（通过时可不传）
 */
export class BatchReviewDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
