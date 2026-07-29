import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSessionEntity } from '../entities/chat-session.entity';
import { ChatMessageEntity } from '../entities/chat-message.entity';
import { UserEntity } from '../../user/entities/user.entity';
import {
  PaginationQuery,
  PaginatedResult,
} from '../../../common/types/pagination.type';

/** 创建会话 DTO */
export interface CreateSessionDto {
  title?: string;
  modelId: string;
  agentId?: string;
  groupId?: number;
  attachedKnowledgeBaseIds?: number[];
  enabledPluginIds?: number[];
  enabledWorkflowIds?: number[];
}

/** 更新会话 DTO */
export interface UpdateSessionDto {
  title?: string;
  groupId?: number;
  attachedKnowledgeBaseIds?: number[];
  enabledPluginIds?: number[];
  enabledWorkflowIds?: number[];
}

/** 保存消息 DTO */
export interface CreateMessageDto {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result?: string;
  }>;
  tokenUsage?: { input: number; output: number; total: number };
  creditsCost?: number;
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    size: number;
  }>;
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatSessionEntity)
    private readonly sessionRepo: Repository<ChatSessionEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepo: Repository<ChatMessageEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'chat' };
  }

  // ============ 会话 CRUD ============

  /** 创建会话 */
  async createSession(userId: number, dto: CreateSessionDto): Promise<ChatSessionEntity> {
    const session = new ChatSessionEntity();
    session.userId = userId;
    session.title = dto.title || '新会话';
    session.modelId = dto.modelId;
    session.agentId = dto.agentId || undefined;
    session.groupId = dto.groupId || 0;
    session.attachedKnowledgeBaseIds = dto.attachedKnowledgeBaseIds || undefined;
    session.enabledPluginIds = dto.enabledPluginIds || undefined;
    session.enabledWorkflowIds = dto.enabledWorkflowIds || undefined;
    return this.sessionRepo.save(session);
  }

  /** 会话列表（分页） */
  async listSessions(userId: number, query: PaginationQuery): Promise<PaginatedResult<ChatSessionEntity>> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));

    const qb = this.sessionRepo
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .orderBy('s.updated_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.keyword) {
      qb.andWhere('s.title LIKE :keyword', { keyword: `%${query.keyword}%` });
    }

    const [list, total] = await qb.getManyAndCount();
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 会话详情（含权限校验） */
  async getSession(userId: number, sessionId: number): Promise<ChatSessionEntity> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('会话不存在');
    if (session.userId !== userId) throw new ForbiddenException('无权访问该会话');
    return session;
  }

  /** 删除会话（同时删除关联消息） */
  async deleteSession(userId: number, sessionId: number): Promise<void> {
    const session = await this.getSession(userId, sessionId);
    await this.messageRepo.delete({ sessionId });
    await this.sessionRepo.remove(session);
  }

  /** 更新会话 */
  async updateSession(userId: number, sessionId: number, dto: UpdateSessionDto): Promise<ChatSessionEntity> {
    const session = await this.getSession(userId, sessionId);
    Object.assign(session, dto);
    return this.sessionRepo.save(session);
  }

  // ============ 消息 CRUD ============

  /** 消息列表（分页） */
  async listMessages(sessionId: number, query: PaginationQuery): Promise<PaginatedResult<ChatMessageEntity>> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 50));

    const qb = this.messageRepo
      .createQueryBuilder('m')
      .where('m.session_id = :sessionId', { sessionId })
      .orderBy('m.created_at', 'ASC')
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

  /** 保存消息 */
  async createMessage(sessionId: number, _userId: number, dto: CreateMessageDto): Promise<ChatMessageEntity> {
    const message = new ChatMessageEntity();
    message.sessionId = sessionId;
    message.role = dto.role;
    message.content = dto.content;
    message.toolCalls = dto.toolCalls || undefined;
    message.tokenUsage = dto.tokenUsage || undefined;
    message.creditsCost = dto.creditsCost || 0;
    message.attachments = dto.attachments || undefined;
    return this.messageRepo.save(message);
  }

  /** 获取会话上下文消息（用于构建 LLM messages 数组） */
  async getSessionMessages(sessionId: number, limit: number = 20): Promise<ChatMessageEntity[]> {
    return this.messageRepo
      .createQueryBuilder('m')
      .where('m.session_id = :sessionId', { sessionId })
      .orderBy('m.created_at', 'DESC')
      .take(limit)
      .getMany()
      .then(msgs => msgs.reverse());
  }
}
