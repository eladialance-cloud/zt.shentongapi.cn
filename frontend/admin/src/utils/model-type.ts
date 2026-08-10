/**
 * 模型「类型=输出类型、能力=输入类型」管理后台工具
 * 与后端 backend/src/modules/admin-model/utils/model-type-utils.ts 保持一致
 */

export type ModelOutputType = 'text' | 'image' | 'video' | 'audio'
export type ModelInputType = 'text' | 'image' | 'video' | 'audio'
export type AdvancedCapability =
  | 'function_calling'
  | 'streaming'
  | 'reasoning'
  | 'json_mode'

export const OUTPUT_TYPE_OPTIONS: Array<{ label: string; value: ModelOutputType }> = [
  { label: '文本', value: 'text' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '语音', value: 'audio' }
]

export const OUTPUT_TYPE_LABEL: Record<string, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '语音'
}

export const INPUT_TYPE_OPTIONS: Array<{ label: string; value: ModelInputType }> = [
  { label: '文字', value: 'text' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '语音', value: 'audio' }
]

export const INPUT_TYPE_LABEL: Record<string, string> = {
  text: '文字',
  image: '图片',
  video: '视频',
  audio: '语音'
}

export const ADVANCED_CAP_OPTIONS: Array<{ label: string; value: AdvancedCapability }> = [
  { label: '函数调用', value: 'function_calling' },
  { label: '流式', value: 'streaming' },
  { label: '推理', value: 'reasoning' },
  { label: 'JSON 模式', value: 'json_mode' }
]

export const ADVANCED_CAP_LABEL: Record<string, string> = {
  function_calling: '函数调用',
  streaming: '流式',
  reasoning: '推理',
  json_mode: 'JSON'
}

/** 路由/计费分类标签（自动推导结果展示） */
export const MODEL_TYPE_LABEL: Record<string, string> = {
  chat: '文本对话',
  vision: '图片识图',
  image: '文生图',
  image_edit: '图生图',
  video: '视频生成',
  tts: '语音合成',
  reasoning: '推理',
  embedding: '向量',
  audio: '音频'
}

/** 输出类型 × 输入类型 -> 路由分类（model_type） */
export function deriveModelType(outputType?: string, inputTypes?: string[]): string {
  const out = outputType || 'text'
  const inputs = inputTypes && inputTypes.length ? inputTypes : ['text']
  switch (out) {
    case 'image':
      return inputs.includes('image') ? 'image_edit' : 'image'
    case 'video':
      return 'video'
    case 'audio':
      return 'tts'
    case 'text':
    default:
      return inputs.includes('image') ? 'vision' : 'chat'
  }
}

/** 路由分类（model_type） -> 输出类型 */
export function outputTypeFromModelType(modelType?: string): ModelOutputType {
  switch ((modelType || 'chat').toLowerCase()) {
    case 'image':
    case 'image_edit':
      return 'image'
    case 'video':
      return 'video'
    case 'tts':
    case 'audio':
      return 'audio'
    default:
      return 'text'
  }
}

/** 路由分类（model_type） -> 默认输入类型 */
export function inputTypesFromModelType(modelType?: string): ModelInputType[] {
  switch ((modelType || 'chat').toLowerCase()) {
    case 'vision':
    case 'image_edit':
      return ['text', 'image']
    case 'image':
    case 'video':
    case 'tts':
    default:
      return ['text']
  }
}
