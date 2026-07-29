import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import fg from 'fast-glob';
import { AgentEntity } from '../agent/entities/agent.entity';
import { AgentReviewEntity } from '../agent/entities/agent-review.entity';
import { AgentCallLogEntity } from '../agent/entities/agent-call-log.entity';
import { AgentRatingEntity } from '../agent/entities/agent-rating.entity';
import { AgentFavoriteEntity } from '../agent/entities/agent-favorite.entity';
import { UserEntity } from '../user/entities/user.entity';
import { AgentCategoryEntity } from './entities/agent-category.entity';
import {
  AgentImportTaskEntity,
  ImportTaskStats,
} from './entities/agent-import-task.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { AgentQueryDto } from './dto/agent-query.dto';
import { AgentReviewQueryDto } from './dto/agent-review-query.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { RejectAgentDto } from './dto/reject-agent.dto';
import { ImportGithubDto } from './dto/import-github.dto';
import { UpdateCategoryDisplayDto } from './dto/update-category-display.dto';
import {
  ParsedAgentMarkdown,
  parseAgentMarkdown,
} from './agent-import.parser';
import {
  AgentCategory,
  BATCH_SIZE,
  CLONE_TIMEOUT_MS,
  DEFAULT_CREATOR_ID,
  DEFAULT_MODEL_ID,
  DEFAULT_PRICE_PER_CALL,
  DEFAULT_RUNTIME_TYPE,
  EXCLUDE_PATTERNS,
  SOURCE_DIRS_TO_SCAN,
  SOURCE_DIR_TO_CATEGORY,
} from './agent-import.constants';

/** execFile 鐨?Promise 鍖栧寘瑁咃紙涓嶇粡杩?shell锛岄伩鍏嶅懡浠ゆ敞鍏ワ級 */
const execFileAsync = promisify(execFile);

/** 鍥哄畾鐨?5 涓垎绫?*/
const FIXED_CATEGORIES = [
  'office',
  'programming',
  'copywriting',
  'data_analysis',
  'other',
] as const;

/** 鍒嗙被榛樿鏄剧ず鍚?*/
const DEFAULT_DISPLAY_NAMES: Record<string, string> = {
  office: '鍔炲叕',
  programming: '缂栫▼',
  copywriting: '鏂囨',
  data_analysis: '鏁版嵁鍒嗘瀽',
  other: '鍏朵粬',
};

/** Agent 鐘舵€佸悎娉曡浆鎹㈣〃 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_review', 'published'],        // 鑽夌鍙彁浜ゅ鏍告垨鐩存帴鍙戝竷(瀹樻柟)
  pending_review: ['approved', 'rejected'],       // 寰呭鏍稿彲瀹℃牳閫氳繃鎴栭┏鍥?  approved: ['published'],                        // 瀹℃牳閫氳繃鍙笂鏋?  published: ['offline'],                         // 宸蹭笂鏋跺彲涓嬫灦
  rejected: ['draft', 'pending_review'],           // 椹冲洖鍚庡彲鏀瑰洖鑽夌鎴栭噸鏂版彁浜?  offline: ['published', 'draft'],                // 涓嬫灦鍚庡彲閲嶆柊涓婃灦鎴栨敼鍥炶崏绋?};

/**
 * 绠＄悊绔?Agent 甯傚満鏈嶅姟
 * 鏁版嵁鍚堝悓鐪熸簮锛歍ask 20 - Agent 甯傚満绠＄悊
 */
@Injectable()
export class AdminAgentService {
  private readonly logger = new Logger(AdminAgentService.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    @InjectRepository(AgentEntity)
    private agentRepo: Repository<AgentEntity>,
    @InjectRepository(AgentReviewEntity)
    private reviewRepo: Repository<AgentReviewEntity>,
    @InjectRepository(AgentCallLogEntity)
    private callLogRepo: Repository<AgentCallLogEntity>,
    @InjectRepository(AgentRatingEntity)
    private ratingRepo: Repository<AgentRatingEntity>,
    @InjectRepository(AgentFavoriteEntity)
    private favoriteRepo: Repository<AgentFavoriteEntity>,
    @InjectRepository(AgentCategoryEntity)
    private categoryRepo: Repository<AgentCategoryEntity>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(AgentImportTaskEntity)
    private agentImportTaskRepo: Repository<AgentImportTaskEntity>,
  ) {}

  // ============================================================
  // [1] Agent CRUD锛堝垱寤恒€佹煡璇€佹洿鏂般€佸垹闄わ級
  // ============================================================

  /** Agent 鍒楄〃 */
  async listAgents(query: AgentQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.agentRepo.createQueryBuilder('a');
    if (query.status) {
      const entityStatus = this.toEntityStatus(query.status);
      if (entityStatus) {
        qb.andWhere('a.status = :status', { status: entityStatus });
      }
    }
    if (query.category) {
      qb.andWhere('a.category = :category', { category: query.category });
    }
    qb.orderBy('a.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [agents, total] = await qb.getManyAndCount();
    const list = await this.toAdminAgentItems(agents);

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Agent 璇︽儏 */
  async getAgentDetail(id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 涓嶅瓨鍦?);
    }
    const items = await this.toAdminAgentItems([agent]);
    return items[0];
  }

  /** 鏂板 Agent */
  async createAgent(dto: CreateAgentDto, adminId: number) {
    const agent = this.agentRepo.create({
      name: dto.name,
      description: dto.description,
      systemPrompt: dto.systemPrompt || '',
      usageExample: dto.usageExamples?.join('\n') || undefined,
      modelId: dto.modelId || '',
      pricePerCall: dto.pricePerCall,
      pricePerToken:
        dto.pricingMode === 'perToken'
          ? { input: dto.pricePerTokenInput, output: dto.pricePerTokenOutput }
          : undefined,
      creatorId: adminId,
      creatorType: 'official',
      status: 'draft',
      category: dto.category,
      sourceType: 'official',
      runtimeType: 'openclaw',
      userId: adminId,
    });
    const saved = await this.agentRepo.save(agent);
    return (await this.toAdminAgentItems([saved as AgentEntity]))[0];
  }

  /** 缂栬緫 Agent */
  async updateAgent(id: number, dto: UpdateAgentDto) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 涓嶅瓨鍦?);
    }
    if (dto.name !== undefined) agent.name = dto.name;
    if (dto.description !== undefined) agent.description = dto.description;
    if (dto.systemPrompt !== undefined) agent.systemPrompt = dto.systemPrompt;
    if (dto.usageExamples !== undefined) {
      agent.usageExample = dto.usageExamples.join('\n') || undefined;
    }
    if (dto.modelId !== undefined) agent.modelId = dto.modelId;
    if (dto.category !== undefined) agent.category = dto.category;
    if (dto.pricePerCall !== undefined) agent.pricePerCall = dto.pricePerCall;
    if (dto.pricingMode !== undefined) {
      if (dto.pricingMode === 'perToken') {
        agent.pricePerToken = {
          input: dto.pricePerTokenInput ?? 0,
          output: dto.pricePerTokenOutput ?? 0,
        };
      } else {
        agent.pricePerToken = undefined;
      }
    }
    await this.agentRepo.save(agent);
  }

  /** 鍒犻櫎 Agent */
  async deleteAgent(id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 涓嶅瓨鍦?);
    }
    if (agent.status === 'published') {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '宸蹭笂鏋?Agent 涓嶈兘鍒犻櫎锛岃鍏堜笅鏋?);
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(AgentCallLogEntity, { agentId: id });
      await manager.delete(AgentReviewEntity, { agentId: id });
      await manager.delete(AgentRatingEntity, { agentId: id });
      await manager.delete(AgentFavoriteEntity, { agentId: id });
      await manager.delete(AgentEntity, id);
    });
  }

  /** 鎵归噺鍒犻櫎 Agent */
  async batchDeleteAgents(ids: number[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    // 涓?deleteAgent 淇濇寔涓€鑷达細宸蹭笂鏋?Agent 涓嶅厑璁稿垹闄?    const agents = await this.agentRepo.find({
      where: { id: In(ids) },
      select: ['id', 'status'],
    });
    const hasPublished = agents.some((a) => a.status === 'published');
    if (hasPublished) {
      BusinessException.throw(
        ErrorCode.VALIDATION_FAILED,
        '宸蹭笂鏋?Agent 涓嶈兘鍒犻櫎锛岃鍏堜笅鏋?,
      );
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(AgentCallLogEntity, { agentId: In(ids) });
      await manager.delete(AgentReviewEntity, { agentId: In(ids) });
      await manager.delete(AgentRatingEntity, { agentId: In(ids) });
      await manager.delete(AgentFavoriteEntity, { agentId: In(ids) });
      await manager.delete(AgentEntity, ids);
    });
  }

  // ============================================================
  // [3] Agent 涓婃灦/涓嬫灦
  // ============================================================

  /** 涓婃灦 Agent */
  async publishAgent(id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 涓嶅瓨鍦?);
    }
    this.assertTransition(agent.status, 'published', '涓婃灦');
    agent.status = 'published';
    agent.publishedAt = new Date();
    await this.agentRepo.save(agent);
  }

  /** 涓嬫灦 Agent */
  async unpublishAgent(id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 涓嶅瓨鍦?);
    }
    this.assertTransition(agent.status, 'offline', '涓嬫灦');
    agent.status = 'offline';
    await this.agentRepo.save(agent);
  }

  // ============================================================
  // [2] Agent 瀹℃牳娴佺▼锛堟彁浜ゃ€佸鏍搁€氳繃/鎷掔粷锛?  // ============================================================

  /** 瀹℃牳闃熷垪鍒楄〃 */
  async listReview(query: AgentReviewQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.agentRepo.createQueryBuilder('a');
    if (query.status) {
      const entityStatus = this.toEntityStatus(query.status);
      if (entityStatus) {
        qb.andWhere('a.status = :status', { status: entityStatus });
      }
    } else {
      // 榛樿鍙湅寰呭鏍?      qb.andWhere('a.status = :status', { status: 'pending_review' });
    }
    qb.orderBy('a.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [agents, total] = await qb.getManyAndCount();
    const list = await this.toAdminAgentItems(agents);

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 閫氳繃瀹℃牳 */
  async approveAgent(id: number, adminId: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 涓嶅瓨鍦?);
    }
    this.assertTransition(agent.status, 'approved', '瀹℃牳閫氳繃');
    agent.status = 'approved';
    agent.rejectionReason = undefined;
    await this.agentRepo.save(agent);

    // 鍐欏叆瀹℃牳璁板綍
    await this.reviewRepo.save({
      agentId: id,
      reviewerId: adminId,
      action: 'approve',
    });
  }

  /** 椹冲洖瀹℃牳 */
  async rejectAgent(id: number, dto: RejectAgentDto, adminId: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 涓嶅瓨鍦?);
    }
    this.assertTransition(agent.status, 'rejected', '椹冲洖');
    agent.status = 'rejected';
    agent.rejectionReason = dto.reason;
    await this.agentRepo.save(agent);

    await this.reviewRepo.save({
      agentId: id,
      reviewerId: adminId,
      action: 'reject',
      reason: dto.reason,
    });
  }

  /** 寮哄埗涓嬫灦 */
  async forceUnpublishAgent(id: number, dto: RejectAgentDto, adminId: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 涓嶅瓨鍦?);
    }
    // 寮哄埗涓嬫灦锛氬厑璁?published 鎴?approved 鐘舵€佷笅鏋?    if (agent.status !== 'published' && agent.status !== 'approved') {
      BusinessException.throw(
        ErrorCode.VALIDATION_FAILED,
        `褰撳墠鐘舵€?${agent.status} 涓嶅厑璁稿己鍒朵笅鏋禶,
      );
    }
    agent.status = 'offline';
    agent.rejectionReason = dto.reason;
    await this.agentRepo.save(agent);

    await this.reviewRepo.save({
      agentId: id,
      reviewerId: adminId,
      action: 'reject',
      reason: dto.reason,
    });
  }

  // ============================================================
  // [6] Agent 涓?OpenClaw 鍚屾
  // ============================================================

  /** GitHub 浠撳簱寮傛瀵煎叆锛堝垱寤轰换鍔★紝绔嬪嵆杩斿洖 taskId锛?*/
  async importGithub(dto: ImportGithubDto): Promise<{ taskId: string }> {
    const GITHUB_URL_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
    if (!GITHUB_URL_REGEX.test(dto.repoUrl)) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, 'Invalid GitHub repository URL');
    }

    const taskId = `imp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const defaults = {
      targetStatus: dto.targetStatus || 'published',
      defaultModelId: dto.defaultModelId || DEFAULT_MODEL_ID,
      defaultCreatorId: dto.defaultCreatorId || DEFAULT_CREATOR_ID,
      dryRun: dto.dryRun ?? false,
      overwriteExisting: dto.overwriteExisting ?? false,
    };

    const stats: ImportTaskStats = {
      total: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
      errors: [],
    };

    await this.agentImportTaskRepo.save({
      taskId,
      repoUrl: dto.repoUrl,
      branch: 'main',
      status: 'processing',
      progress: 0,
      stats,
    });

    void this.processImportTask(taskId, dto, defaults).catch((e: unknown) => {
      // 寮傛浠诲姟寮傚父鐢?processImportTask 鍐呴儴 try-catch 鍏滃簳锛屾澶勪粎浣滄瀬绔厹搴曟棩蹇?      this.logger?.error?.(
        `importGithub async dispatch failed: ${(e as Error).message}`,
      );
    });

    return { taskId };
  }

  /** 寮傛澶勭悊瀵煎叆浠诲姟锛氬厠闅?鈫?瑙ｆ瀽 鈫?鍘婚噸 鈫?鍏ュ簱 */
  private async processImportTask(
    taskId: string,
    dto: ImportGithubDto,
    defaults: {
      targetStatus: 'published' | 'pending_review' | 'draft';
      defaultModelId: string;
      defaultCreatorId: number;
      dryRun: boolean;
      overwriteExisting: boolean;
    },
  ): Promise<void> {
    const startTime = Date.now();
    const tmpDir = path.join(os.tmpdir(), `agent-import-${taskId}`);
    const stats: ImportTaskStats = {
      total: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
      errors: [],
    };
    let commitSha: string | undefined;

    try {
      // a. git clone 鎴?GitHub API tarball 涓嬭浇
      const cloneUrl = await this.resolveCloneUrl(dto.repoUrl);

      if (cloneUrl.startsWith('api-tarball:')) {
        // GitHub API tarball 鍒嗘敮锛氫笉闇€瑕?git 鍛戒护
        const repoUrl = cloneUrl.replace('api-tarball:', '');
        const ownerRepo = repoUrl.replace('https://github.com/', '').replace(/\/$/, '').replace(/\.git$/, '');
        const [owner, repo] = ownerRepo.split('/');

        const https = await import('https');

        // GitHub API 闀滃儚鍒楄〃锛堝浗鍐呮湇鍔″櫒 api.github.com 鍙兘鏃犳硶鐩磋繛锛?        const GITHUB_API_BASES = [
          'https://api.github.com',
          'https://ghproxy.com/https://api.github.com',
          'https://gh-proxy.com/https://api.github.com',
        ];

        // 鍏堢敤 GitHub API 鑾峰彇浠撳簱榛樿鍒嗘敮鍚嶏紙閬嶅巻闀滃儚锛?        let defaultBranch = 'main';
        let repoInfoSuccess = false;
        for (const base of GITHUB_API_BASES) {
          try {
            const repoInfoUrl = `${base}/repos/${owner}/${repo}`;
            this.logger.log(`灏濊瘯鑾峰彇浠撳簱淇℃伅: ${repoInfoUrl}`);
            const repoInfo = await this.httpsGetJson(https, repoInfoUrl);
            defaultBranch = repoInfo.default_branch || 'main';
            this.logger.log(`浠撳簱榛樿鍒嗘敮: ${defaultBranch} (via ${base})`);
            repoInfoSuccess = true;
            break;
          } catch (e) {
            this.logger.warn(`闀滃儚 ${base} 鑾峰彇浠撳簱淇℃伅澶辫触: ${(e as Error).message}`);
          }
        }
        if (!repoInfoSuccess) {
          this.logger.warn(`鎵€鏈夐暅鍍忚幏鍙栦粨搴撲俊鎭け璐ワ紝灏嗗皾璇?main 鍜?master 鍒嗘敮鐩存帴涓嬭浇`);
        }

        // 涓嬭浇 tarball锛堥亶鍘嗛暅鍍?脳 鍒嗘敮锛?        const tarballPath = path.join(os.tmpdir(), `agent-import-tarball-${taskId}.tar.gz`);
        let tarballSuccess = false;
        const branchesToTry = defaultBranch === 'main' ? ['main', 'master'] : [defaultBranch, defaultBranch === 'master' ? 'main' : 'master'];
        for (const base of GITHUB_API_BASES) {
          for (const branch of branchesToTry) {
            const tarballUrl = `${base}/repos/${owner}/${repo}/tarball/${branch}`;
            this.logger.log(`灏濊瘯涓嬭浇 tarball: ${tarballUrl}`);
            const downloadResult = await this.downloadTarball(https, tarballUrl, tarballPath);
            if (downloadResult.success) {
              tarballSuccess = true;
              break;
            }
            this.logger.warn(`tarball 涓嬭浇澶辫触: HTTP ${downloadResult.statusCode}`);
          }
          if (tarballSuccess) break;
        }
        if (!tarballSuccess) {
          throw new Error(`GitHub API tarball 涓嬭浇澶辫触: 鎵€鏈夐暅鍍忓拰鍒嗘敮鍧囨棤娉曚笅杞姐€傝妫€鏌ヤ粨搴撳湴鍧€鏄惁姝ｇ‘锛屾垨鏈嶅姟鍣ㄧ綉缁滄槸鍚﹁兘璁块棶 GitHub銆俙);
        }

        // 瑙ｅ帇 tarball 鍒?tmpDir
        await fs.mkdir(tmpDir, { recursive: true });
        await execFileAsync('tar', ['-xzf', tarballPath, '-C', tmpDir, '--strip-components=1'], {
          timeout: 60_000,
        });

        // 娓呯悊 tarball
        try { await fs.unlink(tarballPath); } catch {}

        // tarball 鏃?commitSha锛岀敤鏃堕棿鎴充唬鏇?        commitSha = `tarball-${Date.now()}`;
      } else {
        // git clone 鍒嗘敮
        await execFileAsync(
          'git',
          ['clone', '--depth', '1', cloneUrl, tmpDir],
          { timeout: CLONE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
        );

        // b. 鑾峰彇 commitSha
        const { stdout: shaStdout } = await execFileAsync(
          'git',
          ['-C', tmpDir, 'rev-parse', 'HEAD'],
        );
        commitSha = shaStdout.trim();
      }

      // c. 閬嶅巻鐩爣婧愮洰褰曚笅鐨?markdown 鏂囦欢
      const files: string[] = await fg(
        [
          ...SOURCE_DIRS_TO_SCAN.map((d) => `${d}/**/*.md`),
          ...EXCLUDE_PATTERNS.map((p) => '!' + p),
        ],
        { cwd: tmpDir, ignore: EXCLUDE_PATTERNS },
      );
      stats.total = files.length;

      // d-g. 璇诲彇骞惰В鏋愭瘡涓枃浠讹紝鍗曟枃浠堕敊璇笉涓柇
      const parsed: Array<{
        relPath: string;
        data: ParsedAgentMarkdown;
        category: AgentCategory;
      }> = [];
      for (const relPath of files) {
        try {
          const content = await fs.readFile(path.join(tmpDir, relPath), 'utf8');
          const result = parseAgentMarkdown(relPath, content);
          if (result.error) {
            stats.failed++;
            if (stats.errors && stats.errors.length < 50) {
              stats.errors.push({ filePath: relPath, error: result.error });
            }
            continue;
          }
          const sourceDir = relPath.split('/')[0];
          const category: AgentCategory =
            SOURCE_DIR_TO_CATEGORY[sourceDir] || 'other';
          parsed.push({ relPath, data: result, category });
        } catch (e) {
          stats.failed++;
          if (stats.errors && stats.errors.length < 50) {
            stats.errors.push({ filePath: relPath, error: (e as Error).message });
          }
        }
      }

      // h. 鎸?sourceRepoUrl + sourceFilePath 鍘婚噸
      const existingMap = new Map<string, { id: number }>();
      if (parsed.length > 0) {
        const existing = await this.agentRepo.find({
          where: {
            sourceRepoUrl: dto.repoUrl,
            sourceFilePath: In(parsed.map((p) => p.relPath)),
          },
          select: ['id', 'sourceFilePath'],
        });
        for (const e of existing) {
          if (e.sourceFilePath) {
            existingMap.set(e.sourceFilePath, { id: e.id });
          }
        }
      }

      // 鏋勯€犳柊澧?/ 鏇存柊闆嗗悎
      const newEntities: AgentEntity[] = [];
      const updatePayloads: Array<{
        id: number;
        fields: Partial<AgentEntity>;
      }> = [];
      for (const item of parsed) {
        const existing = existingMap.get(item.relPath);
        const sourceDir = item.relPath.split('/')[0];
        if (existing) {
          if (!defaults.overwriteExisting) {
            stats.skipped++;
            continue;
          }
          updatePayloads.push({
            id: existing.id,
            fields: {
              name: item.data.name,
              description: item.data.description,
              avatar: item.data.avatar || undefined,
              systemPrompt: item.data.systemPrompt,
              modelId: defaults.defaultModelId,
              category: item.category,
              sourceCategory: sourceDir,
              sourceVersion: commitSha,
            },
          });
        } else {
          const entity = this.agentRepo.create({
            name: item.data.name,
            description: item.data.description,
            avatar: item.data.avatar || undefined,
            systemPrompt: item.data.systemPrompt,
            modelId: defaults.defaultModelId,
            pricePerCall: DEFAULT_PRICE_PER_CALL,
            creatorId: defaults.defaultCreatorId,
            creatorType: 'official',
            status: defaults.targetStatus,
            category: item.category,
            sourceType: 'imported',
            sourceRepoUrl: dto.repoUrl,
            sourceFilePath: item.relPath,
            sourceCategory: sourceDir,
            sourceVersion: commitSha,
            runtimeType: DEFAULT_RUNTIME_TYPE,
            userId: defaults.defaultCreatorId,
            isOfficial: true,
            publishedAt:
              defaults.targetStatus === 'published' ? new Date() : undefined,
          });
          newEntities.push(entity);
        }
      }

      // i/j. dryRun 璺宠繃鍐欏叆锛涘惁鍒欏垎鎵瑰叆搴?      if (defaults.dryRun) {
        stats.inserted = 0;
        stats.skipped = existingMap.size;
      } else {
        let processedCount = 0;
        // 鍒嗘壒 save 鏂板
        for (let i = 0; i < newEntities.length; i += BATCH_SIZE) {
          const batch = newEntities.slice(i, i + BATCH_SIZE);
          await this.agentRepo.save(batch);
          processedCount += batch.length;
          const progress =
            files.length > 0
              ? Math.floor((processedCount / files.length) * 100)
              : 100;
          await this.agentImportTaskRepo.update({ taskId }, { progress, stats });
        }
        stats.inserted = newEntities.length;

        // 鍒嗘壒 update 瑕嗙洊
        for (let i = 0; i < updatePayloads.length; i += BATCH_SIZE) {
          const batch = updatePayloads.slice(i, i + BATCH_SIZE);
          for (const payload of batch) {
            await this.agentRepo.update(payload.id, payload.fields as any);
          }
          processedCount += batch.length;
          const progress =
            files.length > 0
              ? Math.floor((processedCount / files.length) * 100)
              : 100;
          await this.agentImportTaskRepo.update({ taskId }, { progress, stats });
        }
      }

      // k. 瀹屾垚
      stats.durationMs = Date.now() - startTime;
      stats.total = files.length;
      await this.agentImportTaskRepo.update(
        { taskId },
        {
          status: 'success',
          progress: 100,
          stats,
          commitSha,
        },
      );
    } catch (e) {
      stats.durationMs = Date.now() - startTime;
      await this.agentImportTaskRepo.update({ taskId }, {
        status: 'failed',
        error: (e as Error).message.slice(0, 512),
        stats,
      });
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // 蹇界暐涓存椂鐩綍娓呯悊閿欒
      }
    }
  }

  /** 鏌ヨ瀵煎叆浠诲姟鐘舵€?*/
  async getImportTask(taskId: string) {
    const task = await this.agentImportTaskRepo.findOne({ where: { taskId } });
    if (!task) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '瀵煎叆浠诲姟涓嶅瓨鍦?);
    }
    return {
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      repoUrl: task.repoUrl,
      branch: task.branch,
      commitSha: task.commitSha,
      stats: task.stats,
      errorMessage: task.error,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  /** HTTPS GET 杩斿洖 JSON锛圙itHub API 璋冪敤锛?*/
  private async httpsGetJson(https: typeof import('https'), url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'ShentongAI-ImportBot' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          https.get(res.headers.location!, { headers: { 'User-Agent': 'ShentongAI-ImportBot' } }, (res2) => {
            let data2 = '';
            res2.on('data', (chunk: string) => { data2 += chunk; });
            res2.on('end', () => {
              try { resolve(JSON.parse(data2)); } catch { reject(new Error(`JSON瑙ｆ瀽澶辫触: ${data2.slice(0, 200)}`)); }
            });
            res2.on('error', reject);
          });
          return;
        }
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (chunk: string) => { body += chunk; });
          res.on('end', () => {
            reject(new Error(`GitHub API HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
          });
          return;
        }
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error(`JSON瑙ｆ瀽澶辫触: ${data.slice(0, 200)}`)); }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /** 涓嬭浇 tarball 鏂囦欢锛岃繑鍥炵粨鏋滃寘鍚垚鍔?澶辫触鐘舵€?*/
  private async downloadTarball(https: typeof import('https'), url: string, destPath: string): Promise<{ success: boolean; statusCode?: number }> {
    return new Promise((resolve) => {
      const file = require('fs').createWriteStream(destPath);
      https.get(url, { headers: { 'User-Agent': 'ShentongAI-ImportBot' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // GitHub API tarball 杩斿洖302閲嶅畾鍚戝埌 codeload.github.com
          https.get(res.headers.location!, { headers: { 'User-Agent': 'ShentongAI-ImportBot' } }, (res2) => {
            if (res2.statusCode === 200) {
              res2.pipe(file);
              file.on('finish', () => { file.close(); resolve({ success: true }); });
              res2.on('error', () => resolve({ success: false }));
            } else {
              file.close();
              resolve({ success: false, statusCode: res2.statusCode });
            }
          }).on('error', () => resolve({ success: false }));
          return;
        }
        if (res.statusCode === 200) {
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve({ success: true }); });
          res.on('error', () => resolve({ success: false }));
        } else {
          file.close();
          resolve({ success: false, statusCode: res.statusCode });
        }
      }).on('error', () => resolve({ success: false }));
    });
  }

  /** 瑙ｆ瀽鍏嬮殕 URL锛氫笁绾?fallback 鈥斺€?鐩磋繛 鈫?闀滃儚 鈫?GitHub API tarball */
  private async resolveCloneUrl(url: string): Promise<string> {
    // 绾у埆1锛氱洿杩?GitHub锛?5绉掕秴鏃讹紝鍘?绉掑お鐭級
    try {
      await execFileAsync('git', ['ls-remote', url, 'HEAD'], {
        timeout: 15_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      this.logger.log('鐩磋繛 GitHub 鎴愬姛');
      return url;
    } catch {
      this.logger.warn('鐩磋繛 GitHub 澶辫触锛?5s瓒呮椂锛夛紝灏濊瘯闀滃儚鍔犻€?..');
    }

    // 绾у埆2锛歡hfast.top 闀滃儚锛堝浗鍐呮洿绋冲畾鐨勫姞閫熺珯锛?    const mirrored = `https://ghfast.top/${url}`;
    try {
      await execFileAsync('git', ['ls-remote', mirrored, 'HEAD'], {
        timeout: 15_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      this.logger.log(`闀滃儚杩炴帴鎴愬姛: ${mirrored}`);
      return mirrored;
    } catch {
      this.logger.warn(`闀滃儚 ${mirrored} 涔熷け璐ワ紝灏濊瘯 GitHub API tarball...`);
    }

    // 绾у埆3锛氫娇鐢?GitHub API tarball 涓嬭浇锛堜笉闇€瑕?git 鍛戒护锛?    // 鏍囪涓?'api-tarball' 妯″紡锛宲rocessImportTask 涓細璧颁笉鍚屽垎鏀?    return `api-tarball:${url}`;
  }

  // ============================================================
  // [4] Agent 鍒嗙被涓庢爣绛剧鐞?  // ============================================================

  /** 鍒嗙被鍒楄〃锛堝惈姣忓垎绫?Agent 鏁伴噺锛?*/
  async listCategories() {
    // 鏌ヨ鎵€鏈夊垎绫婚厤缃?    const categories = await this.categoryRepo.find({ order: { sort: 'ASC' } });
    const categoryMap = new Map<string, AgentCategoryEntity>(
      categories.map((c) => [c.category, c]),
    );

    // 鑱氬悎姣忓垎绫?Agent 鏁伴噺
    const countRows = await this.agentRepo
      .createQueryBuilder('a')
      .select('a.category', 'category')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('a.category')
      .getRawMany<{ category: string; cnt: string }>();
    const countMap = new Map<string, number>(
      countRows.map((r) => [r.category, Number(r.cnt)]),
    );

    return FIXED_CATEGORIES.map((cat, idx) => {
      const meta = categoryMap.get(cat);
      return {
        category: cat,
        displayName: meta?.displayName || DEFAULT_DISPLAY_NAMES[cat] || cat,
        agentCount: countMap.get(cat) || 0,
        sort: meta?.sort ?? idx,
      };
    });
  }

  /** 鏇存柊鍒嗙被鏄剧ず鍚?*/
  async updateCategoryDisplay(
    category: string,
    dto: UpdateCategoryDisplayDto,
  ) {
    if (!FIXED_CATEGORIES.includes(category as any)) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '鏃犳晥鐨勫垎绫?);
    }
    let entity = await this.categoryRepo.findOne({ where: { category } });
    if (entity) {
      entity.displayName = dto.displayName;
      await this.categoryRepo.save(entity);
    } else {
      entity = this.categoryRepo.create({
        category,
        displayName: dto.displayName,
        sort: FIXED_CATEGORIES.indexOf(category as any),
      });
      await this.categoryRepo.save(entity);
    }
  }

  // ============================================================
  // [5] Agent 缁熻涓庢姤琛?  // ============================================================

  // ============ 鍐呴儴宸ュ叿 ============

  /** 鏍￠獙鐘舵€佽浆鎹㈠悎娉曟€э紝闈炴硶鍒欐姏 BusinessException */
  private assertTransition(
    currentStatus: string,
    targetStatus: string,
    actionDesc: string,
  ): void {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      BusinessException.throw(
        ErrorCode.VALIDATION_FAILED,
        `褰撳墠鐘舵€?${currentStatus} 涓嶅厑璁?{actionDesc}锛堢洰鏍囩姸鎬?${targetStatus}锛塦,
      );
    }
  }

  /** 鍓嶇 status -> 瀹炰綋 status 鏄犲皠 */
  private toEntityStatus(
    status: string,
  ): 'draft' | 'pending_review' | 'approved' | 'published' | 'rejected' | 'offline' | null {
    switch (status) {
      case 'published':
        return 'published';
      case 'unpublished':
        return 'offline';
      case 'pending_review':
        return 'pending_review';
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      case 'draft':
        return 'draft';
      default:
        return null;
    }
  }

  /** 瀹炰綋 status -> 鍓嶇 status 鏄犲皠 */
  private toFrontendStatus(
    status: 'draft' | 'pending_review' | 'approved' | 'published' | 'rejected' | 'offline',
  ): 'published' | 'unpublished' | 'pending_review' | 'approved' | 'rejected' {
    switch (status) {
      case 'published':
        return 'published';
      case 'offline':
        return 'unpublished';
      case 'pending_review':
        return 'pending_review';
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      default:
        return 'unpublished';
    }
  }

  /** 鎵归噺杞崲瀹炰綋涓哄墠绔鍥撅紙鍚?creatorName锛?*/
  private async toAdminAgentItems(agents: AgentEntity[]) {
    if (agents.length === 0) return [];

    // 鎵归噺鏌ヨ鍒涗綔鑰呭悕
    const creatorIds = [...new Set(agents.map((a) => a.creatorId).filter((id) => id > 0))];
    const creators =
      creatorIds.length > 0
        ? await this.userRepo
            .createQueryBuilder('u')
            .select(['u.id', 'u.username'])
            .where('u.id IN (:...ids)', { ids: creatorIds })
            .getMany()
        : [];
    const nameMap = new Map<number, string>(creators.map((u) => [u.id, u.username]));

    return agents.map((a) => {
      const pricingMode = a.pricePerToken ? 'perToken' : 'perCall';
      return {
        id: a.id,
        name: a.name,
        description: a.description || '',
        systemPrompt: a.systemPrompt,
        category: a.category,
        usageExamples: a.usageExample ? a.usageExample.split('\n').filter(Boolean) : undefined,
        modelId: a.modelId,
        creatorType: a.creatorType,
        creatorName: nameMap.get(a.creatorId) || '',
        status: this.toFrontendStatus(a.status),
        pricingMode,
        pricePerCall: a.pricePerCall,
        pricePerTokenInput: a.pricePerToken?.input ?? 0,
        pricePerTokenOutput: a.pricePerToken?.output ?? 0,
        callCount: a.callCount,
        rating: Number(a.rating) || 0,
        rejectReason: a.rejectionReason || undefined,
        forceUnpublishReason: a.status === 'offline' ? a.rejectionReason || undefined : undefined,
        submittedAt: a.publishedAt?.toISOString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      };
    });
  }
}
