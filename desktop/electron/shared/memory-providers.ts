// Hermes 第三方记忆 Provider 静态注册表（对齐上游 hermes-desktop KNOWN_PROVIDERS / PROVIDER_URLS）
// 说明：仅提供配置元数据，实际调用第三方存储需配置 API Key 并完成联调。

export type MemoryProviderName =
  | 'honcho'
  | 'hindsight'
  | 'mem0'
  | 'retaindb'
  | 'supermemory'
  | 'holographic'
  | 'openviking'
  | 'byterover';

export interface MemoryProviderMeta {
  name: string;
  description: string;
  envVars: string[];
  /** 官方控制台/文档外链（无则为空） */
  url?: string;
}

export const MEMORY_PROVIDERS: MemoryProviderMeta[] = [
  {
    name: 'honcho',
    description: '基于 AI 的跨会话用户画像建模，支持辩证问答和语义搜索',
    envVars: ['HONCHO_API_KEY'],
    url: 'https://app.honcho.dev',
  },
  {
    name: 'hindsight',
    description: '长期记忆，具有知识图谱和多策略检索功能',
    envVars: ['HINDSIGHT_API_KEY', 'HINDSIGHT_API_URL', 'HINDSIGHT_BANK_ID'],
    url: 'https://ui.hindsight.vectorize.io',
  },
  {
    name: 'mem0',
    description: '服务端 LLM 事实提取，支持语义搜索和自动去重',
    envVars: ['MEM0_API_KEY'],
    url: 'https://app.mem0.ai',
  },
  {
    name: 'retaindb',
    description: '云端记忆 API，支持混合搜索和 7 种记忆类型',
    envVars: ['RETAINDB_API_KEY'],
    url: 'https://retaindb.com',
  },
  {
    name: 'supermemory',
    description: '语义长期记忆，支持档案回忆和实体提取',
    envVars: ['SUPERMEMORY_API_KEY'],
    url: 'https://supermemory.ai',
  },
  {
    name: 'holographic',
    description: '本地 SQLite 事实存储，支持 FTS5 搜索和信任评分（无需 API Key）',
    envVars: [],
  },
  {
    name: 'openviking',
    description: '会话管理的记忆，支持分层检索和知识浏览',
    envVars: ['OPENVIKING_ENDPOINT', 'OPENVIKING_API_KEY'],
  },
  {
    name: 'byterover',
    description: '持久化知识树，通过 brv CLI 进行分层检索',
    envVars: ['BRV_API_KEY'],
    url: 'https://app.byterover.dev',
  },
];

/** 已知 provider 名称列表（用于主进程校验） */
export const MEMORY_PROVIDER_NAMES: string[] = MEMORY_PROVIDERS.map((p) => p.name);

/** 是否已知 provider（类型守卫） */
export function isKnownMemoryProvider(name: unknown): name is MemoryProviderName {
  return typeof name === 'string' && MEMORY_PROVIDER_NAMES.includes(name);
}