import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from 'typeorm';
import { AdminImportsService } from '../../src/modules/admin-imports/admin-imports.service';
import { GitHubClientService, RepoFileEntry } from '../../src/modules/admin-imports/github-client.service';
import { AssetImportJobEntity, ImportStep } from '../../src/modules/admin-imports/entities/asset-import-job.entity';
import { IMPORT_STEPS, AssetImportType } from '../../src/modules/admin-imports/admin-imports.constants';
import { AgentEntity } from '../../src/modules/agent/entities/agent.entity';
import { WorkflowEntity } from '../../src/modules/admin-workflow/entities/workflow.entity';
import { McpCatalogEntity } from '../../src/modules/admin-mcp/entities/mcp-catalog.entity';
import { SkillPackageEntity } from '../../src/modules/skill-store/entities/skill-package.entity';
import { SkillSourceEntity } from '../../src/modules/skill-store/entities/skill-source.entity';

const AGENT_MD = ['---', 'name: quick-reply', 'display_name: 快捷回复', 'description: 快捷回复', 'trigger: [回复, reply]', '---', '技能正文'].join('\n');

/** mock GitHubClientService：固定 topics/tree/file，可按用例覆盖 */
function makeGithub(overrides: {
  getRepoTree?: () => Promise<RepoFileEntry[]>;
  getFileContent?: (owner: string, repo: string, path?: string) => Promise<string | null>;
  getRepoDefaultBranch?: (owner: string, repo: string) => Promise<string | null>;
  probeArchiveBranch?: (owner: string, repo: string) => Promise<{ status: 'ok' | 'missing' | 'error'; branch?: string | null }>;
} = {}) {
  return {
    getRepoTopics: async (): Promise<string[]> => ['ai', 'agent'],
    getRepoTree: async (): Promise<RepoFileEntry[]> => [{ path: 'skills/reply/SKILL.md', type: 'blob' }],
    getFileContent: async (): Promise<string | null> => AGENT_MD,
    /** 默认仓库均视为不存在（404）；用例可覆盖指定 owner/repo 返回分支 */
    getRepoDefaultBranch: async (): Promise<string | null> => null,
    /** 直连探测默认视为仓库不存在 */
    probeArchiveBranch: async (): Promise<{ status: 'missing' }> => ({ status: 'missing' }),
    ...overrides,
  };
}

/** mock 资产 repo：save 分配自增 id 并记录（可选 onSave 抛错模拟唯一冲突）；支持 seed/findOne/delete */
function makeRepo<T extends object>(onSave?: (e: T) => void, seed: Array<T & { id?: number }> = []) {
  const saved: T[] = [];
  const rows: Array<T & { id?: number }> = [];
  let nextId = 1;
  for (const r of seed) {
    rows.push(r);
    if ((r.id ?? 0) >= nextId) nextId = (r.id ?? 0) + 1;
  }
  return {
    saved,
    rows,
    create: (data: T) => ({ ...data }) as T,
    save: async (e: T) => {
      if (onSave) onSave(e);
      const rec = e as T & { id?: number };
      if (!rec.id) rec.id = nextId++;
      saved.push(e);
      rows.push(rec);
      return e;
    },
    findOne: async (opts: { where?: { id?: number; sourceUrl?: string } } = {}) => {
      const { id, sourceUrl } = opts?.where ?? {};
      return rows.find(r => (id === undefined || r.id === id) && (sourceUrl === undefined || (r as any).sourceUrl === sourceUrl)) ?? null;
    },
    delete: async (criteria: number | { id: number }) => {
      const id = typeof criteria === 'number' ? criteria : criteria.id;
      const idx = rows.findIndex(r => r.id === id);
      rows.splice(idx, 1);
      return { affected: 1 };
    },
  };
}

/** mock job repo：内存态单任务，findOne 返回同一引用便于断言状态机；update 模拟原子条件更新 */
function makeJobRepo() {
  let job: AssetImportJobEntity | null = null;
  return {
    job: () => job,
    set: (j: AssetImportJobEntity) => { job = j; },
    create: (data: Partial<AssetImportJobEntity>) => data as AssetImportJobEntity,
    save: async (e: AssetImportJobEntity) => { if (!e.id) e.id = 1; job = e; return e; },
    findOne: async () => job,
    update: async (criteria: { id?: number; status?: string }, data: Partial<AssetImportJobEntity>) => {
      if (!job) return { affected: 0 };
      if (criteria.id !== undefined && job.id !== criteria.id) return { affected: 0 };
      if (criteria.status !== undefined && job.status !== criteria.status) return { affected: 0 };
      Object.assign(job, data);
      return { affected: 1 };
    },
    delete: async (criteria: number | { id: number }) => {
      const id = typeof criteria === 'number' ? criteria : criteria.id;
      if (job && job.id === id) { job = null; return { affected: 1 }; }
      return { affected: 0 };
    },
    createQueryBuilder: () => {
      const qb = {
        andWhere: () => qb,
        orderBy: () => qb,
        skip: () => qb,
        take: () => qb,
        getManyAndCount: async (): Promise<[AssetImportJobEntity[], number]> => (job ? [[job], 1] : [[], 0]),
      };
      return qb;
    },
  };
}

function makePendingJob(type: AssetImportType): AssetImportJobEntity {
  return {
    id: 1,
    type,
    repoUrl: 'https://github.com/a/b',
    branch: 'main',
    status: 'pending',
    steps: IMPORT_STEPS.map(s => ({ key: s.key, label: s.label, status: 'pending' as const })),
  } as AssetImportJobEntity;
}

function buildService(
  jobRepo: ReturnType<typeof makeJobRepo>,
  agentRepo: ReturnType<typeof makeRepo<AgentEntity>>,
  workflowRepo: ReturnType<typeof makeRepo<WorkflowEntity>>,
  mcpRepo: ReturnType<typeof makeRepo<McpCatalogEntity>>,
  skillRepo: ReturnType<typeof makeRepo<SkillPackageEntity>>,
  github: ReturnType<typeof makeGithub>,
  skillSourceRepo: ReturnType<typeof makeRepo<SkillSourceEntity>> = makeRepo<SkillSourceEntity>(),
) {
  return new AdminImportsService(
    jobRepo as unknown as Repository<AssetImportJobEntity>,
    agentRepo as unknown as Repository<AgentEntity>,
    workflowRepo as unknown as Repository<WorkflowEntity>,
    mcpRepo as unknown as Repository<McpCatalogEntity>,
    skillRepo as unknown as Repository<SkillPackageEntity>,
    skillSourceRepo as unknown as Repository<SkillSourceEntity>,
    github as unknown as GitHubClientService,
  );
}

test('run: create→全流程成功，status=succeeded 且 steps 全 done，草稿落库且 result.id 为数字', async () => {
  const jobRepo = makeJobRepo();
  const agentRepo = makeRepo<AgentEntity>();
  const workflowRepo = makeRepo<WorkflowEntity>();
  const mcpRepo = makeRepo<McpCatalogEntity>();
  const skillRepo = makeRepo<SkillPackageEntity>();
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, makeGithub());

  const created = await service.create({ type: 'skill', repoUrl: 'https://github.com/a/b', branch: 'main' }, 7);
  // create 建 pending job 并异步触发 run（fire-and-forget 可能已推进到 processing/succeeded）
  assert.ok(['pending', 'processing', 'succeeded'].includes(created.status));

  await service.run(created.id, 7);
  const job = jobRepo.job();
  assert.ok(job);
  assert.equal(job.status, 'succeeded');
  assert.ok(job.steps!.every((s: ImportStep) => s.status === 'done'));
  assert.equal(job.result!.created.length, 1);
  assert.equal(job.result!.skipped, 0);
  assert.equal(typeof job.result!.created[0].id, 'number');
  assert.ok(job.result!.created[0].id >= 1);
  // 落库行：必填列对齐（displayName/description/runtimeType/sourceUrl/sourceType/status/reviewStatus）
  assert.ok(skillRepo.saved.length >= 1);
  const row = skillRepo.saved[0];
  assert.equal(row.name, 'quick-reply');
  assert.equal(row.displayName, '快捷回复');
  assert.equal(row.description, '快捷回复');
  assert.equal(row.runtimeType, 'openclaw');
  assert.equal(row.sourceUrl, 'https://github.com/a/b');
  assert.equal(row.sourceType, 'github');
  assert.equal(row.status, 'draft');
  assert.equal(row.reviewStatus, 'pending');
});

test('saveDrafts: name 唯一冲突（Duplicate/1062）→ skipped=1 且 0 产物任务标记 failed 并提示重名', async () => {
  const jobRepo = makeJobRepo();
  jobRepo.set(makePendingJob('agent'));
  const dupError = new Error('ER_DUP_ENTRY: Duplicate entry \'dup-agent\' for key \'agents.name\'');
  const agentRepo = makeRepo<AgentEntity>(() => { throw dupError; });
  const workflowRepo = makeRepo<WorkflowEntity>();
  const mcpRepo = makeRepo<McpCatalogEntity>();
  const skillRepo = makeRepo<SkillPackageEntity>();
  const github = makeGithub({
    getRepoTree: async (): Promise<RepoFileEntry[]> => [{ path: 'agents/a/agent.json', type: 'blob' }],
    getFileContent: async (): Promise<string | null> => JSON.stringify({ name: 'dup-agent', systemPrompt: 'prompt' }),
  });
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, github);

  await service.run(1, 7);
  const job = jobRepo.job();
  assert.ok(job);
  assert.equal(job.status, 'failed');
  assert.equal(job.result!.skipped, 1);
  assert.equal(job.result!.created.length, 0);
  assert.ok((job.errorMessage || '').includes('重名'));
  assert.equal(agentRepo.saved.length, 0);
});

test('run: getFileContent 抛错 → status=failed + errorMessage，parse 步置 error', async () => {
  const jobRepo = makeJobRepo();
  jobRepo.set(makePendingJob('skill'));
  const agentRepo = makeRepo<AgentEntity>();
  const workflowRepo = makeRepo<WorkflowEntity>();
  const mcpRepo = makeRepo<McpCatalogEntity>();
  const skillRepo = makeRepo<SkillPackageEntity>();
  const github = makeGithub({
    getFileContent: async (): Promise<string | null> => { throw new Error('raw fetch timeout'); },
  });
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, github);

  await service.run(1, 7);
  const job = jobRepo.job();
  assert.ok(job);
  assert.equal(job.status, 'failed');
  assert.ok(job.errorMessage!.includes('raw fetch timeout'));
  const parseStep = job.steps!.find((s: ImportStep) => s.key === 'parse');
  assert.equal(parseStep!.status, 'error');
});

test('retry: 原子条件更新仅失败任务可重试，重试后重新执行成功', async () => {
  const jobRepo = makeJobRepo();
  const agentRepo = makeRepo<AgentEntity>();
  const workflowRepo = makeRepo<WorkflowEntity>();
  const mcpRepo = makeRepo<McpCatalogEntity>();
  const skillRepo = makeRepo<SkillPackageEntity>();
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, makeGithub());

  // 非 failed 状态 retry 被拒（原子更新 affected=0 → 抛业务异常）
  jobRepo.set({ ...makePendingJob('skill'), status: 'succeeded' });
  await assert.rejects(() => service.retry(1, 7));

  // failed 任务 retry → 重新执行 → succeeded
  jobRepo.set({ ...makePendingJob('skill'), status: 'failed', errorMessage: 'boom' });
  await service.retry(1, 7);
  await service.run(1, 7);
  const job = jobRepo.job();
  assert.ok(job);

  assert.equal(job.status, 'succeeded');
  assert.ok(job.steps!.every((s: ImportStep) => s.status === 'done'));
  assert.equal(job.result!.created.length, 1);
  assert.equal(job.errorMessage, undefined);
});

test('run: parseRepoUrl 无效 URL → status=failed 且 fetch_repo 步置 error', async () => {
  const jobRepo = makeJobRepo();
  jobRepo.set({ ...makePendingJob('skill'), repoUrl: 'https://example.com/x/y' });
  const agentRepo = makeRepo<AgentEntity>();
  const workflowRepo = makeRepo<WorkflowEntity>();
  const mcpRepo = makeRepo<McpCatalogEntity>();
  const skillRepo = makeRepo<SkillPackageEntity>();
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, makeGithub());

  await service.run(1, 7);
  const job = jobRepo.job();
  assert.ok(job);
  assert.equal(job.status, 'failed');
  assert.ok(job.errorMessage!.includes('无效的 GitHub 仓库地址'));
  const fetchStep = job.steps!.find((s: ImportStep) => s.key === 'fetch_repo');
  assert.equal(fetchStep!.status, 'error');
});

test('saveDrafts: agent 草稿 creatorId/userId 透传 adminId', async () => {
  const jobRepo = makeJobRepo();
  jobRepo.set(makePendingJob('agent'));
  const agentRepo = makeRepo<AgentEntity>();
  const workflowRepo = makeRepo<WorkflowEntity>();
  const mcpRepo = makeRepo<McpCatalogEntity>();
  const skillRepo = makeRepo<SkillPackageEntity>();
  const github = makeGithub({
    getRepoTree: async (): Promise<RepoFileEntry[]> => [{ path: 'agents/writing/agent.json', type: 'blob' }],
    getFileContent: async (): Promise<string | null> => JSON.stringify({ name: 'writer', systemPrompt: '你是写作助手' }),
  });
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, github);

  await service.run(1, 42);
  const job = jobRepo.job();
  assert.ok(job);
  assert.equal(job.status, 'succeeded');
  assert.equal(agentRepo.saved.length, 1);
  const row = agentRepo.saved[0];
  assert.equal(row.creatorId, 42);
  assert.equal(row.userId, 42);
  assert.equal(row.modelId, 'default');
  assert.equal(row.status, 'pending_review');
  assert.equal(row.sourceType, 'imported');
});

test('remove: 删除导入任务（不连带草稿）→ 任务删除、资产保留', async () => {
  const jobRepo = makeJobRepo();
  const job = makePendingJob('agent');
  job.status = 'succeeded';
  job.result = { created: [{ type: 'agent', id: 10, name: 'a' }], skipped: 0 };
  jobRepo.set(job);
  const agentRepo = makeRepo<AgentEntity>(undefined, [{ id: 10, name: 'a', status: 'pending_review' } as AgentEntity & { id?: number }]);
  const workflowRepo = makeRepo<WorkflowEntity>();
  const mcpRepo = makeRepo<McpCatalogEntity>();
  const skillRepo = makeRepo<SkillPackageEntity>();
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, makeGithub());

  const res = await service.remove(1, false);
  assert.deepEqual(res, { removedDrafts: 0, skipped: 0 });
  assert.equal(jobRepo.job(), null);
  assert.equal(agentRepo.rows.length, 1);
});

test('remove: withDrafts=true 连带删除未发布草稿（agent pending_review + mcp disabled）', async () => {
  const jobRepo = makeJobRepo();
  const job = makePendingJob('agent');
  job.status = 'succeeded';
  job.result = {
    created: [
      { type: 'agent', id: 10, name: 'a' },
      { type: 'mcp', id: 20, name: 'm' },
    ],
    skipped: 0,
  };
  jobRepo.set(job);
  const agentRepo = makeRepo<AgentEntity>(undefined, [{ id: 10, name: 'a', status: 'pending_review' } as AgentEntity & { id?: number }]);
  const workflowRepo = makeRepo<WorkflowEntity>();
  const mcpRepo = makeRepo<McpCatalogEntity>(undefined, [{ id: 20, name: 'm', enabled: false } as McpCatalogEntity & { id?: number }]);
  const skillRepo = makeRepo<SkillPackageEntity>();
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, makeGithub());

  const res = await service.remove(1, true);
  assert.deepEqual(res, { removedDrafts: 2, skipped: 0 });
  assert.equal(agentRepo.rows.length, 0);
  assert.equal(mcpRepo.rows.length, 0);
});

test('remove: withDrafts=true 已发布/已上架资产跳过不删', async () => {
  const jobRepo = makeJobRepo();
  const job = makePendingJob('agent');
  job.status = 'succeeded';
  job.result = {
    created: [
      { type: 'agent', id: 10, name: 'a' },
      { type: 'workflow', id: 30, name: 'w' },
    ],
    skipped: 0,
  };
  jobRepo.set(job);
  const agentRepo = makeRepo<AgentEntity>(undefined, [{ id: 10, name: 'a', status: 'published' } as AgentEntity & { id?: number }]);
  const workflowRepo = makeRepo<WorkflowEntity>(undefined, [{ id: 30, name: 'w', publishStatus: 'published', isActive: true } as WorkflowEntity & { id?: number }]);
  const mcpRepo = makeRepo<McpCatalogEntity>();
  const skillRepo = makeRepo<SkillPackageEntity>();
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, makeGithub());

  const res = await service.remove(1, true);
  assert.deepEqual(res, { removedDrafts: 0, skipped: 2 });
  assert.equal(agentRepo.rows.length, 1);
  assert.equal(workflowRepo.rows.length, 1);
});

test('remove: 任务不存在抛异常', async () => {
  const jobRepo = makeJobRepo();
  const service = buildService(jobRepo, makeRepo<AgentEntity>(), makeRepo<WorkflowEntity>(), makeRepo<McpCatalogEntity>(), makeRepo<SkillPackageEntity>(), makeGithub());
  await assert.rejects(() => service.remove(999, true));
});

test('run: 技能目录仓库（categories/*.md）→ 条目写入技能源 skill_sources（中文分类 + 下载候选）', async () => {
  const jobRepo = makeJobRepo();
  jobRepo.set(makePendingJob('skill'));
  const agentRepo = makeRepo<AgentEntity>();
  const workflowRepo = makeRepo<WorkflowEntity>();
  const mcpRepo = makeRepo<McpCatalogEntity>();
  const skillRepo = makeRepo<SkillPackageEntity>();
  const skillSourceRepo = makeRepo<SkillSourceEntity>();
  const github = makeGithub({
    getRepoTree: async (): Promise<RepoFileEntry[]> => [
      { path: 'categories/ai-and-llms.md', type: 'blob' },
      { path: 'categories/devops-and-cloud.md', type: 'blob' },
      { path: 'README.md', type: 'blob' },
    ],
    getFileContent: async (owner: string, repo: string, path?: string): Promise<string | null> => {
      if (path === 'categories/ai-and-llms.md') return '- [claw-skill](https://clawskills.sh/skills/owner-skill) - AI 工具\n- [hub-skill](https://clawhub.ai/o/r) - 另一个';
      if (path === 'categories/devops-and-cloud.md') return '- [gh-skill](https://github.com/foo/bar) - 云技能';
      return null;
    },
  });
  const service = buildService(jobRepo, agentRepo, workflowRepo, mcpRepo, skillRepo, github, skillSourceRepo);
  // 避免校验候选时真实抓取 clawskills.sh 页面（单元测试无网络）
  (service as any).fetchPageHtml = async () => null;

  await service.run(1, 7);
  const job = jobRepo.job();
  assert.ok(job);

  assert.equal(job.status, 'succeeded');
  assert.equal(job.result!.created.length, 3);
  assert.equal(job.result!.catalog!.totalEntries, 3);
  assert.equal(job.result!.catalog!.saved, 3);
  assert.equal(skillSourceRepo.saved.length, 3);
  const first = skillSourceRepo.saved[0] as SkillSourceEntity;
  assert.equal(first.category, 'AI与LLM');
  assert.equal(first.status, 'analyzed');
  const ar = first.analyzeResult as Record<string, unknown>;
  assert.ok(Array.isArray(ar.repoCandidates));
  const second = skillSourceRepo.saved[1] as SkillSourceEntity;
  assert.equal(second.category, 'AI与LLM');
  const third = skillSourceRepo.saved[2] as SkillSourceEntity;
  assert.equal(third.category, '运维与云服务');
  assert.equal(third.sourceUrl, 'https://github.com/foo/bar');
});

test('run: 技能目录候选校验——猜中仓库保留并带 defaultBranch，全错条目候选清空但保留展示', async () => {
  const jobRepo = makeJobRepo();
  jobRepo.set(makePendingJob('skill'));
  const skillSourceRepo = makeRepo<SkillSourceEntity>();
  const github = makeGithub({
    getRepoTree: async (): Promise<RepoFileEntry[]> => [{ path: 'categories/ai-and-llms.md', type: 'blob' }],
    getFileContent: async (): Promise<string | null> => '- [good](https://clawskills.sh/skills/owner-skill) - 猜中\n- [bad](https://clawskills.sh/skills/ghost-repo) - 猜错',
    probeArchiveBranch: async (owner: string, repo: string): Promise<{ status: 'ok' | 'missing'; branch?: string | null }> =>
      owner === 'owner' && repo === 'skill' ? { status: 'ok', branch: 'main' } : { status: 'missing' },
  });
  const service = buildService(jobRepo, makeRepo<AgentEntity>(), makeRepo<WorkflowEntity>(), makeRepo<McpCatalogEntity>(), makeRepo<SkillPackageEntity>(), github, skillSourceRepo);
  (service as any).fetchPageHtml = async () => null;

  await service.run(1, 7);
  const saved = skillSourceRepo.saved as SkillSourceEntity[];
  assert.equal(saved.length, 2);
  const goodAr = saved[0].analyzeResult as Record<string, unknown>;
  assert.deepEqual(goodAr.repoCandidates, [{ owner: 'owner', repo: 'skill', defaultBranch: 'main' }]);
  const badAr = saved[1].analyzeResult as Record<string, unknown>;
  assert.deepEqual(badAr.repoCandidates, []);
  assert.equal(saved[1].status, 'analyzed');
});

test('run: 技能目录重导幂等——同一 sourceUrl 更新候选而非跳过', async () => {
  const jobRepo = makeJobRepo();
  jobRepo.set(makePendingJob('skill'));
  const skillSourceRepo = makeRepo<SkillSourceEntity>(undefined, [
    { id: 1, sourceUrl: 'https://github.com/foo/bar', skillName: '旧名', status: 'analyzed' } as unknown as SkillSourceEntity,
  ]);
  const github = makeGithub({
    getRepoTree: async (): Promise<RepoFileEntry[]> => [{ path: 'categories/devops.md', type: 'blob' }],
    getFileContent: async (): Promise<string | null> => '- [gh-skill](https://github.com/foo/bar) - 云技能',
  });
  const service = buildService(jobRepo, makeRepo<AgentEntity>(), makeRepo<WorkflowEntity>(), makeRepo<McpCatalogEntity>(), makeRepo<SkillPackageEntity>(), github, skillSourceRepo);

  await service.run(1, 7);
  const job = jobRepo.job();
  assert.equal(job!.status, 'succeeded');
  assert.equal(job!.result!.created.length, 1);
  assert.equal(job!.result!.skipped, 0);
  const row = skillSourceRepo.rows[0] as SkillSourceEntity;
  assert.equal(row.skillName, 'gh-skill');
  assert.equal(skillSourceRepo.saved.length, 1); // 仅更新保存一次（seed 只进 rows 不进 saved）
});
