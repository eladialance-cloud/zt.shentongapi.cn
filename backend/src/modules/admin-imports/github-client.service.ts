import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';

export interface RepoFileEntry {
  path: string;
  type: 'blob' | 'tree';
}

/** 默认跳过目录（避免拉取依赖/构建产物） */
const SKIP_DIR_PREFIXES = ['node_modules/', '.git/', 'dist/', 'build/', 'vendor/', 'test/', 'tests/', '__tests__/', 'examples/', 'assets/'];

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

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (this.token) h.Authorization = 'Bearer ' + this.token;
    return h;
  }

  private async getJson(url: string): Promise<unknown | null> {
    const resp = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(15000) });
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

  /** 仓库默认分支（REST /repos/{owner}/{repo} 的 default_branch 字段） */
  async getRepoDefaultBranch(owner: string, repo: string): Promise<string | null> {
    const data = await this.getJson(this.apiBase + '/repos/' + owner + '/' + repo);
    if (!data) return null;
    return ((data as { default_branch?: string }).default_branch) || null;
  }

  /** 递归文件树（过滤依赖/构建目录），返回文件路径列表 */
  async getRepoTree(owner: string, repo: string, branch = 'HEAD'): Promise<RepoFileEntry[]> {
    const data = await this.getJson(this.apiBase + '/repos/' + owner + '/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1');
    if (!data) return [];
    const tree = (data as { tree?: Array<{ path: string; type: string }> }).tree ?? [];
    const out: RepoFileEntry[] = [];
    for (const t of tree) {
      if (t.type !== 'blob') continue;
      if (SKIP_DIR_PREFIXES.some(p => t.path.startsWith(p))) continue;
      if (out.length >= 200) break; // 单仓库最多解析 200 个文件
      out.push({ path: t.path, type: 'blob' });
    }
    return out;
  }

  /** 读取仓库内单个文件（raw），404 返回 null */
  async getFileContent(owner: string, repo: string, filePath: string, branch = 'HEAD'): Promise<string | null> {
    const url = this.rawBase + '/' + owner + '/' + repo + '/' + branch + '/' + filePath;
    const resp = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(15000) });
    if (resp.status === 404) return null;
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.warn('GitHub raw HTTP ' + resp.status + ' for ' + url + ': ' + text.slice(0, 200));
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, 'GitHub raw HTTP ' + resp.status + ': ' + text.slice(0, 200));
    }
    return resp.text();
  }
}
