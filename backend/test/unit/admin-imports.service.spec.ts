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

const AGENT_MD = ['---', 'name: quick-reply', 'display_name: 快捷回复', 'description: 快捷回复', 'trigger: [回复, reply]', '---', '技能正文'].join('\n');

/** mock GitHubClientService：固定 topics/tree/file，可按用例覆盖 */
function makeGithub(overrides: {
  getRepoTree?: () => Promise<RepoFileEntry[]>;
  getFileContent?: () => Promise<string | null>;
} = {}) {
  return {
    getRepoTopics: async (): Promise<string[]> => ['ai', 'agent'],
    getRepoTree: async (): Promise<RepoFileEntry[]> => [{ path: 'skills/reply/SKILL.md', type: 'blob' }],
    getFileContent: async (): Promise<string | null> => AGENT_MD,
    ...overrides,
  };
}

/** mock 资产 repo：save 分配自增 id 并记录（可选 onSave 抛错模拟唯一冲突） */
function makeRepo<T extends object>(onSave?: (e: T) => void) {
  const saved: T[] = [];
  let nextId = 1;
  return {
    saved,
    create: (data: T) => ({ ...data }) as T,
    save: async (e: T) => {
      if (onSave) onSave(e);
      const rec = e as T & { id?: number };
      if (!rec.id) rec.id = nextId++;
      saved.push(e);
      return e;
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
) {
  return new AdminImportsService(
    jobRepo as unknown as Repository<AssetImportJobEntity>,
    agentRepo as unknown as Repository<AgentEntity>,
    workflowRepo as unknown as Repository<WorkflowEntity>,
    mcpRepo as unknown as Repository<McpCatalogEntity>,
    skillRepo as unknown as Repository<SkillPackageEntity>,
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

test('saveDrafts: name 唯一冲突（Duplicate/1062）→ skipped=1 且任务仍成功', async () => {
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
  assert.equal(job.status, 'succeeded');
  assert.equal(job.result!.skipped, 1);
  assert.equal(job.result!.created.length, 0);
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
