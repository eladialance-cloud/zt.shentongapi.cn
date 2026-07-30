import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatService {
  health() {
    return { status: 'ok', module: 'chat' };
  }

  async createSession(userId: number, dto: any) {
    return { id: 1, userId, title: dto.title || 'New Chat', modelId: dto.modelId, createdAt: new Date() };
  }

  async listSessions(userId: number, query?: any) {
    return { items: [], total: 0, page: query?.page || 1, pageSize: query?.pageSize || 20 };
  }

  async getSession(userId: number, sessionId: number) {
    return { id: sessionId, userId, title: 'Chat Session', modelId: 'default' };
  }

  async deleteSession(userId: number, sessionId: number) {
    return { success: true };
  }

  async updateSession(userId: number, sessionId: number, dto: any) {
    return { id: sessionId, ...dto };
  }

  async listMessages(sessionId: number, query?: any) {
    return { items: [], total: 0, page: query?.page || 1, pageSize: query?.pageSize || 20 };
  }

  async createMessage(sessionId: number, userId: number, dto: any) {
    return { id: Date.now(), sessionId, userId, ...dto, createdAt: new Date() };
  }

  async getSessionMessages(sessionId: number, limit: number): Promise<Array<{ role: string; content: string }>> {
    return [];
  }
}
