import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

/** 批量删除请求体（各管理端模块共用） */
export class BatchDeleteDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}
