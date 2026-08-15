/**
 * curl 示例解析：把官方文档的 curl 转成模型适配配置
 * - 提取提交端点（--location URL）
 * - 提取请求体 JSON（-d / --data-raw）并做占位符替换
 * - 识别异步（X-DashScope-Async: enable）
 * - 输出 requestTemplate / extraHeaders / taskQueryUrl 等，供 generationParams 使用
 */

export interface ParsedCurl {
  submitUrl: string;
  method: string;
  modelId?: string;
  async: boolean;
  taskQueryUrl?: string;
  requestTemplate: Record<string, unknown>;
  extraHeaders: Record<string, string>;
  rawBody?: Record<string, unknown>;
  warnings: string[];
}

/** 提取 curl 里的 URL（支持 --location 'u' / "u" / curl 'u' / curl "u"） */
function extractUrl(text: string): string | undefined {
  const m = text.match(/--location(?:\s+-X\s+\w+)?\s*['"]?([^'"\s]+)['"]?/i);
  if (m) return m[1].replace(/['"]$/, '');
  const m2 = text.match(/curl\s+['"]([^'"]+)['"]/i);
  if (m2) return m2[1];
  const m3 = text.match(/curl\s+(https?:\/\/[^'"\s]+)/i);
  if (m3) return m3[1];
  return undefined;
}

function extractMethod(text: string): string {
  const m = text.match(/-(?:X|request)\s+['"]?(GET|POST|PUT|PATCH|DELETE)['"]?/i);
  return m ? m[1].toUpperCase() : 'POST';
}

/** 提取 -H 'k: v' 头 */
function extractHeaders(text: string): { headers: Record<string, string>; warnings: string[] } {
  const headers: Record<string, string> = {};
  const warnings: string[] = [];
  const re = /-H\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const line = m[1];
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (/authorization/i.test(k)) {
      warnings.push('已忽略 Authorization（API Key 由供应商配置提供）');
      continue;
    }
    headers[k] = v;
  }
  return { headers, warnings };
}

/** 提取 -d / --data / --data-raw 的 JSON 文本（取最后一个引号块） */
function extractBodyText(text: string): string | undefined {
  const prefixes = ['--data-raw', '--data-binary', '--data', '-d'];
  for (const pre of prefixes) {
    let from = 0;
    while ((from = text.indexOf(pre, from)) >= 0) {
      const rest = text.slice(from + pre.length).replace(/^\s+/, '');
      if (rest.startsWith("'")) {
        const endQ = rest.indexOf("'", 1);
        if (endQ >= 0) return rest.slice(1, endQ);
      } else if (rest.startsWith('"')) {
        let pos = 1;
        while ((pos = rest.indexOf('"', pos)) >= 0) {
          const candidate = rest.slice(1, pos);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            pos += 1;
          }
        }
      }
      from += pre.length + 1;
    }
  }
  return undefined;
}

const PROMPT_KEYS = new Set(['prompt', 'prompt_text_zh', 'body_text', 'title', 'sub_title', 'description', 'text']);
const SIZE_KEYS = new Set(['size', 'n', 'resolution', 'duration', 'fps', 'width', 'height', 'wh_ratios', 'lora_weight', 'ctrl_ratio', 'ctrl_step', 'generate_num']);

/** 把实际请求体转成带占位符的模板 */
function toTemplate(body: Record<string, unknown>): { template: Record<string, unknown>; modelId?: string; warnings: string[] } {
  const warnings: string[] = [];
  let imgIndex = 0;
  const vars: Record<string, unknown> = {};
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') {
      if (key === 'model') {
        vars.upstreamModelId = v;
        return '{upstreamModelId}';
      }
      if (/^https?:\/\//i.test(v)) {
        const name = imgIndex === 0 ? 'imageUrl0' : `imageUrl${imgIndex}`;
        imgIndex++;
        vars[name] = v;
        return '{' + name + '}';
      }
      if (PROMPT_KEYS.has(key || '')) {
        vars.prompt = v;
        return '{prompt}';
      }
      if (SIZE_KEYS.has(key || '')) {
        vars[key || ''] = v;
        return '{' + key + '}';
      }
      return v;
    }
    if (typeof v === 'number' && key && SIZE_KEYS.has(key)) {
      vars[key] = v;
      return '{' + key + '}';
    }
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = walk(val, k);
      return o;
    }
    return v;
  };
  const template = walk(body) as Record<string, unknown>;
  if (!vars.upstreamModelId) warnings.push('请求体中未找到 model 字段，请手动填写模型 ID');
  return { template, modelId: vars.upstreamModelId as string | undefined, warnings };
}

export function parseCurl(curlText: string): ParsedCurl {
  const warnings: string[] = [];
  const submitUrl = extractUrl(curlText);
  if (!submitUrl) throw new Error('无法从 curl 中解析出请求 URL，请检查示例格式');
  const method = extractMethod(curlText);
  const { headers, warnings: hw } = extractHeaders(curlText);
  warnings.push(...hw);
  const bodyText = extractBodyText(curlText);
  let rawBody: Record<string, unknown> | undefined;
  let requestTemplate: Record<string, unknown> = {};
  let modelId: string | undefined;
  if (bodyText) {
    try {
      rawBody = JSON.parse(bodyText) as Record<string, unknown>;
      const tpl = toTemplate(rawBody);
      requestTemplate = tpl.template;
      modelId = tpl.modelId;
      warnings.push(...tpl.warnings);
    } catch (e) {
      warnings.push('请求体 JSON 解析失败：' + (e as Error).message + '（请手动配置参数模板）');
    }
  } else {
    warnings.push('未找到请求体（-d），请手动配置请求模板');
  }
  const async = headers['X-DashScope-Async'] === 'enable' || /async|Async/.test(submitUrl);
  let taskQueryUrl: string | undefined;
  if (async && /dashscope\.aliyuncs\.com/i.test(submitUrl)) {
    taskQueryUrl = 'https://dashscope.aliyuncs.com/api/v1/tasks/{id}';
  }
  return {
    submitUrl,
    method,
    modelId,
    async,
    taskQueryUrl,
    requestTemplate,
    extraHeaders: headers,
    rawBody,
    warnings,
  };
}
