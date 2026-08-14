/**
 * 模型「类型=输出类型、能力=输入类型」语义工具
 * - 输出类型(OutputType)：text 文本 / image 图片 / video 视频 / audio 语音
 * - 输入类型(InputType，多选)：text 文字 / image 图片 / video 视频 / audio 语音
 * - 高级能力(AdvancedCapability，多选)：由调用模式字典 advancedCaps 定义（含 function_calling / streaming / reasoning / json_mode 及提示词改写等扩展能力）
 *
 * model_type 仍为路由/计费分类（chat/vision/image/image_edit/video/tts），
 * 由「输出类型 × 输入类型」自动推导，调用路径逻辑无需改动。
 */

import { CALL_MODE_TO_MODEL_TYPE, MODEL_TYPE_TO_CALL_MODE } from '../constants/call-modes';

export type OutputType = 'text' | 'image' | 'video' | 'audio';
export type InputType = 'text' | 'image' | 'video' | 'audio';
export type AdvancedCapability =
  | 'function_calling'
  | 'streaming'
  | 'reasoning'
  | 'json_mode'
  | 'prefix_completion'
  | 'web_search'
  | 'multi_turn'
  | 'context_cache'
  | 'batch'
  | 'multi_image'
  | 'video_input'
  | 'prompt_rewrite'
  | 'enhanced_reasoning'
  | 'custom_palette'
  | 'album_mode'
  | 'multi_shot'
  | 'audio_sync'
  | 'custom_audio'
  | 'realtime_streaming'
  | 'speaker_diarization'
  | 'punctuation'
  | 'multi_voice'
  | 'emotion';

export const INPUT_TYPE_ALL: InputType[] = ['text', 'image', 'video', 'audio'];
export const ADVANCED_CAP_ALL: AdvancedCapability[] = [
  'function_calling',
  'streaming',
  'reasoning',
  'json_mode',
  'prefix_completion',
  'web_search',
  'multi_turn',
  'context_cache',
  'batch',
  'multi_image',
  'video_input',
  'prompt_rewrite',
  'enhanced_reasoning',
  'custom_palette',
  'album_mode',
  'multi_shot',
  'audio_sync',
  'custom_audio',
  'realtime_streaming',
  'speaker_diarization',
  'punctuation',
  'multi_voice',
  'emotion',
];

/** 输出类型 × 输入类型 -> 路由分类（model_type） */
export function deriveModelType(
  outputType?: string,
  inputTypes?: string[],
): string {
  const out = outputType || 'text';
  const inputs = inputTypes && inputTypes.length ? inputTypes : ['text'];
  switch (out) {
    case 'image':
      // 文生图 / 图生图 由输入是否含图片区分
      return inputs.includes('image') ? 'image_edit' : 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'tts';
    case 'text':
    default:
      return inputs.includes('image') ? 'vision' : 'chat';
  }
}

/** 路由分类（model_type） -> 输出类型 */
export function outputTypeFromModelType(modelType?: string): OutputType {
  switch ((modelType || 'chat').toLowerCase()) {
    case 'image':
    case 'image_edit':
      return 'image';
    case 'video':
      return 'video';
    case 'tts':
    case 'audio':
      return 'audio';
    case 'text':
    default:
      return 'text';
  }
}

/** 路由分类（model_type） -> 默认输入类型（存量数据回填/旧接口兼容） */
export function inputTypesFromModelType(modelType?: string): InputType[] {
  switch ((modelType || 'chat').toLowerCase()) {
    case 'vision':
    case 'image_edit':
      return ['text', 'image'];
    case 'image':
    case 'video':
    case 'tts':
    case 'chat':
    default:
      return ['text'];
  }
}

/** 归一化输入类型：过滤非法值并去重，空则回退 ['text'] */
export function normalizeInputTypes(inputTypes?: string[] | null): InputType[] {
  const list = Array.isArray(inputTypes)
    ? Array.from(
        new Set(
          inputTypes.filter((t): t is InputType =>
            INPUT_TYPE_ALL.includes(t as InputType),
          ),
        ),
      )
    : [];
  return list.length ? list : ['text'];
}

/** 归一化高级能力：过滤非法值并去重，空则回退 [] */
export function normalizeAdvancedCapabilities(
  caps?: string[] | null,
): AdvancedCapability[] {
  if (!Array.isArray(caps)) return [];
  return Array.from(
    new Set(
      caps.filter((c): c is AdvancedCapability =>
        ADVANCED_CAP_ALL.includes(c as AdvancedCapability),
      ),
    ),
  );
}

/** model_type -> call_mode（未知回退 text_chat） */
export function callModeFromModelType(modelType?: string): string {
  const key = MODEL_TYPE_TO_CALL_MODE[(modelType || 'chat').toLowerCase()];
  return key || 'text_chat';
}

/** call_mode -> 兼容 model_type（路由/计费沿用旧分类） */
export function modelTypeFromCallMode(callMode?: string): string {
  return CALL_MODE_TO_MODEL_TYPE[(callMode || 'text_chat') as keyof typeof CALL_MODE_TO_MODEL_TYPE] || 'chat';
}
