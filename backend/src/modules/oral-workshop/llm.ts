/**
 * 口播工坊 LLM 调用封装（M2）
 *
 * 职责：渲染 prompts.ts 模板 → 调用 LlmCaller（M0-2 确认后端 LLM 通道后注入）→ 解析结构化输出。
 * JSON 容错：strip 前后缀与代码块包裹 → JSON.parse → 提取首个 JSON 对象 → 失败抛 LlmOutputError（由步骤重试机制接管）。
 */
import { renderPrompt } from './prompts';
import type { OralLlmPurpose } from './system-llm.service';

/** LLM 输出解析失败（可重试） */
export class LlmOutputError extends Error {
  name = 'LlmOutputError';
  constructor(message: string) {
    super(message);
  }
}

export interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

/** LLM 调用器抽象：由 M0-2 确认的通道实现（llm-proxy 网关 / 现有 LLM 服务） */
export interface LlmCaller {
  chat(messages: LlmMessage[], opts?: { temperature?: number; purpose?: OralLlmPurpose }): Promise<string>;
}

/**
 * 从 LLM 输出中提取 JSON：
 * 1. 去掉 ```json 代码块包裹
 * 2. 直接 JSON.parse
 * 3. 失败则截取首个 { ... } 再试
 * 4. 仍失败抛 LlmOutputError
 */
export function extractJson(text: string): unknown {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    /* 继续尝试截取 JSON 对象 */
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* 失败走统一异常 */
    }
  }
  throw new LlmOutputError('LLM 输出不是合法 JSON');
}

export interface TopicItem {
  title: string;
  persona_angle?: string;
  hook?: string;
  viral_logic?: string;
}

/** 双语字幕行（zh 中文行 + en 英文行） */
export interface BilingualPair {
  zh: string;
  en: string;
}

/** 指定目标语言字幕行（zh 中文行 + translated 目标语言行） */
export interface TranslatedSubtitleLine {
  zh: string;
  translated: string;
}

/**
 * 字幕目标语言目录（对标参考软件：30 种国际语言 + 9 种方言）
 * 值=翻译提示词中的语言名；zh/zh-xx 为中文及其方言，其余为国际语言
 */
export const TARGET_LANGS: Record<string, string> = {
  // 中文方言（zh-xx 方言双语字幕）
  'zh-SC': '四川话',
  'zh-HK': '粤语',
  'zh-WU': '吴语',
  'zh-DB': '东北话',
  'zh-HA': '河南话',
  'zh-SX': '陕西话',
  'zh-SD': '山东话',
  'zh-TJ': '天津话',
  'zh-MN': '闽南话',
  // 国际语言
  en: '英语',
  ar: '阿拉伯语',
  my: '缅甸语',
  da: '丹麦语',
  nl: '荷兰语',
  fi: '芬兰语',
  fr: '法语',
  de: '德语',
  el: '希腊语',
  he: '希伯来语',
  hi: '印地语',
  id: '印尼语',
  it: '意大利语',
  ja: '日语',
  km: '高棉语',
  ko: '韩语',
  lo: '老挝语',
  ms: '马来语',
  no: '挪威语',
  pl: '波兰语',
  pt: '葡萄牙语',
  ru: '俄语',
  es: '西班牙语',
  sw: '斯瓦希里语',
  sv: '瑞典语',
  tl: '菲律宾语',
  th: '泰语',
  tr: '土耳其语',
  vi: '越南语',
};

/** 目标语言代码 → 中文名（未收录时回退代码本身，便于提示词可读） */
export function targetLangName(code: string): string {
  return TARGET_LANGS[code] ?? code;
}

export interface KeywordTopicsResult {
  keyword_analysis: string;
  topics: TopicItem[];
}

export interface StyleAnalysisResult {
  style_analysis: string;
  topics: string[];
}

export interface LegalIssue {
  type: string;
  quote: string;
  suggestion: string;
}

export interface LegalReviewResult {
  risk_level: 'low' | 'medium' | 'high';
  issues: LegalIssue[];
  safe_script: string;
}

/**
 * 口播工坊 LLM 服务：功能函数 = 渲染模板 + 调用 + 结构化解析
 */
export class OralWorkshopLlmService {
  constructor(private readonly caller: LlmCaller) {}

  private async call(templateId: string, values: Record<string, string>, temperature = 0.7, purpose?: OralLlmPurpose): Promise<string> {
    const prompt = renderPrompt(templateId, values);
    return this.caller.chat([{ role: 'user', content: prompt }], { temperature, purpose });
  }

  /** 文案改写（信息保全，260 字左右） */
  async rewriteScript(script: string, persona?: string, style?: string): Promise<string> {
    return this.call('rewrite_master', {
      script,
      persona: persona ?? '',
      style: style ?? '口语化、有网感',
    }, 0.7, 'rewrite');
  }

  /** 选题 → 口播文案创作 */
  async createScript(topic: string, reference?: string, persona?: string): Promise<string> {
    return this.call('script_creation', {
      topic,
      reference: reference ?? '',
      persona: persona ?? '',
    }, 0.7, 'script');
  }

  /** 选题生成：关键词 + 人设 → topics 数组 */
  async generateTopics(
    keywords: string,
    opts: { persona?: string; count?: number; excludedTopics?: string[] } = {},
  ): Promise<TopicItem[]> {
    const text = await this.call('topic_generation', {
      keywords,
      persona: opts.persona ?? '',
      count: String(opts.count ?? 5),
      excludedTopics: opts.excludedTopics?.length ? opts.excludedTopics.join('、') : '',
    }, 0.7, 'topic');
    const data = extractJson(text) as { topics?: TopicItem[] };
    if (!Array.isArray(data.topics)) throw new LlmOutputError('选题输出缺少 topics 数组');
    return data.topics;
  }

  /** 关键词选题（带机会分析） */
  async keywordTopics(
    keywords: string,
    opts: { persona?: string; count?: number; excludedTopics?: string[] } = {},
  ): Promise<KeywordTopicsResult> {
    const text = await this.call('keyword_topics', {
      keywords,
      persona: opts.persona ?? '',
      count: String(opts.count ?? 5),
      excludedTopics: opts.excludedTopics?.length ? opts.excludedTopics.join('、') : '',
    }, 0.7, 'topic');
    const data = extractJson(text) as Partial<KeywordTopicsResult>;
    if (typeof data.keyword_analysis !== 'string' || !Array.isArray(data.topics)) {
      throw new LlmOutputError('关键词选题输出结构不完整');
    }
    return data as KeywordTopicsResult;
  }

  /** 对标账号风格分析 → style_analysis + 5 个新选题 */
  async styleAnalysis(referenceContent: string, excludedTopics: string[] = []): Promise<StyleAnalysisResult> {
    const text = await this.call('style_analysis', {
      referenceContent,
      excludedTopics: excludedTopics.join('、'),
    }, 0.7, 'topic');
    const data = extractJson(text) as Partial<StyleAnalysisResult>;
    if (typeof data.style_analysis !== 'string' || !Array.isArray(data.topics)) {
      throw new LlmOutputError('风格分析输出结构不完整');
    }
    return data as StyleAnalysisResult;
  }

  /** 标题 + 发布描述（文本返回，后续由导出步骤整理） */
  /** 双语字幕翻译：中文文案 → 中英逐行对照（供 videoEdit 双语字幕渲染） */
  async translateBilingual(script: string): Promise<BilingualPair[]> {
    const raw = await this.call('bilingual_subtitle', { script }, 0.7, 'translate');
    const parsed = extractJson(raw) as { lines?: Array<{ zh?: unknown; en?: unknown }> };
    const lines = Array.isArray(parsed?.lines) ? parsed.lines : null;
    if (!lines || lines.length === 0) {
      throw new LlmOutputError('翻译结果缺少 lines 数组');
    }
    return lines
      .filter((l) => l && typeof l.zh === 'string' && String(l.zh).trim() && typeof l.en === 'string')
      .map((l) => ({ zh: String(l.zh).trim(), en: String(l.en).trim() }));
  }

  /** 指定目标语言的双语字幕翻译：中文文案 → zh+目标语言 逐行对照（供 videoEdit 双语字幕渲染） */
  async translateSubtitles(script: string, targetLang: string): Promise<TranslatedSubtitleLine[]> {
    const raw = await this.call(
      'bilingual_subtitle_lang',
      { script, targetLangName: targetLangName(targetLang) },
      0.7,
      'translate',
    );
    const parsed = extractJson(raw) as { lines?: Array<{ zh?: unknown; translated?: unknown }> };
    const lines = Array.isArray(parsed?.lines) ? parsed.lines : null;
    if (!lines || lines.length === 0) {
      throw new LlmOutputError('翻译结果缺少 lines 数组');
    }
    return lines
      .filter(
        (l) =>
          l &&
          typeof l.zh === 'string' &&
          String(l.zh).trim() &&
          typeof l.translated === 'string' &&
          String(l.translated).trim(),
      )
      .map((l) => ({ zh: String(l.zh).trim(), translated: String(l.translated).trim() }));
  }

  async generateTitle(script: string, platform = '抖音'): Promise<string> {
    return this.call('title_publish', { script, platform }, 0.7, 'title');
  }
  /** 封面标题（结构化 h1/h2，供封面设计器） */
  async generateCoverTitle(script: string): Promise<{ h1: string; h2: string }> {
    const text = await this.call('cover_title', { script }, 0.5, 'title');
    const data = extractJson(text) as Partial<{ h1: unknown; h2: unknown }>;
    const h1 = typeof data.h1 === 'string' ? data.h1.trim() : '';
    const h2 = typeof data.h2 === 'string' ? data.h2.trim() : '';
    if (!h1 || !h2) throw new LlmOutputError('封面标题输出结构不完整');
    return { h1, h2 };
  }

  /** 法务审核：低温度，返回结构化结果 */
  async legalReview(script: string): Promise<LegalReviewResult> {
    const text = await this.call('legal_review', { script }, 0.2, 'review');
    const data = extractJson(text) as Partial<LegalReviewResult>;
    if (typeof data.risk_level !== 'string' || !Array.isArray(data.issues) || typeof data.safe_script !== 'string') {
      throw new LlmOutputError('法务审核输出结构不完整');
    }
    return data as LegalReviewResult;
  }
}
