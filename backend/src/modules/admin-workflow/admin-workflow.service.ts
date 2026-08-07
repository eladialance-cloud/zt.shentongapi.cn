import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowEntity, WorkflowPublishStatus } from './entities/workflow.entity';
import { N8nWorkflowExecLogEntity } from './entities/n8n-workflow-exec-log.entity';
import { WorkflowMcpBindEntity } from './entities/workflow-mcp-bind.entity';
import {
  AdminWorkflowQueryDto,
  CreateAdminWorkflowDto,
  UpdateAdminWorkflowDto,
  ImportGithubWorkflowDto,
} from './dto/workflow.dto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import fg from 'fast-glob';
import { extractZipFile } from '../../common/utils/zip.util';

const execFileAsync = promisify(execFile);

interface ParsedWorkflowMeta {
  name: string;
  description?: string;
  triggerType?: string;
  nodeCount: number;
  categories: string[];
  workflowId?: string;
  version?: string;
}

/**
 * 管理端工作流模板服务（合并版）
 *
 * 统一管理 workflows 表：CRUD + 审核 + GitHub 导入 + 执行日志 + MCP 绑定
 */
@Injectable()
export class AdminWorkflowService {
  private readonly logger = new Logger(AdminWorkflowService.name);

  constructor(
    @InjectRepository(WorkflowEntity)
    private readonly workflowRepo: Repository<WorkflowEntity>,
    @InjectRepository(N8nWorkflowExecLogEntity)
    private readonly execLogRepo: Repository<N8nWorkflowExecLogEntity>,
    @InjectRepository(WorkflowMcpBindEntity)
    private readonly bindRepo: Repository<WorkflowMcpBindEntity>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // 列表 & 详情
  // ═══════════════════════════════════════════════════════════

  async list(query: AdminWorkflowQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.workflowRepo.createQueryBuilder('w');

    if (query.engineType) {
      qb.andWhere('w.engine_type = :et', { et: query.engineType });
    }
    if (query.category) {
      qb.andWhere('w.category = :cat', { cat: query.category });
    }
    if (query.publishStatus) {
      qb.andWhere('w.publish_status = :ps', { ps: query.publishStatus });
    }
    if (query.status) {
      // status 可映射为 reviewStatus 或 publishStatus，优先 publishStatus
      qb.andWhere('w.publish_status = :st', { st: query.status });
    }
    if (query.keyword) {
      qb.andWhere('(w.name LIKE :kw OR w.description LIKE :kw OR w.tags LIKE :kwj)', {
        kw: `%${query.keyword}%`,
        kwj: `%${query.keyword}%`,
      });
    }

    qb.orderBy('w.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 0 };
  }

  async detail(id: number): Promise<WorkflowEntity> {
    const workflow = await this.workflowRepo.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException(`工作流 ${id} 不存在`);
    return workflow;
  }

  // ═══════════════════════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════════════════════

  async create(dto: CreateAdminWorkflowDto): Promise<WorkflowEntity> {
    const entity = this.workflowRepo.create({
      name: dto.name,
      description: dto.description,
      engineType: dto.engineType as WorkflowEntity['engineType'],
      n8nWorkflowId: dto.n8nWorkflowId,
      cozeWorkflowId: dto.cozeWorkflowId,
      workflowJson: dto.workflowJson,
      category: dto.category as WorkflowEntity['category'],
      inputSchema: dto.inputSchema,
      outputSchema: dto.outputSchema,
      pricePerExecution: dto.pricePerExecution,
      isActive: dto.isActive ?? false,
      isPublished: false,
      publishStatus: 'draft',
      reviewStatus: 'pending_review',
      icon: dto.icon,
      tags: dto.tags,
      triggerType: dto.triggerType,
      nodeCount: dto.nodeCount ?? 0,
      executionCount: 0,
    });
    return this.workflowRepo.save(entity);
  }

  async update(id: number, dto: UpdateAdminWorkflowDto): Promise<void> {
    const workflow = await this.detail(id);
    const simpleFields: Array<keyof UpdateAdminWorkflowDto> = [
      'name', 'description', 'engineType', 'n8nWorkflowId', 'cozeWorkflowId',
      'workflowJson', 'category', 'inputSchema', 'outputSchema',
      'pricePerExecution', 'isActive', 'isPublished', 'icon', 'tags',
      'triggerType', 'nodeCount',
    ];
    for (const key of simpleFields) {
      if (dto[key] !== undefined) (workflow as any)[key] = dto[key];
    }
    if (dto.publishStatus !== undefined) {
      workflow.publishStatus = dto.publishStatus as WorkflowPublishStatus;
    }
    await this.workflowRepo.save(workflow);
  }

  async remove(id: number): Promise<void> {
    const workflow = await this.detail(id);
    // 清理关联
    await this.bindRepo.delete({ workflowLibId: id } as any);
    await this.workflowRepo.delete(id);
  }

  // ═══════════════════════════════════════════════════════════
  // 审核流
  // ═══════════════════════════════════════════════════════════

  async review(id: number, action: 'approve' | 'reject', reason?: string) {
    if (action === 'approve') return this.approve(id);
    return this.reject(id, reason || '');
  }

  async approve(id: number) {
    const workflow = await this.workflowRepo.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException(`工作流 ${id} 不存在`);
    workflow.reviewStatus = 'approved';
    workflow.publishStatus = 'approved';
    workflow.rejectReason = undefined;
    await this.workflowRepo.save(workflow);
  }

  async reject(id: number, reason: string) {
    const workflow = await this.workflowRepo.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException(`工作流 ${id} 不存在`);
    workflow.reviewStatus = 'rejected';
    workflow.publishStatus = 'rejected';
    workflow.rejectReason = reason;
    await this.workflowRepo.save(workflow);
  }

  // ═══════════════════════════════════════════════════════════
  // GitHub 导入（支持 n8n-workflows 仓库批量解析）
  // ═══════════════════════════════════════════════════════════

  async importFromGithub(dto: ImportGithubWorkflowDto) {
    this.logger.log(`[Workflow] GitHub 导入: ${dto.repoUrl}`);

    const cleanUrl = dto.repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
    const tmpDir = path.join(os.tmpdir(), `wf-import-${Date.now()}`);
    const cloneUrl = await this.resolveCloneUrl(cleanUrl);

    try {
      await execFileAsync('git', ['clone', '--depth', '1', '--filter=blob:none', cloneUrl, tmpDir], {
        timeout: 120_000,
        maxBuffer: 100 * 1024 * 1024,
      });
      this.logger.log(`[Workflow] git clone 成功`);
    } catch (e: any) {
      throw new BadRequestException(`git clone 失败: ${e.message}`);
    }

    let imported = 0;
    try {
      if (dto.filePath) {
        imported = await this.importSingleFile(tmpDir, dto);
      } else {
        imported = await this.importWorkflowsDir(tmpDir, dto);
      }
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
    }

    this.logger.log(`[Workflow] 导入完成: ${imported} 条`);
    return { imported };
  }


  /**
   * 本地上传导入工作流
   * 支持 .json（n8n 工作流）与 .zip（内含 .json 工作流，自动扫描）
   */
  async importLocalFiles(files: Express.Multer.File[]): Promise<{ imported: number; failed: number; errors: string[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('请上传工作流文件（.json 或 .zip）');
    }
    let imported = 0;
    const errors: string[] = [];

    for (const file of files) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      try {
        if (ext === '.json') {
          const content = file.buffer.toString('utf-8');
          const parsed = this.parseWorkflowJson(content, file.originalname);
          if (!parsed) {
            errors.push(`${file.originalname}: 不是有效的 n8n 工作流 JSON`);
            continue;
          }
          await this.upsertWorkflow({
            ...parsed,
            name: parsed.name,
            nodeCount: parsed.nodeCount,
            categories: parsed.categories,
            sourcePath: file.originalname,
            repoUrl: `local://${file.originalname}`,
            category: 'other',
          });
          imported++;
        } else if (ext === '.zip') {
          const stamp = Date.now();
          const uploadDir = path.resolve(process.cwd(), 'uploads', 'workflows');
          await fs.mkdir(uploadDir, { recursive: true });
          const safeName = file.originalname.replace(/[^\w.-]/g, '_');
          const zipPath = path.join(uploadDir, `workflow-local-${stamp}-${safeName}`);
          await fs.writeFile(zipPath, file.buffer);
          const tmpDir = path.join(os.tmpdir(), `workflow-local-${stamp}`);
          await fs.mkdir(tmpDir, { recursive: true });
          try {
            extractZipFile(zipPath, tmpDir);
            const count = await this.importWorkflowsDir(tmpDir, {
              repoUrl: `local://${path.basename(zipPath)}`,
              category: 'other',
            });
            imported += count;
          } finally {
            try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
          }
        } else {
          errors.push(`${file.originalname}: 不支持的文件类型（仅 .json / .zip）`);
        }
      } catch (e) {
        errors.push(`${file.originalname}: ${(e as Error).message}`);
      }
    }

    if (imported === 0 && errors.length > 0) {
      throw new BadRequestException(`导入失败: ${errors.join('; ')}`);
    }
    this.logger.log(`[Workflow] 本地上传导入完成: ${imported} 条, 失败 ${errors.length}`);
    return { imported, failed: errors.length, errors };
  }

  /** 导入单个指定文件 */
  private async importSingleFile(tmpDir: string, dto: ImportGithubWorkflowDto): Promise<number> {
    const fullPath = path.join(tmpDir, dto.filePath!);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      throw new BadRequestException(`文件不存在: ${dto.filePath}`);
    }
    const parsed = this.parseWorkflowJson(content, dto.filePath!);
    if (!parsed) throw new BadRequestException(`文件不是有效的 n8n 工作流 JSON: ${dto.filePath}`);
    await this.upsertWorkflow({
      ...parsed,
      name: parsed.name!,
      nodeCount: parsed.nodeCount,
      categories: parsed.categories,
      sourcePath: dto.filePath!,
      repoUrl: dto.repoUrl,
      category: dto.category || 'other',
    });
    return 1;
  }

  /** 批量扫描 workflows/ 目录下的目录结构 */
  private async importWorkflowsDir(tmpDir: string, dto: ImportGithubWorkflowDto): Promise<number> {
    // 检查是否存在 workflows/ 目录（n8n-workflows 仓库结构）
    const workflowsRoot = path.join(tmpDir, 'workflows');
    let scanRoot = tmpDir;
    let isN8nRepo = false;
    try {
      await fs.access(workflowsRoot);
      scanRoot = workflowsRoot;
      isN8nRepo = true;
      this.logger.log('[Workflow] 检测到 n8n-workflows 仓库结构');
    } catch {
      this.logger.log('[Workflow] 通用仓库结构，扫描根目录');
    }

    const jsonFiles = await fg(['**/*.json'], {
      cwd: scanRoot,
      ignore: ['**/node_modules/**', '**/.git/**', '**/package*.json', '**/tsconfig*.json', '**/composer.json'],
      absolute: false,
    });
    this.logger.log(`[Workflow] 找到 ${jsonFiles.length} 个 JSON 文件`);

    if (jsonFiles.length === 0) throw new BadRequestException('未找到工作流 JSON 文件');

    let imported = 0;
    for (const relPath of jsonFiles) {
      try {
        const fullPath = path.join(scanRoot, relPath);
        const content = await fs.readFile(fullPath, 'utf-8');

        // 快速检查是否为 n8n workflow JSON（有 nodes 字段）
        if (content.length < 100) continue;

        const parsed = this.parseWorkflowJson(content, relPath);
        if (!parsed) continue; // 非 n8n workflow JSON

        // 确定分类：n8n-workflows 仓库用目录名作为 category
        let category = dto.category;
        if (isN8nRepo && !category) {
          const dirName = relPath.split('/')[0];
          category = dirName.toLowerCase().replace(/\s+/g, '_');
        }

        await this.upsertWorkflow({
          ...parsed,
          name: parsed.name!,
          nodeCount: parsed.nodeCount,
          categories: parsed.categories,
          sourcePath: relPath,
          repoUrl: dto.repoUrl,
          category: category || 'other',
        });
        imported++;
      } catch (e) {
        this.logger.warn(`[Workflow] 跳过 ${relPath}: ${(e as Error).message}`);
      }
    }

    return imported;
  }

  /**
   * 解析 n8n workflow JSON 提取元数据
   * n8n JSON 顶层结构: { name, nodes[], connections{}, ... }
   * n8n-workflows 仓库格式: { meta: {...}, nodes:[...], connections:{...} }
   */
  private parseWorkflowJson(content: string, filePath: string): ParsedWorkflowMeta | null {
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }

    // 必须有 nodes 数组才是 n8n workflow
    if (!parsed.nodes || !Array.isArray(parsed.nodes)) return null;

    const nodes = parsed.nodes as any[];
    const nodeCount = nodes.length;

    // 提取名称
    let name: string;
    if (parsed.meta?.instanceId) {
      // n8n-workflows 仓库格式: 文件名去掉编号前缀
      const fileName = filePath.split('/').pop()?.replace(/\.json$/i, '') || filePath;
      name = fileName.replace(/^\d+[_]?/, '').replace(/_/g, ' ');
    } else {
      name = parsed.name || filePath.split('/').pop()?.replace(/\.json$/i, '') || '未命名工作流';
    }

    // 提取触发类型
    let triggerType: string | undefined;
    const triggerNode = nodes.find(
      (n: any) =>
        n.type?.includes('.trigger') ||
        n.type?.includes('.Trigger') ||
        n.type?.includes('webhook') ||
        n.type?.includes('Webhook') ||
        n.type?.includes('schedule') ||
        n.type?.includes('Cron'),
    );
    if (triggerNode) {
      const t = triggerNode.type as string;
      if (t.includes('webhook') || t.includes('Webhook')) triggerType = 'webhook';
      else if (t.includes('schedule') || t.includes('Cron') || t.includes('interval')) triggerType = 'schedule';
      else if (t.includes('manual') || t.includes('Manual')) triggerType = 'manual';
      else triggerType = 'trigger';
    }

    // 提取涉及的集成商分类（从 nodes[].type 和 credentials 中）
    const categories = new Set<string>();
    for (const node of nodes) {
      if (node.type && typeof node.type === 'string') {
        const match = node.type.match(/n8n-nodes-base\.(\w+)/i);
        if (match && match[1]) categories.add(match[1].toLowerCase());
      }
    }

    return {
      name,
      description: parsed.meta?.category || parsed.description,
      triggerType,
      nodeCount,
      categories: Array.from(categories),
      workflowId: parsed.meta?.instanceId || parsed.id,
      version: parsed.meta?.versionId || parsed.version,
    };
  }

  /** 去重 upsert */
  private async upsertWorkflow(data: {
    name: string;
    description?: string;
    triggerType?: string;
    nodeCount: number;
    categories: string[];
    workflowId?: string;
    version?: string;
    sourcePath: string;
    repoUrl: string;
    category: string;
  }) {
    const existing = await this.workflowRepo.findOne({
      where: { sourceRepo: data.repoUrl, sourcePath: data.sourcePath },
    });

    const tags = data.categories.length > 0 ? data.categories : undefined;

    if (existing) {
      existing.name = data.name;
      existing.description = data.description;
      existing.triggerType = data.triggerType;
      existing.nodeCount = data.nodeCount;
      existing.n8nWorkflowId = data.workflowId;
      existing.version = data.version;
      existing.tags = tags;
      existing.category = data.category as WorkflowEntity['category'];
      await this.workflowRepo.save(existing);
    } else {
      await this.workflowRepo.save(
        this.workflowRepo.create({
          name: data.name,
          description: data.description,
          engineType: 'n8n',
          category: data.category as WorkflowEntity['category'],
          triggerType: data.triggerType,
          nodeCount: data.nodeCount,
          n8nWorkflowId: data.workflowId,
          version: data.version,
          tags,
          sourceRepo: data.repoUrl,
          sourcePath: data.sourcePath,
          publishStatus: 'draft',
          reviewStatus: 'pending_review',
          isActive: false,
          isPublished: false,
          pricePerExecution: 0,
          executionCount: 0,
        }),
      );
    }
  }

  /**
   * git clone 镜像加速
   *  1) 直连 → 2) ghfast.top → 3) gh-proxy.com → 4) ghproxy.net
   * 若全部超时则退化为直连尝试
   */
  private async resolveCloneUrl(url: string): Promise<string> {
    const mirrors = [
      url,
      `https://ghfast.top/${url}`,
      `https://gh-proxy.com/${url}`,
      `https://ghproxy.net/${url}`,
    ];
    for (const mirror of mirrors) {
      try {
        await execFileAsync('git', ['ls-remote', '--exit-code', mirror, 'HEAD'], {
          timeout: 12_000,
          maxBuffer: 5 * 1024 * 1024,
        });
        this.logger.log(`[Workflow] 镜像可用: ${mirror}`);
        return mirror;
      } catch {
        this.logger.warn(`[Workflow] 镜像不可用: ${mirror}`);
      }
    }
    return url; // 回退直连
  }

  // ═══════════════════════════════════════════════════════════
  // 执行日志
  // ═══════════════════════════════════════════════════════════

  async listExecLogs(query: {
    workflowLibId?: number;
    userId?: number;
    taskId?: number;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.execLogRepo.createQueryBuilder('e');

    if (query.workflowLibId) qb.andWhere('e.workflow_lib_id = :wid', { wid: query.workflowLibId });
    if (query.userId) qb.andWhere('e.user_id = :uid', { uid: query.userId });
    if (query.taskId) qb.andWhere('e.task_id = :tid', { tid: query.taskId });
    if (query.status) qb.andWhere('e.status = :st', { st: query.status });

    qb.orderBy('e.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 0 };
  }

  // ═══════════════════════════════════════════════════════════
  // MCP 绑定
  // ═══════════════════════════════════════════════════════════

  async listBinds(workflowLibId: number) {
    return this.bindRepo.find({ where: { workflowLibId } as any });
  }

  async createBind(
    workflowLibId: number,
    mcpResourceId: number,
    bindType: 'input' | 'output' | 'trigger',
    config?: Record<string, unknown>,
  ) {
    const existing = await this.bindRepo.findOne({
      where: { workflowLibId, mcpResourceId } as any,
    });
    if (existing) throw new BadRequestException('该 MCP 资源已绑定到此工作流');
    return this.bindRepo.save(
      this.bindRepo.create({ workflowLibId, mcpResourceId, bindType, config }),
    );
  }

  async deleteBind(id: number) {
    const bind = await this.bindRepo.findOne({ where: { id } as any });
    if (!bind) throw new NotFoundException(`绑定 ${id} 不存在`);
    await this.bindRepo.delete(id);
  }

  // ═══════════════════════════════════════════════════════════
  // 统计
  // ═══════════════════════════════════════════════════════════

  async stats() {
    const total = await this.workflowRepo.count();
    const active = await this.workflowRepo.count({ where: { isActive: true } });
    const pending = await this.workflowRepo.count({ where: { publishStatus: 'pending_review' } });
    const approved = await this.workflowRepo.count({ where: { publishStatus: 'approved' } });
    const published = await this.workflowRepo.count({ where: { publishStatus: 'published' } });
    const rejected = await this.workflowRepo.count({ where: { publishStatus: 'rejected' } });

    const byEngineRaw = await this.workflowRepo
      .createQueryBuilder('w')
      .select('w.engineType', 'engineType')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN w.isActive = true THEN 1 ELSE 0 END)', 'active')
      .addSelect('COALESCE(SUM(w.executionCount), 0)', 'executionCount')
      .groupBy('w.engineType')
      .getRawMany<{ engineType: string; total: string; active: string; executionCount: string }>();

    const byEngineType = byEngineRaw.map((r) => ({
      engineType: r.engineType,
      total: Number(r.total),
      active: Number(r.active),
      executionCount: Number(r.executionCount),
    }));

    const topRaw = await this.workflowRepo.find({
      order: { executionCount: 'DESC' },
      take: 10,
    });
    const topWorkflows = topRaw.map((w) => ({
      id: w.id,
      name: w.name,
      engineType: w.engineType,
      executionCount: w.executionCount,
    }));

    return {
      total,
      active,
      pending,
      approved,
      published,
      rejected,
      byEngineType,
      topWorkflows,
      executionTrend: [] as Array<{ date: string; count: number }>,
    };
  }
}
