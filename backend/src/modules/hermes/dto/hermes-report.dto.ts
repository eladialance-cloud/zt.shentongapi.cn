import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

/** 本地 Hermes 编排结果上报（桌面端主进程 → 云端） */
export class HermesReportDto {
  @IsString()
  executionRef: string;

  @IsInt()
  teamTaskId: number;

  @IsOptional()
  @IsInt()
  teamId?: number;

  @IsIn(['completed', 'failed'])
  status: 'completed' | 'failed';

  @IsString()
  summary: string;

  @IsOptional()
  steps?: unknown[];

  @IsOptional()
  outputs?: unknown[];

  @IsOptional()
  error?: string | null;

  @IsInt()
  durationMs: number;
}