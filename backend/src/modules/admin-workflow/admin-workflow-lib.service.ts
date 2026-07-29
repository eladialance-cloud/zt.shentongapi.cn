import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { N8nWorkflowLibEntity } from './entities/n8n-workflow-lib.entity';
import { N8nWorkflowExecLogEntity } from './entities/n8n-workflow-exec-log.entity';
import { WorkflowMcpBindEntity } from './entities/workflow-mcp-bind.entity';
import {
  CreateWorkflowLibDto,
  UpdateWorkflowLibDto,
  ImportGithubWorkflowDto,
} from './dto/workflow-lib.dto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import fg from 'fast-glob';

const execFileAsync = promisify(execFile);

/**
 * 管理端工作流库扩展服务
 * 全局工作流库 CRUD + GitHub 导入 + 执行日志 + MCP 绑定
 */
@Injectable()
export class AdminWorkflowLibService {
  private readonly logger = new Logger(AdminWorkflowLibService.name);

  constructor(
    @InjectRepository(N8nWorkflowLibEntity)
    private libRepo: Repository<N8nWorkflowLibEntity>,
    @InjectRepository(N8nWorkflowExecLogEntity)
    private execLogRepo: Repository<N8nWorkflowExecLogEntity>,
    @InjectRepository(WorkflowMcpBindEntity)
    private bindRepo: Repository<WorkflowMcpBindEntity>,
  ) {}

  // ============ 工作流库 CRUD ============

  async list(query: {
    keyword?: string;
    category?: string;
    publishStatus?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.libRepo.createQueryBuilder('w');

    if (query.keyword) {
      qb.andWhere('(w.name LIKE :kw OR w.description LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    if (query.category) {
      qb.andWhere('w.category = :category', { category: query.category });
    }
    if (query.publishStatus) {
      qb.andWhere('w.publish_status = :status', { status: query.publishStatus });
    }

    qb.orderBy('w.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 0 };
  }

  async detail(id: number): Promise<N8nWorkflowLibEntity> {
    const workflow = await this.libRepo.findOne({ where: { id } });
    if (!workflow) {
      throw new NotFoundException(`工作流库 ${id} 不存在`);
    }
    return workflow;
  }

  async create(dto: CreateWorkflowLibDto): Promise<N8nWorkflowLibEntity> {
    const entity = this.libRepo.create({
      name: dto.name,
      description: dto.description,
      category: dto.category,
      workflowJson: dto.workflowJson,
      sourceRepo: dto.sourceRepo,
      sourcePath: dto.sourcePath,
      version: dto.version,
      icon: dto.icon,
      tags: dto.tags,
      inputSchema: dto.inputSchema,
      publishStatus: 'draft',
      isPublished: false,
    });
    return this.libRepo.save(entity);
  }

  async update(id: number, dto: UpdateWorkflowLibDto): Promise<void> {
    const workflow = await this.detail(id);
    if (dto.name !== undefined) workflow.name = dto.name;
    if (dto.description !== undefined) workflow.description = dto.description;
    if (dto.category !== undefined) workflow.category = dto.category;
    if (dto.workflowJson !== undefined) workflow.workflowJson = dto.workflowJson;
    if (dto.version !== undefined) workflow.version = dto.version;
    if (dto.icon !== undefined) workflow.icon = dto.icon;
    if (dto.tags !== undefined) workflow.tags = dto.tags;
    if (dto.inputSchema !== undefined) workflow.inputSchema = dto.inputSchema;
    if (dto.publishStatus !== undefined) workflow.publishStatus = dto.publishStatus as any;
    if (dto.isPublished !== undefined) workflow.isPublished = dto.isPublished;
    await this.libRepo.save(workflow);
  }

  async delete(id: number): Promise<void> {
    const workflow = await this.detail(id);
    // 删除关联的 MCP 绑定
    await this.bindRepo.delete({ workflowLibId: id });
    await this.libRepo.delete(id);
  }

  // ============ GitHub 导入 ============

  /**
   * GitHub 导入工作流
   * 支持单个文件或批量拉取
   * - dto.filePath 指定时 → 拉取单个 JSON 文件
   * - dto.filePath 空时 → 拉取 workflows/ 或 n8n/ 目录下所有 .json 文件
   */
  async importFromGithub(dto: ImportGithubWorkflowDto): Promise<{ imported: number; items: N8nWorkflowLibEntity[] }> {
    this.logger.log(`[WorkflowLib] GitHub 导入: ${dto.repoUrl}, path: ${dto.filePath || '(auto scan)'}`);

    // 清理 URL
    const cleanUrl = dto.repoUrl.replace(/\.git$/, '').replace(/\/$/, '');

    // git clone 到临时目录
    const tmpDir = path.join(os.tmpdir(), `workflow-import-${Date.now()}`);
    const cloneUrl = await this.resolveCloneUrl(cleanUrl);

    try {
      await execFileAsync('git', ['clone', '--depth', '1', cloneUrl, tmpDir], {
        timeout: 60_000,
        maxBuffer: 50 * 1024 * 1024,
      });
      this.logger.log(`[WorkflowLib] git clone 成功: ${cloneUrl}`);
    } catch (e) {
      throw new BadRequestException(`git clone 失败: ${(e as Error).message}`);
    }

    // 扫描 .json 文件
    const workflowFiles: Array<{ path: string; content: string; name: string }> = [];

    try {
      let jsonFiles: string[];
      if (dto.filePath) {
        // 单个文件
        const fullPath = path.join(tmpDir, dto.filePath);
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          workflowFiles.push({
            path: dto.filePath,
            content,
            name: this.extractWorkflowName(dto.filePath, content),
          });
        } catch {
          throw new BadRequestException(`文件不存在: ${dto.filePath}`);
        }
      } else {
        // 批量扫描所有 .json 文件（不限目录）
        jsonFiles = await fg(['**/*.json'], {
          cwd: tmpDir,
          ignore: ['**/node_modules/**', '**/.git/**', '**/package*.json', '**/tsconfig*.json'],
          absolute: false,
        });
        this.logger.log(`[WorkflowLib] 找到 ${jsonFiles.length} 个 .json 文件`);

        for (const relPath of jsonFiles) {
          try {
            const fullPath = path.join(tmpDir, relPath);
            const content = await fs.readFile(fullPath, 'utf-8');
            workflowFiles.push({
              path: relPath,
              content,
              name: this.extractWorkflowName(relPath, content),
            });
          } catch (e) {
            this.logger.warn(`[WorkflowLib] 读取文件 ${relPath} 失败: ${(e as Error).message}`);
          }
        }
      }
    } finally {
      // 清理临时目录
      try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
    }

    if (workflowFiles.length === 0) {
      throw new BadRequestException('仓库中没有找到 .json 工作流文件');
    }

    // 内容入库
    const savedItems: N8nWorkflowLibEntity[] = [];
    for (const wf of workflowFiles) {
      // 解析 JSON 内容提取名称和描述
      let workflowJson: string | undefined;
      let description: string | undefined;
      try {
        const parsed = JSON.parse(wf.content);
        workflowJson = wf.content;
        description = parsed.name || parsed.description || `从 ${wf.path} 导入`;
      } catch {
        // 非 JSON，也存储内容
        workflowJson = wf.content;
        description = `从 ${dto.repoUrl} 导入 (非JSON)`;
      }

      // 去重: 按 sourceRepo + sourcePath 唯一定位
      const existing = await this.libRepo.findOne({
        where: { sourceRepo: dto.repoUrl, sourcePath: wf.path },
      });

      if (existing) {
        // 覆盖更新（类似 overwriteExisting）
        existing.name = wf.name;
        existing.description = description;
        existing.workflowJson = workflowJson;
        existing.category = dto.category || existing.category;
        existing.sourceRepo = dto.repoUrl;
        existing.sourcePath = wf.path;
        savedItems.push(await this.libRepo.save(existing));
      } else {
        const entity = this.libRepo.create({
          name: wf.name,
          description,
          category: dto.category,
          workflowJson,
          sourceRepo: dto.repoUrl,
          sourcePath: wf.path,
          publishStatus: 'draft',
          isPublished: false,
        });
        savedItems.push(await this.libRepo.save(entity));
      }
    }

    this.logger.log(`[WorkflowLib] 导入完成: ${savedItems.length} 条工作流`);
    return { imported: savedItems.length, items: savedItems }; 
  }

  /** git clone 镜像加速 */
  private async resolveCloneUrl(url: string): Promise<string> {
    const mirrors = [
      url, // 直连
      `https://ghfast.top/${url}`, // 镜像1
      `https://gh-proxy.com/${url}`, // 镜像2
      `https://ghproxy.net/${url}`, // 镜像3
    ];

    for (const mirror of mirrors) {
      try {
        await execFileAsync('git', ['ls-remote', mirror, 'HEAD'], {
          timeout: 15_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        this.logger.log(`[WorkflowLib] 连接成功: ${mirror}`);
        return mirror;
      } catch (e) {
        this.logger.warn(`[WorkflowLib] 连接失败: ${mirror} - ${(e as Error).message}`);
      }
    }

    // 所有镜像 ls-remote 都失败，仍然返回原始 URL 让 git clone 尝试
    this.logger.warn('[WorkflowLib] 所有镜像 ls-remote 失败，直接尝试 git clone 原始 URL');
    return url;
  }

  /** 从文件内容中提取 workflow 名称 */
  private extractWorkflowName(filePath: string, content: string): string {
    try {
      const parsed = JSON.parse(content);
      if (parsed.name) return parsed.name;
    } catch {}
    // fallback: 文件名去掉 .json
    const fileName = filePath.split('/').pop() || filePath;
    return fileName.replace(/\.json$/i, '');
  }

  // ============ 执行日志 ============

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

    if (query.workflowLibId) {
      qb.andWhere('e.workflow_lib_id = :wid', { wid: query.workflowLibId });
    }
    if (query.userId) {
      qb.andWhere('e.user_id = :uid', { uid: query.userId });
    }
    if (query.taskId) {
      qb.andWhere('e.task_id = :tid', { tid: query.taskId });
    }
    if (query.status) {
      qb.andWhere('e.status = :status', { status: query.status });
    }

    qb.orderBy('e.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 0 };
  }

  // ============ MCP 绑定 ============

  async listBinds(workflowLibId: number): Promise<WorkflowMcpBindEntity[]> {
    return this.bindRepo.find({ where: { workflowLibId } });
  }

  async createBind(
    workflowLibId: number,
    mcpResourceId: number,
    bindType: 'input' | 'output' | 'trigger',
    config?: Record<string, unknown>,
  ): Promise<WorkflowMcpBindEntity> {
    // 检查是否已存在
    const existing = await this.bindRepo.findOne({
      where: { workflowLibId, mcpResourceId },
    });
    if (existing) {
      throw new BadRequestException('该 MCP 资源已绑定到此工作流');
    }
    const entity = this.bindRepo.create({
      workflowLibId,
      mcpResourceId,
      bindType,
      config,
    });
    return this.bindRepo.save(entity);
  }

  async deleteBind(id: number): Promise<void> {
    const bind = await this.bindRepo.findOne({ where: { id } });
    if (!bind) {
      throw new NotFoundException(`绑定 ${id} 不存在`);
    }
    await this.bindRepo.delete(id);
  }
}
