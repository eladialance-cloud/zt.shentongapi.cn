/**
 * path-policy —— 路径与扩展名判定策略（安全审计 S-03 / S-21 / S-22）
 *
 * 设计要点：
 * - 纯函数、零 electron 依赖，可在 jest 中直接单测；handler 只做接线。
 * - fail-closed：参数异常 / 未配置允许根 / 无法解析 一律拒绝，放行必须显式配置。
 * - 不依赖 node:path 的平台语义：平台由参数显式传入，保证同一份判定在 Windows/macOS/Linux
 *   上行为可预测且可测（node:path 会绑定宿主平台，无法在同一进程内测另一平台语义）。
 *
 * 背景：修复前 fs:open-file-in-editor 直接把渲染层传来的任意路径交给 shell.openPath，
 * 在 Windows 上打开 .exe/.bat/.lnk 等价于本机代码执行；fs:read-file 也可读任意文件。
 */

/** 可执行 / 脚本 / 快捷方式类扩展名：openPath 会调用关联程序，一律拒绝 */
export const EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.msp', '.dll', '.sys',
  '.vbs', '.vbe', '.vb', '.wsf', '.wsh', '.ws', '.ps1', '.psm1', '.reg', '.jar',
  '.lnk', '.url', '.hta', '.cpl', '.jse', '.js', '.mjs', '.cjs', '.sh', '.bash',
  '.application', '.gadget', '.msc', '.sct', '.shb', '.vxd', '.wsc', '.ins', '.isp', '.job', '.lnk',
]);

/** 预期以编辑器打开的文本类扩展名（供 UI 提示；不作为放行门槛，见下方说明） */
export const OPENABLE_TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md', '.markdown', '.txt', '.json', '.yaml', '.yml', '.csv', '.tsv', '.log',
  '.ini', '.conf', '.cfg', '.toml', '.env', '.ts', '.tsx', '.py', '.html', '.css', '.xml', '.sql', '.vue',
]);

export type PathDenyReason =
  | 'EMPTY'
  | 'UNC'
  | 'NOT_ABSOLUTE'
  | 'OUTSIDE_ROOTS'
  | 'EXECUTABLE';

export type PathDecision =
  | { ok: true; path: string }
  | { ok: false; reason: PathDenyReason };

/** UNC / 协议相对路径（\\\\server\\share 或 //server/share）：可能触发 SMB 认证外带，一律拒绝 */
export function isUncPath(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  return /^[\\/]{2}/.test(input.trim());
}

interface SplitPath {
  /** '' | '/' | 'C:/' */
  prefix: string;
  parts: string[];
}

function splitPath(raw: string, win: boolean): SplitPath {
  let s = raw.replace(/\\/g, '/');
  let prefix = '';
  if (win) {
    const drive = /^([A-Za-z]):/.exec(s);
    if (drive) {
      prefix = drive[1] + ':/';
      s = s.slice(2);
    }
  }
  if (!prefix && s.startsWith('/')) prefix = '/';
  const parts: string[] = [];
  for (const seg of s.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return { prefix, parts };
}

function joinPrefix(prefix: string, joined: string, sep: string): string {
  if (!prefix) return joined;
  if (prefix === '/') return '/' + joined;
  return prefix.replace('/', sep) + joined;
}

/** 折叠 . 与 ..，保留原始大小写与平台分隔符（用于回传给 shell.openPath 的路径） */
export function collapsePath(input: string, platform: NodeJS.Platform = process.platform): string {
  const win = platform === 'win32';
  const { prefix, parts } = splitPath(input, win);
  return joinPrefix(prefix, parts.join(win ? '\\' : '/'), win ? '\\' : '/');
}

/** 归一化用于比较：win32 大小写不敏感，posix 大小写敏感 */
export function normalizeForCompare(absPath: string, platform: NodeJS.Platform = process.platform): string {
  const win = platform === 'win32';
  const normalized = collapsePath(absPath, platform);
  return win ? normalized.toLowerCase() : normalized;
}

/** 判断 absPath 是否位于 root 之内（必须整段目录匹配，避免 ctx 与 ctx-evil 混淆） */
export function isInsideRoot(
  absPath: string,
  root: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (!absPath || !root) return false;
  const win = platform === 'win32';
  const sep = win ? '\\' : '/';
  const a = normalizeForCompare(absPath, platform);
  const raw = normalizeForCompare(root, platform);
  if (!raw) return false;
  const r = raw.replace(/[\\/]+$/, '');
  if (!r) return a.startsWith(sep);
  if (r.endsWith(':')) return a.startsWith(r + sep);
  return a === r || a.startsWith(r + sep);
}

function extractExtension(absPath: string): string {
  const base = absPath.replace(/[\\/]+$/, '');
  const slash = Math.max(base.lastIndexOf('\\'), base.lastIndexOf('/'));
  const name = base.slice(slash + 1);
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  const ext = name.slice(idx).toLowerCase();
  return ext === '.' ? '' : ext;
}

function isAbsolutePath(raw: string, win: boolean): boolean {
  if (win) return /^[A-Za-z]:[\\/]/.test(raw) || /^[\\/]/.test(raw);
  return raw.startsWith('/');
}

function evaluate(
  input: unknown,
  roots: readonly string[],
  platform: NodeJS.Platform,
  checkExtension: boolean,
): PathDecision {
  if (typeof input !== 'string') return { ok: false, reason: 'EMPTY' };
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'EMPTY' };
  if (isUncPath(raw)) return { ok: false, reason: 'UNC' };
  if (!isAbsolutePath(raw, platform === 'win32')) return { ok: false, reason: 'NOT_ABSOLUTE' };
  const collapsed = collapsePath(raw, platform);
  const safeRoots = Array.isArray(roots) ? roots : [];
  const inside = safeRoots.some((r) => typeof r === 'string' && isInsideRoot(collapsed, r, platform));
  if (!inside) return { ok: false, reason: 'OUTSIDE_ROOTS' };
  if (checkExtension && EXECUTABLE_EXTENSIONS.has(extractExtension(collapsed))) {
    return { ok: false, reason: 'EXECUTABLE' };
  }
  return { ok: true, path: collapsed };
}

/**
 * 判定「用系统默认程序打开」是否安全。
 * 拒绝：空值、UNC、相对路径、可执行/脚本/快捷方式扩展名、允许根之外的路径。
 * 注意：这里只拦「可执行类」扩展名（黑名单），普通文件（文档/压缩包/图片等）仍放行，
 * 因为 openPath 的 RCE 风险来自可执行与快捷方式类型；OPENABLE_TEXT_EXTENSIONS 仅作 UI 提示。
 */
export function evaluateOpenPath(
  input: unknown,
  roots: readonly string[],
  platform: NodeJS.Platform = process.platform,
): PathDecision {
  return evaluate(input, roots, platform, true);
}

/**
 * 判定「读取文件」是否安全：只做根限定与 UNC/相对路径拦截，不限制扩展名。
 */
export function evaluateReadPath(
  input: unknown,
  roots: readonly string[],
  platform: NodeJS.Platform = process.platform,
): PathDecision {
  return evaluate(input, roots, platform, false);
}
