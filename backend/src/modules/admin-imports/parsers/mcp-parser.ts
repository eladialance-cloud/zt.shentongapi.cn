import { MCP_CATEGORIES } from '../../../common/utils/asset-common';
import type { AssetImportType } from '../admin-imports.constants';
import {
  categoryFromTopics,
  type ImportParseContext,
  type ImportedAssetDraft,
  type ImportParser,
} from './import-parser.interface';

/** GitHub topics → MCP 分类（MCP_CATEGORIES 值集） */
const MCP_TOPIC_MAP: Record<string, string> = Object.fromEntries(
  MCP_CATEGORIES.map(c => [c, c]),
);

/** README 文件名（含 readme_zh.md） */
const README_NAME = /^readme(_zh)?\.md$/i;
/** 环境变量段标题：## Environment / ## Environment Variables / ## Env / ## 环境变量 */
const ENV_HEADER = /^##\s+(environment variables|environment|env|环境变量)\s*$/i;
/** 环境变量行：KEY (required/可选): 说明（支持 - 列表前缀与中文冒号） */
const ENV_LINE = /^(?:[-*]\s*)?([A-Za-z_][A-Za-z0-9_.-]*)\s*(?:\(([^)]*)\))?\s*[:：]\s*(.*)$/;

export interface McpEnvVar {
  key: string;
  required: boolean;
  description: string;
}

/** 提取 README 环境变量段的 KEY (required): 说明 行 → envTemplate */
function extractEnvTemplate(readme: string): McpEnvVar[] {
  const out: McpEnvVar[] = [];
  let inSection = false;
  for (const raw of readme.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^##\s+/.test(line)) {
      inSection = ENV_HEADER.test(line);
      continue;
    }
    if (!inSection) continue;
    const m = ENV_LINE.exec(line);
    if (!m) continue;
    const flag = (m[2] ?? '').toLowerCase();
    out.push({
      key: m[1],
      required: flag.includes('required') || /必需|必填|必须/.test(flag),
      description: m[3].trim(),
    });
  }
  return out;
}

/** github.com 页面不可能是 MCP 端点（保留 github.io 可作真实端点宿主） */
const GITHUB_URL = /^https?:\/\/(?:[^/]+\.)?github\.com\//i;
/** 行内 endpoint 关键词：transport / endpoint / server url / 服务地址 */
const ENDPOINT_HINT = /transport|endpoint|server url|服务地址/i;

/** 提取 README 中首个可靠的 MCP endpoint URL：带端口、含 /mcp 或 /sse 路径、或所在行含 endpoint 关键词 */
function firstEndpointUrl(readme: string): string | undefined {
  for (const raw of readme.split(/\r?\n/)) {
    const line = raw.trim();
    const found = line.match(/https?:\/\/[^\s)>\]"']+/g) ?? [];
    for (const rawUrl of found) {
      const url = rawUrl.replace(/[.,;]+$/, '');
      if (!url || GITHUB_URL.test(url)) continue;
      const hostAndPath = url.replace(/^https?:\/\//i, '');
      const hasPort = /^[^/]+:\d+/.test(hostAndPath);
      const pathPart = hostAndPath.replace(/^[^/]+/, '');
      const hasEndpointPath = /(^|\/)(mcp|sse)(\/|$)/i.test(pathPart);
      if (hasPort || hasEndpointPath || ENDPOINT_HINT.test(line)) return url;
    }
  }
  return undefined;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** bin 首个入口名：对象取第一个 key，字符串视为入口文件（用包名作为启动名） */
function resolveBinName(pkg: Record<string, unknown>, name: string): string | undefined {
  const bin = pkg.bin;
  if (typeof bin === 'string') return name;
  if (bin && typeof bin === 'object' && !Array.isArray(bin)) {
    const first = Object.keys(bin)[0];
    return first || undefined;
  }
  return undefined;
}

/** MCP 解析器：读根 package.json（bin 首个入口）+ README 环境变量段 → 配置草稿 */
export class McpParser implements ImportParser {
  readonly type: AssetImportType = 'mcp';
  /** n8n-mcp 专属标记（子类覆盖为 true） */
  protected readonly n8nMcp: boolean = false;

  async parse(ctx: ImportParseContext): Promise<ImportedAssetDraft[]> {
    const pkgFile = ctx.files.find(f => f.content != null && f.path.toLowerCase() === 'package.json');
    if (!pkgFile || pkgFile.content == null) return [];
    let pkg: Record<string, unknown>;
    try {
      const v = JSON.parse(pkgFile.content);
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return [];
      pkg = v as Record<string, unknown>;
    } catch {
      return [];
    }
    const name = asString(pkg.name).trim();
    if (!name) return [];
    const description = asString(pkg.description);
    const binName = resolveBinName(pkg, name);
    const readme = this.findReadme(ctx) ?? '';
    const envTemplate = extractEnvTemplate(readme);
    const url = firstEndpointUrl(readme);
    const payload: Record<string, unknown> = {
      runtime: 'node',
      transportType: 'stdio',
      envTemplate,
    };
    if (binName) {
      payload.command = 'npx';
      payload.args = [binName];
    } else if (url) {
      // README 含可靠的 endpoint URL 且无 bin → http 传输
      payload.transportType = 'http';
      payload.url = url;
    } else {
      payload.command = 'npx';
      payload.args = [name];
    }
    if (this.n8nMcp) payload.n8nMcp = true;
    return [
      {
        type: this.type,
        name,
        displayName: name,
        description,
        category: categoryFromTopics(ctx.topics, MCP_TOPIC_MAP, 'other'),
        tags: [],
        sourceType: 'github',
        sourceRepo: ctx.repoUrl,
        sourcePath: pkgFile.path,
        githubTopics: ctx.topics,
        payload,
      },
    ];
  }

  private findReadme(ctx: ImportParseContext): string | null {
    const f = ctx.files.find(x => x.content != null && README_NAME.test(x.path.split('/').pop() ?? ''));
    return f?.content ?? null;
  }
}
