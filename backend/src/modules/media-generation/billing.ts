/** 生成类计费纯函数
 * 视频按秒：pricing_mode=per_second 时优先取 video_per_second[resolution] x duration，
 * 回退旧 videoPrices 矩阵（{ 分辨率: { 时长秒: 积分 } }）。
 */
export function computeVideoCharge(
  model: {
    pricingMode?: string | null;
    videoPerSecond?: Record<string, number> | null;
    videoPrices?: Record<string, Record<string, number>> | null;
  },
  opts: { resolution?: string; duration: number },
): number {
  if (model.pricingMode === 'per_second' && model.videoPerSecond && opts.resolution) {
    const rate = model.videoPerSecond[opts.resolution];
    if (rate != null) return Math.round(rate * opts.duration * 100) / 100;
  }
  const matrix = model.videoPrices?.[opts.resolution ?? ''];
  if (matrix) return matrix[String(opts.duration)] ?? 0;
  return 0;
}
