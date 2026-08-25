/**
 * 口播工坊模板加载器（M5-3）
 *
 * 从 templates/t1.json … t10.json 读取自建模板（schema 与轻语资源核验一致），
 * 提供类型化访问 + 校验。模板文件可被 ORAL_WORKSHOP_TEMPLATES_DIR 环境变量覆盖
 * （生产可指向管理后台上传目录）。
 */
import * as fs from 'fs';
import * as path from 'path';

/** 模板支持的标题/字幕动画 */
export type TemplateAnimation = 'fade_in' | 'zoom_in' | 'zoom_out' | 'bounce_in' | 'none';

export interface TemplateShadow {
  color: string;
  distance: number;
  opacity: number;
}

export interface TemplateTextStyle {
  fontSize: number;
  fontFamily: string;
  color: string;
  /** 元素锚点（相对画布中心/左上，按模板语义） */
  position: [number, number];
  bold?: boolean;
  shadow?: TemplateShadow;
}

export interface TemplateTextElement {
  content: string;
  style: TemplateTextStyle;
  animation?: string;
  animation_options?: string[];
  animation_duration?: number;
  /** 'all' 表示整片持续，数字表示秒数 */
  duration?: string | number;
}

export interface OralWorkshopTemplate {
  template_id: string;
  name: string;
  version: string;
  description?: string;
  preview_video_url?: string;
  cover_image_url?: string;
  auto_bgm?: boolean;
  project_settings: {
    width: number;
    height: number;
    fps: number;
    duration: number;
    background: string;
  };
  global_elements: {
    h1?: TemplateTextElement;
    h2?: TemplateTextElement;
    [key: string]: TemplateTextElement | undefined;
  };
  subtitle_config: {
    position: [number, number];
    style: TemplateTextStyle;
    animation_options?: string[];
    highlight_style?: { color: string; bold?: boolean };
  };
  pip_config?: { position: string; scale: number };
  content_prompts?: { h1?: string; h2?: string; subtitles?: string };
}

/** 模板加载/校验失败（调用方可转为步骤失败信息） */
export class TemplateLoadError extends Error {
  name = 'TemplateLoadError';
  constructor(message: string) {
    super(message);
  }
}

/** 模板轻量元数据（列表展示用，桌面端/管理后台结构一致） */
export interface OralWorkshopTemplateMeta {
  template_id: string;
  name: string;
  version: string;
  description?: string;
  preview_video_url?: string;
  cover_image_url?: string;
  width: number;
  height: number;
  duration: number;
}

/** 把完整模板转成轻量元数据（扁平 width/height/duration） */
export function toTemplateMeta(t: OralWorkshopTemplate): OralWorkshopTemplateMeta {
  return {
    template_id: t.template_id,
    name: t.name,
    version: t.version,
    description: t.description,
    preview_video_url: t.preview_video_url,
    cover_image_url: t.cover_image_url,
    width: t.project_settings.width,
    height: t.project_settings.height,
    duration: t.project_settings.duration,
  };
}

/** 当前文件目录（构建配置为 CommonJS，__dirname 恒可用） */
function currentDir(): string {
  return __dirname;
}

/** 模板目录：默认模块内 templates/，可用环境变量覆盖 */
export function resolveTemplatesDir(): string {
  return process.env.ORAL_WORKSHOP_TEMPLATES_DIR || path.join(currentDir(), 'templates');
}

/** 加载单个模板（按 template_id，如 t1） */
export function loadTemplate(templateId: string): OralWorkshopTemplate {
  if (!/^t\d+$/.test(templateId)) {
    throw new TemplateLoadError(`非法模板 ID: ${templateId}`);
  }
  const file = path.join(resolveTemplatesDir(), `${templateId}.json`);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    throw new TemplateLoadError(`模板不存在: ${templateId}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new TemplateLoadError(`模板 JSON 解析失败: ${templateId}（${(e as Error).message}）`);
  }
  return validateTemplate(data, templateId);
}

/** 列出全部自建模板（按 t1..t10 数字排序） */
export function listTemplates(): OralWorkshopTemplate[] {
  const dir = resolveTemplatesDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    throw new TemplateLoadError(`模板目录不存在: ${dir}`);
  }
  const ids = files
    .filter((f) => /^t\d+\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const bundled = ids.map((id) => loadTemplate(id));
  return [...bundled.map((t) => ensureCoverPreview(t)), ...listCustomTemplates()];
}

/** 上传/自定义模板目录（生产可挂载持久盘；环境变量可覆盖，便于测试） */
export function customTemplatesDir(): string {
  return process.env.ORAL_WORKSHOP_CUSTOM_TEMPLATES_DIR || path.join(process.cwd(), 'uploads', 'oral-workshop', 'templates', 'custom');
}

/** 模板预览图目录（写入后经 /uploads/ 静态托管） */
export function templatePreviewsDir(): string {
  return process.env.ORAL_WORKSHOP_PREVIEWS_DIR || path.join(process.cwd(), 'uploads', 'oral-workshop', 'templates', 'previews');
}

/** XML 转义（模板名等进入 SVG 文本节点） */
function xmlEscape(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 从模板样式生成 9:16 预览 SVG（主色取自 H1，副色取自 H2，字幕条取自 subtitle_config） */
export function generateTemplatePreviewSvg(t: OralWorkshopTemplate): string {
  const h1 = t.global_elements?.h1?.style?.color || '#F6EE7C';
  const h2 = t.global_elements?.h2?.style?.color || '#FFFFFF';
  const sub = t.subtitle_config?.style?.color || '#FFFFFF';
  const name = xmlEscape(t.name || t.template_id);
  const meta = xmlEscape(t.template_id + ' · ' + t.project_settings.width + 'x' + t.project_settings.height + ' · ' + t.project_settings.duration + 's');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="270" height="480" viewBox="0 0 270 480">',
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#181a20"/><stop offset="1" stop-color="#0b0c10"/></linearGradient></defs>',
    '<rect width="270" height="480" fill="url(#bg)"/>',
    '<rect x="0" y="0" width="270" height="16" fill="' + h1 + '"/>',
    '<rect x="0" y="464" width="270" height="16" fill="' + sub + '"/>',
    '<text x="135" y="150" text-anchor="middle" font-size="24" font-weight="bold" fill="' + h1 + '">' + name + '</text>',
    '<text x="135" y="182" text-anchor="middle" font-size="12" fill="#9aa0a6">' + meta + '</text>',
    '<rect x="28" y="300" width="214" height="96" rx="12" fill="' + h2 + '" opacity="0.92"/>',
    '<text x="135" y="356" text-anchor="middle" font-size="17" font-weight="bold" fill="#111114">口播字幕效果预览</text>',
    '</svg>',
  ].join('');
}

/** 确保模板有封面预览图（无则生成 SVG 写入 previews 目录，返回 /uploads/… 相对路径） */
export function ensureCoverPreview(t: OralWorkshopTemplate): OralWorkshopTemplate {
  if (t.cover_image_url) return t;
  try {
    const dir = templatePreviewsDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, t.template_id + '.svg');
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, generateTemplatePreviewSvg(t), 'utf8');
    }
    return { ...t, cover_image_url: '/uploads/oral-workshop/templates/previews/' + t.template_id + '.svg' };
  } catch {
    return t;
  }
}

/** 读取自定义模板（uploads/oral-workshop/templates/custom/*.json） */
export function listCustomTemplates(): OralWorkshopTemplate[] {
  const dir = customTemplatesDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: OralWorkshopTemplate[] = [];
  for (const f of files.filter((x) => /^t\d+\.json$/.test(x)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
    const id = f.replace(/\.json$/, '');
    try {
      out.push(ensureCoverPreview(validateTemplate(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), id)));
    } catch {
      // 单个自定义模板损坏不阻塞列表
    }
  }
  return out;
}

/** 保存自定义模板（管理后台上传）：校验 → 分配下一个 template_id → 写入 custom 目录 */
export function saveCustomTemplate(raw: string, coverImageUrl?: string): OralWorkshopTemplate {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new TemplateLoadError('模板 JSON 解析失败: ' + (e as Error).message);
  }
  if (!data || typeof data !== 'object') throw new TemplateLoadError('模板内容非法');
  const existing = new Set<string>();
  for (const t of [...listTemplates(), ...listCustomTemplates()]) existing.add(t.template_id);
  let next = 1;
  while (existing.has('t' + next)) next += 1;
  const id = 't' + next;
  // 覆盖为用户不可预知的新 ID（粘贴的 JSON 里可能带旧的 template_id）
  const normalized = validateTemplate({ ...(data as Record<string, unknown>), template_id: id }, id);
  if (coverImageUrl) normalized.cover_image_url = coverImageUrl;
  const dir = customTemplatesDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(normalized, null, 2), 'utf8');
  return ensureCoverPreview(normalized);
}

/** 删除自定义模板（内置 t1-t10 不可删） */
export function deleteCustomTemplate(id: string): boolean {
  if (!/^t\d+$/.test(id) || Number(id.slice(1)) <= 10) return false;
  const file = path.join(customTemplatesDir(), id + '.json');
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

/** 校验并规范化模板对象 */
export function validateTemplate(data: unknown, templateId: string): OralWorkshopTemplate {
  if (!data || typeof data !== 'object') {
    throw new TemplateLoadError(`模板内容非法: ${templateId}`);
  }
  const t = data as Partial<OralWorkshopTemplate>;
  if (t.template_id !== templateId) {
    throw new TemplateLoadError(`模板 ID 与文件名不一致: ${String(t.template_id)} != ${templateId}`);
  }
  const ps = t.project_settings;
  if (
    !ps ||
    typeof ps.width !== 'number' ||
    typeof ps.height !== 'number' ||
    typeof ps.fps !== 'number' ||
    typeof ps.duration !== 'number'
  ) {
    throw new TemplateLoadError(`模板缺少 project_settings(width/height/fps/duration): ${templateId}`);
  }
  const sc = t.subtitle_config;
  if (!sc || !Array.isArray(sc.position) || !sc.style || typeof sc.style.fontSize !== 'number') {
    throw new TemplateLoadError(`模板缺少 subtitle_config(position/style): ${templateId}`);
  }
  return t as OralWorkshopTemplate;
}
