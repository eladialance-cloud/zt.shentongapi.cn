/** 模型配置模板库 seed —— 后台"从模板创建"数据源 + 模型市场预设库
 * 参考价单位：积分/千token 或 /张 /次 /分钟；管理员可改。
 * 关联规格: docs/superpowers/specs/2026-08-14-llm-call-modes-oss-design.md 第 5 节
 *          docs/superpowers/specs/2026-08-14-model-market-design.md 第 3 节
 */
import { CallModeKey } from './call-modes';

export type VendorKey = 'aliyun-dashscope' | 'openai' | 'deepseek' | 'relay';

export interface ModelTemplate {
  key: string;
  vendor: VendorKey;
  name: string;
  callMode: CallModeKey;
  description: string;
  /** 真实上游模型 ID（发给第三方 API 的 model 字段） */
  upstreamModelId: string;
  specValues: Record<string, unknown>;
  generationParams: Record<string, unknown>;
  recommendedScenarioTags: string[];
  referencePrice?: ReferencePrice;
  /** 是否已通过真实 API 测试（未验证黄标 / 已验证绿标） */
  verified: boolean;
  /** 需账号开通权限（如 qwen-video-plus） */
  requiresActivation?: boolean;
}

export interface ReferencePrice {
  inputPricePerToken?: number;
  outputPricePerToken?: number;
  pricePerImage?: number;
  pricePerCall?: number;
  pricePerMinute?: number;
  videoPerSecond?: Record<string, number>;
}

/** 厂商级预设（模型市场创建供应商时自动预填；存 provider.config） */
export interface ProviderTemplate {
  vendor: VendorKey;
  nameSuggestion: string;
  baseUrl: string;
  chatPath: string;
  modelsPath: string;
  apiStyle: string;
  /** 生成适配模板（存 provider.config.generation，模型级 generationParams 可覆盖） */
  generation: Record<string, unknown>;
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    vendor: 'aliyun-dashscope',
    nameSuggestion: '阿里百炼 DashScope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    apiStyle: 'dashscope_native',
    generation: {
      // 文生图：DashScope 原生异步端点（compatible-mode /images/generations 对 wanx2.1 返回 404）
      imagesPath: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
      imageTaskPath: 'https://dashscope.aliyuncs.com/api/v1/tasks/{id}',
      imageResultUrlPath: 'output.results[0].url',
      imageRequestTemplate: { model: '{upstreamModelId}', input: { prompt: '{prompt}' }, parameters: { n: 1, size: '{size}' } },
      videosPath: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      taskPath: 'https://dashscope.aliyuncs.com/api/v1/tasks/{id}',
      requestTemplate: { model: '{upstreamModelId}', input: { prompt: '{prompt}' }, parameters: { resolution: '{resolution}', duration: '{duration}', fps: '{fps}' } },
      taskIdPath: 'output.task_id',
      statusPath: 'output.task_status',
      successValues: ['SUCCEEDED'],
      failedValues: ['FAILED', 'CANCELED'],
      resultUrlPath: 'output.video_url',
      extraHeaders: { 'X-DashScope-Async': 'enable' },
      async: true,
      pollInterval: 3000,
    },
  },
  {
    vendor: 'openai',
    nameSuggestion: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    apiStyle: 'openai_compatible',
    generation: {},
  },
  {
    vendor: 'deepseek',
    nameSuggestion: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    apiStyle: 'openai_compatible',
    generation: {},
  },
  {
    vendor: 'relay',
    nameSuggestion: '中转 / 自建',
    baseUrl: '',
    chatPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    apiStyle: 'openai_compatible',
    generation: {},
  },
];

export const MODEL_TEMPLATES: ModelTemplate[] = [
  // ============ 阿里百炼 DashScope ============
  { key: 'qwen-plus', vendor: 'aliyun-dashscope', name: '通义千问-Plus', callMode: 'text_chat', description: '通用对话旗舰', upstreamModelId: 'qwen-plus', specValues: { contextWindow: 131072, maxOutput: 8192 }, generationParams: {}, recommendedScenarioTags: ['通用对话'], referencePrice: { inputPricePerToken: 0.8, outputPricePerToken: 2 }, verified: true },
  { key: 'qwen-flash', vendor: 'aliyun-dashscope', name: '通义千问-Flash', callMode: 'text_chat', description: '轻量高速对话', upstreamModelId: 'qwen-flash', specValues: { contextWindow: 131072, maxOutput: 4096 }, generationParams: {}, recommendedScenarioTags: ['通用对话'], referencePrice: { inputPricePerToken: 0.1, outputPricePerToken: 0.3 }, verified: true },
  { key: 'qwen-long', vendor: 'aliyun-dashscope', name: '通义千问-Long', callMode: 'text_chat', description: '长文档两步式（先传文件拿 file-id 再带 file_ids 调用）', upstreamModelId: 'qwen-long', specValues: { contextWindow: 10000000, maxOutput: 8192 }, generationParams: { file_id_required: true, submit_path: '/compatible-mode/v1/file-uploads', file_id_path: 'file_id', chat_files_field: 'files', reference_note: '先上传文件得到 file-id，再在 chat/completions 带 file_ids 引用' }, recommendedScenarioTags: ['长文档'], referencePrice: { inputPricePerToken: 0.2, outputPricePerToken: 1 }, verified: false },
  { key: 'qwen-mt-flash', vendor: 'aliyun-dashscope', name: '通义千问-翻译-Flash', callMode: 'text_chat', description: '翻译专用（chat_body_extra.target_lang 注入）', upstreamModelId: 'qwen-mt-flash', specValues: { contextWindow: 131072, maxOutput: 4096 }, generationParams: { chat_body_extra: { target_lang: 'zh' } }, recommendedScenarioTags: ['翻译'], referencePrice: { inputPricePerToken: 0.3, outputPricePerToken: 0.6 }, verified: false },
  { key: 'character-qwen-6b', vendor: 'aliyun-dashscope', name: '通义千问-角色-6B', callMode: 'text_chat', description: '角色扮演轻量版', upstreamModelId: 'character-qwen-6b', specValues: { contextWindow: 32768, maxOutput: 2048 }, generationParams: {}, recommendedScenarioTags: ['角色扮演'], referencePrice: { inputPricePerToken: 0.2, outputPricePerToken: 0.4 }, verified: false },
  { key: 'character-qwen-32b', vendor: 'aliyun-dashscope', name: '通义千问-角色-32B', callMode: 'text_chat', description: '角色扮演旗舰版', upstreamModelId: 'character-qwen-32b', specValues: { contextWindow: 32768, maxOutput: 4096 }, generationParams: {}, recommendedScenarioTags: ['角色扮演'], referencePrice: { inputPricePerToken: 0.5, outputPricePerToken: 1.2 }, verified: false },
  { key: 'qwen-doc-turbo', vendor: 'aliyun-dashscope', name: '通义千问-文档-Turbo', callMode: 'text_chat', description: '长文档处理（doc/PDF）', upstreamModelId: 'qwen-doc-turbo', specValues: { contextWindow: 10000000, maxOutput: 8192 }, generationParams: {}, recommendedScenarioTags: ['长文档'], referencePrice: { inputPricePerToken: 0.3, outputPricePerToken: 1 }, verified: false },
  { key: 'qwen-deep-research', vendor: 'aliyun-dashscope', name: '通义千问-深度研究', callMode: 'text_chat', description: '深度研究（chat_body_extra.enable_search 注入）', upstreamModelId: 'qwen-deep-research', specValues: { contextWindow: 131072, maxOutput: 16384 }, generationParams: { chat_body_extra: { enable_search: true } }, recommendedScenarioTags: ['深度研究'], referencePrice: { inputPricePerToken: 1.2, outputPricePerToken: 3 }, verified: false },
  { key: 'gui-plus', vendor: 'aliyun-dashscope', name: '通义千问-GUI-Plus', callMode: 'vision', description: 'GUI 操作（必须传截图）', upstreamModelId: 'qwen-gui-plus', specValues: { contextWindow: 32768, maxOutput: 2048, inputTypes: ['text', 'image'] }, generationParams: { require_screenshot: true, input_image_required: true }, recommendedScenarioTags: ['GUI操作'], referencePrice: { inputPricePerToken: 0.6, outputPricePerToken: 1.5 }, verified: false },
  { key: 'qwen-vl-plus', vendor: 'aliyun-dashscope', name: '通义千问-VL-Plus', callMode: 'vision', description: '视觉理解（图/视频+文本）', upstreamModelId: 'qwen-vl-plus', specValues: { contextWindow: 32768, maxOutput: 4096, inputTypes: ['text', 'image', 'video'] }, generationParams: {}, recommendedScenarioTags: ['图像理解'], referencePrice: { inputPricePerToken: 0.8, outputPricePerToken: 2 }, verified: false },
  { key: 'qwen-ocr', vendor: 'aliyun-dashscope', name: '通义千问-OCR', callMode: 'ocr', description: 'OCR 文字提取', upstreamModelId: 'qwen-ocr', specValues: { fileFormats: ['jpg', 'png', 'pdf'], maxPages: 10 }, generationParams: {}, recommendedScenarioTags: ['OCR'], referencePrice: { pricePerImage: 2 }, verified: false },
  { key: 'wanx-t2i-plus', vendor: 'aliyun-dashscope', name: '通义万相-文生图Plus', callMode: 'image', description: '文生图（高清增强）', upstreamModelId: 'wanx2.1-t2i-plus', specValues: { resolutions: ['720P', '1080P'], defaultResolution: '720P', aspectRatios: ['1:1', '16:9'], maxImages: 4 }, generationParams: { image_sizes: ['1024x1024', '1280x720'] }, recommendedScenarioTags: ['文生图'], referencePrice: { pricePerImage: 20 }, verified: false },
  { key: 'wanx-v1', vendor: 'aliyun-dashscope', name: '通义万相-V1经典', callMode: 'image', description: '文生图（V1 经典模型）', upstreamModelId: 'wanx-v1', specValues: { resolutions: ['720P', '1080P'], defaultResolution: '720P', aspectRatios: ['1:1', '16:9'], maxImages: 4 }, generationParams: { image_sizes: ['1024x1024', '1280x720'] }, recommendedScenarioTags: ['文生图'], referencePrice: { pricePerImage: 8 }, verified: false },
  { key: 'wanx-style-repaint', vendor: 'aliyun-dashscope', name: '通义万相-图像风格重绘', callMode: 'image_edit', description: '图生图-风格重绘（输入图+提示词→风格化成图）', upstreamModelId: 'wanx-style-repaint-v1', specValues: { resolutions: ['720P', '1080P'], defaultResolution: '720P', aspectRatios: ['1:1', '16:9'], maxImages: 1 }, generationParams: { images_style: 'json', images_path: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis', image_request_template: { model: '{upstreamModelId}', input: { prompt: '{prompt}', base_image_url: '{imageUrl0}' }, parameters: { n: 1 } } }, recommendedScenarioTags: ['图像编辑'], referencePrice: { pricePerImage: 12 }, verified: false },
  { key: 'qwen-image', vendor: 'aliyun-dashscope', name: '通义万相-图像', callMode: 'image', description: '文生图', upstreamModelId: 'wanx2.1-t2i-turbo', specValues: { resolutions: ['720P', '1080P'], defaultResolution: '720P', aspectRatios: ['1:1', '16:9'], maxImages: 4 }, generationParams: { image_sizes: ['1024x1024', '1280x720'] }, recommendedScenarioTags: ['文生图'], referencePrice: { pricePerImage: 10 }, verified: false },
  { key: 'wanx-sketch', vendor: 'aliyun-dashscope', name: '通义万相-线稿生图', callMode: 'image_edit', description: '线稿/草图生图（image_edit 创意工具：输入图+提示词→成图；请求形状由 images_style 配置驱动）', upstreamModelId: 'wanx2.1-sketch-to-image-lite', specValues: { resolutions: ['720P', '1080P'], defaultResolution: '720P', aspectRatios: ['1:1', '16:9'], maxImages: 1 }, generationParams: { images_style: 'json', images_path: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis', image_request_template: { model: '{upstreamModelId}', input: { prompt: '{prompt}', base_image_url: '{imageUrl0}' }, parameters: { n: 1 } } }, recommendedScenarioTags: ['图像编辑'], referencePrice: { pricePerImage: 12 }, verified: false },
  { key: 'wan2.2-t2v-turbo', vendor: 'aliyun-dashscope', name: '通义万相-视频生成Turbo', callMode: 'video', description: '文生视频（异步·Turbo）', upstreamModelId: 'wan2.2-t2v-turbo', specValues: { resolutionTiers: ['720P', '1080P'], defaultResolution: '720P', maxDurationSec: 60, supportsAudio: true, async: true }, generationParams: { video_resolutions: ['720P', '1080P'], video_durations: [5, 10, 15], video_fps: [24] }, recommendedScenarioTags: ['视频生成'], referencePrice: { videoPerSecond: { '720P': 2, '1080P': 4 } }, verified: false, requiresActivation: true },
  { key: 'wan2.2-t2v-plus', vendor: 'aliyun-dashscope', name: '通义万相-视频生成Plus', callMode: 'video', description: '文生视频（异步·Plus）', upstreamModelId: 'wan2.2-t2v-plus', specValues: { resolutionTiers: ['720P', '1080P'], defaultResolution: '720P', maxDurationSec: 60, supportsAudio: true, async: true }, generationParams: { video_resolutions: ['720P', '1080P'], video_durations: [5, 10, 15], video_fps: [24] }, recommendedScenarioTags: ['视频生成'], referencePrice: { videoPerSecond: { '720P': 3, '1080P': 6 } }, verified: false, requiresActivation: true },
  { key: 'wan2.1-t2v-turbo', vendor: 'aliyun-dashscope', name: '通义万相-视频生成V2.1Turbo', callMode: 'video', description: '文生视频（异步·V2.1 Turbo）', upstreamModelId: 'wan2.1-t2v-turbo', specValues: { resolutionTiers: ['720P', '1080P'], defaultResolution: '720P', maxDurationSec: 60, supportsAudio: true, async: true }, generationParams: { video_resolutions: ['720P', '1080P'], video_durations: [5, 10, 15], video_fps: [24] }, recommendedScenarioTags: ['视频生成'], referencePrice: { videoPerSecond: { '720P': 2, '1080P': 4 } }, verified: false, requiresActivation: true },
  { key: 'wan2.1-t2v-plus', vendor: 'aliyun-dashscope', name: '通义万相-视频生成V2.1Plus', callMode: 'video', description: '文生视频（异步·V2.1 Plus）', upstreamModelId: 'wan2.1-t2v-plus', specValues: { resolutionTiers: ['720P', '1080P'], defaultResolution: '720P', maxDurationSec: 60, supportsAudio: true, async: true }, generationParams: { video_resolutions: ['720P', '1080P'], video_durations: [5, 10, 15], video_fps: [24] }, recommendedScenarioTags: ['视频生成'], referencePrice: { videoPerSecond: { '720P': 3, '1080P': 6 } }, verified: false, requiresActivation: true },
  { key: 'qwen-video-max', vendor: 'aliyun-dashscope', name: '通义千问-视频Max', callMode: 'video', description: '文生视频（异步·高质量）', upstreamModelId: 'qwen-video-max', specValues: { resolutionTiers: ['720P', '1080P'], defaultResolution: '720P', maxDurationSec: 60, supportsAudio: true, async: true }, generationParams: { video_resolutions: ['720P', '1080P'], video_durations: [5, 10, 15], video_fps: [24] }, recommendedScenarioTags: ['视频生成'], referencePrice: { videoPerSecond: { '720P': 5, '1080P': 10 } }, verified: false, requiresActivation: true },
  { key: 'qwen-video-turbo', vendor: 'aliyun-dashscope', name: '通义千问-视频Turbo', callMode: 'video', description: '文生视频（异步·快速）', upstreamModelId: 'qwen-video-turbo', specValues: { resolutionTiers: ['720P', '1080P'], defaultResolution: '720P', maxDurationSec: 60, supportsAudio: true, async: true }, generationParams: { video_resolutions: ['720P', '1080P'], video_durations: [5, 10, 15], video_fps: [24] }, recommendedScenarioTags: ['视频生成'], referencePrice: { videoPerSecond: { '720P': 2, '1080P': 4 } }, verified: false, requiresActivation: true },
  { key: 'wan2.2-t2v', vendor: 'aliyun-dashscope', name: '通义万相-视频生成', callMode: 'video', description: '文生视频（异步）', upstreamModelId: 'qwen-video-plus', specValues: { resolutionTiers: ['720P', '1080P'], defaultResolution: '720P', maxDurationSec: 60, supportsAudio: true, async: true }, generationParams: { video_resolutions: ['720P', '1080P'], video_durations: [5, 10, 15], video_fps: [24] }, recommendedScenarioTags: ['视频生成'], referencePrice: { videoPerSecond: { '720P': 2, '1080P': 4 } }, verified: false, requiresActivation: true },
  { key: 'happyhorse-1.1-i2v', vendor: 'aliyun-dashscope', name: 'HappyHorse-图生视频1.1', callMode: 'video', description: '图生视频（异步·首帧图）', upstreamModelId: 'happyhorse-1.1-i2v', specValues: { resolutionTiers: ['720P', '1080P'], defaultResolution: '720P', maxDurationSec: 60, supportsAudio: false, async: true }, generationParams: { video_resolutions: ['720P', '1080P'], video_durations: [5, 10], video_fps: [24], i2v: true }, recommendedScenarioTags: ['图生视频'], referencePrice: { videoPerSecond: { '720P': 2, '1080P': 4 } }, verified: false },
  { key: 'qwen-audio-asr', vendor: 'aliyun-dashscope', name: '通义千问-ASR', callMode: 'stt', description: '语音识别', upstreamModelId: 'paraformer-v2', specValues: { formats: ['wav', 'mp3', 'm4a'], sampleRates: ['8k', '16k'], languages: ['zh', 'en'], supportsRealtime: true, maxAudioSec: 300 }, generationParams: {}, recommendedScenarioTags: ['语音识别'], referencePrice: { pricePerMinute: 3 }, verified: false },
  { key: 'qwen-tts', vendor: 'aliyun-dashscope', name: '语音合成-CosyVoice', callMode: 'tts', description: '语音合成', upstreamModelId: 'cosyvoice-v1', specValues: { voices: ['longxiaochun', 'longxiaoxia', 'longyue'], formats: ['wav', 'mp3'], speedRange: '0.5-2.0', supportsStreaming: true }, generationParams: {}, recommendedScenarioTags: ['语音合成'], referencePrice: { pricePerCall: 2, pricePerMinute: 3 }, verified: false },
  { key: 'text-embedding-v3', vendor: 'aliyun-dashscope', name: '文本向量-Embedding-V3', callMode: 'embedding', description: '向量嵌入', upstreamModelId: 'text-embedding-v3', specValues: { vectorDim: 1024, maxInputLength: 8000, maxBatchSize: 10 }, generationParams: {}, recommendedScenarioTags: ['向量检索'], referencePrice: { inputPricePerToken: 0.1 }, verified: false },
  { key: 'text-rerank-v1', vendor: 'aliyun-dashscope', name: '文本重排-Rerank-V1', callMode: 'rerank', description: '重排序', upstreamModelId: 'text-rerank-v1', specValues: { maxDocs: 10, maxDocLength: 4000 }, generationParams: {}, recommendedScenarioTags: ['重排序'], referencePrice: { pricePerCall: 1 }, verified: false },

  // ============ OpenAI ============
  { key: 'openai-gpt-4o', vendor: 'openai', name: 'GPT-4o', callMode: 'text_chat', description: 'OpenAI 旗舰（文本输出）', upstreamModelId: 'gpt-4o', specValues: { contextWindow: 128000, maxOutput: 16384 }, generationParams: {}, recommendedScenarioTags: ['通用对话'], referencePrice: { inputPricePerToken: 12, outputPricePerToken: 36 }, verified: false },
  { key: 'openai-gpt-4o-mini', vendor: 'openai', name: 'GPT-4o-mini', callMode: 'text_chat', description: '轻量高速', upstreamModelId: 'gpt-4o-mini', specValues: { contextWindow: 128000, maxOutput: 16384 }, generationParams: {}, recommendedScenarioTags: ['通用对话'], referencePrice: { inputPricePerToken: 1.5, outputPricePerToken: 6 }, verified: false },
  { key: 'openai-gpt-4.1', vendor: 'openai', name: 'GPT-4.1', callMode: 'text_chat', description: '长上下文旗舰', upstreamModelId: 'gpt-4.1', specValues: { contextWindow: 1047576, maxOutput: 32768 }, generationParams: {}, recommendedScenarioTags: ['通用对话', '长文档'], referencePrice: { inputPricePerToken: 16, outputPricePerToken: 64 }, verified: false },
  { key: 'openai-dall-e-3', vendor: 'openai', name: 'DALL·E 3', callMode: 'image', description: '文生图', upstreamModelId: 'dall-e-3', specValues: { resolutions: ['1024x1024', '1024x1792'], defaultResolution: '1024x1024', aspectRatios: ['1:1', '9:16'], maxImages: 1 }, generationParams: {}, recommendedScenarioTags: ['文生图'], referencePrice: { pricePerImage: 15 }, verified: false },
  { key: 'openai-whisper-1', vendor: 'openai', name: 'Whisper-1', callMode: 'stt', description: '语音识别', upstreamModelId: 'whisper-1', specValues: { formats: ['mp3', 'mp4', 'wav'], sampleRates: ['16k'], languages: ['zh', 'en'], supportsRealtime: false, maxAudioSec: 600 }, generationParams: {}, recommendedScenarioTags: ['语音识别'], referencePrice: { pricePerMinute: 2 }, verified: false },
  { key: 'openai-tts-1', vendor: 'openai', name: 'TTS-1', callMode: 'tts', description: '语音合成', upstreamModelId: 'tts-1', specValues: { voices: ['alloy', 'echo', 'nova'], formats: ['mp3'], speedRange: '0.25-4.0', supportsStreaming: true }, generationParams: {}, recommendedScenarioTags: ['语音合成'], referencePrice: { pricePerCall: 2 }, verified: false },

  // ============ DeepSeek ============
  { key: 'deepseek-chat', vendor: 'deepseek', name: 'DeepSeek-Chat', callMode: 'text_chat', description: '通用对话', upstreamModelId: 'deepseek-chat', specValues: { contextWindow: 131072, maxOutput: 8192 }, generationParams: {}, recommendedScenarioTags: ['通用对话'], referencePrice: { inputPricePerToken: 1, outputPricePerToken: 2 }, verified: false },
  { key: 'deepseek-reasoner', vendor: 'deepseek', name: 'DeepSeek-Reasoner', callMode: 'text_chat', description: '深度推理（reasoning）', upstreamModelId: 'deepseek-reasoner', specValues: { contextWindow: 131072, maxOutput: 65536 }, generationParams: {}, recommendedScenarioTags: ['深度研究', '通用对话'], referencePrice: { inputPricePerToken: 2, outputPricePerToken: 8 }, verified: false },
];
