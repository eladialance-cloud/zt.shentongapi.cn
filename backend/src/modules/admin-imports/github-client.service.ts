import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';

export interface RepoFileEntry {
  path: string;
  type: 'blob' | 'tree';
}

/** 默认跳过目录（避免拉取依赖/构建产物） */
const SKIP_DIR_PREFIXES = ['node_modules/', '.git/', 'dist/', 'build/', 'vendor/', 'test/', 'tests/', '__tests__/', 'examples/', 'assets/'];

import { gunzipSync } from 'node:zlib';

/** Promise 硬超时：AbortSignal 无法中断 DNS 解析，race 兜底保证调用方不会无限等待 */
export function raceTimeout<T>(promise: Promise<T>, ms: number, label = 'request'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' 超时（' + ms + 'ms）')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 从页面 HTML 提取首个 github.com/<owner>/<repo> 链接（目录站详情页解析用，纯函数便于单测） */
/** 从页面 HTML 提取所有 github.com/<owner>/<repo> 链接（去重、保持顺序）；目录站详情页常含多个链接，需逐个校验 */
export function extractGithubReposFromHtml(html: string): Array<{ owner: string; repo: string }> {
  if (!html) return [];
  const out: Array<{ owner: string; repo: string }> = [];
  const seen = new Set<string>();
  const re = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const repo = m[2].replace(/\.git$/, '');
    const key = m[1] + '/' + repo;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ owner: m[1], repo });
    }
  }
  return out;
}

/** 从页面 HTML 提取首个 github.com/<owner>/<repo> 链接（兼容旧调用，新代码请用 extractGithubReposFromHtml） */
export function extractGithubRepoFromHtml(html: string): { owner: string; repo: string } | null {
  return extractGithubReposFromHtml(html)[0] ?? null;
}

/** 非 API 兜底：解压 tar.gz 列出文件（GitHub archive 首层是 <owner>-<repo>-<branch> 根目录，已剥离） */
export function listTarGzEntries(buffer: Buffer): string[] {
  const plain = gunzipSync(buffer);
  const files: string[] = [];
  let off = 0;
  while (off + 512 <= plain.length) {
    const header = plain.subarray(off, off + 512);
    if (header.every(b => b === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0[\s\S]*$/, '');
    if (!name) break;
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0[\s\S]*$/, '').trim() || '0', 8) || 0;
    const typeflag = String.fromCharCode(header[156] ?? 0);
    if (!name.endsWith('/') && typeflag !== '5' && typeflag !== '2') {
      const slash = name.indexOf('/');
      files.push(slash >= 0 ? name.slice(slash + 1) : name);
    }
    const pad = (512 - (size % 512)) % 512;
    off += 512 + size + pad;
  }
  return files;
}

/** 直连 archive 探测结果 */
export type ArchiveProbeResult =
  | { status: 'ok'; branch: string | null }
  | { status: 'missing' }
  | { status: 'error' };

type ProbeFetcher = (
  url: string,
  init?: { method?: string; redirect?: 'follow' | 'manual'; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

/** 直连 GitHub archive 检测仓库/分支可用性（不走 API、不受限流影响）：
 *  依次 HEAD main → master → HEAD.tar.gz；不跟随重定向——存在时 GitHub 会 302 到 codeload（跟随反而可能因 codeload 慢而超时），
 *  404 判定仓库/分支不存在，403/网络异常返回 error 由调用方决定 */
export async function probeGithubArchive(
  owner: string,
  repo: string,
  fetcher: ProbeFetcher = fetch as unknown as ProbeFetcher,
): Promise<ArchiveProbeResult> {
  const base = `https://github.com/${owner}/${repo}/archive`;
  const probe = async (u: string): Promise<'ok' | 'missing' | 'blocked' | 'error'> => {
    try {
      const res = await raceTimeout(fetcher(u, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(7000) }), 7000, 'GitHub archive 探测');
      if (res.ok) return 'ok';
      // GitHub 仓库/分支存在时 archive 会 302 重定向到 codeload（无需跟随，避免 codeload 慢导致误判超时）
      if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) return 'ok';
      return res.status === 404 ? 'missing' : 'blocked';
    } catch {
      return 'error';
    }
  };
  for (const branch of ['main', 'master']) {
    const r = await probe(`${base}/refs/heads/${branch}.tar.gz`);
    if (r === 'ok') return { status: 'ok', branch };
    if (r === 'blocked' || r === 'error') return { status: 'error' };
  }
  const head = await probe(`${base}/HEAD.tar.gz`);
  if (head === 'ok') return { status: 'ok', branch: null };
  if (head === 'missing') return { status: 'missing' };
  return { status: 'error' };
}

@Injectable()
export class GitHubClientService {
  private readonly logger = new Logger(GitHubClientService.name);
  private readonly token = process.env.GITHUB_TOKEN || '';
  private readonly apiBase = 'https://api.github.com';
  private readonly rawBase = 'https://raw.githubusercontent.com';

  static parseRepoUrl(url: string): { owner: string; repo: string } {
    const u = url.trim().replace(/\.git$/, '');
    let m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
    if (m) return { owner: m[1], repo: m[2] };
    m = u.match(/^git@github\.com:([^/]+)\/([^/]+)$/);
    if (m) return { owner: m[1], repo: m[2] };
    BusinessException.throw(ErrorCode.VALIDATION_FAILED, '无效的 GitHub 仓库地址');
  }

  /** token 仅用于 api.github.com（REST）；raw/archive 直连不带 Authorization，避免无效 token 导致 401 */
  private headers(url?: string): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (this.token && url && url.startsWith(this.apiBase)) h.Authorization = 'Bearer ' + this.token;
    return h;
  }

  /** 带超时与重试的 fetch：GitHub 网络不稳定，单次超时/断连自动重试（最多 3 次，退避间隔） */
  private async fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await raceTimeout(fetch(url, { headers: this.headers(url), signal: AbortSignal.timeout(20000) }), 25000, 'GitHub 请求');
      } catch (e) {
        lastErr = e as Error;
        if (attempt < maxAttempts) {
          this.logger.warn(`GitHub 请求失败(第 ${attempt} 次，共 ${maxAttempts} 次) ${url}: ${lastErr.message}`);
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }
    }
    BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, 'GitHub 请求失败: ' + (lastErr?.message ?? 'unknown'));
  }

  private async getJson(url: string): Promise<unknown | null> {
    const resp = await this.fetchWithRetry(url);
    if (resp.status === 404) return null;
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.warn('GitHub API HTTP ' + resp.status + ' for ' + url + ': ' + text.slice(0, 200));
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, 'GitHub API HTTP ' + resp.status + ': ' + text.slice(0, 200));
    }
    return resp.json();
  }

  /** 仓库 topics（公开仓库无需 token；私有仓库需 token） */
  async getRepoTopics(owner: string, repo: string): Promise<string[]> {
    const data = await this.getJson(this.apiBase + '/repos/' + owner + '/' + repo + '/topics');
    if (!data) return [];
    return ((data as { names?: string[] }).names ?? []).slice(0, 20);
  }

  /** 仓库默认分支：优先直连探测（main/master/HEAD，不经 API、不受限流影响），API 仅作兜底 */
  async getRepoDefaultBranch(owner: string, repo: string): Promise<string | null> {
    const probed = await probeGithubArchive(owner, repo);
    if (probed.status === 'ok') return probed.branch;
    try {
      const data = await this.getJson(this.apiBase + '/repos/' + owner + '/' + repo);
      if (!data) return null;
      return ((data as { default_branch?: string }).default_branch) || null;
    } catch (err) {
      this.logger.warn('GitHub 默认分支 API 不可用，按 HEAD 处理: ' + (err as Error).message);
      return null;
    }
  }

  /** 直连 archive 探测仓库是否存在及默认分支（HEAD 请求，不经 GitHub API，不受限流影响） */
  async probeArchiveBranch(owner: string, repo: string): Promise<ArchiveProbeResult> {
    return probeGithubArchive(owner, repo);
  }

  /** 递归文件树（过滤依赖/构建目录；根目录关键文件优先，避免大仓库截断吞掉 package.json/README 等） */
  async getRepoTree(owner: string, repo: string, branch = 'HEAD'): Promise<RepoFileEntry[]> {
    try {
      const data = await this.getJson(this.apiBase + '/repos/' + owner + '/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1');
      if (!data) return [];
      const tree = (data as { tree?: Array<{ path: string; type: string }> }).tree ?? [];
      const blobs: RepoFileEntry[] = [];
      for (const t of tree) {
        if (t.type !== 'blob') continue;
        if (SKIP_DIR_PREFIXES.some(p => t.path.startsWith(p))) continue;
        blobs.push({ path: t.path, type: 'blob' });
      }
      return this.sortTree(blobs);
    } catch (err) {
      // API 不可用（未配 token/限流/被墙）：下载 tar.gz 兜底列文件，导入不依赖 GitHub API
      this.logger.warn('GitHub tree API 不可用，改用 tar.gz 兜底: ' + (err as Error).message);
      return this.getRepoTreeFromArchive(owner, repo, branch);
    }
  }

  /** 根目录文件优先（package.json / README / pyproject.toml 等关键配置不被大仓库截断） */
  private sortTree(blobs: RepoFileEntry[]): RepoFileEntry[] {
    const roots = blobs.filter(b => !b.path.includes('/'));
    const nested = blobs.filter(b => b.path.includes('/'));
    return [...roots, ...nested].slice(0, 500);
  }

  /** 非 API 兜底：下载仓库 tar.gz → 解压列文件（避开 GitHub API 限流/未配 token） */
  private async getRepoTreeFromArchive(owner: string, repo: string, branch: string): Promise<RepoFileEntry[]> {
    const url = `https://github.com/${owner}/${repo}/archive/${encodeURIComponent(branch)}.tar.gz`;
    const resp = await this.fetchWithRetry(url);
    if (!resp.ok) {
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, 'GitHub archive HTTP ' + resp.status + ' for ' + url);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const names = listTarGzEntries(buf);
    const blobs: RepoFileEntry[] = [];
    for (const p of names) {
      if (SKIP_DIR_PREFIXES.some(pre => p.startsWith(pre))) continue;
      blobs.push({ path: p, type: 'blob' });
    }
    return this.sortTree(blobs);
  }

  /** 读取仓库内单个文件（raw），404 返回 null */
  async getFileContent(owner: string, repo: string, filePath: string, branch = 'HEAD'): Promise<string | null> {
    const url = this.rawBase + '/' + owner + '/' + repo + '/' + branch + '/' + filePath;
    const resp = await this.fetchWithRetry(url);
    if (resp.status === 404) return null;
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.warn('GitHub raw HTTP ' + resp.status + ' for ' + url + ': ' + text.slice(0, 200));
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, 'GitHub raw HTTP ' + resp.status + ': ' + text.slice(0, 200));
    }
    return resp.text();
  }
}
