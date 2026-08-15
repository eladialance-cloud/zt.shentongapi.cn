/** 第三方供应商按类型（对话/图片/视频）匹配端点与预设 —— 纯工具函数（可单测）
 * 设计（用户诉求）：同一个供应商、同一个 Key，图片/对话/视频 只是 URL 后缀不同。
 * 在「添加第三方供应商」中选择类型后，由厂商模板(PROVIDER_TEMPLATES)自动匹配后缀写入 provider.config；
 * 图片/视频平台没有上游"模型列表"接口（如 DashScope 媒体服务是异步任务端点），
 * 因此读取时改为加载该厂商官方预设（MODEL_TEMPLATES 按类型过滤），保证能正常添加图片/视频模型。
 * 关联: docs/superpowers/specs/2026-08-14-model-market-design.md
 */
import { CallModeDef } from '../constants/call-modes';
import { ModelTemplate } from '../constants/model-templates';

export type ProviderType = 'chat' | 'image' | 'video';

export const PROVIDER_TYPES: ProviderType[] = ['chat', 'image', 'video'];

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  chat: '对话（文本输出）',
  image: '图片',
  video: '视频',
};

/** 调用模式 -> 输出类型（从调用模式字典推导，缺省 text） */
export function outputTypeOfCallMode(callMode: string, callModes: CallModeDef[]): string {
  return callModes.find((m) => m.key === callMode)?.output ?? 'text';
}

/** 按供应商类型过滤模板：
 *  - chat  -> 输出为 text 的调用模式（对话/向量/重排/识图/OCR/语音识别等）
 *  - image -> 文生图 image + 图像编辑 image_edit
 *  - video -> 视频生成 video + 视频编辑 video_edit
 */
export function presetsForProviderType(
  templates: ModelTemplate[],
  type: ProviderType,
  callModes: CallModeDef[],
): ModelTemplate[] {
  const modes = new Set<string>();
  if (type === 'image') {
    modes.add('image');
    modes.add('image_edit');
  } else if (type === 'video') {
    modes.add('video');
    modes.add('video_edit');
  } else {
    for (const m of callModes) {
      if (m.output === 'text') modes.add(m.key);
    }
  }
  return templates.filter((t) => modes.has(t.callMode));
}

/** 端点提示（UI 展示"已自动匹配后缀"） */
export interface ProviderEndpointHint {
  label: string;
  path: string;
}

/** 按厂商模板 + 类型返回应匹配的端点：
 *  - chat  -> 对话 chatPath + 模型列表 modelsPath（OpenAI 兼容读取）
 *  - image -> 文生图/图生图 imagesPath
 *  - video -> 视频生成 videosPath + 异步任务查询 taskPath
 */
export function endpointsForProviderType(
  vendor: {
    chatPath?: string;
    modelsPath?: string;
    generation?: Record<string, unknown>;
  },
  type: ProviderType,
): ProviderEndpointHint[] {
  const gen = vendor.generation ?? {};
  if (type === 'image') {
    const out: ProviderEndpointHint[] = [];
    if (typeof gen.imagesPath === 'string' && gen.imagesPath) {
      out.push({ label: '文生图 / 图生图', path: gen.imagesPath });
    }
    return out;
  }
  if (type === 'video') {
    const out: ProviderEndpointHint[] = [];
    if (typeof gen.videosPath === 'string' && gen.videosPath) {
      out.push({ label: '视频生成', path: gen.videosPath });
    }
    if (typeof gen.taskPath === 'string' && gen.taskPath) {
      out.push({ label: '异步任务查询', path: gen.taskPath });
    }
    return out;
  }
  const out: ProviderEndpointHint[] = [];
  if (typeof vendor.chatPath === 'string' && vendor.chatPath) {
    out.push({ label: '对话', path: vendor.chatPath });
  }
  if (typeof vendor.modelsPath === 'string' && vendor.modelsPath) {
    out.push({ label: '模型列表', path: vendor.modelsPath });
  }
  return out;
}
