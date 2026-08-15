/** 模型市场 - 纯工具函数（可单测）
 * 关联规格: docs/superpowers/specs/2026-08-14-model-market-design.md 第 3/5 节
 */
import { MODEL_TEMPLATES, ModelTemplate } from '../constants/model-templates';

/** 按厂商过滤市场预设（relay 无预设时返回空数组） */
export function marketPresetsForVendor(vendor: string): ModelTemplate[] {
  return MODEL_TEMPLATES.filter((t) => t.vendor === vendor);
}

export interface ResolvedPricing {
  pricePer1kInput: number | null;
  pricePer1kOutput: number | null;
  pricePerImage: number | null;
  pricePerCall: number | null;
  pricePerMinute: number | null;
  videoPerSecond: Record<string, number> | null;
}

/** 预填参考积分 + 管理员覆盖（纯函数）
 * 语义：undefined 忽略（回退参考值）；null 清空为 null；0 视为 0；
 *      非有限数值/非数字视为无效 -> null；videoPerSecond 为对象时整体替换并克隆。
 */
export function resolvePricing(
  tpl: ModelTemplate,
  overrides?: Record<string, unknown>,
): ResolvedPricing {
  const o = overrides ?? {};
  const num = (v: unknown): number | null | undefined =>
    v === null
      ? null
      : typeof v === 'number' && Number.isFinite(v)
        ? v
        : undefined;
  const r = tpl.referencePrice;
  const rawVideo = o.videoPerSecond;
  let videoPerSecond: Record<string, number> | null;
  if (rawVideo === undefined) {
    videoPerSecond = r?.videoPerSecond ? { ...r.videoPerSecond } : null;
  } else if (
    rawVideo !== null &&
    typeof rawVideo === 'object' &&
    !Array.isArray(rawVideo)
  ) {
    videoPerSecond = { ...(rawVideo as Record<string, number>) };
  } else {
    videoPerSecond = null;
  }
  return {
    pricePer1kInput: o.inputPricePerToken !== undefined ? (num(o.inputPricePerToken) ?? null) : (r?.inputPricePerToken ?? null),
    pricePer1kOutput: o.outputPricePerToken !== undefined ? (num(o.outputPricePerToken) ?? null) : (r?.outputPricePerToken ?? null),
    pricePerImage: o.pricePerImage !== undefined ? (num(o.pricePerImage) ?? null) : (r?.pricePerImage ?? null),
    pricePerCall: o.pricePerCall !== undefined ? (num(o.pricePerCall) ?? null) : (r?.pricePerCall ?? null),
    pricePerMinute: o.pricePerMinute !== undefined ? (num(o.pricePerMinute) ?? null) : (r?.pricePerMinute ?? null),
    videoPerSecond,
  };
}