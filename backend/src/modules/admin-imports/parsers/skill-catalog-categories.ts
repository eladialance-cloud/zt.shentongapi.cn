/**
 * 技能目录（索引）仓库分类映射：英文分类文件名 → 平台中文分类
 * 覆盖 VoltAgent/awesome-openclaw-skills 的 30 个 categories/*.md 分类
 */
export const SKILL_CATALOG_CATEGORY_MAP: Record<string, string> = {
  'ai-and-llms': 'AI与LLM',
  'apple-apps-and-services': '苹果应用与服务',
  'browser-and-automation': '浏览器与自动化',
  'calendar-and-scheduling': '日历与日程',
  'clawdbot-tools': 'Clawdbot工具',
  'cli-utilities': '命令行工具',
  'coding-agents-and-ides': '编程智能体与IDE',
  'communication': '通讯沟通',
  'data-and-analytics': '数据与分析',
  'devops-and-cloud': '运维与云服务',
  'gaming': '游戏',
  'git-and-github': 'Git与GitHub',
  'health-and-fitness': '健康与健身',
  'image-and-video-generation': '图像与视频生成',
  'ios-and-macos-development': 'iOS与macOS开发',
  'marketing-and-sales': '营销与销售',
  'media-and-streaming': '媒体与流媒体',
  'moltbook': 'Moltbook',
  'notes-and-pkm': '笔记与知识管理',
  'pdf-and-documents': 'PDF与文档',
  'personal-development': '个人成长',
  'productivity-and-tasks': '效率与任务',
  'search-and-research': '搜索与研究',
  'security-and-passwords': '安全与密码',
  'self-hosted-and-automation': '自托管与自动化',
  'shopping-and-e-commerce': '购物与电商',
  'smart-home-and-iot': '智能家居与物联网',
  'speech-and-transcription': '语音与转写',
  'transportation': '出行交通',
  'web-and-frontend-development': 'Web与前端开发',
};

/** 英文分类 → 中文分类；未知分类原样返回，空值兜底「其他」 */
export function resolveCatalogCategory(category: string | undefined | null): string {
  if (!category) return '其他';
  return SKILL_CATALOG_CATEGORY_MAP[category.toLowerCase()] || category;
}
