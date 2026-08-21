/**
 * 模型默认同步纯函数：设置页每类默认模型（chat/vision/image/video/tts）
 * → Hermes / ST-Claw 配置更新参数（可单测，不依赖 electron）。
 *
 * 规则：
 * - user 为 null / 空对象 → 返回 null（调用方保持 pickPlatformModels 自动挑选，不重写配置）；
 * - 分类字段为空/缺失 → 回退 picked（自动挑选结果）；
 * - vision 为空时回退 chat；
 * - tts 暂不落到 Hermes/ST-Claw 配置（平台语音通道预留，透传给编排上下文）。
 */

export interface UserModelDefaultsInput {
  chat?: string | null
  vision?: string | null
  image?: string | null
  video?: string | null
  tts?: string | null
}

/** pickPlatformModels 返回的基线（自动挑选，含默认兜底） */
export interface PickedModelDefaults {
  llmModel: string
  vlmModel: string
  imageT2iModel: string
  imageIt2iModel: string
  videoFirstFrameModel: string
  videoStartEndModel: string
  videoReferenceModel: string
}

export interface ResolvedModelDefaults {
  hermes: {
    /** Hermes model.default / custom_providers.model = chat 默认 */
    llmModel: string
  }
  videoClaw: {
    llmModel: string
    vlmModel: string
    imageT2iModel: string
    imageIt2iModel: string
    videoFirstFrameModel: string
    videoStartEndModel: string
    videoReferenceModel: string
  }
  /** 编排上下文透传（渲染层提交任务时注入媒体模型路由表） */
  orchestrate: {
    chat?: string
    vision?: string
    image?: string
    video?: string
    tts?: string
  }
}

function pick(value: string | null | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback
}

export function resolveModelDefaults(
  user: UserModelDefaultsInput | null | undefined,
  picked: PickedModelDefaults,
): ResolvedModelDefaults | null {
  const u = user ?? {}
  const hasAny = [u.chat, u.vision, u.image, u.video, u.tts].some((v) => !!v && v.trim() !== "")
  if (!hasAny) return null
  const chat = pick(u.chat, picked.llmModel)
  const vision = pick(u.vision, pick(u.chat, picked.vlmModel))
  const image = pick(u.image, picked.imageT2iModel)
  const video = pick(u.video, picked.videoFirstFrameModel)
  return {
    hermes: { llmModel: chat },
    videoClaw: {
      llmModel: chat,
      vlmModel: vision,
      imageT2iModel: image,
      imageIt2iModel: image,
      videoFirstFrameModel: video,
      videoStartEndModel: video,
      videoReferenceModel: video,
    },
    orchestrate: {
      chat,
      vision: u.vision && u.vision.trim() ? u.vision.trim() : undefined,
      image,
      video,
      tts: u.tts && u.tts.trim() ? u.tts.trim() : undefined,
    },
  }
}
