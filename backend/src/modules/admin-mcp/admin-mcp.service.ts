import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { McpServerConfigEntity } from './entities/mcp-server-config.entity';
import { McpToolRegistryEntity } from './entities/mcp-tool-registry.entity';
import { McpResourceRegistryEntity } from './entities/mcp-resource-registry.entity';
import { McpCallLogEntity } from './entities/mcp-call-log.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import {
  CreateServerConfigDto,
  UpdateServerConfigDto,
  CreateToolRegistryDto,
  UpdateToolRegistryDto,
  CreateResourceRegistryDto,
  UpdateResourceRegistryDto,
  McpQueryDto,
} from './dto/admin-mcp.dto';

/**
 * MCP 全局管理服务
 * 提供 MCP Server 配置、工具注册、资源注册、调用日志的 CRUD 操作
 */
@Injectable()
export class AdminMcpService {
  constructor(
    @InjectRepository(McpServerConfigEntity)
    private serverRepo: Repository<McpServerConfigEntity>,
    @InjectRepository(McpToolRegistryEntity)
    private toolRepo: Repository<McpToolRegistryEntity>,
    @InjectRepository(McpResourceRegistryEntity)
    private resourceRepo: Repository<McpResourceRegistryEntity>,
    @InjectRepository(McpCallLogEntity)
    private logRepo: Repository<McpCallLogEntity>,
  ) {}

  // ============ 服务配置 CRUD ============

  /** 服务列表 */
  async listServers(query: McpQueryDto) {
    const qb = this.serverRepo.createQueryBuilder('s');

    if (query.keyword) {
      qb.andWhere(
        '(s.name LIKE :keyword OR s.description LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }
    if (query.serviceType) {
      qb.andWhere('s.service_type = :serviceType', {
        serviceType: query.serviceType,
      });
    }
    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }

    qb.orderBy('s.created_at', 'DESC');
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  /** 创建服务 */
  async createServer(dto: CreateServerConfigDto) {
    const entity = new McpServerConfigEntity();
    entity.name = dto.name;
    entity.description = dto.description;
    entity.transportType = dto.transportType;
    entity.command = dto.command;
    entity.args = dto.args;
    entity.env = dto.env;
    entity.url = dto.url;
    entity.headers = dto.headers;
    entity.serviceType = dto.serviceType;
    entity.enabled = true;
    entity.status = 'pending';
    entity.isSystem = false;
    entity.toolCount = 0;

    return this.serverRepo.save(entity);
  }

  /** 更新服务 */
  async updateServer(id: number, dto: UpdateServerConfigDto) {
    const server = await this.serverRepo.findOne({ where: { id } });
    if (!server) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'MCP服务不存在');
    }

    if (dto.name !== undefined) server.name = dto.name;
    if (dto.description !== undefined) server.description = dto.description;
    if (dto.transportType !== undefined) server.transportType = dto.transportType;
    if (dto.command !== undefined) server.command = dto.command;
    if (dto.args !== undefined) server.args = dto.args;
    if (dto.env !== undefined) server.env = dto.env;
    if (dto.url !== undefined) server.url = dto.url;
    if (dto.headers !== undefined) server.headers = dto.headers;
    if (dto.serviceType !== undefined) server.serviceType = dto.serviceType;
    if (dto.enabled !== undefined) {
      server.enabled = dto.enabled;
      server.status = dto.enabled ? 'pending' : 'disabled';
    }

    return this.serverRepo.save(server);
  }

  /** 删除服务 */
  async deleteServer(id: number) {
    const server = await this.serverRepo.findOne({ where: { id } });
    if (!server) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'MCP服务不存在');
    }
    // 同时删除关联的工具和资源
    await this.toolRepo.delete({ serverId: id });
    await this.resourceRepo.delete({ serverId: id });
    await this.serverRepo.delete(id);
  }

  // ============ 工具注册 CRUD ============

  /** 工具列表 */
  async listTools(query: { serverId?: number; keyword?: string }) {
    const qb = this.toolRepo.createQueryBuilder('t');

    if (query.serverId) {
      qb.andWhere('t.server_id = :serverId', { serverId: query.serverId });
    }
    if (query.keyword) {
      qb.andWhere(
        '(t.tool_name LIKE :keyword OR t.display_name LIKE :keyword OR t.description LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    qb.orderBy('t.created_at', 'DESC');
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  /** 注册工具 */
  async createTool(dto: CreateToolRegistryDto) {
    const entity = new McpToolRegistryEntity();
    entity.serverId = Number(dto.serverId);
    entity.toolName = dto.toolName;
    entity.displayName = dto.displayName;
    entity.description = dto.description;
    entity.inputSchema = dto.inputSchema;
    entity.category = dto.category;
    entity.isEnabled = true;
    entity.callCount = 0;

    return this.toolRepo.save(entity);
  }

  /** 更新工具 */
  async updateTool(id: number, dto: UpdateToolRegistryDto) {
    const tool = await this.toolRepo.findOne({ where: { id } });
    if (!tool) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'MCP工具不存在');
    }

    if (dto.displayName !== undefined) tool.displayName = dto.displayName;
    if (dto.description !== undefined) tool.description = dto.description;
    if (dto.inputSchema !== undefined) tool.inputSchema = dto.inputSchema;
    if (dto.category !== undefined) tool.category = dto.category;
    if (dto.isEnabled !== undefined) tool.isEnabled = dto.isEnabled;

    return this.toolRepo.save(tool);
  }

  /** 删除工具 */
  async deleteTool(id: number) {
    const tool = await this.toolRepo.findOne({ where: { id } });
    if (!tool) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'MCP工具不存在');
    }
    await this.toolRepo.delete(id);
  }

  // ============ 资源注册 CRUD ============

  /** 资源列表 */
  async listResources(query: { serverId?: number; keyword?: string }) {
    const qb = this.resourceRepo.createQueryBuilder('r');

    if (query.serverId) {
      qb.andWhere('r.server_id = :serverId', { serverId: query.serverId });
    }
    if (query.keyword) {
      qb.andWhere(
        '(r.resource_uri LIKE :keyword OR r.display_name LIKE :keyword OR r.description LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    qb.orderBy('r.created_at', 'DESC');
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  /** 注册资源 */
  async createResource(dto: CreateResourceRegistryDto) {
    const entity = new McpResourceRegistryEntity();
    entity.serverId = Number(dto.serverId);
    entity.resourceUri = dto.resourceUri;
    entity.resourceType = dto.resourceType;
    entity.displayName = dto.displayName;
    entity.description = dto.description;
    entity.metadata = dto.metadata;
    entity.isEnabled = true;

    return this.resourceRepo.save(entity);
  }

  /** 更新资源 */
  async updateResource(id: number, dto: UpdateResourceRegistryDto) {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'MCP资源不存在');
    }

    if (dto.resourceUri !== undefined) resource.resourceUri = dto.resourceUri;
    if (dto.resourceType !== undefined) resource.resourceType = dto.resourceType;
    if (dto.displayName !== undefined) resource.displayName = dto.displayName;
    if (dto.description !== undefined) resource.description = dto.description;
    if (dto.metadata !== undefined) resource.metadata = dto.metadata;
    if (dto.isEnabled !== undefined) resource.isEnabled = dto.isEnabled;

    return this.resourceRepo.save(resource);
  }

  /** 删除资源 */
  async deleteResource(id: number) {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'MCP资源不存在');
    }
    await this.resourceRepo.delete(id);
  }

  // ============ 调用日志查询 ============

  /** 调用日志列表 */
  async listLogs(query: {
    serverId?: number;
    userId?: number;
    callType?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.logRepo.createQueryBuilder('l');

    if (query.serverId) {
      qb.andWhere('l.server_id = :serverId', { serverId: query.serverId });
    }
    if (query.userId) {
      qb.andWhere('l.user_id = :userId', { userId: query.userId });
    }
    if (query.callType) {
      qb.andWhere('l.call_type = :callType', { callType: query.callType });
    }
    if (query.status) {
      qb.andWhere('l.status = :status', { status: query.status });
    }

    qb.orderBy('l.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ============ 自动发现 ============

  /**
   * 自动发现工具（占位实现）
   * 后续接入真实 MCP Server 连接逻辑后补充
   */
  async autoDiscover(serverId: number) {
    const server = await this.serverRepo.findOne({ where: { id: serverId } });
    if (!server) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'MCP服务不存在');
    }

    // 占位：返回空数组，后续实现真实连接后的工具发现
    return [];
  }
}
