/** 生成类计费纯函数
 * 视频按秒：pricing_mode=per_second 时优先取 video_per_second[resolution] x duration，
 * 回退旧 videoPrices 矩阵（{ 分辨率: { 时长秒: 积分 } }）。
 */

/** 分辨率档位归一化（用户端 720p/720P/720 统一为 720P，1080p/1080P/1080 统一为 1080P） */
export function normalizeResolutionTier(res: string): string {
  const r = String(res ?? '').trim().toLowerCase();
  if (r === '720p' || r === '720') return '720P';
  if (r === '1080p' || r === '1080') return '1080P';
  return String(res ?? '');
}

/** 上游分辨率格式：720P -> 1280*720，1080P -> 1920*1080（DashScope 视频/图片参数格式） */
export function upstreamResolution(res?: string | null): string {
  const tier = normalizeResolutionTier(res ?? '');
  if (tier === '720P') return '1280*720';
  if (tier === '1080P') return '1920*1080';
  if (tier.includes('x')) return tier.replace(/x/g, '*');
  return tier;
}

function tierOf(obj: Record<string, unknown> | null | undefined, res: string): string | null {
  if (!obj) return null;
  const key = normalizeResolutionTier(res);
  if (obj[key] !== undefined) return key;
  for (const k of Object.keys(obj)) {
    if (normalizeResolutionTier(k) === key) return k;
  }
  return null;
}

export function computeVideoCharge(
  model: {
    pricingMode?: string | null;
    videoPerSecond?: Record<string, number> | null;
    videoPrices?: Record<string, Record<string, number>> | null;
  },
  opts: { resolution?: string; duration: number },
): number {
  if (model.pricingMode === 'per_second' && model.videoPerSecond && opts.resolution) {
    const k = tierOf(model.videoPerSecond, opts.resolution);
    if (k !== null) {
      const rate = model.videoPerSecond[k];
      if (rate != null) return Math.round(rate * opts.duration * 100) / 100;
    }
  }
  const mk = tierOf(model.videoPrices, opts.resolution ?? '');
  if (mk !== null) {
    const matrix = model.videoPrices![mk];
    if (matrix) return matrix[String(opts.duration)] ?? 0;
  }
  return 0;
}
