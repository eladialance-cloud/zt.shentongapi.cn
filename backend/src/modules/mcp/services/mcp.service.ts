import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { McpServerEntity } from '../entities/mcp-server.entity';
import { McpCatalogEntity } from '../../admin-mcp/entities/mcp-catalog.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { probeStdioServer } from './mcp-stdio-client';
import { assertHttpUrlSafe, assertMcpCommandSafe, buildStdioProbePlan } from '../utils/mcp-security';
import { CreateMcpServerDto, UpdateMcpServerDto } from '../dto/mcp.dto';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  // 内存缓存：最近一次探测的工具列表（serverId -> tools），避免重复握手
  private readonly toolsCache = new Map<number, Array<{ name: string; description?: string }>>();

  constructor(
    @InjectRepository(McpServerEntity) private readonly serverRepo: Repository<McpServerEntity>,
    @InjectRepository(McpCatalogEntity) private readonly catalogRepo: Repository<McpCatalogEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'mcp' };
  }

  async getInfo(userId: number) {
    const serverCount = await this.serverRepo.count({ where: { userId } });
    return {
      name: 'MCP Service',
      version: '1.0.0',
      serverCount,
      transports: ['stdio', 'http', 'streamable-http'],
    };
  }

  // ============ 官方目录 ============

  async listCatalog(userId: number, query: { category?: string; keyword?: string; page?: number; pageSize?: number }) {
    const qb = this.catalogRepo.createQueryBuilder('c').where('c.enabled = 1');
    if (query.category) qb.andWhere('c.category = :cat', { cat: query.category });
    if (query.keyword) qb.andWhere('(c.name LIKE :kw OR c.description LIKE :kw)', { kw: `%${query.keyword}%` });
    qb.orderBy('c.sort_order', 'ASC').addOrderBy('c.created_at', 'DESC');
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    qb.skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    const installed = await this.serverRepo.find({ where: { userId, source: 'official' } });
    const installedIds = new Set(installed.map((s) => Number(s.catalogId)));
    return {
      total,
      list: list.map((c) => this.sanitizeCatalog({ ...c, isInstalled: c.id != null && installedIds.has(c.id) })),
    };
  }

  async getCatalog(userId: number, id: number) {
    const item = await this.catalogRepo.findOne({ where: { id, enabled: true } });
    if (!item) BusinessException.throw(ErrorCode.NOT_FOUND, '目录条目不存在或已下架');
    const mine = await this.serverRepo.findOne({ where: { userId, catalogId: id, source: 'official' } });
    return this.sanitizeCatalog({ ...item, isInstalled: !!mine, mcpServerId: mine?.id ?? null });
  }

  /** 目录脱敏：剥离 headers；envTemplate 中 secret=true 的项去掉 default（默认值仅随下载包下发） */
  private sanitizeCatalog(item: Record<string, unknown>): Record<string, unknown> {
    const rest = { ...item };
    delete rest.headers;
    const envTemplate = rest.envTemplate;
    if (Array.isArray(envTemplate)) {
      rest.envTemplate = envTemplate.map((t) => {
        const entry = t as Record<string, unknown>;
        if (entry.secret && entry.default !== undefined) {
          const { default: _ignored, ...withoutDefault } = entry;
          return withoutDefault;
        }
        return t;
      });
    }
    return rest;
  }

  // ============ Server CRUD ============

  async listServers(userId: number, keyword?: string) {
    if (!keyword) {
      return this.serverRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    }
    return this.serverRepo
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere('(s.name LIKE :kw OR s.description LIKE :kw)', { kw: `%${keyword}%` })
      .orderBy('s.created_at', 'DESC')
      .getMany();
  }

  async getServer(userId: number, id: number) {
    const server = await this.serverRepo.findOne({ where: { id, userId } });
    if (!server) BusinessException.throw(ErrorCode.NOT_FOUND, 'MCP 服务器不存在');
    return server;
  }

  async createServer(userId: number, dto: CreateMcpServerDto) {
    if (dto.transportType === 'stdio' && !dto.command) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, 'stdio 类型必须配置 command');
    }
    if ((dto.transportType === 'http' || dto.transportType === 'streamable-http') && !dto.url) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, 'http 类型必须配置 url');
    }
    if (dto.transportType === 'stdio') {
      assertMcpCommandSafe(dto.command, dto.args);
    }
    const server = this.serverRepo.create({
      userId,
      name: dto.name,
      description: dto.description,
      transportType: dto.transportType,
      command: dto.command,
      args: dto.args,
      env: dto.env,
      url: dto.url,
      headers: dto.headers,
      enabled: dto.enabled ?? true,
      status: 'pending',
      // 安全：忽略客户端传入的 source/catalogId，强制 custom，防伪造 official 干扰幂等
      source: 'custom',
      catalogId: undefined,
    });
    return this.serverRepo.save(server);
  }

  async updateServer(userId: number, id: number, dto: UpdateMcpServerDto) {
    const server = await this.getServer(userId, id);
    if (server.source === 'official') {
      // 官方实例只允许改展示/开关字段，忽略 command/args/transportType/url/headers/source/catalogId 变更
      if (dto.name !== undefined) server.name = dto.name;
      if (dto.description !== undefined) server.description = dto.description;
      if (dto.env !== undefined) server.env = dto.env;
      if (dto.enabled !== undefined) {
        server.enabled = dto.enabled;
        server.status = dto.enabled ? 'pending' : 'disabled';
      }
    } else {
      if (dto.name !== undefined) server.name = dto.name;
      if (dto.description !== undefined) server.description = dto.description;
      if (dto.transportType !== undefined) server.transportType = dto.transportType;
      if (dto.command !== undefined) server.command = dto.command;
      if (dto.args !== undefined) server.args = dto.args;
      if (dto.env !== undefined) server.env = dto.env;
      if (dto.url !== undefined) server.url = dto.url;
      if (dto.headers !== undefined) server.headers = dto.headers;
      if (dto.enabled !== undefined) {
        server.enabled = dto.enabled;
        server.status = dto.enabled ? 'pending' : 'disabled';
      }
      if (dto.command !== undefined || dto.args !== undefined) {
        assertMcpCommandSafe(server.command, server.args);
      }
    }
    // 忽略 dto.source / dto.catalogId：来源与目录关联不可由客户端改写
    const saved = await this.serverRepo.save(server);
    this.toolsCache.delete(server.id);
    return saved;
  }

  async deleteServer(userId: number, id: number) {
    const server = await this.getServer(userId, id);
    await this.serverRepo.delete(server.id);
    this.toolsCache.delete(server.id);
  }

  async probeServer(userId: number, serverId: number) {
    const server = await this.getServer(userId, serverId);
    let status: 'connected' | 'failed' = 'connected';
    let toolCount = 0;
    let tools: Array<{ name: string; description?: string }> = [];
    let error: string | undefined;

    if (server.transportType === 'stdio') {
      // 安全：后端 stdio 探测仅执行官方目录条目（目录 command/args），自定义服务器一律不执行
      const catalog =
        server.source === 'official' && server.catalogId
          ? await this.catalogRepo.findOne({ where: { id: server.catalogId, enabled: true } })
          : null;
      const plan = buildStdioProbePlan(server, catalog);
      if (!plan.allow) {
        status = 'failed';
        error = plan.reason || '探测未允许';
      } else if (!plan.command) {
        status = 'failed';
        error = '官方目录条目缺少启动命令';
      } else {
        const result = await probeStdioServer({
          command: plan.command,
          args: plan.args || [],
          env: plan.env || {},
        });
        if (result.ok) {
          toolCount = result.toolCount;
          tools = result.tools;
          this.toolsCache.set(server.id, result.tools);
        } else {
          status = 'failed';
          error = result.error;
        }
      }
    } else {
      // HTTP/streamable-http 探测：SSRF 防护（字面 IP + DNS 解析 + IPv6）后 POST MCP initialize 校验
      const target = server.url || '';
      try {
        await assertHttpUrlSafe(target);
      } catch (e) {
        status = 'failed';
        error = (e as Error).message;
      }
      if (status === 'connected') {
        try {
          const res = await fetch(target, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'shentong-ai', version: '1.0.0' },
              },
            }),
            redirect: 'manual',
            signal: AbortSignal.timeout(10000),
          });
          const text = await res.text();
          if (text.length > 1024 * 1024) {
            status = 'failed';
            error = '响应过大';
          } else {
            let jsonOk = false;
            try {
              const body = JSON.parse(text) as { jsonrpc?: unknown; result?: unknown; error?: unknown };
              jsonOk =
                body !== null &&
                typeof body === 'object' &&
                body.jsonrpc !== undefined &&
                (body.result !== undefined || body.error !== undefined);
            } catch {
              jsonOk = false;
            }
            const sseOk = text.includes('jsonrpc') && (text.includes('event:') || text.includes('data:'));
            if (!jsonOk && !sseOk) {
              status = 'failed';
              error = '目标不是有效的 MCP HTTP 端点';
            }
          }
        } catch (e) {
          status = 'failed';
          error = (e as Error).message;
        }
      }
    }

    server.status = status;
    server.toolCount = toolCount;
    if (status === 'connected') {
      server.lastConnectedAt = new Date();
    } else {
      this.toolsCache.delete(server.id);
    }
    await this.serverRepo.save(server);
    return { serverId, status, toolCount, tools, error };
  }

  async listTools(userId: number, serverId: number) {
    await this.getServer(userId, serverId);
    return this.toolsCache.get(serverId) ?? [];
  }

  async callTool(userIdOrOptions: any, options?: any) {
    return { ok: false, message: '工具调用由本地 OpenClaw 执行，后端不提供直调' };
  }
}