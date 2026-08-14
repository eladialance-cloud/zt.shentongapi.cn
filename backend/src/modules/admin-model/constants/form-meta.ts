/** 管理后台动态表单元数据：规格字段 schema + 高级能力标签
 * 关联规格: docs/superpowers/specs/2026-08-14-llm-call-modes-oss-design.md 第 5 节
 */
export interface SpecFieldSchema {
  label: string;
  type: 'number' | 'text' | 'select' | 'multiselect' | 'json' | 'boolean';
  options?: string[];
  default?: unknown;
  placeholder?: string;
  min?: number;
  max?: number;
}

export const SPEC_FIELD_SCHEMAS: Record<string, SpecFieldSchema> = {
  contextWindow: { label: '上下文窗口', type: 'number', placeholder: '如 131072', min: 1 },
  maxOutput: { label: '最大输出', type: 'number', placeholder: '如 8192', min: 1 },
  vectorDim: { label: '向量维度', type: 'number', placeholder: '如 1024', min: 1 },
  maxInputLength: { label: '最大输入长度', type: 'number', placeholder: '如 8000', min: 1 },
  maxBatchSize: { label: '最大批量数', type: 'number', placeholder: '如 10', min: 1 },
  maxDocs: { label: '最大输入文档数', type: 'number', placeholder: '如 10', min: 1 },
  maxDocLength: { label: '最大单条长度', type: 'number', placeholder: '如 4000', min: 1 },
  inputTypes: { label: '支持输入类型', type: 'multiselect', options: ['text', 'image', 'video', 'audio'], default: ['text'] },
  fileFormats: { label: '支持文件格式', type: 'multiselect', options: ['jpg', 'png', 'webp', 'pdf'], default: ['jpg', 'png'] },
  maxPages: { label: '最大页数', type: 'number', placeholder: '如 10', min: 1 },
  resolutions: { label: '分辨率范围', type: 'multiselect', options: ['720P', '1080P', '2K', '4K'], default: ['720P', '1080P'] },
  defaultResolution: { label: '默认分辨率', type: 'select', options: ['720P', '1080P', '2K', '4K'], default: '720P' },
  aspectRatios: { label: '支持比例', type: 'multiselect', options: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: ['1:1', '16:9'] },
  maxImages: { label: '最大生成张数', type: 'number', placeholder: '如 4', min: 1 },
  supportsAsync: { label: '是否异步', type: 'boolean', default: false },
  resolutionTiers: { label: '分辨率档', type: 'multiselect', options: ['720P', '1080P', '2K', '4K'], default: ['720P', '1080P'] },
  maxDurationSec: { label: '最大时长(秒)', type: 'number', placeholder: '如 60', min: 1 },
  supportsAudio: { label: '是否支持音频', type: 'boolean', default: false },
  async: { label: '是否异步', type: 'boolean', default: true },
  durationSec: { label: '时长(秒)', type: 'number', placeholder: '如 30', min: 1 },
  formats: { label: '输出格式', type: 'multiselect', options: ['wav', 'mp3', 'aac', 'ogg', 'm4a'], default: ['mp3'] },
  sampleRates: { label: '采样率', type: 'multiselect', options: ['8k', '16k', '24k', '48k'], default: ['16k'] },
  languages: { label: '语言', type: 'multiselect', options: ['zh', 'en', 'ja', 'ko', 'ru', 'es'], default: ['zh', 'en'] },
  supportsRealtime: { label: '是否实时', type: 'boolean', default: false },
  maxAudioSec: { label: '最大音频时长(秒)', type: 'number', placeholder: '如 300', min: 1 },
  voices: { label: '音色列表', type: 'multiselect', options: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', '自定义'], default: ['nova'] },
  speedRange: { label: '语速范围', type: 'text', placeholder: '如 0.5-2.0' },
  supportsStreaming: { label: '是否流式', type: 'boolean', default: false },
  needsReferenceVoice: { label: '需要参考音色', type: 'boolean', default: true },
  supportedFeatures: { label: '支持功能', type: 'multiselect', options: ['function_calling', 'audio_in', 'text_in', 'audio_out', 'vad'], default: [] },
};

export const ADVANCED_CAP_LABELS: Record<string, string> = {
  function_calling: '函数调用',
  streaming: '流式输出',
  reasoning: '推理',
  json_mode: 'JSON 模式',
  prefix_completion: '前缀续写',
  web_search: '联网搜索',
  multi_turn: '多轮对话',
  context_cache: '会话缓存',
  batch: '批量处理',
  multi_image: '多图输入',
  video_input: '视频输入',
  prompt_rewrite: '提示词改写',
  enhanced_reasoning: '增强推理',
  custom_palette: '自定义色板',
  album_mode: '相册模式',
  multi_shot: '多镜头',
  audio_sync: '音频同步',
  custom_audio: '自定义音频',
  realtime_streaming: '实时流式',
  speaker_diarization: '说话人分离',
  punctuation: '标点恢复',
  multi_voice: '多音色',
  emotion: '情感控制',
};