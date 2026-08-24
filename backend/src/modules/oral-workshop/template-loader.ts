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
  return ids.map((id) => loadTemplate(id));
}

/** 校验并规范化模板对象 */
function validateTemplate(data: unknown, templateId: string): OralWorkshopTemplate {
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
