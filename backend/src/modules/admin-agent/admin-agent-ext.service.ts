import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AgentEntity } from '../agent/entities/agent.entity';
import { AgentDepartmentEntity } from './entities/agent-department.entity';
import { AgentTagEntity } from './entities/agent-tag.entity';
import { AgentTagMapEntity } from './entities/agent-tag-map.entity';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './dto/agent-department.dto';
import { CreateTagDto, UpdateTagDto, BindTagsDto } from './dto/agent-tag.dto';

/**
 * 管理端 Agent 扩展服务
 * 部门分类管理 + 标签库管理 + 版本管理
 */
@Injectable()
export class AdminAgentExtService {
  private readonly logger = new Logger(AdminAgentExtService.name);

  constructor(
    @InjectRepository(AgentDepartmentEntity)
    private deptRepo: Repository<AgentDepartmentEntity>,
    @InjectRepository(AgentTagEntity)
    private tagRepo: Repository<AgentTagEntity>,
    @InjectRepository(AgentTagMapEntity)
    private tagMapRepo: Repository<AgentTagMapEntity>,
    @InjectRepository(AgentEntity)
    private agentRepo: Repository<AgentEntity>,
  ) {}

  // ============ 部门分类管理 ============

  async listDepartments(): Promise<AgentDepartmentEntity[]> {
    return this.deptRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async createDepartment(dto: CreateDepartmentDto): Promise<AgentDepartmentEntity> {
    const existing = await this.deptRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException(`部门编码 ${dto.code} 已存在`);
    }
    const entity = this.deptRepo.create({
      name: dto.name,
      code: dto.code,
      icon: dto.icon,
      sortOrder: dto.sortOrder ?? 0,
      isActive: true,
    });
    return this.deptRepo.save(entity);
  }

  async updateDepartment(id: number, dto: UpdateDepartmentDto): Promise<AgentDepartmentEntity> {
    const dept = await this.deptRepo.findOne({ where: { id } });
    if (!dept) {
      throw new NotFoundException(`部门 ${id} 不存在`);
    }
    if (dto.name !== undefined) dept.name = dto.name;
    if (dto.icon !== undefined) dept.icon = dto.icon;
    if (dto.sortOrder !== undefined) dept.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) dept.isActive = dto.isActive;
    return this.deptRepo.save(dept);
  }

  async deleteDepartment(id: number): Promise<void> {
    const dept = await this.deptRepo.findOne({ where: { id } });
    if (!dept) {
      throw new NotFoundException(`部门 ${id} 不存在`);
    }
    // 检查是否有 Agent 关联
    const count = await this.agentRepo.count({ where: { deptId: id } });
    if (count > 0) {
      throw new BadRequestException(`部门下仍有 ${count} 个 Agent，无法删除`);
    }
    await this.deptRepo.delete(id);
  }

  // ============ 标签库管理 ============

  async listTags(): Promise<AgentTagEntity[]> {
    return this.tagRepo.find({ order: { id: 'ASC' } });
  }

  async createTag(dto: CreateTagDto): Promise<AgentTagEntity> {
    const entity = this.tagRepo.create({
      name: dto.name,
      color: dto.color ?? '#6366f1',
    });
    return this.tagRepo.save(entity);
  }

  async updateTag(id: number, dto: UpdateTagDto): Promise<AgentTagEntity> {
    const tag = await this.tagRepo.findOne({ where: { id } });
    if (!tag) {
      throw new NotFoundException(`标签 ${id} 不存在`);
    }
    if (dto.name !== undefined) tag.name = dto.name;
    if (dto.color !== undefined) tag.color = dto.color;
    return this.tagRepo.save(tag);
  }

  async deleteTag(id: number): Promise<void> {
    const tag = await this.tagRepo.findOne({ where: { id } });
    if (!tag) {
      throw new NotFoundException(`标签 ${id} 不存在`);
    }
    // 删除关联
    await this.tagMapRepo.delete({ tagId: id });
    await this.tagRepo.delete(id);
  }

  // ============ Agent-标签绑定 ============

  async bindTags(agentId: number, dto: BindTagsDto): Promise<void> {
    const agent = await this.agentRepo.findOne({ where: { id: agentId } });
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} 不存在`);
    }
    // 先删除旧关联
    await this.tagMapRepo.delete({ agentId });
    // 批量插入新关联
    if (dto.tagIds.length > 0) {
      const maps = dto.tagIds.map((tagId) =>
        this.tagMapRepo.create({ agentId, tagId }),
      );
      await this.tagMapRepo.save(maps);
    }
  }

  async getAgentTags(agentId: number): Promise<AgentTagEntity[]> {
    const maps = await this.tagMapRepo.find({ where: { agentId } });
    if (maps.length === 0) return [];
    const tagIds = maps.map((m) => m.tagId);
    return this.tagRepo.find({ where: { id: In(tagIds) } });
  }

  // ============ 版本管理 ============

  async getAgentVersion(agentId: number): Promise<{ version: number; history: any[] }> {
    const agent = await this.agentRepo.findOne({ where: { id: agentId } });
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} 不存在`);
    }
    return {
      version: agent.version ?? 1,
      history: [], // TODO: 后续可增加 agent_version_history 表
    };
  }

  async bumpVersion(agentId: number): Promise<{ version: number }> {
    const agent = await this.agentRepo.findOne({ where: { id: agentId } });
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} 不存在`);
    }
    const currentVersion = agent.version ?? 1;
    agent.version = currentVersion + 1;
    await this.agentRepo.save(agent);
    return { version: currentVersion + 1 };
  }

  // ============ 同步更新（推送到 OpenClaw） ============

  async syncToOpenClaw(agentId: number): Promise<{ success: boolean; message: string }> {
    const agent = await this.agentRepo.findOne({ where: { id: agentId } });
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} 不存在`);
    }
    if (!agent.openclawAgentId) {
      throw new BadRequestException('该 Agent 未关联 OpenClaw 实例');
    }
    // TODO: 调用 OpenClawService.syncAgent 完成实际同步
    this.logger.log(`[AdminAgentExt] 同步 Agent ${agentId} 到 OpenClaw (agentId=${agent.openclawAgentId})`);
    // 更新同步状态
    agent.syncStatus = 'pending';
    await this.agentRepo.save(agent);
    return { success: true, message: '已提交同步请求' };
  }
}
