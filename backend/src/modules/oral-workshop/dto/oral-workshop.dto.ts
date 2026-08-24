import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** 创建口播工坊任务 DTO */
export class CreateOralWorkshopJobDto {
  /** 原始文案/选题 */
  @IsNotEmpty({ message: 'scriptInput 不能为空' })
  @IsString()
  @MaxLength(20000)
  scriptInput: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetAudience?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  platforms?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  style?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  persona?: string;

  @IsOptional()
  @IsInt()
  digitalHumanId?: number;

  @IsOptional()
  @IsInt()
  voiceId?: number;

  @IsOptional()
  @IsInt()
  templateId?: number;

  /** 用户提供的成音（OSS URL 或服务器本地路径）：有值时 voiceClone 直接采用，不调 TTS */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  audioUrl?: string;

  /** 用户提供的数字人/绿幕视频（OSS URL 或服务器本地路径）：有值时 digitalHuman 直接采用 */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  videoUrl?: string;

  /** 双语字幕：true 时字幕渲染中英双行（LLM 翻译） */
  @IsOptional()
  @IsBoolean()
  bilingual?: boolean;

  /** 幂等键：重复提交同一 clientTxnId 直接返回已有任务，防止重复扣费 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientTxnId?: string;
}

/** 批量矩阵化建单 DTO（对标参考软件 draft:batch-create：文案 × 模板 × 声音 × 形象） */
export class BatchCreateOralWorkshopJobsDto {
  /** 文案/选题列表（每行一条，最多 50 条） */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(20000, { each: true })
  topics: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetAudience?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  platforms?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  style?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  persona?: string;

  /** 模板矩阵（不传 = 默认模板） */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  templateIds?: number[];

  /** 声音矩阵（不传 = 系统语音） */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  voiceIds?: number[];

  /** 形象矩阵（不传 = 上传视频/卡片兜底） */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  digitalHumanIds?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  audioUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  videoUrl?: string;

  /** 双语字幕：true 时每个任务字幕渲染中英双行 */
  @IsOptional()
  @IsBoolean()
  bilingual?: boolean;

  /** 批量幂等键：同一 batchTxnId 重复提交不重复建单 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  batchTxnId?: string;
}

/** 口播工坊任务查询 DTO */
export class OralWorkshopJobQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(['pending', 'processing', 'done', 'failed', 'cancelled'])
  status?: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';
}

/** 我的声音资产 DTO */
export class CreateVoiceAssetDto {
  @IsNotEmpty({ message: 'name 不能为空' })
  @IsString()
  @MaxLength(128)
  name: string;

  /** 参考音频 URL（OSS 或服务器路径） */
  @IsNotEmpty({ message: 'refAudioUrl 不能为空' })
  @IsString()
  @MaxLength(512)
  refAudioUrl: string;
}

/** 我的数字人形象 DTO */
export class CreateDigitalHumanAssetDto {
  @IsNotEmpty({ message: 'name 不能为空' })
  @IsString()
  @MaxLength(128)
  name: string;

  /** 火山数字人形象 ID */
  @IsNotEmpty({ message: 'cloudId 不能为空' })
  @IsString()
  @MaxLength(128)
  cloudId: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  previewUrl?: string;
}

/** 选题灵感 DTO */
export class GenerateTopicsDto {
  @IsNotEmpty({ message: 'keywords 不能为空' })
  @IsString()
  @MaxLength(200)
  keywords: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  persona?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;
}
