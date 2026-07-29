import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { McpServerEntity } from '../entities/mcp-server.entity';
import { McpToolRegistryEntity } from '../../admin-mcp/entities/mcp-tool-registry.entity';
import { CreateMcpServerDto, UpdateMcpServerDto } from '../dto/mcp.dto';

/**
 * MCP 服务
 *
 * 提供 MCP Server 管理、工具调用能力。
 * 支持 http / streamable-http 传输方式的远程工具调用。
 */
@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    @InjectRepository(McpServerEntity)
    private readonly serverRepo: Repository<McpServerEntity>,
    @InjectRepository(McpToolRegistryEntity)
    private readonly toolRepo: Repository<McpToolRegistryEntity>,
  ) {}

  // ============ 基础信息 ============

  /**
   * MCP 网关信息
   */
  async getInfo(userId: number) {
    const serverCount = await this.serverRepo.count({
      where: { userId },
    });

    return {
      name: 'openclaw-mcp-gateway',
      version: '1.0.0',
      serverCount,
      transports: ['stdio', 'http', 'streamable-http'],
    };
  }

  health() {
    return { status: 'ok', module: 'mcp' };
  }

  // ============ Server CRUD ============

  /**
   * 获取用户的 MCP Server 列表
   */
  async listServers(userId: number, keyword?: string) {
    const where: Record<string, unknown> = { userId };
    if (keyword) {
      where.name = Like(`%${keyword}%`);
    }
    return this.serverRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取单个 MCP Server 详情
   */
  async getServer(userId: number, id: number) {
    const server = await this.serverRepo.findOne({
      where: { id, userId },
    });
    if (!server) {
      throw new NotFoundException(`MCP Server #${id} not found`);
    }
    return server;
  }

  /**
   * 创建 MCP Server
   */
  async createServer(userId: number, dto: CreateMcpServerDto) {
    const server = this.serverRepo.create({
      ...dto,
      userId,
    });
    return this.serverRepo.save(server);
  }

  /**
   * 更新 MCP Server
   */
  async updateServer(userId: number, id: number, dto: UpdateMcpServerDto) {
    const server = await this.getServer(userId, id);
    Object.assign(server, dto);
    return this.serverRepo.save(server);
  }

  /**
   * 删除 MCP Server
   */
  async deleteServer(userId: number, id: number) {
    const server = await this.getServer(userId, id);

    // 删除关联的工具注册记录
    await this.toolRepo.delete({ serverId: id });

    await this.serverRepo.remove(server);
  }

  // ============ 探测 & 工具列表 ============

  /**
   * 探测 MCP Server 连通性
   */
  async probeServer(userId: number, serverId: number) {
    const server = await this.getServer(userId, serverId);

    if (server.transportType === 'stdio') {
      // stdio 模式无法通过 HTTP 探测，仅检查配置完整性
      if (!server.command) {
        return {
          reachable: false,
          errorMessage: 'stdio transport requires a command but none is configured',
        };
      }
      // stdio 模式认为配置完整即可达
      await this.serverRepo.update(serverId, {
        status: 'connected',
        lastConnectedAt: new Date(),
      });
      return {
        reachable: true,
        toolCount: server.toolCount,
      };
    }

    // http / streamable-http 模式：发起 HTTP 连接测试
    if (!server.url) {
      return {
        reachable: false,
        errorMessage: `No URL configured for transport type '${server.transportType}'`,
      };
    }

    // SSRF 防护
    const parsedUrl = new URL(server.url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedPatterns = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\.169\.254$/,
      /^0\.0\.0\.0$/,
      /^localhost$/,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
    ];
    if (blockedPatterns.some((pattern) => pattern.test(hostname))) {
      throw new ForbiddenException(
        `MCP Server URL '${hostname}' is not allowed: internal/metadata addresses are blocked`,
      );
    }

    const endpoint = `${server.url.replace(/\/$/, '')}/tools/list`;
    const startTime = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(server.headers ?? {}),
        },
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        await this.serverRepo.update(serverId, { status: 'failed' });
        return {
          reachable: false,
          latencyMs,
          errorMessage: `HTTP ${response.status} ${response.statusText}: ${errorText}`,
        };
      }

      const data = await response.json();
      const tools = Array.isArray(data) ? data : data?.tools ?? [];
      const toolCount = Array.isArray(tools) ? tools.length : 0;

      // 更新服务器状态
      await this.serverRepo.update(serverId, {
        status: 'connected',
        lastConnectedAt: new Date(),
        toolCount,
      });

      return {
        reachable: true,
        latencyMs,
        toolCount,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      await this.serverRepo.update(serverId, { status: 'failed' });

      if (err instanceof Error && err.name === 'AbortError') {
        return {
          reachable: false,
          latencyMs,
          errorMessage: 'Connection timed out after 10s',
        };
      }

      return {
        reachable: false,
        latencyMs,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 获取 MCP Server 的工具列表
   */
  async listTools(userId: number, serverId: number) {
    // 验证 Server 归属
    await this.getServer(userId, serverId);

    const tools = await this.toolRepo.find({
      where: { serverId },
      order: { toolName: 'ASC' },
    });

    return tools.map((t) => ({
      name: t.toolName,
      displayName: t.displayName,
      description: t.description,
      inputSchema: t.inputSchema,
      category: t.category,
      isEnabled: t.isEnabled,
      callCount: t.callCount,
    }));
  }

  // ============ 工具调用 ============

  /**
   * 调用 MCP Server 暴露的工具
   *
   * @param userId 用户 ID
   * @param params 调用参数：serverId, toolName, args
   * @returns 工具执行结果
   */
  async callTool(
    userId: number,
    params: {
      serverId: string;
      toolName: string;
      args: Record<string, unknown>;
    },
  ): Promise<unknown> {
    const { serverId, toolName, args } = params;

    // 1. 查找 MCP Server 配置
    const server = await this.serverRepo.findOne({
      where: { id: Number(serverId), userId },
    });

    if (!server) {
      throw new NotFoundException(`MCP Server #${serverId} not found`);
    }

    if (!server.enabled) {
      throw new ForbiddenException(`MCP Server #${serverId} is disabled`);
    }

    // 2. 查找 Tool 注册信息
    const tool = await this.toolRepo.findOne({
      where: { serverId: server.id, toolName },
    });

    if (!tool) {
      throw new NotFoundException(
        `Tool '${toolName}' not found on MCP Server #${serverId}`,
      );
    }

    if (!tool.isEnabled) {
      throw new ForbiddenException(`Tool '${toolName}' is disabled`);
    }

    // 3. 通过 HTTP 调用 MCP Server 执行工具
    // 仅支持 http / streamable-http 传输模式
    if (server.transportType === 'stdio') {
      throw new BadRequestException(
        `Cannot call stdio transport server '${server.name}' via HTTP. Use an agent-side MCP client instead.`,
      );
    }

    if (!server.url) {
      throw new BadRequestException(
        `MCP Server #${serverId} has no URL configured for transport type '${server.transportType}'`,
      );
    }

    // SSRF 防护：拒绝内网地址和云元数据接口
    const parsedUrl = new URL(server.url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedPatterns = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\.169\.254$/, // 云元数据接口
      /^0\.0\.0\.0$/,
      /^localhost$/,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
    ];
    if (blockedPatterns.some((pattern) => pattern.test(hostname))) {
      throw new ForbiddenException(
        `MCP Server URL '${hostname}' is not allowed: internal/metadata addresses are blocked`,
      );
    }

    const endpoint = `${server.url.replace(/\/$/, '')}/tools/call`;

    this.logger.log(
      `Calling MCP tool '${toolName}' on server '${server.name}' (endpoint: ${endpoint})`,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(server.headers ?? {}),
        },
        body: JSON.stringify({
          name: toolName,
          arguments: args,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new BadGatewayException(
          `MCP Server returned ${response.status} ${response.statusText}: ${errorText}`,
        );
      }

      const result = await response.json();

      // 4. 增加调用计数
      await this.toolRepo.increment(
        { id: tool.id },
        'callCount',
        1,
      );

      return result;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ServiceUnavailableException(
          `MCP tool call timed out after 30s (tool: '${toolName}', server: '${server.name}')`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
