/** 模型供应商体系 - 纯工具函数（可单测） */

/** 生成供应商 slug：小写 + 非字母数字/中文转 - + 去首尾 -；空串回退 provider */
export function buildSlug(name: string): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'provider';
  return base;
}

/** 生成全局唯一 modelId：原 ID 冲突时加 @slug，再冲突递增 -2/-3；超长时先为后缀预留空间 */
export function buildUniqueModelId(
  baseId: string,
  slug: string,
  existing: Set<string>,
): string {
  const MAX = 64;  const make = (id: string, suffix: string): string => {
    // 后缀截断到 63 位以内，保证 head+suffix 总长 ≤ 64（ai_models.model_id varchar(64)）
    const capped = suffix.slice(0, Math.max(1, MAX - 1));
    const keep = Math.max(1, MAX - capped.length);
    const head = id.length > keep ? id.slice(0, keep) : id;
    return head + capped;
  };
  const base = make(baseId, '');
  if (!existing.has(base)) return base;
  const suffixed = make(baseId, '@' + slug);
  if (!existing.has(suffixed)) return suffixed;
  let n = 2;
  while (n < 100000) {
    const candidate = make(baseId, '@' + slug + '-' + n);
    if (!existing.has(candidate)) return candidate;
    n++;
  }
  // 极端兜底：追加时间戳基数后缀
  return make(baseId, '@' + slug + '-' + Date.now().toString(36));
}

/** 上游模型项（fetch /models 解析结果） */
export interface UpstreamModel {
  modelId: string;
  ownedBy?: string;
  upstreamInputPrice?: number;
  upstreamOutputPrice?: number;
}

/** 解析上游 GET /models 应答为标准列表（尽力读取价格 metadata） */
export function parseUpstreamModels(raw: unknown): UpstreamModel[] {
  const anyRaw = raw as { data?: unknown[] } | unknown[] | null | undefined;
  if (!anyRaw) return [];
  const dataArray = Array.isArray(anyRaw)
    ? (anyRaw as unknown[])
    : Array.isArray((anyRaw as { data?: unknown[] }).data)
      ? ((anyRaw as { data: unknown[] }).data)
      : [];
  const result: UpstreamModel[] = [];
  for (const m of dataArray) {
    const anyM = m as Record<string, unknown>;
    if (!anyM || typeof anyM !== 'object') continue;
    const meta = (anyM?.api as any)?.metadata ?? anyM?.metadata ?? anyM?.pricing ?? {};
    const priceOf = (v: unknown): number | undefined => {
      const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const modelId = String(anyM.id || anyM.modelId || '');
    if (!modelId) continue;
    const input = priceOf(meta.input ?? meta.prompt ?? meta.input_price ?? meta.price);
    const output = priceOf(meta.output ?? meta.completion ?? meta.output_price ?? meta.price);
    result.push({
      modelId,
      ownedBy: (anyM.owned_by || anyM.ownedBy || undefined) as string | undefined,
      upstreamInputPrice: input,
      upstreamOutputPrice: output,
    });
  }
  return result;
}

/** 积分扣费（积分/千token）：ceil(input/1000*inPrice + output/1000*outPrice)；价格为 null 或非有限值返回 null */
export function calculateCreditCost(
  tokens: { input: number; output: number },
  pricePer1kInput: number | null | undefined,
  pricePer1kOutput: number | null | undefined,
): number | null {
  const inPrice = Number(pricePer1kInput);
  const outPrice = Number(pricePer1kOutput);
  if (pricePer1kInput == null || pricePer1kOutput == null || !Number.isFinite(inPrice) || !Number.isFinite(outPrice)) {
    return null;
  }
  const input = Number.isFinite(Number(tokens.input)) ? Math.max(0, Number(tokens.input)) : 0;
  const output = Number.isFinite(Number(tokens.output)) ? Math.max(0, Number(tokens.output)) : 0;
  return Math.ceil((input / 1000) * Math.max(0, inPrice) + (output / 1000) * Math.max(0, outPrice));
}