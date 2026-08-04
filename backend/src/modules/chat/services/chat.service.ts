import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Like, Repository } from 'typeorm';
import { ChatSessionEntity } from '../entities/chat-session.entity';
import { ChatMessageEntity } from '../entities/chat-message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatSessionEntity)
    private readonly sessionRepo: Repository<ChatSessionEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepo: Repository<ChatMessageEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  health() {
    return { status: 'ok', module: 'chat' };
  }

  /** 校验会话归属权：不存在或非本人 → 404 */
  private async assertSession(
    userId: number,
    sessionId: number,
  ): Promise<ChatSessionEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new NotFoundException('会话不存在或无权访问');
    }
    return session;
  }

  async createSession(userId: number, dto: any) {
    const session = this.sessionRepo.create({
      title: dto.title || '新会话',
      modelId: dto.modelId,
      agentId: dto.agentId ?? undefined,
      groupId: dto.groupId ?? 0,
      attachedKnowledgeBaseIds: dto.attachedKnowledgeBaseIds ?? [],
      knowledgeBaseId: dto.knowledgeBaseId ?? dto.attachedKnowledgeBaseIds?.[0],
      enabledPluginIds: dto.enabledPluginIds ?? [],
      enabledWorkflowIds: dto.enabledWorkflowIds ?? [],
      userId,
    });
    return this.sessionRepo.save(session);
  }

  async listSessions(userId: number, query?: any) {
    const page = Math.max(Number(query?.page) || 1, 1);
    const pageSize = Math.max(Number(query?.pageSize) || 20, 1);
    const where: any = { userId };
    if (query?.keyword) {
      where.title = Like(`%${query.keyword}%`);
    }
    const [items, total] = await this.sessionRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list: items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getSession(userId: number, sessionId: number) {
    return this.assertSession(userId, sessionId);
  }

  async deleteSession(userId: number, sessionId: number) {
    await this.assertSession(userId, sessionId);
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ChatMessageEntity, { sessionId });
      await manager.delete(ChatSessionEntity, { id: sessionId, userId });
    });
  }

  async updateSession(userId: number, sessionId: number, dto: any) {
    const session = await this.assertSession(userId, sessionId);
    if (dto.title !== undefined) session.title = dto.title;
    if (dto.modelId !== undefined) session.modelId = dto.modelId;
    if (dto.pinned !== undefined) session.pinned = dto.pinned;
    if (dto.knowledgeBaseId !== undefined) session.knowledgeBaseId = dto.knowledgeBaseId;
    if (dto.groupId !== undefined) session.groupId = dto.groupId;
    if (dto.attachedKnowledgeBaseIds !== undefined) {
      session.attachedKnowledgeBaseIds = dto.attachedKnowledgeBaseIds;
    }
    if (dto.enabledPluginIds !== undefined) session.enabledPluginIds = dto.enabledPluginIds;
    if (dto.enabledWorkflowIds !== undefined) session.enabledWorkflowIds = dto.enabledWorkflowIds;
    return this.sessionRepo.save(session);
  }

  async listMessages(sessionId: number, query?: any) {
    const page = Math.max(Number(query?.page) || 1, 1);
    const pageSize = Math.max(Number(query?.pageSize) || 20, 1);
    const [items, total] = await this.messageRepo.findAndCount({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list: items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async createMessage(sessionId: number, userId: number, dto: any) {
    await this.assertSession(userId, sessionId);
    const message = this.messageRepo.create({
      sessionId,
      role: dto.role,
      content: dto.content,
      toolCalls: dto.toolCalls,
      tokenUsage: dto.tokenUsage,
      creditsCost: dto.creditsCost ?? 0,
      attachments: dto.attachments,
    });
    const saved = await this.messageRepo.save(message);
    await this.sessionRepo.update(sessionId, { lastMessageAt: new Date() });
    return saved;
  }

  async getSessionMessages(
    sessionId: number,
    limit: number,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: limit,
    });
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }
}
