import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AssetImportJobEntity, ImportStep, ImportJobCatalogStats, ImportJobResult } from './entities/asset-import-job.entity';
import { CreateImportDto } from './dto/create-import.dto';
import { ImportQueryDto } from './dto/import-query.dto';
import { IMPORT_STEPS, ImportStepKey, AssetImportType } from './admin-imports.constants';
import { GitHubClientService, extractGithubRepoFromHtml, raceTimeout } from './github-client.service';
import { ImportParser, ImportedAssetDraft, ImportFile } from './parsers/import-parser.interface';
import { AgentParser } from './parsers/agent-parser';
import { WorkflowParser } from './parsers/workflow-parser';
import { McpParser } from './parsers/mcp-parser';
import { N8nMcpParser } from './parsers/n8n-mcp-parser';
import { SkillParser } from './parsers/skill-parser';
import { SkillCatalogParser, SkillCatalogEntry, SkillRepoCandidate } from './parsers/skill-catalog-parser';
import { resolveCatalogCategory } from './parsers/skill-catalog-categories';
import { SkillPackParser } from './parsers/skill-pack-parser';
import { AgentEntity } from '../agent/entities/agent.entity';
import { WorkflowEntity } from '../admin-workflow/entities/workflow.entity';
import { McpCatalogEntity } from '../admin-mcp/entities/mcp-catalog.entity';
import { SkillPackageEntity } from '../skill-store/entities/skill-package.entity';
import { SkillSourceEntity } from '../skill-store/entities/skill-source.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { AiClassifyService } from '../admin-classify/ai-classify.service';

/** 有界并发 map：保持结果顺序，limit 为最大并发数（不引入第三方依赖） */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const n = Math.max(1, Math.min(limit, items.length));
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

@Injectable()
export class AdminImportsService implements OnModuleInit {
  private readonly logger = new Logger(AdminImportsService.name);
  private readonly parsers: Record<AssetImportType, ImportParser>;
  private readonly catalogParser = new SkillCatalogParser();

  constructor(
    @InjectRepository(AssetImportJobEntity) private jobRepo: Repository<AssetImportJobEntity>,
    @InjectRepository(AgentEntity) private agentRepo: Repository<AgentEntity>,
    @InjectRepository(WorkflowEntity) private workflowRepo: Repository<WorkflowEntity>,
    @InjectRepository(McpCatalogEntity) private mcpRepo: Repository<McpCatalogEntity>,
    @InjectRepository(SkillPackageEntity) private skillRepo: Repository<SkillPackageEntity>,
    @InjectRepository(SkillSourceEntity) private skillSourceRepo: Repository<SkillSourceEntity>,
    private githubClient: GitHubClientService,
    @Optional() private aiClassify?: AiClassifyService,
  ) {
    this.parsers = {
      agent: new AgentParser(),
      workflow: new WorkflowParser(),
      mcp: new McpParser(),
      n8n_mcp: new N8nMcpParser(),
      skill: new SkillParser(),
      skill_pack: new SkillPackParser(),
    };
  }


  /** 启动时将遗留 processing 任务重置为 failed（避免进程中断后永久卡死无法重试） */
  async onModuleInit() {
    try {
      // 仅重置已过期的 processing 任务（>5 分钟未更新）：双实例并存或热重启时，
      // 新实例不应立刻中断另一个实例刚开始的导入任务
      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      const res = await this.jobRepo.update(
        { status: 'processing', updatedAt: LessThan(staleBefore) },
        { status: 'failed', errorMessage: '服务重启导致任务中断，请重试' },
      );
      if (res.affected) this.logger.warn('重置 ' + res.affected + ' 个中断的导入任务为 failed');
    } catch (e) {
      this.logger.warn('重置中断导入任务失败: ' + (e as Error).message);
    }
  }
  /** 提交导入任务：建 pending job 后异步执行（adminId 供落库草稿归属） */
  async create(dto: CreateImportDto, adminId: number) {
    const job = this.jobRepo.create({
      type: dto.type,
      repoUrl: dto.repoUrl,
      branch: dto.branch || undefined,
      status: 'pending',
      steps: IMPORT_STEPS.map(s => ({ key: s.key, label: s.label, status: 'pending' as const })),
      params: dto.maxSkills ? { maxSkills: dto.maxSkills } : undefined,
    });
    const saved = await this.jobRepo.save(job);
    this.run(saved.id, adminId).catch(e => this.logger.error('导入任务 ' + saved.id + ' 失败: ' + (e as Error).message));
    return saved;
  }

  list(query: ImportQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const qb = this.jobRepo.createQueryBuilder('j');
    if (query.type) qb.andWhere('j.type = :type', { type: query.type });
    if (query.status) qb.andWhere('j.status = :status', { status: query.status });
    qb.orderBy('j.id', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    return qb.getManyAndCount().then(([list, total]) => ({ list, total, page, pageSize }));
  }

  async detail(id: number) {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) BusinessException.throw(ErrorCode.NOT_FOUND, '导入任务不存在');
    return job;
  }

  /** 重试失败的导入任务：原子条件更新（仅 failed 状态可重试），避免并发双跑 run() */
  async retry(id: number, adminId: number) {
    const affected = await this.jobRepo.update(
      { id, status: 'failed' },
      { status: 'processing', steps: IMPORT_STEPS.map(s => ({ key: s.key, label: s.label, status: 'pending' as const })) },
    );
    if (!affected.affected) BusinessException.throw(ErrorCode.NOT_FOUND, '仅失败的导入任务可重试');
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) BusinessException.throw(ErrorCode.NOT_FOUND, '导入任务不存在');
    this.run(job.id, adminId).catch(e => this.logger.error('导入任务重试失败: ' + (e as Error).message));
    return job;
  }

  /** 删除导入任务；withDrafts=true 时连带删除该任务导入的草稿（仅未发布草稿，已发布跳过） */
  async remove(id: number, withDrafts: boolean): Promise<{ removedDrafts: number; skipped: number }> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) BusinessException.throw(ErrorCode.NOT_FOUND, '导入任务不存在');
    let removedDrafts = 0;
    let skipped = 0;
    if (withDrafts && job.result?.created?.length) {
      for (const item of job.result.created) {
        const r = await this.removeDraftIfUnpublished(item.type, item.id);
        if (r === 'removed') removedDrafts++;
        else if (r === 'skipped') skipped++;
      }
    }
    await this.jobRepo.delete(id);
    return { removedDrafts, skipped };
  }

  /** 删除单个草稿资产（仅未发布/未启用状态；已发布或已上架跳过） */
  private async removeDraftIfUnpublished(type: AssetImportType, id: number): Promise<'removed' | 'skipped'> {
    try {
      switch (type) {
        case 'agent': {
          const row = await this.agentRepo.findOne({ where: { id } });
          if (!row) return 'skipped';
          if (row.status === 'published' || row.status === 'offline' || row.status === 'rejected') return 'skipped';
          await this.agentRepo.delete(id);
          return 'removed';
        }
        case 'workflow': {
          const row = await this.workflowRepo.findOne({ where: { id } });
          if (!row) return 'skipped';
          if (row.publishStatus === 'approved' || row.publishStatus === 'published' || row.isActive) return 'skipped';
          await this.workflowRepo.delete(id);
          return 'removed';
        }
        case 'mcp':
        case 'n8n_mcp': {
          const row = await this.mcpRepo.findOne({ where: { id } });
          if (!row) return 'skipped';
          if (row.enabled) return 'skipped';
          await this.mcpRepo.delete(id);
          return 'removed';
        }
        case 'skill':
        case 'skill_pack': {
          const row = await this.skillRepo.findOne({ where: { id } });
          if (!row) return 'skipped';
          if (row.status === 'published' || row.status === 'approved') return 'skipped';
          await this.skillRepo.delete(id);
          return 'removed';
        }
      }
    } catch (e) {
      this.logger.warn('删除导入草稿失败 type=' + type + ' id=' + id + ': ' + (e as Error).message);
    }
    return 'skipped';
  }

  private setStep(job: AssetImportJobEntity, key: ImportStepKey, status: ImportStep['status'], progress?: { done: number; total: number }) {
    job.steps = (job.steps ?? []).map(s => (s.key === key ? { ...s, status, progress } : s));
  }

  /** 异步执行 4 步状态机 */
  async run(jobId: number, adminId: number): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) return;
    job.status = 'processing';
    job.errorMessage = undefined;
    await this.jobRepo.save(job);
    try {
      // 1. fetch_repo
      this.setStep(job, 'fetch_repo', 'running'); await this.jobRepo.save(job);
      const { owner, repo } = GitHubClientService.parseRepoUrl(job.repoUrl);
      if (!job.branch) {
        try {
          job.branch = (await this.githubClient.getRepoDefaultBranch(owner, repo)) || 'HEAD';
        } catch {
          // GitHub API/网络不可用时退回 HEAD（archive/HEAD.tar.gz 可由 GitHub 自动解析）
          job.branch = 'HEAD';
        }
        await this.jobRepo.save(job);
      }
      let topics: string[] = [];
      try {
        topics = await this.githubClient.getRepoTopics(owner, repo);
      } catch (err) {
        this.logger.warn('GitHub topics 获取失败（不影响导入）: ' + (err as Error).message);
      }
      const tree = await this.githubClient.getRepoTree(owner, repo, job.branch);
      const allPaths = tree.map(t => t.path);
      this.setStep(job, 'fetch_repo', 'done'); await this.jobRepo.save(job);

      // 2. parse
      this.setStep(job, 'parse', 'running'); await this.jobRepo.save(job);
      const parser = this.parsers[job.type];
      const keyPaths = this.pickKeyFiles(job.type, allPaths);
      // 技能目录仓库（categories/*.md 索引，无 SKILL.md）→ 自动展开为具体技能仓库草稿
      const isSkillCatalog = job.type === 'skill' && keyPaths.length === 0
        && allPaths.some(p => /^categories\/[^/]+\.md$/i.test(p));
      let drafts: ImportedAssetDraft[] = [];
      let catalogEntries: SkillCatalogEntry[] = [];
      let catalogStats: ImportJobCatalogStats | undefined;
      if (isSkillCatalog) {
        // 技能目录（索引）仓库：整库条目写入「技能源」skill_sources，由桌面端用户按条目直连 GitHub 下载
        const catPaths = allPaths.filter(p => /^categories\/[^/]+\.md$/i.test(p)).slice(0, 50);
        this.logger.log('读取技能目录分类文件 ' + catPaths.length + ' 个（并发 6）');
        const catContents = await mapLimit(catPaths, 6, (p) => this.githubClient.getFileContent(owner, repo, p, job.branch));
        const catFiles: ImportFile[] = catContents.map((content, i) => ({ path: catPaths[i], content }));
        catalogEntries = this.catalogParser.parseCatalogFiles(catFiles);
        // 校验候选仓库：剔除 404 猜测，失败时从来源页解析真实仓库（clawskills.sh 等）
        catalogEntries = await this.verifyCatalogCandidates(catalogEntries, async (done, total) => {
          this.setStep(job, 'parse', 'running', { done, total });
          await this.jobRepo.save(job);
        });
        catalogStats = { totalEntries: catalogEntries.length, attempted: catalogEntries.length, fetched: 0, failed: 0 };
      } else {
        const files: ImportFile[] = [];
        for (const p of keyPaths) {
          files.push({ path: p, content: await this.githubClient.getFileContent(owner, repo, p, job.branch) });
        }
        drafts = await parser.parse({ repoUrl: job.repoUrl, branch: job.branch, topics, files });
      }
      this.setStep(job, 'parse', 'done'); await this.jobRepo.save(job);

      // 3. classify（目录清单：分类直接映射为平台中文分类，跳过 AI 避免数千次调用）
      this.setStep(job, 'classify', 'running'); await this.jobRepo.save(job);
      if (isSkillCatalog) {
        for (const e of catalogEntries) e.category = resolveCatalogCategory(e.category);
      } else if (this.aiClassify) {
        for (const d of drafts) {
          const r = await this.aiClassify.classify(this.describe(d), d.type, d.category);
          d.category = r.category;
          d.tags = r.tags;
        }
      }
      this.setStep(job, 'classify', 'done'); await this.jobRepo.save(job);

      // 4. save
      this.setStep(job, 'save', 'running'); await this.jobRepo.save(job);
      const result = isSkillCatalog
        ? await this.saveCatalogSources(catalogEntries)
        : await this.saveDrafts(job, drafts, adminId);
      if (catalogStats) result.catalog = { ...catalogStats, saved: result.created.length, skippedSources: result.skipped };
      this.setStep(job, 'save', 'done');
      if (result.created.length === 0) {
        // 0 产物：标记失败并给出可操作原因（避免「导入成功」但无资产的误导）
        job.status = 'failed';
        job.errorMessage = this.buildEmptyReason(job.type, allPaths, result.skipped, keyPaths, catalogStats);
        job.result = result;
        await this.jobRepo.save(job);
        return;
      }
      job.status = 'succeeded';
      job.result = result;
      await this.jobRepo.save(job);
    } catch (e) {
      job.status = 'failed';
      job.errorMessage = String((e as Error).message || e).slice(0, 1024);
      const active = (job.steps ?? []).find(s => s.status === 'running');
      if (active) this.setStep(job, active.key, 'error');
      await this.jobRepo.save(job);
    }
  }

  /** 各类型关键文件挑选（最多数量见注释） */
  private pickKeyFiles(type: AssetImportType, paths: string[]): string[] {
    const lower = (p: string) => p.toLowerCase();
    const isReadme = (p: string) => /^readme(_zh)?\.md$/i.test(p.split('/').pop() || '');
    switch (type) {
      case 'agent':
        return paths.filter(p => lower(p).endsWith('agent.json') || lower(p).endsWith('agent.md') || (lower(p).endsWith('.md') && !isReadme(p))).slice(0, 20);
      case 'workflow':
        return paths.filter(p => lower(p).endsWith('.json') && !/package\.json|tsconfig|lock\.json/i.test(p)).slice(0, 50);
      case 'mcp':
      case 'n8n_mcp':
        return paths.filter(p => lower(p) === 'package.json' || lower(p) === 'pyproject.toml' || lower(p) === 'setup.py' || isReadme(p) || lower(p) === 'readme_zh.md').slice(0, 5);
      case 'skill':
        return paths.filter(p => lower(p).endsWith('skill.md')).slice(0, 30);
      case 'skill_pack':
        return paths.filter(p => lower(p).endsWith('manifest.json') || lower(p).endsWith('.pack.json')).slice(0, 30);
    }
  }

  /** AI 分类输入摘要（Task 5 使用） */
  private describe(d: ImportedAssetDraft): string {
    const p = d.payload;
    if (d.type === 'agent' && typeof p.systemPrompt === 'string') return p.systemPrompt.slice(0, 2000);
    if (d.type === 'workflow' && typeof p.workflowJson === 'string') return (d.description + ' ' + p.workflowJson).slice(0, 2000);
    return (d.description + ' ' + d.githubTopics.join(' ')).slice(0, 2000);
  }

  /** 0 产物时的失败原因（按类型给出可操作提示，附仓库文件清单与已检查关键文件） */
  private buildEmptyReason(type: AssetImportType, paths: string[], skipped: number, keyPaths: string[], catalogStats?: ImportJobCatalogStats): string {
    if (skipped > 0) {
      return '解析出 ' + skipped + ' 个资产但全部因重名被跳过，请检查管理后台是否已存在同名资产';
    }
    const sample = paths.slice(0, 20).join(', ');
    const checked = '已检查关键文件：' + (keyPaths.length ? keyPaths.join(', ') : '（无，仓库树未包含根目录关键文件）');
    if (catalogStats && catalogStats.totalEntries > 0 && (catalogStats.saved ?? 0) === 0) {
      if ((catalogStats.skippedSources ?? 0) > 0) {
        return '目录仓库解析到 ' + catalogStats.totalEntries + ' 个技能条目，但全部已存在于技能源（来源链接重复被跳过），无需重复导入';
      }
      return '目录仓库解析到 ' + catalogStats.totalEntries + ' 个技能条目，但保存到技能源失败（请查看导入任务日志或稍后重试）';
    }
    switch (type) {
      case 'agent':
        return '未解析到 Agent：仓库中未找到 agent.json / agent.md 或说明类 .md 文件。仓库文件示例：' + sample + '；' + checked;
      case 'workflow':
        return '未解析到工作流：仓库中未找到可导入的 .json 工作流文件（已排除 package/tsconfig/lock）。仓库文件示例：' + sample + '；' + checked;
      case 'mcp':
      case 'n8n_mcp':
        return '未解析到 MCP：仓库根目录未找到 package.json / pyproject.toml / setup.py，且 README 未提取到服务地址。仓库文件示例：' + sample + '；' + checked;
      case 'skill':
        return '未解析到技能：仓库中未找到 SKILL.md（若为技能目录/索引仓库，请导入包含 SKILL.md 的具体技能仓库）。仓库文件示例：' + sample + '；' + checked;
      case 'skill_pack':
        return '未解析到技能包：仓库中未找到 manifest.json / .pack.json。仓库文件示例：' + sample + '；' + checked;
      default:
        return '未解析到任何资产，仓库文件示例：' + sample + '；' + checked;
    }
  }

  /** 目录条目候选仓库校验：只保留 GitHub 上真实存在的仓库（默认分支可探测到）；
   *  仅对非 github.com 直链来源做校验（直链无需探测）；猜测全部失效时，尝试从来源页解析真实仓库。
   *  遇到 API 限流(403)时停止校验并保留原候选，避免导入整体失败。 */
  private async verifyCatalogCandidates(entries: SkillCatalogEntry[], onProgress?: (done: number, total: number) => Promise<void>): Promise<SkillCatalogEntry[]> {
    if (entries.length === 0) return entries;
    const started = Date.now();
    let processed = 0;
    this.logger.log('开始校验技能目录候选仓库，共 ' + entries.length + ' 条（并发 6，直连 GitHub archive 探测）');
    const results: SkillCatalogEntry[] = new Array(entries.length);
    await mapLimit(entries, 6, async (e, i) => {
      if (!/clawskills\.sh|clawhub\.ai/i.test(e.sourceUrl || '')) {
        results[i] = e;
      } else {
        const good: SkillRepoCandidate[] = [];
        let probeError = false;
        for (const cand of e.candidates) {
          const probed = await this.githubClient.probeArchiveBranch(cand.owner, cand.repo);
          if (probed.status === 'ok') {
            good.push({ owner: cand.owner, repo: cand.repo, defaultBranch: probed.branch ?? undefined });
          } else if (probed.status === 'error') {
            probeError = true;
          }
          if (good.length >= 2) break;
        }
        if (good.length === 0) {
          if (probeError) {
            // 网络异常无法判定：仅保留本条原候选并继续，避免一条抖动中断整批校验
            this.logger.warn('GitHub 候选校验网络异常，保留本条原候选: ' + e.sourceUrl);
            results[i] = { ...e };
          } else {
            const resolved = await this.resolveSourceRepo(e.sourceUrl);
            if (resolved) good.push(resolved);
            results[i] = { ...e, candidates: good };
          }
        } else {
          results[i] = { ...e, candidates: good };
        }
      }
      processed++;
      if (processed % 10 === 0 || processed === entries.length) {
        this.logger.log('候选校验进度 ' + processed + '/' + entries.length + '，用时 ' + Math.round((Date.now() - started) / 1000) + 's');
      }
      if (onProgress && (processed % 25 === 0 || processed === entries.length)) {
        await onProgress(processed, entries.length);
      }
    });
    this.logger.log('候选校验完成，共 ' + entries.length + ' 条，总用时 ' + Math.round((Date.now() - started) / 1000) + 's');
    return results;
  }

  /** 从来源页解析真实 GitHub 仓库：github.com 直链直接解析；clawskills.sh 详情页提取 github 链接后校验 */
  private async resolveSourceRepo(url: string): Promise<SkillRepoCandidate | null> {
    const u = (url || '').trim();
    if (!/^https?:\/\//i.test(u)) return null;
    let m = u.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i);
    if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
    m = u.match(/^https?:\/\/(?:www\.)?clawskills\.sh\/skills\/([^/\s?#]+)/i);
    if (m) {
      try {
        const html = await this.fetchPageHtml(u);
        const repo = html ? extractGithubRepoFromHtml(html) : null;
        if (repo) {
          const probed = await this.githubClient.probeArchiveBranch(repo.owner, repo.repo);
          if (probed.status === 'ok') {
            return { owner: repo.owner, repo: repo.repo, defaultBranch: probed.branch ?? undefined };
          }
        }
      } catch { /* 解析失败返回 null */ }
    }
    return null;
  }

  /** 抓取页面 HTML（带 UA 与超时；失败返回 null，不影响导入） */
  private async fetchPageHtml(url: string): Promise<string | null> {
    try {
      const resp = await raceTimeout(fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (shentong-ai-admin)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      }), 15000, '技能来源页抓取');
      if (!resp.ok) return null;
      return await resp.text();
    } catch {
      return null;
    }
  }

    /** 技能目录清单落库为「技能源」（skill_sources）：每条独立一行，status=analyzed，无需再解析。
   *  条目下载地址候选写入 analyze_result.repoCandidates，桌面端直连 GitHub 下载 */
  private async saveCatalogSources(entries: SkillCatalogEntry[]): Promise<ImportJobResult> {
    const result: ImportJobResult = { created: [], skipped: 0 };
    for (const e of entries) {
      try {
        const repoUrl = e.candidates.length
          ? 'https://github.com/' + e.candidates[0].owner + '/' + e.candidates[0].repo
          : e.sourceUrl;
        // 幂等刷新：同一 sourceUrl 已存在则更新候选/描述（修正历史猜错仓库的条目），而不是跳过
        const existing = await this.skillSourceRepo.findOne({ where: { sourceUrl: e.sourceUrl } });
        if (existing) {
          Object.assign(existing, {
            sourceType: 'github',
            skillName: (e.name || e.candidates[0]?.repo || 'skill').slice(0, 64),
            skillDesc: (e.description || '').slice(0, 500),
            skillType: 'skill',
            category: resolveCatalogCategory(e.category),
            status: 'analyzed',
            analyzeResult: {
              repoCandidates: e.candidates,
              repoUrl,
              sourceUrl: e.sourceUrl,
              category: resolveCatalogCategory(e.category),
            },
          });
          await this.skillSourceRepo.save(existing);
          result.created.push({ type: 'skill', id: existing.id, name: existing.skillName });
          continue;
        }
        const row = await this.skillSourceRepo.save(this.skillSourceRepo.create({
          sourceUrl: e.sourceUrl.slice(0, 512),
          sourceType: 'github',
          skillName: (e.name || e.candidates[0]?.repo || 'skill').slice(0, 64),
          skillDesc: (e.description || '').slice(0, 500),
          skillType: 'skill',
          category: resolveCatalogCategory(e.category),
          status: 'analyzed',
          analyzeResult: {
            repoCandidates: e.candidates,
            repoUrl,
            sourceUrl: e.sourceUrl,
            category: resolveCatalogCategory(e.category),
          },
        } as Partial<SkillSourceEntity>));
        result.created.push({ type: 'skill', id: row.id, name: row.skillName });
      } catch (err) {
        const msg = String((err as Error).message || err);
        if (/Duplicate|1062/i.test(msg)) {
          result.skipped++;
          this.logger.warn('技能源跳过（sourceUrl 冲突）: ' + e.sourceUrl);
        } else {
          throw err;
        }
      }
    }
    return result;
  }

  /** 落库草稿：各类型映射见决策 1-4；name 唯一冲突跳过计入 skipped */
  private async saveDrafts(job: AssetImportJobEntity, drafts: ImportedAssetDraft[], adminId: number): Promise<ImportJobResult> {
    const result: ImportJobResult = { created: [], skipped: 0 };
    for (const d of drafts) {
      try {
        let id: number | undefined;
        if (d.type === 'agent') {
          const row = await this.agentRepo.save(this.agentRepo.create({
            name: d.name, displayName: d.displayName, description: d.description,
            systemPrompt: String(d.payload.systemPrompt ?? ''),
            category: d.category, tags: d.tags, status: 'pending_review',
            sourceType: 'imported', sourceRepoUrl: d.sourceRepo, sourceFilePath: d.sourcePath,
            sourceCategory: d.category, sourceVersion: '1.0.0', githubTopics: d.githubTopics,
            runtimeType: (d.payload.runtimeType as string) ?? 'hybrid',
            modelId: 'default', creatorId: adminId, userId: adminId, pricePerCall: 0,
            isOfficial: true, officialVisible: true, syncStatus: 'pending',
          } as Partial<AgentEntity>));
          id = row.id;
        } else if (d.type === 'workflow') {
          const row = await this.workflowRepo.save(this.workflowRepo.create({
            name: d.name, description: d.description,
            workflowJson: String(d.payload.workflowJson ?? ''),
            sceneCategory: (d.payload.sceneCategory as string) ?? 'other',
            category: d.category ?? 'other', tags: d.tags,
            sourceType: 'github', sourceRepo: d.sourceRepo, sourcePath: d.sourcePath, githubTopics: d.githubTopics,
            engineType: 'n8n', publishStatus: 'draft', reviewStatus: 'pending_review',
            isActive: false, isPublished: false, nodeCount: Number(d.payload.nodeCount) || 0,
          } as Partial<WorkflowEntity>));
          id = row.id;
        } else if (d.type === 'mcp' || d.type === 'n8n_mcp') {
          const row = await this.mcpRepo.save(this.mcpRepo.create({
            name: d.name, description: d.description, category: d.category ?? 'other', tags: d.tags,
            sourceType: 'github', sourceRepo: d.sourceRepo, sourcePath: d.sourcePath, githubTopics: d.githubTopics,
            enabled: false, securityLevel: 'community',
            runtime: (d.payload.runtime as string) ?? 'node',
            transportType: (d.payload.transportType as string) ?? 'stdio',
            command: d.payload.command as string | undefined,
            args: d.payload.args as string[] | undefined,
            envTemplate: Array.isArray(d.payload.envTemplate)
              ? (d.payload.envTemplate as Array<{ key: string; label?: string; required?: boolean; description?: string }>).map(e => ({ ...e, label: e.label ?? e.key }))
              : undefined,
            url: d.payload.url as string | undefined,
            version: '1.0.0', sortOrder: 0, toolCount: 0,
          } as Partial<McpCatalogEntity>));
          id = row.id;
        } else {
          const row = await this.skillRepo.save(this.skillRepo.create({
            name: d.name, displayName: d.displayName, description: d.description,
            skillType: 'skill', runtimeType: String(d.payload.runtimeType ?? 'openclaw'),
            category: d.category, sourceUrl: d.sourceRepo,
            sourceType: 'github', sourceRepo: d.sourceRepo, sourcePath: d.sourcePath, githubTopics: d.githubTopics,
            skillMdPath: d.payload.skillMdPath as string | undefined,
            entryPoint: d.payload.entryPoint as string | undefined,
            triggerKeywords: d.payload.triggerKeywords as string[] | undefined,
            status: 'draft', reviewStatus: 'pending', isOfficial: true, version: '1.0.0',
          } as Partial<SkillPackageEntity>));
          id = row.id;
        }
        result.created.push({ type: d.type, id: id!, name: d.name });
      } catch (e) {
        const msg = String((e as Error).message || e);
        if (/Duplicate|1062/i.test(msg)) {
          result.skipped++;
          this.logger.warn('导入跳过（name 冲突）: ' + d.name);
        } else {
          throw e;
        }
      }
    }
    return result;
  }
}
