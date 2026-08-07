// 内容市场 - 渲染进程类型定义
// 复用主进程共享类型（@shared/types 已在 tsconfig.web.json 中声明）

import type {
  MarketItemType,
  InstalledRecord,
  MarketDownloadResult,
} from '@shared/types'

export type {
  MarketItemType,
  InstalledRecord,
  MarketDownloadResult,
} from '@shared/types'

export interface PurchasedItem {
  id: number;
  userId: number;
  itemType: MarketItemType;
  itemId: number;
  version: string;
  price: number;
  createdAt: string;
}
