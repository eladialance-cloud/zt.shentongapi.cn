/** 模型可用性探测工具（纯函数，可单测）
 * 设计：探测 = 对上游发一次最小真实请求（文本 max_tokens=1；图片生成 1 张；
 *       视频仅提交不轮询；需要文件输入的模型跳过），并把上游报错分类成
 *       可读结论，避免用户面对 400/404 裸错误无从下手。
 */
export type ProbeVerdict = 'available' | 'not_activated' | 'config_error' | 'skip';

/** 上游报错文本 -> 结论（未开通 / 配置错误） */
export function classifyProbeError(raw: string): {
  verdict: Extract<ProbeVerdict, 'not_activated' | 'config_error'>;
  message: string;
} {
  const low = raw.toLowerCase();
  const notActivated =
    /model not exist|model not found|model does not exist|notexist|model.*不存在|不存在.*model|未开通|not opened|not activated|invalid model|no such model|model.*not open|not authorized|forbidden.*model|permission denied/i.test(
      low,
    );
  if (notActivated) {
    return {
      verdict: 'not_activated',
      message:
        '❌ 未开通：上游提示该模型可能未开通或不存在（' +
        raw.slice(0, 160) +
        '）。请到该平台控制台开通此模型后再探测',
    };
  }
  return {
    verdict: 'config_error',
    message: '⚠️ 配置错误：' + raw.slice(0, 300),
  };
}

/** 调用模式是否需要文件/图片输入（无法用纯文本自动探测） */
export function probeNeedsFileInput(callMode: string, generationParams?: Record<string, unknown> | null): boolean {
  if (callMode === 'image_edit' || callMode === 'video_edit') return true;
  if (callMode === 'ocr' || callMode === 'stt' || callMode === 'voice_conversion') return true;
  if ((callMode === 'video') && (generationParams as Record<string, unknown> | undefined)?.i2v === true) return true;
  return false;
}
