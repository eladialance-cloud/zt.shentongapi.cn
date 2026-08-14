/** 模型配置模板库 seed（千问清单）——后台"从模板创建"数据源
 * 参考价单位：积分/千token 或 /张 /次 /分钟；管理员可改。
 * 关联规格: docs/superpowers/specs/2026-08-14-llm-call-modes-oss-design.md 第 5 节
 */
import { CallModeKey } from './call-modes';

export interface ModelTemplate {
  key: string;
  name: string;
  callMode: CallModeKey;
  description: string;
  specValues: Record<string, unknown>;
  generationParams: Record<string, unknown>;
  recommendedScenarioTags: string[];
  referencePrice?: ReferencePrice;
}

export interface ReferencePrice {
  inputPricePerToken?: number;
  outputPricePerToken?: number;
  pricePerImage?: number;
  pricePerCall?: number;
  pricePerMinute?: number;
  videoPerSecond?: Record<string, number>;
}

export const MODEL_TEMPLATES: ModelTemplate[] = [
  { key: 'qwen-plus', name: '通义千问-Plus', callMode: 'text_chat', description: '通用对话旗舰', specValues: { contextWindow: 131072, maxOutput: 8192 }, generationParams: {}, recommendedScenarioTags: ['通用对话'], referencePrice: { inputPricePerToken: 0.8, outputPricePerToken: 2 } },
  { key: 'qwen-flash', name: '通义千问-Flash', callMode: 'text_chat', description: '轻量高速对话', specValues: { contextWindow: 131072, maxOutput: 4096 }, generationParams: {}, recommendedScenarioTags: ['通用对话'], referencePrice: { inputPricePerToken: 0.1, outputPricePerToken: 0.3 } },
  { key: 'qwen-long', name: '通义千问-Long', callMode: 'text_chat', description: '长文档两步式（先传文件拿 file-id 再带 file_ids 调用）', specValues: { contextWindow: 10000000, maxOutput: 8192 }, generationParams: { file_id_required: true, submit_path: '/compatible-mode/v1/file-uploads', file_id_path: 'file_id', chat_files_field: 'files', reference_note: '先上传文件得到 file-id，再在 chat/completions 带 file_ids 引用' }, recommendedScenarioTags: ['长文档'], referencePrice: { inputPricePerToken: 0.2, outputPricePerToken: 1 } },
  { key: 'qwen-mt-flash', name: '通义千问-翻译-Flash', callMode: 'text_chat', description: '翻译专用（chat_body_extra.target_lang 注入）', specValues: { contextWindow: 131072, maxOutput: 4096 }, generationParams: { chat_body_extra: { target_lang: 'zh' } }, recommendedScenarioTags: ['翻译'], referencePrice: { inputPricePerToken: 0.3, outputPricePerToken: 0.6 } },
  { key: 'character-qwen-6b', name: '通义千问-角色-6B', callMode: 'text_chat', description: '角色扮演轻量版', specValues: { contextWindow: 32768, maxOutput: 2048 }, generationParams: {}, recommendedScenarioTags: ['角色扮演'], referencePrice: { inputPricePerToken: 0.2, outputPricePerToken: 0.4 } },
  { key: 'character-qwen-32b', name: '通义千问-角色-32B', callMode: 'text_chat', description: '角色扮演旗舰版', specValues: { contextWindow: 32768, maxOutput: 4096 }, generationParams: {}, recommendedScenarioTags: ['角色扮演'], referencePrice: { inputPricePerToken: 0.5, outputPricePerToken: 1.2 } },
  { key: 'qwen-doc-turbo', name: '通义千问-文档-Turbo', callMode: 'text_chat', description: '长文档处理（doc/PDF）', specValues: { contextWindow: 10000000, maxOutput: 8192 }, generationParams: {}, recommendedScenarioTags: ['长文档'], referencePrice: { inputPricePerToken: 0.3, outputPricePerToken: 1 } },
  { key: 'qwen-deep-research', name: '通义千问-深度研究', callMode: 'text_chat', description: '深度研究（chat_body_extra.enable_search 注入）', specValues: { contextWindow: 131072, maxOutput: 16384 }, generationParams: { chat_body_extra: { enable_search: true } }, recommendedScenarioTags: ['深度研究'], referencePrice: { inputPricePerToken: 1.2, outputPricePerToken: 3 } },
  { key: 'gui-plus', name: '通义千问-GUI-Plus', callMode: 'vision', description: 'GUI 操作（必须传截图）', specValues: { contextWindow: 32768, maxOutput: 2048, inputTypes: ['text', 'image'] }, generationParams: { require_screenshot: true, input_image_required: true }, recommendedScenarioTags: ['GUI操作'], referencePrice: { inputPricePerToken: 0.6, outputPricePerToken: 1.5 } },
  { key: 'qwen-vl-plus', name: '通义千问-VL-Plus', callMode: 'vision', description: '视觉理解（图/视频+文本）', specValues: { contextWindow: 32768, maxOutput: 4096, inputTypes: ['text', 'image', 'video'] }, generationParams: {}, recommendedScenarioTags: ['图像理解'], referencePrice: { inputPricePerToken: 0.8, outputPricePerToken: 2 } },
  { key: 'qwen-ocr', name: '通义千问-OCR', callMode: 'ocr', description: 'OCR 文字提取', specValues: { fileFormats: ['jpg', 'png', 'pdf'], maxPages: 10 }, generationParams: {}, recommendedScenarioTags: ['OCR'], referencePrice: { pricePerImage: 2 } },
  { key: 'qwen-image', name: '通义万相-图像', callMode: 'image', description: '文生图', specValues: { resolutions: ['720P', '1080P'], defaultResolution: '720P', aspectRatios: ['1:1', '16:9'], maxImages: 4 }, generationParams: { image_sizes: ['1024x1024', '1280x720'] }, recommendedScenarioTags: ['文生图'], referencePrice: { pricePerImage: 10 } },
  { key: 'wanx-sketch', name: '通义万相-线稿生图', callMode: 'image_edit', description: '线稿/草图生图（image_edit 创意工具：输入图+提示词→成图；请求形状由 images_style 配置驱动）', specValues: { resolutions: ['720P', '1080P'], defaultResolution: '720P', aspectRatios: ['1:1', '16:9'], maxImages: 1 }, generationParams: { images_style: 'multipart', images_path: '/images/edits', image_fields: ['sketch'], prompt_field: 'prompt', model_field: 'model' }, recommendedScenarioTags: ['图像编辑'], referencePrice: { pricePerImage: 12 } },
  { key: 'wan2.2-t2v', name: '通义万相-视频生成', callMode: 'video', description: '文生视频（异步）', specValues: { resolutionTiers: ['720P', '1080P'], defaultResolution: '720P', maxDurationSec: 60, supportsAudio: true, async: true }, generationParams: { video_resolutions: ['720p', '1080p'], video_durations: [5, 10, 15], video_fps: [24] }, recommendedScenarioTags: ['视频生成'], referencePrice: { videoPerSecond: { '720P': 2, '1080P': 4 } } },
  { key: 'qwen-audio-asr', name: '通义千问-ASR', callMode: 'stt', description: '语音识别', specValues: { formats: ['wav', 'mp3', 'm4a'], sampleRates: ['8k', '16k'], languages: ['zh', 'en'], supportsRealtime: true, maxAudioSec: 300 }, generationParams: {}, recommendedScenarioTags: ['语音识别'], referencePrice: { pricePerMinute: 3 } },
  { key: 'qwen-tts', name: '通义千问-TTS', callMode: 'tts', description: '语音合成', specValues: { voices: ['alloy', 'nova', '自定义'], formats: ['wav', 'mp3'], speedRange: '0.5-2.0', supportsStreaming: true }, generationParams: {}, recommendedScenarioTags: ['语音合成'], referencePrice: { pricePerCall: 2, pricePerMinute: 3 } },
  { key: 'text-embedding-v3', name: '文本向量-Embedding-V3', callMode: 'embedding', description: '向量嵌入', specValues: { vectorDim: 1024, maxInputLength: 8000, maxBatchSize: 10 }, generationParams: {}, recommendedScenarioTags: ['向量检索'], referencePrice: { inputPricePerToken: 0.1 } },
  { key: 'text-rerank-v1', name: '文本重排-Rerank-V1', callMode: 'rerank', description: '重排序', specValues: { maxDocs: 10, maxDocLength: 4000 }, generationParams: {}, recommendedScenarioTags: ['重排序'], referencePrice: { pricePerCall: 1 } },
];
