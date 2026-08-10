import { Repository } from 'typeorm';
import { ModelProviderEntity } from '../entities/model-provider.entity';

/**
 * 全局中转解析（严格单全局 + 兼容回退）
 * 1. is_global = 1 且 status = active 的供应商（唯一索引保证全站至多 1 条）
 * 2. 兜底：第一个 active 供应商（历史数据未标记全局时，保证老配置不失效）
 * 返回 null 表示无可用中转（调用方回退 API Key 池或直接报错）
 */
export async function resolveRelay(
  providerRepo: Repository<ModelProviderEntity>,
): Promise<ModelProviderEntity | null> {
  const global = await providerRepo.findOne({
    where: { isGlobal: true, status: 'active' },
    order: { id: 'ASC' },
  });
  if (global) return global;
  const fallback = await providerRepo.findOne({
    where: { status: 'active' },
    order: { id: 'ASC' },
  });
  return fallback ?? null;
}
