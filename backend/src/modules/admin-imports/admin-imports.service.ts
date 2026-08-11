import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetImportJobEntity, ImportStep, ImportJobResult } from './entities/asset-import-job.entity';
import { CreateImportDto } from './dto/create-import.dto';
import { ImportQueryDto } from './dto/import-query.dto';
import { IMPORT_STEPS, ImportStepKey, AssetImportType } from './admin-imports.constants';
import { GitHubClientService } from './github-client.service';
import { ImportParser, ImportedAssetDraft, ImportFile } from './parsers/import-parser.interface';
import { AgentParser } from './parsers/agent-parser';
import { WorkflowParser } from './parsers/workflow-parser';
import { McpParser } from './parsers/mcp-parser';
import { N8nMcpParser } from './parsers/n8n-mcp-parser';
import { SkillParser } from './parsers/skill-parser';
import { SkillPackParser } from './parsers/skill-pack-parser';
import { AgentEntity } from '../agent/entities/agent.entity';
import { WorkflowEntity } from '../admin-workflow/entities/workflow.entity';
import { McpCatalogEntity } from '../admin-mcp/entities/mcp-catalog.entity';
import { SkillPackageEntity } from '../skill-store/entities/skill-package.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { AiClassifyService } from '../admin-classify/ai-classify.service';

@Injectable()
export class AdminImportsService implements OnModuleInit {
  private readonly logger = new Logger(AdminImportsService.name);
  private readonly parsers: Record<AssetImportType, ImportParser>;

  constructor(
    @InjectRepository(AssetImportJobEntity) private jobRepo: Repository<AssetImportJobEntity>,
    @InjectRepository(AgentEntity) private agentRepo: Repository<AgentEntity>,
    @InjectRepository(WorkflowEntity) private workflowRepo: Repository<WorkflowEntity>,
    @InjectRepository(McpCatalogEntity) private mcpRepo: Repository<McpCatalogEntity>,
    @InjectRepository(SkillPackageEntity) private skillRepo: Repository<SkillPackageEntity>,
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
      const res = await this.jobRepo.update(
        { status: 'processing' },
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

  private setStep(job: AssetImportJobEntity, key: ImportStepKey, status: ImportStep['status']) {
    job.steps = (job.steps ?? []).map(s => (s.key === key ? { ...s, status } : s));
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
        job.branch = (await this.githubClient.getRepoDefaultBranch(owner, repo)) || 'HEAD';
        await this.jobRepo.save(job);
      }
      const topics = await this.githubClient.getRepoTopics(owner, repo);
      const tree = await this.githubClient.getRepoTree(owner, repo, job.branch);
      const allPaths = tree.map(t => t.path);
      this.setStep(job, 'fetch_repo', 'done'); await this.jobRepo.save(job);

      // 2. parse
      this.setStep(job, 'parse', 'running'); await this.jobRepo.save(job);
      const parser = this.parsers[job.type];
      const keyPaths = this.pickKeyFiles(job.type, allPaths);
      const files: ImportFile[] = [];
      for (const p of keyPaths) {
        files.push({ path: p, content: await this.githubClient.getFileContent(owner, repo, p, job.branch) });
      }
      const drafts = await parser.parse({ repoUrl: job.repoUrl, branch: job.branch, topics, files });
      this.setStep(job, 'parse', 'done'); await this.jobRepo.save(job);

      // 3. classify
      this.setStep(job, 'classify', 'running'); await this.jobRepo.save(job);
      if (this.aiClassify) {
        for (const d of drafts) {
          const r = await this.aiClassify.classify(this.describe(d), d.type, d.category);
          d.category = r.category;
          d.tags = r.tags;
        }
      }
      this.setStep(job, 'classify', 'done'); await this.jobRepo.save(job);

      // 4. save
      this.setStep(job, 'save', 'running'); await this.jobRepo.save(job);
      const result = await this.saveDrafts(job, drafts, adminId);
      this.setStep(job, 'save', 'done');
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
        return paths.filter(p => lower(p) === 'package.json' || isReadme(p) || lower(p) === 'readme_zh.md').slice(0, 5);
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
