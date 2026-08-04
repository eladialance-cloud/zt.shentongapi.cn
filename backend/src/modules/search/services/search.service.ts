import { Injectable } from '@nestjs/common';

/** 搜索范围分类（与 desktop/src/api/search-api.ts 的 SearchCategory 对齐） */
export interface SearchCategory {
  /** 分类 key，唯一标识（agent / skill / knowledge / workflow） */
  key: string;
  /** 显示名称（如「AI员工」/「技能」/「知识库」/「工作流」） */
  label: string;
  /** 是否启用（false 时不在搜索范围展示） */
  enabled: boolean;
  /** 跳转路由模板（如 '/agents/:id'），供调用方按结果类型路由 */
  routePath: string;
}

/** 默认搜索范围分类（与 desktop/src/api/search-api.ts DEFAULT_CATEGORIES 一致） */
const DEFAULT_CATEGORIES: SearchCategory[] = [
  { key: 'agent', label: 'AI员工', enabled: true, routePath: '/agents/:id' },
  { key: 'skill', label: '技能', enabled: true, routePath: '/skill-market' },
  { key: 'knowledge', label: '知识库', enabled: true, routePath: '/knowledge/search' },
  { key: 'workflow', label: '工作流', enabled: true, routePath: '/workflows/:id' },
];

@Injectable()
export class SearchService {
  /** 返回搜索范围分类（静态，与桌面端 DEFAULT_CATEGORIES 保持一致） */
  getCategories(): SearchCategory[] {
    return DEFAULT_CATEGORIES;
  }
}
