import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, Validate, ValidatorConstraint, type ValidatorConstraintInterface, type ValidationArguments } from 'class-validator';
import { validateMediaRef } from '../ffmpeg';

/** 媒体引用白名单校验：只允许公网 http(s) 链接或以 /uploads/ 开头的服务端路径（防任意文件读取） */
@ValidatorConstraint({ name: 'safeMediaRef', async: false })
export class SafeMediaRefConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && validateMediaRef(value);
  }
  defaultMessage(_args: ValidationArguments): string {
    return '媒体地址只能是公网 http(s) 链接或以 /uploads/ 开头的服务端路径';
  }
}

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

  /** 执行模式：auto=自动流水线（默认）/ manual=手动逐步（每步确认后继续）/ single=单步执行 */
  @IsOptional()
  @IsIn(['auto', 'manual', 'single'])
  executionMode?: 'auto' | 'manual' | 'single';

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
  @Validate(SafeMediaRefConstraint)
  audioUrl?: string;

  /** 用户提供的数字人/绿幕视频（OSS URL 或服务器本地路径）：有值时 digitalHuman 直接采用 */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Validate(SafeMediaRefConstraint)
  videoUrl?: string;

  /** 双语字幕：true 时字幕渲染中英双行（LLM 翻译） */
  @IsOptional()
  @IsBoolean()
  bilingual?: boolean;

  /** 字幕目标语言：zh/留空=纯中文；en 等国际语言或 zh-xx 方言=双语对照字幕（LLM 翻译目标语言，优先级高于 bilingual） */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  targetLang?: string;

  /** 配音音质档位：V1=标准 / V2=高清（留空=后台默认模型） */
  @IsOptional()
  @IsIn(['V1', 'V2'])
  voiceModelVersion?: 'V1' | 'V2';

  /** 任务级官方音色 speaker_id（seed-tts-2.0 音色池选择，覆盖档位默认音色；仅本地/火山合成时生效） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  speakerId?: string;

  /** 语速（0.5-1.5，默认 0.9；用户级覆盖后台/环境变量） */
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.5)
  voiceSpeechRate?: number;

  /** 人声音量增益（-20~20，默认 0） */
  @IsOptional()
  @IsNumber()
  @Min(-20)
  @Max(20)
  voiceLoudnessRate?: number;

  /** 情感（高兴/愤怒/悲伤/害怕/平静/无；映射火山 context_texts） */
  @IsOptional()
  @IsIn(['高兴', '愤怒', '悲伤', '害怕', '平静', '无'])
  voiceEmotion?: string;

  /** BGM（E3：后台音乐库条目 URL 或自定义 URL） */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Validate(SafeMediaRefConstraint)
  bgmUrl?: string;

  /** BGM 音量（0-1，默认 0.2） */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  bgmVolume?: number;

  /** 画中画素材（P3 D4/E6：叠加到成片的图片/视频，位置/缩放/时间可选） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  pipAssets?: Array<{
    /** 素材 URL（/uploads/ 或公网 http(s)） */
    url: string;
    /** 位置：tl=左上 / tr=右上 / bl=左下 / br=右下 / center=居中 */
    position?: 'tl' | 'tr' | 'bl' | 'br' | 'center';
    /** 缩放（0.1-1，相对原视频宽度比例，默认 0.25） */
    scale?: number;
    /** 起始秒（可选） */
    startSec?: number;
    /** 结束秒（可选，需大于 startSec） */
    endSec?: number;
  }>;

  /** 数字人清晰度档位：V1=标准 / V2=高清（留空=后台默认） */
  @IsOptional()
  @IsIn(['V1', 'V2'])
  dhModelVersion?: 'V1' | 'V2';

  /** 数字人生成方式（D6）：auto=自动降级（默认）/ cloud=强制云端火山 / local=强制本地卡片视频 */
  @IsOptional()
  @IsIn(['auto', 'cloud', 'local'])
  dhGenerationMode?: 'auto' | 'cloud' | 'local';

  /** 多镜头拼接（D3：列表从上到下即最终视频拼接顺序，每镜头选择形象+时长；传了则忽略单选 digitalHumanId） */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  shots?: Array<{
    /** 数字人形象资产 ID（digital_human_assets.id） */
    digitalHumanId: number;
    /** 镜头时长（秒，2-120） */
    seconds: number;
  }>;

  /** 字幕轨开关（E7：false = 成片不烧录字幕，默认 true） */
  @IsOptional()
  @IsBoolean()
  subtitlesEnabled?: boolean;

  /** BGM 轨开关（E7：false = 不混入背景音乐，默认 true） */
  @IsOptional()
  @IsBoolean()
  bgmEnabled?: boolean;

  /** 字幕文本覆盖（E4：多行文本，每行一条字幕；留空=按文案自动分段） */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  subtitlesOverride?: string;

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

  /** 执行模式（批量任务统一生效） */
  @IsOptional()
  @IsIn(['auto', 'manual', 'single'])
  executionMode?: 'auto' | 'manual' | 'single';

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

  /** 批量统一配音音质档位：V1=标准 / V2=高清（留空=后台默认） */
  @IsOptional()
  @IsIn(['V1', 'V2'])
  voiceModelVersion?: 'V1' | 'V2';

  /** 批量统一数字人清晰度档位：V1=标准 / V2=高清（留空=后台默认） */
  @IsOptional()
  @IsIn(['V1', 'V2'])
  dhModelVersion?: 'V1' | 'V2';

  /** 批量统一官方音色 speaker_id（seed-tts-2.0 音色池选择） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  speakerId?: string;

  /** 批量统一语速（0.5-1.5） */
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.5)
  voiceSpeechRate?: number;

  /** 批量统一音量增益（-20~20） */
  @IsOptional()
  @IsNumber()
  @Min(-20)
  @Max(20)
  voiceLoudnessRate?: number;

  /** 批量统一情感 */
  @IsOptional()
  @IsIn(['高兴', '愤怒', '悲伤', '害怕', '平静', '无'])
  voiceEmotion?: string;

  /** 批量统一 BGM URL */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Validate(SafeMediaRefConstraint)
  bgmUrl?: string;

  /** 批量统一 BGM 音量（0-1） */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  bgmVolume?: number;

  /** 批量统一画中画素材（P3 D4/E6） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  pipAssets?: Array<{
    url: string;
    position?: 'tl' | 'tr' | 'bl' | 'br' | 'center';
    scale?: number;
    startSec?: number;
    endSec?: number;
  }>;

  /** 批量统一数字人生成方式（D6） */
  @IsOptional()
  @IsIn(['auto', 'cloud', 'local'])
  dhGenerationMode?: 'auto' | 'cloud' | 'local';

  /** 批量统一字幕轨开关（E7） */
  @IsOptional()
  @IsBoolean()
  subtitlesEnabled?: boolean;

  /** 批量统一 BGM 轨开关（E7） */
  @IsOptional()
  @IsBoolean()
  bgmEnabled?: boolean;

  /** 批量统一字幕文本覆盖（E4） */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  subtitlesOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Validate(SafeMediaRefConstraint)
  audioUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Validate(SafeMediaRefConstraint)
  videoUrl?: string;

  /** 双语字幕：true 时每个任务字幕渲染中英双行 */
  @IsOptional()
  @IsBoolean()
  bilingual?: boolean;

  /** 字幕目标语言（批量任务统一生效，优先级高于 bilingual） */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  targetLang?: string;

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
  @Validate(SafeMediaRefConstraint)
  refAudioUrl: string;

  /** 情感参考音频 URL（C6：复刻时附带的情绪素材，可选） */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Validate(SafeMediaRefConstraint)
  emotionRefAudio?: string;
}

/** 我的数字人形象 DTO */
export class CreateDigitalHumanAssetDto {
  @IsNotEmpty({ message: 'name 不能为空' })
  @IsString()
  @MaxLength(128)
  name: string;

  /** 形象类型（D2）：cloud=火山形象 ID（默认）/ video=本地上传视频 */
  @IsOptional()
  @IsIn(['cloud', 'video'])
  kind?: 'cloud' | 'video';

  /** 火山数字人形象 ID（kind=cloud 时必填） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cloudId?: string;

  /** 本地视频形象 URL（kind=video 时必填，转码后的 MP4） */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Validate(SafeMediaRefConstraint)
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  previewUrl?: string;

  /** 形象描述（D1） */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  excludedTopics?: string[];

  /** 行业或产品（选题贴合该领域，可选） */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  industryOrProduct?: string;

  /** 产品卖点（选题围绕卖点展开，可选） */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  productSellingPoints?: string;
}

/** 智能改写 DTO（A4：选模板/字数/参考范文，AI 改写口播文案） */
export class RewriteScriptDto {
  @IsNotEmpty({ message: 'script 不能为空' })
  @IsString()
  @MaxLength(20000)
  script: string;

  /** 改写模板：rewrite_master（信息保全）/ generic_rewrite（精简）/ rewrite_detailed（爆款详细）/ rewrite_deep_learn（深度学习） */
  @IsOptional()
  @IsIn(['rewrite_master', 'generic_rewrite', 'rewrite_detailed', 'rewrite_deep_learn'])
  templateId?: string;

  /** 目标字数（默认 260，范围 100-800） */
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(800)
  wordCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  persona?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  style?: string;

  /** 参考范文（深度学习模板用） */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  reference?: string;
}

/** 产品/营销文案 DTO（A5：至少填产品名称或卖点之一） */
export class ProductCopyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sellingPoints?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  persona?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  style?: string;
}

/** 对标账号风格分析 DTO（分析参考内容 → style_analysis + 5 条选题） */
export class StyleAnalysisDto {
  @IsNotEmpty({ message: '请提供对标内容' })
  @IsString()
  @MaxLength(20000)
  referenceContent: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  excludedTopics?: string[];
}

/** 选题 → 口播文案生成 DTO（选题灵感选中后，AI 扩写完整口播文案） */
export class GenerateScriptDto {
  @IsNotEmpty({ message: 'topic 不能为空' })
  @IsString()
  @MaxLength(500)
  topic: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  persona?: string;

  /** 参考范文/对标文案（可选，增强模仿语感节奏） */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  reference?: string;
}

/** 学习对标：提取文案 DTO（videoUrl 必须是公网视频链接，下载时再做 SSRF 校验） */
export class ExtractScriptDto {
  @IsNotEmpty({ message: 'videoUrl 不能为空' })
  @IsString()
  @MaxLength(512)
  @Validate(SafeMediaRefConstraint)
  videoUrl: string;
}
