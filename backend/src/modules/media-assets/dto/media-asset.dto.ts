import {
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaAssetType } from '../entities/media-asset.entity';

/** 手动登记素材 DTO */
export class CreateMediaAssetDto {
  @ApiProperty({ description: '素材标题', maxLength: 255, example: '产品宣传图' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: '素材地址', maxLength: 1024, example: 'https://oss.example.com/a.png' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  url: string;

  @ApiPropertyOptional({
    description: '素材类型',
    enum: ['image', 'video', 'audio', 'file'],
    default: 'file',
  })
  @IsOptional()
  @IsIn(['image', 'video', 'audio', 'file'])
  assetType?: MediaAssetType;

  @ApiPropertyOptional({ description: 'MIME 类型', example: 'image/png' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @ApiPropertyOptional({ description: '文件大小（字节）', example: 204800 })
  @IsOptional()
  @IsInt()
  fileSize?: number;

  @ApiPropertyOptional({ description: '标签', type: [String], example: ['海报', '电商'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/** 更新素材 DTO（全部可选） */
export class UpdateMediaAssetDto {
  @ApiPropertyOptional({ description: '素材标题', maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: '标签', type: [String], example: ['海报', '电商'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '是否归档', example: true })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

/** 导入素材 DTO（taskId / mediaJobId 二选一） */
export class ImportMediaAssetDto {
  @ApiPropertyOptional({ description: '任务 ID（导入 task_output_item）', example: 101 })
  @IsOptional()
  @IsInt()
  taskId?: number;

  @ApiPropertyOptional({ description: '媒体生成任务 ID（导入 media_jobs.resultUrls）', example: 9 })
  @IsOptional()
  @IsInt()
  mediaJobId?: number;
}

/** 素材列表查询 DTO */
export class MediaAssetQueryDto {
  @ApiPropertyOptional({ description: '素材类型过滤', enum: ['image', 'video', 'audio', 'file'] })
  @IsOptional()
  @IsIn(['image', 'video', 'audio', 'file'])
  type?: MediaAssetType;

  @ApiPropertyOptional({ description: '是否只查已归档（true/false/1/0）', example: 'false' })
  @IsOptional()
  @IsBooleanString()
  archived?: string;

  @ApiPropertyOptional({ description: '页码', example: 1 })
  @IsOptional()
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: '每页条数（上限 100）', example: 10 })
  @IsOptional()
  @IsInt()
  pageSize?: number;
}