/** 调用模式字典（14 种）——后台动态表单与网关路由的真源
 * 关联规格: docs/superpowers/specs/2026-08-14-llm-call-modes-oss-design.md 第 3 节
 */
export type CallModeKey =
  | 'text_chat' | 'embedding' | 'rerank' | 'vision' | 'ocr'
  | 'image' | 'image_edit' | 'video' | 'video_edit' | 'music'
  | 'stt' | 'tts' | 'voice_conversion' | 'realtime';

export type OutputType = 'text' | 'image' | 'video' | 'audio';
export type InputType = 'text' | 'image' | 'video' | 'audio';
export type BillingMode = 'token' | 'per_image' | 'per_call' | 'per_minute' | 'per_second';

export interface CallModeDef {
  key: CallModeKey;
  label: string;
  group: 'text' | 'multimodal' | 'generation' | 'voice';
  apiPath: string;
  sync: boolean;
  async: boolean;
  streaming: boolean;
  output: OutputType;
  inputs: InputType[];
  billingModes: BillingMode[];
  recommendedBilling: BillingMode;
  specFields: string[];
  advancedCaps: string[];
  recommendedScenarioTags: string[];
}

export const CALL_MODES: CallModeDef[] = [
  { key: 'text_chat', label: '文本对话', group: 'text', apiPath: '/chat/completions', sync: true, async: false, streaming: true, output: 'text', inputs: ['text'], billingModes: ['token'], recommendedBilling: 'token', specFields: ['contextWindow', 'maxOutput'], advancedCaps: ['function_calling', 'streaming', 'reasoning', 'json_mode', 'prefix_completion', 'web_search', 'multi_turn', 'context_cache'], recommendedScenarioTags: ['通用对话'] },
  { key: 'embedding', label: '向量嵌入', group: 'text', apiPath: '/embeddings', sync: true, async: false, streaming: false, output: 'text', inputs: ['text'], billingModes: ['token', 'per_call'], recommendedBilling: 'per_call', specFields: ['vectorDim', 'maxInputLength', 'maxBatchSize'], advancedCaps: ['batch'], recommendedScenarioTags: ['向量检索'] },
  { key: 'rerank', label: '重排序', group: 'text', apiPath: '/rerank', sync: true, async: false, streaming: false, output: 'text', inputs: ['text'], billingModes: ['token', 'per_call'], recommendedBilling: 'per_call', specFields: ['maxDocs', 'maxDocLength'], advancedCaps: ['batch'], recommendedScenarioTags: ['重排序'] },
  { key: 'vision', label: '视觉理解', group: 'multimodal', apiPath: '/chat/completions', sync: true, async: false, streaming: true, output: 'text', inputs: ['text', 'image', 'video'], billingModes: ['token'], recommendedBilling: 'token', specFields: ['contextWindow', 'maxOutput', 'inputTypes'], advancedCaps: ['function_calling', 'streaming', 'reasoning', 'multi_image', 'video_input'], recommendedScenarioTags: ['图像理解'] },
  { key: 'ocr', label: 'OCR文字提取', group: 'multimodal', apiPath: '/ocr', sync: true, async: false, streaming: false, output: 'text', inputs: ['image'], billingModes: ['per_image', 'token'], recommendedBilling: 'per_image', specFields: ['fileFormats', 'maxPages'], advancedCaps: [], recommendedScenarioTags: ['OCR'] },
  { key: 'image', label: '文生图', group: 'generation', apiPath: '/images/generations', sync: true, async: true, streaming: false, output: 'image', inputs: ['text'], billingModes: ['per_image'], recommendedBilling: 'per_image', specFields: ['resolutions', 'defaultResolution', 'aspectRatios', 'maxImages', 'supportsAsync'], advancedCaps: ['prompt_rewrite', 'enhanced_reasoning', 'custom_palette', 'album_mode'], recommendedScenarioTags: ['文生图'] },
  { key: 'image_edit', label: '图像编辑', group: 'generation', apiPath: '/images/edits', sync: true, async: true, streaming: false, output: 'image', inputs: ['text', 'image'], billingModes: ['per_image'], recommendedBilling: 'per_image', specFields: ['resolutions', 'defaultResolution', 'aspectRatios', 'maxImages', 'supportsAsync'], advancedCaps: ['prompt_rewrite', 'enhanced_reasoning', 'custom_palette', 'album_mode'], recommendedScenarioTags: ['图像编辑'] },
  { key: 'video', label: '视频生成', group: 'generation', apiPath: '/videos/generations', sync: false, async: true, streaming: false, output: 'video', inputs: ['text', 'image'], billingModes: ['per_second'], recommendedBilling: 'per_second', specFields: ['resolutionTiers', 'defaultResolution', 'maxDurationSec', 'aspectRatios', 'supportsAudio', 'async'], advancedCaps: ['prompt_rewrite', 'multi_shot', 'audio_sync', 'custom_audio'], recommendedScenarioTags: ['视频生成'] },
  { key: 'video_edit', label: '视频编辑', group: 'generation', apiPath: '/videos/edits', sync: false, async: true, streaming: false, output: 'video', inputs: ['text', 'video'], billingModes: ['per_second'], recommendedBilling: 'per_second', specFields: ['resolutionTiers', 'defaultResolution', 'maxDurationSec', 'aspectRatios', 'supportsAudio', 'async'], advancedCaps: ['prompt_rewrite', 'multi_shot', 'audio_sync', 'custom_audio'], recommendedScenarioTags: ['视频编辑'] },
  { key: 'music', label: '音乐生成', group: 'generation', apiPath: '/music/generations', sync: false, async: true, streaming: false, output: 'audio', inputs: ['text'], billingModes: ['per_call'], recommendedBilling: 'per_call', specFields: ['durationSec', 'formats', 'async'], advancedCaps: [], recommendedScenarioTags: ['音乐生成'] },
  { key: 'stt', label: '语音识别', group: 'voice', apiPath: '/audio/transcriptions', sync: true, async: false, streaming: true, output: 'text', inputs: ['audio'], billingModes: ['per_minute'], recommendedBilling: 'per_minute', specFields: ['formats', 'sampleRates', 'languages', 'supportsRealtime', 'maxAudioSec'], advancedCaps: ['realtime_streaming', 'speaker_diarization', 'punctuation'], recommendedScenarioTags: ['语音识别'] },
  { key: 'tts', label: '语音合成', group: 'voice', apiPath: '/audio/speech', sync: true, async: false, streaming: true, output: 'audio', inputs: ['text'], billingModes: ['per_call', 'per_minute'], recommendedBilling: 'per_call', specFields: ['voices', 'formats', 'speedRange', 'supportsStreaming'], advancedCaps: ['streaming', 'multi_voice', 'emotion'], recommendedScenarioTags: ['语音合成'] },
  { key: 'voice_conversion', label: '语音转语音', group: 'voice', apiPath: '/audio/voice-conversion', sync: true, async: false, streaming: false, output: 'audio', inputs: ['audio'], billingModes: ['per_minute'], recommendedBilling: 'per_minute', specFields: ['formats', 'needsReferenceVoice', 'maxDurationSec'], advancedCaps: [], recommendedScenarioTags: ['实时语音'] },
  { key: 'realtime', label: '实时语音对话', group: 'voice', apiPath: '/realtime', sync: false, async: false, streaming: true, output: 'text', inputs: ['audio', 'text'], billingModes: ['per_minute', 'token'], recommendedBilling: 'per_minute', specFields: ['sampleRates', 'formats', 'supportedFeatures'], advancedCaps: [], recommendedScenarioTags: ['实时语音'] },
];

export const CALL_MODE_KEYS = new Set<CallModeKey>(CALL_MODES.map((m) => m.key));

/** 存量 model_type -> call_mode（迁移与兼容回填） */
export const MODEL_TYPE_TO_CALL_MODE: Record<string, CallModeKey> = {
  chat: 'text_chat',
  vision: 'vision',
  image: 'image',
  image_edit: 'image_edit',
  video: 'video',
  tts: 'tts',
  reasoning: 'text_chat',
  embedding: 'embedding',
  audio: 'tts',
};

/** call_mode -> 兼容 model_type（路由/计费沿用旧分类） */
export const CALL_MODE_TO_MODEL_TYPE: Record<CallModeKey, string> = {
  text_chat: 'chat',
  embedding: 'embedding',
  rerank: 'rerank',
  vision: 'vision',
  ocr: 'vision',
  image: 'image',
  image_edit: 'image_edit',
  video: 'video',
  video_edit: 'video',
  music: 'tts',
  stt: 'chat',
  tts: 'tts',
  voice_conversion: 'tts',
  realtime: 'chat',
};

/** 场景标签固定字典（21 项） */
export const SCENARIO_TAGS = [
  '通用对话', '翻译', '角色扮演', '长文档', '数据挖掘', '对话分析', '深度研究', 'GUI操作', '意图识别',
  '图像理解', 'OCR', '文生图', '图像编辑', '图生图', '虚拟试衣', '创意海报', '视频生成', '图生视频', '视频编辑', '语音识别', '语音合成', '音乐生成',
  '向量检索', '重排序', '实时语音',
] as const;