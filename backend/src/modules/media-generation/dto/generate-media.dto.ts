import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, Max, IsArray, ArrayMaxSize } from 'class-validator';

/** 生成图片 DTO */
export class GenerateImageDto {
  @IsNotEmpty({ message: 'modelId 不能为空' })
  @IsString()
  modelId: string;

  @IsNotEmpty({ message: '提示词不能为空' })
  @IsString()
  @MaxLength(2000)
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  size?: string;
  /** 创意工具输入图（image_edit 等）：http(s) URL 或 data:image 数据 URI，最多 4 张 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(4000, { each: true })
  inputImages?: string[];
}

/** 生成视频 DTO */
export class GenerateVideoDto {
  @IsNotEmpty({ message: 'modelId 不能为空' })
  @IsString()
  modelId: string;

  @IsNotEmpty({ message: '提示词不能为空' })
  @IsString()
  @MaxLength(2000)
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  resolution?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  duration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  fps?: number;

  /** 图生视频首帧图：http(s) URL 或 data:image 数据 URI，最多 1 张 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @IsString({ each: true })
  @MaxLength(4000, { each: true })
  inputImages?: string[];
}

/** 生成任务查询 DTO */
export class MediaJobQueryDto {
  @IsOptional()
  @IsInt()
  page?: number;

  @IsOptional()
  @IsInt()
  pageSize?: number;

  @IsOptional()
  @IsIn(['image', 'video'])
  type?: 'image' | 'video';
}
