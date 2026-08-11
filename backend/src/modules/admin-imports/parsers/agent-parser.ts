import matter from 'gray-matter';
import type { AssetImportType } from '../admin-imports.constants';
import {
  type ImportFile,
  type ImportParseContext,
  type ImportedAssetDraft,
  type ImportParser,
} from './import-parser.interface';
import { resolveAssetCategory } from './category-resolver';

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/** 排除 README/LICENSE 等仓库说明文件 */
function isReadmeOrLicense(path: string): boolean {
  const base = baseName(path).toLowerCase();
  return /^readme/.test(base) || /^license/.test(base);
}

function buildDraft(
  ctx: ImportParseContext,
  path: string,
  name: string,
  displayName: string,
  description: string,
  payload: Record<string, unknown>,
): ImportedAssetDraft {
  return {
    type: 'agent',
    name,
    displayName,
    description,
    category: resolveAssetCategory(ctx.topics, path),
    tags: [],
    sourceType: 'github',
    sourceRepo: ctx.repoUrl,
    sourcePath: path,
    githubTopics: ctx.topics,
    payload,
  };
}

function parseAgentJson(file: ImportFile, ctx: ImportParseContext): ImportedAssetDraft | null {
  if (file.content == null) return null;
  let data: Record<string, unknown>;
  try {
    const v = JSON.parse(file.content);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    data = v as Record<string, unknown>;
  } catch {
    return null;
  }
  const rawName = asString(data.name).trim();
  const name = rawName || stripExt(baseName(file.path));
  const systemPrompt = data.systemPrompt ?? data.system_prompt;
  if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) return null;
  const displayName = asString(data.displayName).trim() || asString(data.display_name).trim() || name;
  const description = asString(data.description);
  const avatar = asString(data.avatar).trim() || undefined;
  const usageExample = asString(data.usageExample).trim() || asString(data.usage_example).trim() || undefined;
  const payload: Record<string, unknown> = { systemPrompt, runtimeType: 'hybrid' };
  if (avatar) payload.avatar = avatar;
  if (usageExample) payload.usageExample = usageExample;
  return buildDraft(ctx, file.path, name, displayName, description, payload);
}

function parseAgentMarkdown(file: ImportFile, ctx: ImportParseContext): ImportedAssetDraft | null {
  if (file.content == null) return null;
  let fm: Record<string, unknown> = {};
  let body = '';
  try {
    const parsed = matter(file.content);
    fm = parsed.data ?? {};
    body = (parsed.content ?? '').trim();
  } catch {
    fm = {};
    body = file.content.trim();
  }
  const systemPrompt = body;
  if (!systemPrompt) return null;
  const rawName = asString(fm.name).trim();
  const name = rawName || stripExt(baseName(file.path));
  const displayName = asString(fm.display_name).trim() || asString(fm.displayName).trim() || name;
  const description = asString(fm.description);
  const avatar = asString(fm.emoji).trim() || undefined;
  const usageExample = asString(fm.usage_example).trim() || asString(fm.usageExample).trim() || undefined;
  const payload: Record<string, unknown> = { systemPrompt, runtimeType: 'hybrid' };
  if (avatar) payload.avatar = avatar;
  if (usageExample) payload.usageExample = usageExample;
  return buildDraft(ctx, file.path, name, displayName, description, payload);
}

/** Agent 解析器：优先 agent.json / AGENT.md，其次任意 *.md（排除 README/LICENSE） */
export class AgentParser implements ImportParser {
  readonly type: AssetImportType = 'agent';

  async parse(ctx: ImportParseContext): Promise<ImportedAssetDraft[]> {
    const files = ctx.files.filter(f => f.content != null);
    const agentJson = files.filter(f => /agent\.json$/i.test(f.path));
    const agentMd = files.filter(f => /agent\.md$/i.test(f.path));
    const anyMd = files.filter(
      f => /\.md$/i.test(f.path) && !isReadmeOrLicense(f.path) && !/agent\.md$/i.test(f.path),
    );
    const candidates = agentJson.length || agentMd.length ? [...agentJson, ...agentMd] : anyMd;
    const drafts: ImportedAssetDraft[] = [];
    for (const f of candidates) {
      const draft = /\.json$/i.test(f.path) ? parseAgentJson(f, ctx) : parseAgentMarkdown(f, ctx);
      if (draft) drafts.push(draft);
    }
    return drafts;
  }
}
