import {
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaAssetType } from '../entities/media-asset.entity';
import { LIBRARY_KINDS, type MediaAssetKind, type MediaAssetLibrary } from '../library-kind';

/** 两库允许的 kind 全量（校验用） */
const ALL_KINDS: string[] = [...LIBRARY_KINDS.input, ...LIBRARY_KINDS.output];

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

  @ApiPropertyOptional({ description: '素材描述（参与语义检索；支持长文案全文）', example: '产品宣传海报，科技蓝风格' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @ApiPropertyOptional({ description: '扩展元数据（时长/分辨率/封面/字幕摘要）', example: { duration: 12.5 } })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
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

  @ApiPropertyOptional({ description: '素材描述（参与语义检索；支持长文案全文）', maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;
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

  @ApiPropertyOptional({ description: '素材库：input=用户输入库 / output=生成素材库（不传=兼容旧行为，不返回声音/形象/IP档案）', enum: ['input', 'output'] })
  @IsOptional()
  @IsIn(['input', 'output'])
  library?: MediaAssetLibrary;

  @ApiPropertyOptional({ description: '业务类别', enum: ALL_KINDS, example: 'copy' })
  @IsOptional()
  @IsIn(ALL_KINDS)
  kind?: MediaAssetKind;

  @ApiPropertyOptional({ description: '来源过滤', enum: ['manual', 'task', 'media_job', 'agent', 'flow'] })
  @IsOptional()
  @IsIn(['manual', 'task', 'media_job', 'agent', 'flow'])
  sourceType?: string;

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

/** 素材语义检索 DTO */
export class MaterialSearchQueryDto {
  @ApiProperty({ description: '搜索内容（自然语言/关键词）', example: '科技风宣传片' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  q: string;

  @ApiPropertyOptional({ description: '素材类型过滤', enum: ['image', 'video', 'audio', 'file'] })
  @IsOptional()
  @IsIn(['image', 'video', 'audio', 'file'])
  type?: MediaAssetType;

  @ApiPropertyOptional({
    description: '限定素材库：input=只从用户输入库取材（生成节点用）/ output=只在生成素材库检索',
    enum: ['input', 'output'],
  })
  @IsOptional()
  @IsIn(['input', 'output'])
  library?: MediaAssetLibrary;

  @ApiPropertyOptional({ description: '业务类别过滤', enum: ALL_KINDS })
  @IsOptional()
  @IsIn(ALL_KINDS)
  kind?: MediaAssetKind;

  @ApiPropertyOptional({ description: '返回条数（上限 50）', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  topK?: number;
}
